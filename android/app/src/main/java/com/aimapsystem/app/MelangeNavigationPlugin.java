package com.aimapsystem.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.zeticai.mlange.core.model.ZeticMLangeModel;
import com.zeticai.mlange.core.model.llm.LLMNextTokenResult;
import com.zeticai.mlange.core.model.llm.ZeticMLangeLLMModel;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "MelangeNavigation")
public class MelangeNavigationPlugin extends Plugin {

    private static final String SYSTEM_PROMPT = "You are an offline automotive navigation assistant. "
            + "Always return strict JSON without markdown.";
    private static final String INTENT_PROMPT_TEMPLATE
            = SYSTEM_PROMPT + " Return object keys: destination, mode, poi, avoid. "
            + "mode must be fastest|safest|eco|no-toll. avoid must be an array of strings. "
            + "If unknown, use null or empty array. Query: %s";

    private final ExecutorService inferenceExecutor = Executors.newSingleThreadExecutor();
    private final Pattern destinationPattern = Pattern.compile(
            "(?:to|navigate to|take me to|directions to|route to|drive to)\\s+(.+?)(?:\\s+(?:avoiding|avoid|with|via|and)|$)"
    );

    private boolean prepared = false;
    private boolean nativeModelReady = false;
    private String llmModelName = BuildConfig.ZETIC_LLM_MODEL;
    private String llmFallbackModelName = BuildConfig.ZETIC_LLM_FALLBACK_MODEL;
    private String speechModelName = BuildConfig.ZETIC_SPEECH_MODEL;
    private String speechEncoderModelName = "ZETIC-ai/whisper-base-encoder";
    private String ttsModelName = "neuphonic/pocket-tts";
    private String personalKey = BuildConfig.ZETIC_PAT;
    private String locale = "en-US";
    private String deviceClass = "midRange";
    private int maxGeneratedTokens = 320;
    private int inferenceTimeoutMs = 4500;
    private int voiceCommandLatencyTargetMs = 2500;
    private ZeticMLangeLLMModel llmModel = null;
    private ZeticMLangeModel speechEncoderModel = null;
    private ZeticMLangeModel speechDecoderModel = null;
    private String llmRuntimeClass = null;
    private String speechRuntimeClass = null;

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        releaseModel();
        inferenceExecutor.shutdownNow();
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        // JS may pass an end-user-provided token from secure storage; if absent or
        // empty, fall back to the build-time-injected BuildConfig.ZETIC_PAT so the
        // raw token never crosses the JS/native boundary in dev builds.
        personalKey = valueOrDefault(call.getString("tokenKey"), personalKey);
        llmModelName = valueOrDefault(call.getString("llmModelName"), llmModelName);
        llmFallbackModelName = valueOrDefault(call.getString("llmFallbackModelName"), llmFallbackModelName);
        speechModelName = valueOrDefault(call.getString("speechModelName"), speechModelName);
        speechEncoderModelName = valueOrDefault(call.getString("speechEncoderModelName"), speechEncoderModelName);
        ttsModelName = valueOrDefault(call.getString("ttsModelName"), ttsModelName);
        locale = valueOrDefault(call.getString("locale"), locale);
        deviceClass = valueOrDefault(call.getString("deviceClass"), deviceClass);
        maxGeneratedTokens = positiveOrDefault(call.getInt("maxGeneratedTokens"), maxGeneratedTokens);
        inferenceTimeoutMs = positiveOrDefault(call.getInt("inferenceTimeoutMs"), inferenceTimeoutMs);
        voiceCommandLatencyTargetMs = positiveOrDefault(
                call.getInt("voiceCommandLatencyTargetMs"),
                voiceCommandLatencyTargetMs
        );

