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
        CAPPluginMethod(name: "transcribeNavigationCommand", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rankPoiCandidates", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "predictOfflineCache", returnType: CAPPluginReturnPromise)
    ]

    private let inferenceQueue = DispatchQueue(label: "com.aimapsystem.melange.inference", qos: .userInitiated)
    private let maxGeneratedTokens = 320
    private let intentPattern = #"(?:to|navigate to|take me to|directions to|route to|drive to)\s+(.+?)(?:\s+(?:avoiding|avoid|with|via|and)|$)"#
    private let systemPrompt = "You are an offline automotive navigation assistant. Always return strict JSON without markdown."

    private var prepared = false
    private var nativeModelReady = false
    private var llmModelName = "google/gemma-3-4b-it"
    private var llmFallbackModelName = "LiquidAI/LFM2.5-1.2B-Instruct"
    private var speechModelName = "ZETIC-ai/whisper-base-decoder"
    private var speechEncoderModelName = "ZETIC-ai/whisper-base-encoder"
    private var ttsModelName = "neuphonic/pocket-tts"
    private var personalKey = ""
    private var locale = "en-US"
    private var deviceClass = "midRange"
    private var maxGeneratedTokens = 320
    private var inferenceTimeoutMs = 4500
    private var voiceCommandLatencyTargetMs = 2500
    private var speechRuntimeClass: String?
    private var nativeSpeechReady = false

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
        if let fallbackModel = call.getString("llmFallbackModelName")?.trimmingCharacters(in: .whitespacesAndNewlines), !fallbackModel.isEmpty {
            llmFallbackModelName = fallbackModel
        }
        if let modelName = call.getString("speechModelName")?.trimmingCharacters(in: .whitespacesAndNewlines), !modelName.isEmpty {
            speechModelName = modelName
        }
        if let modelName = call.getString("speechEncoderModelName")?.trimmingCharacters(in: .whitespacesAndNewlines), !modelName.isEmpty {
            speechEncoderModelName = modelName
        }
        if let modelName = call.getString("ttsModelName")?.trimmingCharacters(in: .whitespacesAndNewlines), !modelName.isEmpty {
            ttsModelName = modelName
        }
        if let requestedLocale = call.getString("locale"), !requestedLocale.isEmpty {
            locale = requestedLocale
        }
        if let requestedDeviceClass = call.getString("deviceClass"), !requestedDeviceClass.isEmpty {
            deviceClass = requestedDeviceClass
        }
        if let requestedTokens = call.getInt("maxGeneratedTokens"), requestedTokens > 0 {
            maxGeneratedTokens = requestedTokens
        }
        if let requestedTimeout = call.getInt("inferenceTimeoutMs"), requestedTimeout > 0 {
            inferenceTimeoutMs = requestedTimeout
        }
        if let requestedLatency = call.getInt("voiceCommandLatencyTargetMs"), requestedLatency > 0 {
            voiceCommandLatencyTargetMs = requestedLatency
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
        guard let audioBase64 = call.getString("audioBase64")?.trimmingCharacters(in: .whitespacesAndNewlines), !audioBase64.isEmpty else {
            call.reject("audioBase64 is required")
            return
        }

        inferenceQueue.async {
            if let text = self.runSpeechModel(audioBase64: audioBase64), !text.isEmpty {
                call.resolve([
                    "text": text,
                    "runtime": "melange-speech"
                ])
                return
            }
            call.resolve([
                "text": "",
                "runtime": "native-fallback",
                "error": "Speech model tensor I/O integration is not implemented for \(self.speechModelName) yet"
            ])
        }
    }

    @objc func rankPoiCandidates(_ call: CAPPluginCall) {
        guard let query = call.getString("query")?.trimmingCharacters(in: .whitespacesAndNewlines), !query.isEmpty else {
            call.reject("Query is required")
            return
        }

        let candidatesJson = call.getString("candidatesJson") ?? "[]"
        let limit = max(call.getInt("limit") ?? 5, 1)

        inferenceQueue.async {
            do {
                let data = Data(candidatesJson.utf8)
                let parsed = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] ?? []
                call.resolve([
                    "items": self.rankCandidates(query: query, candidates: parsed, limit: limit),
                    "runtime": self.nativeModelReady ? "melange-ranking" : "native-ranking-fallback"
                ])
            } catch {
                call.resolve([
                    "items": [],
                    "runtime": "native-ranking-fallback",
                    "error": error.localizedDescription
                ])
            }
        }
    }

    @objc func predictOfflineCache(_ call: CAPPluginCall) {
        let contextJson = call.getString("contextJson") ?? "{}"
        inferenceQueue.async {
            do {
                let data = Data(contextJson.utf8)
                let parsed = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
                var payload = self.buildCachePlan(context: parsed)
                payload["runtime"] = self.nativeModelReady ? "melange-cache" : "native-cache-fallback"
                call.resolve(payload)
            } catch {
                call.resolve([
                    "assetHints": [],
                    "poiCategories": [],
                    "warmRouteModes": [],
                    "runtime": "native-cache-fallback",
                    "error": error.localizedDescription
                ])
            }
        }
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
            "llmFallbackModelName": llmFallbackModelName,
            "speechModelName": speechModelName,
            "speechEncoderModelName": speechEncoderModelName,
            "ttsModelName": ttsModelName,
            "deviceClass": deviceClass,
            "maxGeneratedTokens": maxGeneratedTokens,
            "inferenceTimeoutMs": inferenceTimeoutMs,
            "voiceCommandLatencyTargetMs": voiceCommandLatencyTargetMs,
            "speechRuntimeDetected": nativeSpeechReady,
            "speechRuntimeClass": speechRuntimeClass as Any
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
        detectSpeechRuntime()
    }

    private func detectSpeechRuntime() {
        let candidates = [
            "ZeticMLangeSpeechModel",
            "ai.zetic.mlange.speech.ZeticMLangeSpeechModel"
        ]
        speechRuntimeClass = candidates.first(where: { NSClassFromString($0) != nil })
        nativeSpeechReady = false
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

    private func runSpeechModel(audioBase64: String) -> String? {
        guard nativeSpeechReady else { return nil }
        return nil
    }

    private func rankCandidates(query: String, candidates: [[String: Any]], limit: Int) -> [[String: Any]] {
        let queryTokens = tokenize(query)

        return candidates
            .enumerated()
            .map { index, candidate in
                let aliases = candidate["aliases"] as? [String] ?? []
                let haystack = [
                    candidate["name"] as? String ?? "",
                    candidate["category"] as? String ?? "",
                    candidate["description"] as? String ?? "",
                    aliases.joined(separator: " ")
                ].joined(separator: " ")
                let candidateTokens = tokenize(haystack)
                let overlap = queryTokens.filter { candidateTokens.contains($0) }.count
                let distancePenalty = min((candidate["distanceMeters"] as? Double ?? 0) / 5000, 10)
                let category = (candidate["category"] as? String ?? "").lowercased()
                let categoryBoost = queryTokens.contains(where: { category.contains($0) }) ? 2.0 : 0
                let score = Double(overlap * 3) + categoryBoost - distancePenalty

                var enriched = candidate
                enriched["_score"] = score
                enriched["_index"] = index
                return enriched
            }
            .sorted {
                let leftScore = $0["_score"] as? Double ?? 0
                let rightScore = $1["_score"] as? Double ?? 0
                if leftScore != rightScore {
                    return leftScore > rightScore
                }
                return ($0["_index"] as? Int ?? 0) < ($1["_index"] as? Int ?? 0)
            }
            .prefix(max(limit, 1))
            .map {
                var candidate = $0
                candidate.removeValue(forKey: "_score")
                candidate.removeValue(forKey: "_index")
                return candidate
            }
    }

    private func buildCachePlan(context: [String: Any]) -> [String: Any] {
        let route = context["route"] as? [String: Any] ?? [:]
        let regionId = (context["regionId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let onHighway = context["onHighway"] as? Bool ?? false
        let vehicleProfile = (context["vehicleProfile"] as? String ?? "automobile").lowercased()
        let poi = ((context["poi"] as? String) ?? (route["poi"] as? String) ?? "").lowercased()
        let routeMode = ((route["mode"] as? String) ?? "").lowercased()

        var assetHints = ["graph", "poi"]
        if let regionId, !regionId.isEmpty {
            assetHints.append("map:\(regionId)")
        }

        var poiCategories: [String] = []
        if !poi.isEmpty {
            poiCategories.append(poi)
        }
        if onHighway {
            poiCategories.append(contentsOf: ["fuel", "rest_area", "charging"])
        }
        if vehicleProfile == "automobile" {
            poiCategories.append("hospital")
        }

        var warmRouteModes: [String] = []
        if !routeMode.isEmpty {
            warmRouteModes.append(routeMode)
        }

        return [
            "regionId": regionId as Any,
            "radiusKm": onHighway ? 40 : 20,
            "assetHints": Array(Set(assetHints)).sorted(),
            "poiCategories": Array(Set(poiCategories)).sorted(),
            "warmRouteModes": Array(Set(warmRouteModes)).sorted()
        ]
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

    private func tokenize(_ value: String) -> [String] {
        value
            .lowercased()
            .replacingOccurrences(of: #"[^a-z0-9\u{0900}-\u{097F}]+"#, with: " ", options: .regularExpression)
            .split(separator: " ")
            .map(String.init)
    }

    private func extractJson(_ source: String) -> String? {
        guard let start = source.firstIndex(of: "{"), let end = source.lastIndex(of: "}") else {
            return nil
        }
        guard start < end else { return nil }
        return String(source[start...end])
    }
}
