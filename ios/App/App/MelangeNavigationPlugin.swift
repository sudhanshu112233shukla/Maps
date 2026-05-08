import Capacitor
import Foundation

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

    private var prepared = false
    private var llmModelName = "Qwen/Qwen3-4B"
    private var speechModelName = "OpenAI/whisper-tiny-decoder"
    private var locale = "en-US"

    @objc func prepare(_ call: CAPPluginCall) {
        if let modelName = call.getString("llmModelName")?.trimmingCharacters(in: .whitespacesAndNewlines), !modelName.isEmpty {
            llmModelName = modelName
        }
        if let modelName = call.getString("speechModelName")?.trimmingCharacters(in: .whitespacesAndNewlines), !modelName.isEmpty {
            speechModelName = modelName
        }
        if let requestedLocale = call.getString("locale"), !requestedLocale.isEmpty {
            locale = requestedLocale
        }
        prepared = true

        call.resolve([
            "prepared": true,
            "runtime": "native-bridge",
            "supportsNativeMelange": false,
            "supportsVoiceCommands": false,
            "supportsSemanticSearch": false,
            "supportsPredictiveCaching": false,
            "threadingModel": "ui+navigation+ai+index+background",
            "llmModelName": llmModelName,
            "speechModelName": speechModelName
        ])
    }

    @objc func parseRouteIntent(_ call: CAPPluginCall) {
        guard let query = call.getString("query")?.trimmingCharacters(in: .whitespacesAndNewlines), !query.isEmpty else {
            call.reject("Query is required")
            return
        }

        let lowered = query.lowercased()
        var response: [String: Any] = [
            "mode": detectMode(lowered),
            "language": locale.split(separator: "-").first.map(String.init) ?? "en",
            "avoid": detectAvoidances(lowered),
            "runtime": prepared ? "native-bridge" : "native-fallback"
        ]

        if let destination = extractDestination(lowered) {
            response["destination"] = destination
        }

        if let poi = detectPoi(lowered) {
            response["poi"] = poi
        }

        call.resolve(response)
    }

    @objc func chatNavigation(_ call: CAPPluginCall) {
        guard let message = call.getString("message")?.lowercased(), !message.isEmpty else {
            call.reject("Message is required")
            return
        }

        let text: String
        if message.contains("fuel") || message.contains("petrol") || message.contains("gas") {
            text = "Native bridge is active. I can route you to fuel stops while keeping the route biased toward primary roads."
        } else if message.contains("safe") || message.contains("night") {
            text = "Safest mode prefers major roads and reduces reliance on minor roads, especially during late hours."
        } else if message.contains("offline") {
            text = "This build keeps routing, search, and app-shell assets available offline after provisioning."
        } else {
            text = "Native bridge is live. Replace this fallback guidance with Melange model calls in the plugin."
        }

        call.resolve([
            "text": text,
            "runtime": prepared ? "native-bridge" : "native-fallback"
        ])
    }

    @objc func transcribeNavigationCommand(_ call: CAPPluginCall) {
        call.reject("Native Melange speech transcription is not wired yet in this build")
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
        let pattern = #"(?:to|navigate to|take me to|directions to|route to|drive to)\s+(.+?)(?:\s+(?:avoiding|avoid|with|via|and)|$)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
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

    private func containsAny(_ value: String, candidates: [String]) -> Bool {
        candidates.contains { value.contains($0) }
    }
}
