package com.aimapsystem.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "MelangeNavigation")
public class MelangeNavigationPlugin extends Plugin {

    private boolean prepared = false;
    private String llmModelName = "Qwen/Qwen3-4B";
    private String speechModelName = "OpenAI/whisper-tiny-decoder";
    private String locale = "en-US";

    @PluginMethod
    public void prepare(PluginCall call) {
        llmModelName = valueOrDefault(call.getString("llmModelName"), llmModelName);
        speechModelName = valueOrDefault(call.getString("speechModelName"), speechModelName);
        locale = valueOrDefault(call.getString("locale"), locale);
        prepared = true;

        JSObject result = new JSObject();
        result.put("prepared", true);
        result.put("runtime", "native-bridge");
        result.put("supportsNativeMelange", false);
        result.put("supportsVoiceCommands", false);
        result.put("supportsSemanticSearch", false);
        result.put("supportsPredictiveCaching", false);
        result.put("threadingModel", "ui+navigation+ai+index+background");
        result.put("llmModelName", llmModelName);
        result.put("speechModelName", speechModelName);
        call.resolve(result);
    }

    @PluginMethod
    public void parseRouteIntent(PluginCall call) {
        String query = call.getString("query", "").trim();
        if (query.isEmpty()) {
            call.reject("Query is required");
            return;
        }

        String lowered = query.toLowerCase(Locale.US);
        JSObject result = new JSObject();
        String destination = extractDestination(lowered);
        if (destination != null) {
            result.put("destination", destination);
        }

        String poi = detectPoi(lowered);
        if (poi != null) {
            result.put("poi", poi);
        }

        result.put("mode", detectMode(lowered));
        result.put("language", locale.split("-")[0]);
        result.put("avoid", detectAvoidances(lowered));
        result.put("runtime", prepared ? "native-bridge" : "native-fallback");
        call.resolve(result);
    }

    @PluginMethod
    public void chatNavigation(PluginCall call) {
        String message = call.getString("message", "").trim().toLowerCase(Locale.US);
        if (message.isEmpty()) {
            call.reject("Message is required");
            return;
        }

        String text;
        if (message.contains("fuel") || message.contains("petrol") || message.contains("gas")) {
            text = "Native bridge is active. I can route you to fuel stops and keep the route biased toward primary roads.";
        } else if (message.contains("safe") || message.contains("night")) {
            text = "Safest mode prefers major roads and reduces exposure to minor roads, especially at night.";
        } else if (message.contains("offline")) {
            text = "This build keeps routing, search, and app-shell assets available offline after provisioning.";
        } else {
            text = "Native bridge is live. Add Melange runtime calls here to replace this fallback guidance.";
        }

        JSObject result = new JSObject();
        result.put("text", text);
        result.put("runtime", prepared ? "native-bridge" : "native-fallback");
        call.resolve(result);
    }

    @PluginMethod
    public void transcribeNavigationCommand(PluginCall call) {
        call.reject("Native Melange speech transcription is not wired yet in this build");
    }

    private String detectMode(String lowered) {
        if (containsAny(lowered, "no toll", "avoid toll", "without toll", "bina toll")) {
            return "no-toll";
        }
        if (containsAny(lowered, "eco", "fuel efficient", "kam fuel", "save fuel")) {
            return "eco";
        }
        if (containsAny(lowered, "safe", "safer", "surakshit")) {
            return "safest";
        }
        return "fastest";
    }

    private JSArray detectAvoidances(String lowered) {
        JSArray avoid = new JSArray();
        if (containsAny(lowered, "avoid toll", "no toll", "bina toll")) {
            avoid.put("tolls");
        }
        if (containsAny(lowered, "avoid highway", "no highway")) {
            avoid.put("highways");
        }
        if (containsAny(lowered, "avoid traffic", "no traffic", "jam avoid")) {
            avoid.put("traffic");
        }
        if (lowered.contains("avoid night")) {
            avoid.put("night-driving");
        }
        return avoid;
    }

    private String detectPoi(String lowered) {
        if (containsAny(lowered, "hospital", "clinic", "doctor", "emergency", "aspatal")) return "hospital";
        if (containsAny(lowered, "fuel", "gas", "petrol", "diesel", "indhan")) return "fuel";
        if (containsAny(lowered, "charging", "charger", "ev", "battery charge")) return "charging";
        if (containsAny(lowered, "restaurant", "food", "cafe", "coffee", "chai", "khana")) return "restaurant";
        if (containsAny(lowered, "hotel", "motel", "stay", "lodge")) return "hotel";
        if (containsAny(lowered, "pharmacy", "chemist", "medicine")) return "pharmacy";
        if (containsAny(lowered, "rest area", "washroom", "toilet", "service area")) return "rest_area";
        return null;
    }

    private String extractDestination(String lowered) {
        Pattern pattern = Pattern.compile("(?:to|navigate to|take me to|directions to|route to|drive to)\\s+(.+?)(?:\\s+(?:avoiding|avoid|with|via|and)|$)");
        Matcher matcher = pattern.matcher(lowered);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }
        return null;
    }

    private boolean containsAny(String value, String... candidates) {
        for (String candidate : candidates) {
            if (value.contains(candidate)) {
                return true;
            }
        }
        return false;
    }

    private String valueOrDefault(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }
}
