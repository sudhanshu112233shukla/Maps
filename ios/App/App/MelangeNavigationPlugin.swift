import Capacitor
import Foundation

#if canImport(ZeticMLange)
import ZeticMLange
#endif

@objc(MelangeNavigationPlugin)
public class MelangeNavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MelangeNavigationPlugin"
    public let jsName = "MelangeNavigation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "parseRouteIntent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "chatNavigation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "transcribeNavigationCommand", returnType: CAPPluginReturnPromise)
    ]

    private let inferenceQueue = DispatchQueue(label: "com.aimapsystem.melange.inference", qos: .userInitiated)
    private let maxGeneratedTokens = 320
    private let intentPattern = #"(?:to|navigate to|take me to|directions to|route to|drive to)\s+(.+?)(?:\s+(?:avoiding|avoid|with|via|and)|$)"#
    private let systemPrompt = "You are an offline automotive navigation assistant. Always return strict JSON without markdown."

    private var prepared = false
    private var nativeModelReady = false
    private var llmModelName = "google/gemma-3-4b-it"
    private var speechModelName = "OpenAI/whisper-tiny-decoder"
    private var personalKey = ""
    private var locale = "en-US"

    #if canImport(ZeticMLange)
    private var llmModel: ZeticMLangeLLMModel?
    #endif

    @objc func prepare(_ call: CAPPluginCall) {
        if let key = call.getString("tokenKey")?.trimmingCharacters(in: .whitespacesAndNewlines), !key.isEmpty {
            personalKey = key
        }
        if let modelName = call.getString("llmModelName")?.trimmingCharacters(in: .whitespacesAndNewlines), !modelName.isEmpty {
            llmModelName = modelName
        }
        if let modelName = call.getString("speechModelName")?.trimmingCharacters(in: .whitespacesAndNewlines), !modelName.isEmpty {
            speechModelName = modelName
        }
        if let requestedLocale = call.getString("locale"), !requestedLocale.isEmpty {
            locale = requestedLocale
        }

        inferenceQueue.async {
            do {
                try self.initializeModel()
                self.prepared = true
                call.resolve(self.buildPrepareResponse(error: nil))
            } catch {
                self.prepared = true
                self.nativeModelReady = false
                call.resolve(self.buildPrepareResponse(error: error.localizedDescription))
            }
        }
    }

    @objc func parseRouteIntent(_ call: CAPPluginCall) {
        guard let query = call.getString("query")?.trimmingCharacters(in: .whitespacesAndNewlines), !query.isEmpty else {
            call.reject("Query is required")
            return
        }

        inferenceQueue.async {
            let lowered = query.lowercased()
            var response = self.heuristicIntent(for: lowered)

            do {
                if let melangeIntent = try self.runIntentModel(query: query) {
                    response = self.mergeIntent(base: response, nativeResult: melangeIntent, loweredQuery: lowered)
                    response["runtime"] = "melange-llm"
                } else {
                    response["runtime"] = self.prepared ? "native-fallback" : "cold-start-fallback"
                }
            } catch {
                response["runtime"] = "native-fallback"
                response["error"] = error.localizedDescription
            }

            response["language"] = self.locale.split(separator: "-").first.map(String.init) ?? "en"
            call.resolve(response)
        }
    }

    @objc func chatNavigation(_ call: CAPPluginCall) {
        guard let message = call.getString("message")?.trimmingCharacters(in: .whitespacesAndNewlines), !message.isEmpty else {
            call.reject("Message is required")
            return
        }

        inferenceQueue.async {
            do {
                if let generated = try self.runChatModel(message: message), !generated.isEmpty {
                    call.resolve([
                        "text": generated,
                        "runtime": "melange-llm"
                    ])
                    return
                }
            } catch {
                // fall through to deterministic fallback
            }

            call.resolve([
                "text": self.fallbackChatResponse(message.lowercased()),
                "runtime": "native-fallback"
            ])
        }
    }

    @objc func transcribeNavigationCommand(_ call: CAPPluginCall) {
        call.reject("Speech model tensor I/O integration is not implemented for \(speechModelName) yet")
    }

    private func buildPrepareResponse(error: String?) -> [String: Any] {
        var response: [String: Any] = [
            "prepared": prepared,
            "runtime": nativeModelReady ? "melange-llm" : "native-bridge",
            "supportsNativeMelange": nativeModelReady,
            "supportsVoiceCommands": false,
            "supportsSemanticSearch": nativeModelReady,
            "supportsPredictiveCaching": nativeModelReady,
            "threadingModel": "ui+navigation+ai+index+background",
            "llmModelName": llmModelName,
            "speechModelName": speechModelName
        ]
        if let error {
            response["error"] = error
        }
        return response
    }

    private func initializeModel() throws {
        nativeModelReady = false
        #if canImport(ZeticMLange)
        llmModel?.forceDeinit()
        llmModel = nil

        guard !personalKey.isEmpty else {
            return
        }

        let model = try ZeticMLangeLLMModel(
            personalKey: personalKey,
            name: llmModelName,
            modelMode: .RUN_AUTO,
            initOption: LLMInitOption(
                kvCacheCleanupPolicy: .CLEAN_UP_ON_FULL,
                nCtx: 4096
            )
        )
        llmModel = model
        nativeModelReady = true
        #else
        nativeModelReady = false
        #endif
    }

    private func runIntentModel(query: String) throws -> [String: Any]? {
        guard nativeModelReady else { return nil }
        let prompt = "\(systemPrompt) Return JSON object keys: destination, mode, poi, avoid. mode must be fastest|safest|eco|no-toll. avoid must be an array. Query: \(query)"
        guard let generated = try runPrompt(prompt), !generated.isEmpty else {
            return nil
        }
        guard let payload = extractJson(generated) else {
            return nil
        }
        let data = Data(payload.utf8)
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return object
    }

    private func runChatModel(message: String) throws -> String? {
        guard nativeModelReady else { return nil }
        let prompt = "\(systemPrompt) Respond in one short paragraph for a driver. User: \(message)"
        return try runPrompt(prompt)?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func runPrompt(_ prompt: String) throws -> String? {
        #if canImport(ZeticMLange)
        guard let model = llmModel else { return nil }
        _ = try model.run(prompt)
        var output = ""
        for _ in 0..<maxGeneratedTokens {
            let result = model.waitForNextToken()
            if result.generatedTokens == 0 {
                break
            }
            if !result.token.isEmpty {
                output.append(result.token)
            }
        }
        return output
        #else
        return nil
        #endif
    }

    private func mergeIntent(base: [String: Any], nativeResult: [String: Any], loweredQuery: String) -> [String: Any] {
        var merged = base

        if let destination = (nativeResult["destination"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !destination.isEmpty {
            merged["destination"] = destination
        }

        if let mode = (nativeResult["mode"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !mode.isEmpty {
            merged["mode"] = normalizeMode(mode)
        }

        if let poi = (nativeResult["poi"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !poi.isEmpty {
            merged["poi"] = poi.lowercased()
        }

        if let avoid = nativeResult["avoid"] as? [String], !avoid.isEmpty {
            merged["avoid"] = avoid
        } else {
            merged["avoid"] = detectAvoidances(loweredQuery)
        }

        return merged
    }

    private func heuristicIntent(for lowered: String) -> [String: Any] {
        var response: [String: Any] = [
            "mode": detectMode(lowered),
            "avoid": detectAvoidances(lowered)
        ]

        if let destination = extractDestination(lowered) {
            response["destination"] = destination
        }
        if let poi = detectPoi(lowered) {
            response["poi"] = poi
        }

        return response
    }

    private func normalizeMode(_ raw: String) -> String {
        let lowered = raw.lowercased()
        switch lowered {
        case "fastest", "safest", "eco", "no-toll":
            return lowered
        case "notoll", "no_toll":
            return "no-toll"
        default:
            return "fastest"
        }
    }

    private func detectMode(_ lowered: String) -> String {
        if containsAny(lowered, candidates: ["no toll", "avoid toll", "without toll", "bina toll"]) {
            return "no-toll"
        }
        if containsAny(lowered, candidates: ["eco", "fuel efficient", "kam fuel", "save fuel"]) {
            return "eco"
        }
        if containsAny(lowered, candidates: ["safe", "safer", "surakshit"]) {
            return "safest"
        }
        return "fastest"
    }

    private func detectAvoidances(_ lowered: String) -> [String] {
        var avoid: [String] = []
        if containsAny(lowered, candidates: ["avoid toll", "no toll", "bina toll"]) { avoid.append("tolls") }
        if containsAny(lowered, candidates: ["avoid highway", "no highway"]) { avoid.append("highways") }
        if containsAny(lowered, candidates: ["avoid traffic", "no traffic", "jam avoid"]) { avoid.append("traffic") }
        if lowered.contains("avoid night") { avoid.append("night-driving") }
        return avoid
    }

    private func detectPoi(_ lowered: String) -> String? {
        if containsAny(lowered, candidates: ["hospital", "clinic", "doctor", "emergency", "aspatal"]) { return "hospital" }
        if containsAny(lowered, candidates: ["fuel", "gas", "petrol", "diesel", "indhan"]) { return "fuel" }
        if containsAny(lowered, candidates: ["charging", "charger", "ev", "battery charge"]) { return "charging" }
        if containsAny(lowered, candidates: ["restaurant", "food", "cafe", "coffee", "chai", "khana"]) { return "restaurant" }
        if containsAny(lowered, candidates: ["hotel", "motel", "stay", "lodge"]) { return "hotel" }
        if containsAny(lowered, candidates: ["pharmacy", "chemist", "medicine"]) { return "pharmacy" }
        if containsAny(lowered, candidates: ["rest area", "washroom", "toilet", "service area"]) { return "rest_area" }
        return nil
    }

    private func extractDestination(_ lowered: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: intentPattern) else {
            return nil
        }

        let range = NSRange(lowered.startIndex..<lowered.endIndex, in: lowered)
        guard
            let match = regex.firstMatch(in: lowered, options: [], range: range),
            let destinationRange = Range(match.range(at: 1), in: lowered)
        else {
            return nil
        }

        return String(lowered[destinationRange]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func fallbackChatResponse(_ loweredMessage: String) -> String {
        if containsAny(loweredMessage, candidates: ["fuel", "petrol", "gas"]) {
            return "Nearest fuel routing is available offline and prefers primary corridors."
        }
        if containsAny(loweredMessage, candidates: ["safe", "night"]) {
            return "Safest mode penalizes minor roads and prioritizes major corridors."
        }
        if containsAny(loweredMessage, candidates: ["offline"]) {
            return "Routing, search, and region data provisioning remain available offline."
        }
        return "Provide destination or stop type with routing preferences like safest, eco, or no toll."
    }

    private func containsAny(_ value: String, candidates: [String]) -> Bool {
        candidates.contains { value.contains($0) }
    }

    private func extractJson(_ source: String) -> String? {
        guard let start = source.firstIndex(of: "{"), let end = source.lastIndex(of: "}") else {
            return nil
        }
        guard start < end else { return nil }
        return String(source[start...end])
    }
}