        inferenceExecutor.execute(() -> {
            try {
                initializeModel();
                prepared = true;
                JSObject result = buildPrepareResult();
                call.resolve(result);
            } catch (Exception error) {
                prepared = true;
                nativeModelReady = false;
                JSObject result = buildPrepareResult();
                result.put("error", error.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void parseRouteIntent(PluginCall call) {
        String query = call.getString("query", "").trim();
        if (query.isEmpty()) {
            call.reject("Query is required");
            return;
        }

        inferenceExecutor.execute(() -> {
            try {
                JSObject result = new JSObject();
                String normalized = query.toLowerCase(Locale.US);

                JSObject melangeIntent = runIntentModel(query);
                if (melangeIntent != null) {
                    mergeIntentResult(result, melangeIntent, normalized);
                    result.put("runtime", "melange-llm");
                } else {
                    applyHeuristicIntent(result, normalized);
                    result.put("runtime", prepared ? "native-fallback" : "cold-start-fallback");
                }

                result.put("language", locale.split("-")[0]);
                call.resolve(result);
            } catch (Exception error) {
                JSObject fallback = new JSObject();
                applyHeuristicIntent(fallback, query.toLowerCase(Locale.US));
                fallback.put("runtime", "native-fallback");
                fallback.put("language", locale.split("-")[0]);
                fallback.put("error", error.getMessage());
                call.resolve(fallback);
            }
        });
    }

    @PluginMethod
    public void chatNavigation(PluginCall call) {
        String message = call.getString("message", "").trim();
        if (message.isEmpty()) {
            call.reject("Message is required");
            return;
        }

        inferenceExecutor.execute(() -> {
            try {
                String response = runChatModel(message);
                JSObject result = new JSObject();
                if (response != null && !response.isEmpty()) {
                    result.put("text", response);
                    result.put("runtime", "melange-llm");
                } else {
                    result.put("text", fallbackChatResponse(message.toLowerCase(Locale.US)));
                    result.put("runtime", "native-fallback");
                }
                call.resolve(result);
            } catch (Exception error) {
                JSObject result = new JSObject();
                result.put("text", fallbackChatResponse(message.toLowerCase(Locale.US)));
                result.put("runtime", "native-fallback");
                result.put("error", error.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void transcribeNavigationCommand(PluginCall call) {
        String audioBase64 = call.getString("audioBase64", "").trim();
        if (audioBase64.isEmpty()) {
            call.reject("audioBase64 is required");
            return;
        }

        inferenceExecutor.execute(() -> {
            try {
                String text = runSpeechModel(audioBase64);
                JSObject result = new JSObject();
                if (text != null && !text.isEmpty()) {
                    result.put("text", text);
                    result.put("runtime", "melange-speech");
                    call.resolve(result);
                    return;
                }
                result.put("text", "");
                result.put("runtime", "native-fallback");
                result.put("error", "Speech model integration requires melange tensor I/O wiring for model: " + speechModelName);
                call.resolve(result);
            } catch (Exception error) {
                JSObject result = new JSObject();
                result.put("text", "");
                result.put("runtime", "native-fallback");
                result.put("error", error.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void rankPoiCandidates(PluginCall call) {
        String query = call.getString("query", "").trim();
        String candidatesJson = call.getString("candidatesJson", "[]");
        int limit = positiveOrDefault(call.getInt("limit"), 5);

        if (query.isEmpty()) {
            call.reject("Query is required");
            return;
        }

        inferenceExecutor.execute(() -> {
            try {
                JSONArray candidates = new JSONArray(candidatesJson);
                JSObject result = new JSObject();
                result.put("items", rankCandidates(query, candidates, limit));
                result.put("runtime", nativeModelReady ? "melange-ranking" : "native-ranking-fallback");
                call.resolve(result);
            } catch (Exception error) {
                JSObject result = new JSObject();
                result.put("items", new JSArray());
                result.put("runtime", "native-ranking-fallback");
                result.put("error", error.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void predictOfflineCache(PluginCall call) {
        String contextJson = call.getString("contextJson", "{}");

        inferenceExecutor.execute(() -> {
            try {
                JSONObject context = new JSONObject(contextJson);
                JSObject result = buildCachePlan(context);
                result.put("runtime", nativeModelReady ? "melange-cache" : "native-cache-fallback");
                call.resolve(result);
            } catch (Exception error) {
                JSObject result = new JSObject();
                result.put("runtime", "native-cache-fallback");
                result.put("assetHints", new JSArray());
                result.put("poiCategories", new JSArray());
                result.put("warmRouteModes", new JSArray());
                result.put("error", error.getMessage());
                call.resolve(result);
            }
        });
    }

    private JSObject runIntentModel(String query) {
        if (!nativeModelReady) {
            return null;
        }

        String prompt = String.format(Locale.US, INTENT_PROMPT_TEMPLATE, query);
        String generated = runPrompt(prompt);
        if (generated == null || generated.isEmpty()) {
            return null;
        }
        String jsonSlice = extractJson(generated);
        if (jsonSlice == null) {
            return null;
        }
        try {
            return new JSObject(jsonSlice);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String runChatModel(String message) {
        if (!nativeModelReady) {
            return null;
        }
        String prompt = SYSTEM_PROMPT + " Respond in 1-2 short sentences. User: " + message;
        String generated = runPrompt(prompt);
        if (generated == null) {
            return null;
        }
        String cleaned = generated.trim();
        if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
            try {
                JSONObject candidate = new JSONObject(cleaned);
                if (candidate.has("text")) {
                    return candidate.optString("text", "").trim();
                }
            } catch (Exception ignored) {
                return cleaned;
            }
        }
        return cleaned;
    }

    private String runPrompt(String prompt) {
        if (llmModel == null) {
            return null;
        }
        try {
            llmModel.run(prompt);

            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < maxGeneratedTokens; i++) {
                LLMNextTokenResult tokenResult = llmModel.waitForNextToken();
                if (tokenResult == null) {
                    break;
                }

                int generatedTokens = tokenResult.getGeneratedTokens();
                if (generatedTokens == 0) {
                    break;
                }
                String token = tokenResult.getToken();
                if (token != null) {
                    builder.append(token);
                }
            }
            return builder.toString();
        } catch (Exception error) {
            nativeModelReady = false;
            return null;
        }
    }

    private String runSpeechModel(String audioBase64) {
        if (speechEncoderModel == null || speechDecoderModel == null) {
            return null;
        }
        return null;
    }

    private JSObject buildPrepareResult() {
        JSObject result = new JSObject();
        result.put("prepared", prepared);
        result.put("runtime", nativeModelReady ? "melange-llm" : "native-bridge");
        result.put("supportsNativeMelange", nativeModelReady);
        result.put("supportsVoiceCommands", false);
        result.put("supportsSpeechRuntime", speechEncoderModel != null && speechDecoderModel != null);
        result.put("supportsSemanticSearch", nativeModelReady);
        result.put("supportsPredictiveCaching", nativeModelReady);
        result.put("threadingModel", "ui+navigation+ai+index+background");
        result.put("llmModelName", llmModelName);
        result.put("llmFallbackModelName", llmFallbackModelName);
        result.put("speechModelName", speechModelName);
        result.put("speechEncoderModelName", speechEncoderModelName);
        result.put("ttsModelName", ttsModelName);
        result.put("deviceClass", deviceClass);
        result.put("maxGeneratedTokens", maxGeneratedTokens);
        result.put("inferenceTimeoutMs", inferenceTimeoutMs);
        result.put("voiceCommandLatencyTargetMs", voiceCommandLatencyTargetMs);
        result.put("llmRuntimeClass", llmRuntimeClass == null ? JSONObject.NULL : llmRuntimeClass);
        result.put("speechRuntimeClass", speechRuntimeClass == null ? JSONObject.NULL : speechRuntimeClass);
        result.put("speechEncoderReady", speechEncoderModel != null);
        result.put("speechDecoderReady", speechDecoderModel != null);
        result.put("speechEncoderInputCount", speechEncoderModel == null ? 0 : speechEncoderModel.getInputBuffers().length);
        result.put("speechDecoderInputCount", speechDecoderModel == null ? 0 : speechDecoderModel.getInputBuffers().length);
        return result;
    }

    private void initializeModel() throws Exception {
        releaseModel();
        if (personalKey == null || personalKey.trim().isEmpty()) {
            nativeModelReady = false;
            return;
        }

        String[] modelCandidates = new String[]{
            llmModelName,
            llmFallbackModelName
        };

        Exception lastError = null;
        for (String modelId : modelCandidates) {
            if (modelId == null || modelId.trim().isEmpty()) {
                continue;
            }
            try {
                llmModel = new ZeticMLangeLLMModel(getContext(), personalKey, modelId);
                llmRuntimeClass = ZeticMLangeLLMModel.class.getName();
                llmModelName = modelId;
                nativeModelReady = true;
                initializeSpeechModel();
                return;
            } catch (Exception error) {
                lastError = error;
            }
        }

        nativeModelReady = false;
        if (lastError != null) {
            throw lastError;
        }
        initializeSpeechModel();
    }

    private void initializeSpeechModel() {
        speechEncoderModel = null;
        speechDecoderModel = null;
        speechRuntimeClass = null;

        if (personalKey == null || personalKey.trim().isEmpty()) {
            return;
        }
        if (speechEncoderModelName == null || speechEncoderModelName.trim().isEmpty()) {
            return;
        }
        if (speechModelName == null || speechModelName.trim().isEmpty()) {
            return;
        }

        try {
            speechEncoderModel = new ZeticMLangeModel(getContext(), personalKey, speechEncoderModelName);
            speechDecoderModel = new ZeticMLangeModel(getContext(), personalKey, speechModelName);
            speechRuntimeClass = ZeticMLangeModel.class.getName();
        } catch (Exception ignored) {
            speechEncoderModel = null;
            speechDecoderModel = null;
            speechRuntimeClass = null;
        }
    }

    private JSArray rankCandidates(String query, JSONArray candidates, int limit) {
        List<JSONObject> scored = new ArrayList<>();
        List<String> queryTokens = tokenize(query);

        for (int i = 0; i < candidates.length(); i++) {
            JSONObject candidate = candidates.optJSONObject(i);
            if (candidate == null) {
                continue;
            }

            StringBuilder haystack = new StringBuilder();
            haystack.append(candidate.optString("name", "")).append(' ');
            haystack.append(candidate.optString("category", "")).append(' ');
            haystack.append(candidate.optString("description", "")).append(' ');

            JSONArray aliases = candidate.optJSONArray("aliases");
            if (aliases != null) {
                for (int aliasIndex = 0; aliasIndex < aliases.length(); aliasIndex++) {
                    haystack.append(aliases.optString(aliasIndex, "")).append(' ');
                }
            }

            List<String> candidateTokens = tokenize(haystack.toString());
            int overlap = 0;
            for (String token : queryTokens) {
                if (candidateTokens.contains(token)) {
                    overlap += 1;
                }
            }

            double distancePenalty = 0;
            if (candidate.has("distanceMeters")) {
                distancePenalty = Math.min(candidate.optDouble("distanceMeters", 0) / 5000.0, 10);
            }
            double categoryBoost = 0;
            String category = candidate.optString("category", "").toLowerCase(Locale.US);
            for (String token : queryTokens) {
                if (category.contains(token)) {
                    categoryBoost = 2;
                    break;
                }
            }

            double score = overlap * 3 + categoryBoost - distancePenalty;
            candidate.remove("_score");
            try {
                candidate.put("_score", score);
            } catch (Exception ignored) {
                // ignore
            }
            scored.add(candidate);
        }

        scored.sort((left, right) -> Double.compare(
                right.optDouble("_score", 0),
                left.optDouble("_score", 0)
        ));

        JSArray result = new JSArray();
        int boundedLimit = Math.max(1, limit);
        for (int i = 0; i < scored.size() && i < boundedLimit; i++) {
            JSONObject candidate = scored.get(i);
            candidate.remove("_score");
            result.put(candidate);
        }
        return result;
    }

    private JSObject buildCachePlan(JSONObject context) {
        JSObject result = new JSObject();
        String regionId = context.optString("regionId", null);
        String vehicleProfile = context.optString("vehicleProfile", "automobile");
        JSONObject route = context.optJSONObject("route");
        boolean onHighway = context.optBoolean("onHighway", false);
        String poi = context.optString("poi", route == null ? "" : route.optString("poi", ""));
        String routeMode = route == null ? "" : route.optString("mode", "");

        JSArray assetHints = new JSArray();
        assetHints.put("graph");
        assetHints.put("poi");
        if (regionId != null && !regionId.trim().isEmpty()) {
            assetHints.put("map:" + regionId.trim());
            result.put("regionId", regionId.trim());
        } else {
            result.put("regionId", JSONObject.NULL);
        }

        JSArray poiCategories = new JSArray();
        if (!poi.trim().isEmpty()) {
            poiCategories.put(poi.trim().toLowerCase(Locale.US));
        }
        if (onHighway) {
            poiCategories.put("fuel");
            poiCategories.put("rest_area");
            poiCategories.put("charging");
        }
        if ("automobile".equalsIgnoreCase(vehicleProfile)) {
            poiCategories.put("hospital");
        }

        JSArray warmRouteModes = new JSArray();
        if (!routeMode.trim().isEmpty()) {
            warmRouteModes.put(routeMode.trim().toLowerCase(Locale.US));
        }

        result.put("radiusKm", onHighway ? 40 : 20);
        result.put("assetHints", dedupeArray(assetHints));
        result.put("poiCategories", dedupeArray(poiCategories));
        result.put("warmRouteModes", dedupeArray(warmRouteModes));
        return result;
    }

    private void releaseModel() {
        if (llmModel != null) {
            try {
                llmModel.deinit();
            } catch (Exception ignored) {
                // ignore
            }
        }
        llmModel = null;
        llmRuntimeClass = null;
        if (speechEncoderModel != null) {
            try {
                speechEncoderModel.close();
            } catch (Exception ignored) {
                // ignore
            }
        }
        if (speechDecoderModel != null) {
            try {
                speechDecoderModel.close();
            } catch (Exception ignored) {
                // ignore
            }
        }
        speechEncoderModel = null;
        speechDecoderModel = null;
        speechRuntimeClass = null;
        nativeModelReady = false;
    }

    private void applyHeuristicIntent(JSObject target, String lowered) {
        String destination = extractDestination(lowered);
        if (destination != null) {
            target.put("destination", destination);
        }

        String poi = detectPoi(lowered);
        if (poi != null) {
            target.put("poi", poi);
        }

        target.put("mode", detectMode(lowered));
        target.put("avoid", detectAvoidances(lowered));
    }

    private void mergeIntentResult(JSObject target, JSObject source, String loweredQuery) {
        String destination = source.optString("destination", "").trim();
        if (destination.isEmpty()) {
            destination = extractDestination(loweredQuery);
        }
        if (destination != null && !destination.isEmpty()) {
            target.put("destination", destination);
        }

        String mode = source.optString("mode", "").trim();
        target.put("mode", normalizeMode(mode.isEmpty() ? detectMode(loweredQuery) : mode));

        String poi = source.optString("poi", "").trim();
        if (poi.isEmpty()) {
            poi = detectPoi(loweredQuery);
        }
        if (poi != null && !poi.isEmpty()) {
            target.put("poi", poi);
        }

        JSArray avoid = new JSArray();
        JSONArray sourceAvoid = source.optJSONArray("avoid");
        if (sourceAvoid != null) {
            for (int i = 0; i < sourceAvoid.length(); i++) {
                String value = sourceAvoid.optString(i, "").trim();
                if (!value.isEmpty()) {
                    avoid.put(value);
                }
            }
        } else {
            avoid = detectAvoidances(loweredQuery);
        }
        target.put("avoid", avoid);
    }

    private String fallbackChatResponse(String loweredMessage) {
        if (containsAny(loweredMessage, "fuel", "petrol", "gas")) {
            return "Nearest fuel routing is available offline and prefers primary corridors.";
        }
        if (containsAny(loweredMessage, "safe", "night")) {
            return "Safest mode penalizes minor roads and prioritizes major corridors.";
        }
        if (containsAny(loweredMessage, "offline")) {
            return "Routing, search, and region data provisioning remain available offline.";
        }
        return "Provide destination or stop type with routing preferences like safest, eco, or no toll.";
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

    private String normalizeMode(String mode) {
        switch (mode.toLowerCase(Locale.US)) {
            case "safest":
            case "eco":
            case "no-toll":
            case "fastest":
                return mode.toLowerCase(Locale.US);
            case "notoll":
            case "no_toll":
                return "no-toll";
            default:
                return "fastest";
        }
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
        if (containsAny(lowered, "hospital", "clinic", "doctor", "emergency", "aspatal")) {
            return "hospital";
        }
        if (containsAny(lowered, "fuel", "gas", "petrol", "diesel", "indhan")) {
            return "fuel";
        }
        if (containsAny(lowered, "charging", "charger", "ev", "battery charge")) {
            return "charging";
        }
        if (containsAny(lowered, "restaurant", "food", "cafe", "coffee", "chai", "khana")) {
            return "restaurant";
        }
        if (containsAny(lowered, "hotel", "motel", "stay", "lodge")) {
            return "hotel";
        }
        if (containsAny(lowered, "pharmacy", "chemist", "medicine")) {
            return "pharmacy";
        }
        if (containsAny(lowered, "rest area", "washroom", "toilet", "service area")) {
            return "rest_area";
        }
        return null;
    }

    private String extractDestination(String lowered) {
        Matcher matcher = destinationPattern.matcher(lowered);
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

    private int positiveOrDefault(Integer value, int fallback) {
        return value != null && value > 0 ? value : fallback;
    }

    private List<String> tokenize(String value) {
        List<String> tokens = new ArrayList<>();
        for (String raw : value.toLowerCase(Locale.US).replaceAll("[^a-z0-9\\u0900-\\u097f]+", " ").split("\\s+")) {
            if (!raw.isEmpty()) {
                tokens.add(raw);
            }
        }
        return tokens;
    }

    private JSArray dedupeArray(JSArray source) {
        JSArray deduped = new JSArray();
        List<String> seen = new ArrayList<>();
        for (int i = 0; i < source.length(); i++) {
            String value = source.optString(i, "").trim();
            if (!value.isEmpty() && !seen.contains(value)) {
                seen.add(value);
                deduped.put(value);
            }
        }
        return deduped;
    }

    private String extractJson(String source) {
        int start = source.indexOf('{');
        int end = source.lastIndexOf('}');
        if (start < 0 || end <= start) {
            return null;
        }
        return source.substring(start, end + 1);
    }
}
