package com.aimapsystem.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GraphHopperRouting")
public class GraphHopperRoutingPlugin extends Plugin {

    private boolean prepared = false;
    private String graphDir = null;

    @PluginMethod
    public void prepare(PluginCall call) {
        String requestedGraphDir = call.getString("graphDir", null);
        this.graphDir = requestedGraphDir;
        this.prepared = requestedGraphDir != null && !requestedGraphDir.trim().isEmpty();

        JSObject response = new JSObject();
        response.put("nativeAvailable", false);
        response.put("prepared", this.prepared);
        response.put("graphDir", this.graphDir);
        call.resolve(response);
    }

    @PluginMethod
    public void route(PluginCall call) {
        JSObject response = new JSObject();
        response.put("ok", false);
        response.put("error", "native_graphhopper_not_enabled");
        call.resolve(response);
    }
}