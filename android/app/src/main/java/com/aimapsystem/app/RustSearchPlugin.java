package com.aimapsystem.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "RustSearch")
public class RustSearchPlugin extends Plugin {

    private boolean prepared = false;
    private String activeRegion = "";
    private String activeVersion = "";

    @PluginMethod
    public void prepareIndex(PluginCall call) {
        String regionId = call.getString("regionId", "").trim();
        String graphPath = call.getString("graphPath", "").trim();
        String poiPath = call.getString("poiPath", "").trim();
        String dataVersion = call.getString("dataVersion", "").trim();

        JSObject result = new JSObject();
        result.put("nativeAvailable", RustSearchNativeBridge.isAvailable());

        if (!RustSearchNativeBridge.isAvailable()) {
            prepared = false;
            result.put("prepared", false);
            result.put("reason", "Rust native library not loaded");
            call.resolve(result);
            return;
        }

        try {
            boolean success = RustSearchNativeBridge.nativePrepareIndex(
              regionId,
              graphPath,
              poiPath,
              dataVersion
            );
            prepared = success;
            if (success) {
                activeRegion = regionId;
                activeVersion = dataVersion;
            }
            result.put("prepared", success);
            result.put("regionId", regionId);
            result.put("dataVersion", dataVersion);
            call.resolve(result);
        } catch (Throwable error) {
            prepared = false;
            result.put("prepared", false);
            result.put("error", error.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void search(PluginCall call) {
        String query = call.getString("query", "").trim();
        String regionId = call.getString("regionId", activeRegion).trim();
        int limit = call.getInt("limit", 6);
        Double biasLng = call.getDouble("biasLng");
        Double biasLat = call.getDouble("biasLat");

        JSObject result = new JSObject();
        result.put("nativeAvailable", RustSearchNativeBridge.isAvailable());
        result.put("prepared", prepared);
        result.put("results", new JSArray());

        if (!RustSearchNativeBridge.isAvailable() || !prepared || query.isEmpty()) {
            call.resolve(result);
            return;
        }

        try {
            String payload = RustSearchNativeBridge.nativeSearch(
              query,
              regionId,
              Math.max(1, Math.min(20, limit)),
              biasLng == null ? 0.0 : biasLng,
              biasLat == null ? 0.0 : biasLat
            );

            if (payload == null || payload.trim().isEmpty()) {
                call.resolve(result);
                return;
            }

            JSONObject parsed = new JSONObject(payload);
            JSONArray nativeResults = parsed.optJSONArray("results");
            if (nativeResults != null) {
                JSArray out = new JSArray();
                for (int i = 0; i < nativeResults.length(); i++) {
                    out.put(nativeResults.get(i));
                }
                result.put("results", out);
            }

            result.put("regionId", parsed.optString("regionId", regionId));
            result.put("dataVersion", parsed.optString("dataVersion", activeVersion));
            result.put("latencyMs", parsed.optDouble("latencyMs", -1));
            call.resolve(result);
        } catch (Throwable error) {
            result.put("error", error.getMessage());
            call.resolve(result);
        }
    }
}
