package com.aimapsystem.app;

import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
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

    private static final int MAX_GENERATED_TOKENS = 320;
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
    private String personalKey = BuildConfig.ZETIC_PAT;
    private String locale = "en-US";
    private Object llmModel = null;
    private Object speechModel = null;
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
        locale = valueOrDefault(call.getString("locale"), locale);

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
            invokeMethod(llmModel, "run", new Class<?>[]{String.class}, new Object[]{prompt});

            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < MAX_GENERATED_TOKENS; i++) {
                Object tokenResult = invokeMethod(llmModel, "waitForNextToken", new Class<?>[]{}, new Object[]{});
                if (tokenResult == null) {
                    break;
                }

                int generatedTokens = readIntMember(tokenResult, "generatedTokens", "getGeneratedTokens");
                if (generatedTokens == 0) {
                    break;
                }
                String token = readStringMember(tokenResult, "token", "getToken");
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
        if (speechModel == null) {
            return null;
        }
        try {
            Object response;
            try {
                response = invokeMethod(
                        speechModel,
                        "transcribeBase64",
                        new Class<?>[]{String.class},
                        new Object[]{audioBase64}
                );
            } catch (Exception firstError) {
                response = invokeMethod(
                        speechModel,
                        "run",
                        new Class<?>[]{String.class},
                        new Object[]{audioBase64}
                );
            }
            return response == null ? null : response.toString().trim();
        } catch (Exception error) {
            return null;
        }
    }

    private JSObject buildPrepareResult() {
        JSObject result = new JSObject();
        result.put("prepared", prepared);
        result.put("runtime", nativeModelReady ? "melange-llm" : "native-bridge");
        result.put("supportsNativeMelange", nativeModelReady);
        result.put("supportsVoiceCommands", speechModel != null);
        result.put("supportsSemanticSearch", nativeModelReady);
        result.put("supportsPredictiveCaching", nativeModelReady);
        result.put("threadingModel", "ui+navigation+ai+index+background");
        result.put("llmModelName", llmModelName);
        result.put("speechModelName", speechModelName);
        result.put("llmRuntimeClass", llmRuntimeClass == null ? JSONObject.NULL : llmRuntimeClass);
        result.put("speechRuntimeClass", speechRuntimeClass == null ? JSONObject.NULL : speechRuntimeClass);
        return result;
    }

    private void initializeModel() throws Exception {
        releaseModel();
        if (personalKey == null || personalKey.trim().isEmpty()) {
            nativeModelReady = false;
            return;
        }

        // Real ZETIC Melange Android SDK 1.6+ package; the previous
        // `ai.zetic.mlange.*` paths never resolved. The LLM class lives at
        // `com.zeticai.mlange.core.model.llm.ZeticMLangeLLMModel`. Reflection is
        // retained instead of a direct import only so that JVM-default-arg
        // constructors stay usable from Java; replacement with a typed Kotlin
        // wrapper is tracked as a follow-up.
        String[] classCandidates = new String[]{
            "com.zeticai.mlange.core.model.llm.ZeticMLangeLLMModel"
        };

        String[] modelCandidates = new String[]{
            llmModelName,
            llmFallbackModelName
        };

        Exception lastError = null;
        for (String modelId : modelCandidates) {
            if (modelId == null || modelId.trim().isEmpty()) {
                continue;
            }
            for (String className : classCandidates) {
                try {
                    Class<?> modelClass = Class.forName(className);
                    Constructor<?> constructor = resolveContextKeyNameConstructor(modelClass);
                    if (constructor == null) {
                        lastError = new NoSuchMethodException(
                                "No (Context,String,String) constructor on " + className
                        );
                        continue;
                    }
                    llmModel = constructor.newInstance(getContext(), personalKey, modelId);
                    llmRuntimeClass = className;
                    llmModelName = modelId;
                    nativeModelReady = true;
                    initializeSpeechModel();
                    return;
                } catch (Exception error) {
                    lastError = error;
                }
            }
        }

        nativeModelReady = false;
        if (lastError != null) {
            throw lastError;
        }
        initializeSpeechModel();
    }

    private void initializeSpeechModel() {
        // Whisper integration on Melange is a two-stage pipeline (encoder + decoder
        // ZeticMLangeModel instances) fed with mel-spectrogram tensors, not a single
        // `transcribeBase64` call. Until the tensor I/O path is wired (see the
        // "Whisper tensor I/O wiring" roadmap task), keep the speech model
        // intentionally unset so callers correctly fall back to the JS path.
        speechModel = null;
        speechRuntimeClass = null;
    }

    private Constructor<?> resolveContextKeyNameConstructor(Class<?> modelClass) {
        // Kotlin classes compiled without @JvmOverloads expose only the full
        // constructor. Walk every public ctor and accept any whose first three
        // params are (Context, String, String); remaining params receive null.
        for (Constructor<?> candidate : modelClass.getConstructors()) {
            Class<?>[] params = candidate.getParameterTypes();
            if (params.length >= 3
                    && Context.class.isAssignableFrom(params[0])
                    && params[1] == String.class
                    && params[2] == String.class
                    && params.length == 3) {
                return candidate;
            }
        }
        return null;
    }

    private void releaseModel() {
        if (llmModel != null) {
            try {
                invokeMethod(llmModel, "deinit", new Class<?>[]{}, new Object[]{});
            } catch (Exception ignored) {
                // ignore
            }
        }
        llmModel = null;
        llmRuntimeClass = null;
        speechModel = null;
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

    private Object invokeMethod(
            Object target,
            String methodName,
            Class<?>[] parameterTypes,
            Object[] args
    ) throws Exception {
        Method method = target.getClass().getMethod(methodName, parameterTypes);
        method.setAccessible(true);
        return method.invoke(target, args);
    }

    private int readIntMember(Object target, String fieldName, String getterName) {
        List<Integer> candidates = new ArrayList<>();
        try {
            Field field = target.getClass().getField(fieldName);
            Object value = field.get(target);
            if (value instanceof Number) {
                candidates.add(((Number) value).intValue());
            }
        } catch (Exception ignored) {
            // ignore
        }
        try {
            Method getter = target.getClass().getMethod(getterName);
            Object value = getter.invoke(target);
            if (value instanceof Number) {
                candidates.add(((Number) value).intValue());
            }
        } catch (Exception ignored) {
            // ignore
        }
        return candidates.isEmpty() ? 0 : candidates.get(0);
    }

    private String readStringMember(Object target, String fieldName, String getterName) {
        try {
            Field field = target.getClass().getField(fieldName);
            Object value = field.get(target);
            if (value != null) {
                return value.toString();
            }
        } catch (Exception ignored) {
            // ignore
        }

        try {
            Method getter = target.getClass().getMethod(getterName);
            Object value = getter.invoke(target);
            if (value != null) {
                return value.toString();
            }
        } catch (Exception ignored) {
            // ignore
        }
        return null;
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
