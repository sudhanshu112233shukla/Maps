package com.aimapsystem.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.Locale;

import com.graphhopper.GraphHopper;
import com.graphhopper.GHRequest;
import com.graphhopper.GHResponse;
import com.graphhopper.ResponsePath;
import com.graphhopper.config.CHProfile;
import com.graphhopper.config.Profile;
import com.graphhopper.util.Instruction;
import com.graphhopper.util.InstructionList;
import com.graphhopper.util.PointList;
import com.graphhopper.util.Translation;
import com.graphhopper.util.TranslationMap;

@CapacitorPlugin(name = "GraphHopperRouting")
public class GraphHopperRoutingPlugin extends Plugin {
    private GraphHopper hopper = null;
    private boolean prepared = false;
    private String preparedRegionId = null;
    private String preparedGraphDir = null;

    private JSObject baseStatus() {
        JSObject ret = new JSObject();
        ret.put("nativeAvailable", true);
        ret.put("prepared", prepared);
        ret.put("regionId", preparedRegionId);
        ret.put("graphDir", preparedGraphDir);
        return ret;
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        String regionId = call.getString("regionId", "");
        String graphDir = call.getString("graphDir", "");

        prepared = false;
        preparedRegionId = regionId;
        preparedGraphDir = graphDir;
        hopper = null;

        JSObject ret = baseStatus();

        if (graphDir == null || graphDir.trim().isEmpty()) {
            call.resolve(ret);
            return;
        }

        File graphFolder = new File(graphDir);
        if (!graphFolder.exists() || !graphFolder.isDirectory()) {
            call.resolve(ret);
            return;
        }

        try {
            GraphHopper gh = new GraphHopper();
            gh.setGraphHopperLocation(graphDir);

            // GraphHopper v9 profiles are configured via weighting + hints.
            gh.setProfiles(new Profile("car")
                    .setWeighting("fastest")
                    .putHint("vehicle", "car"));

            // If a CH graph is shipped, this must match.
            gh.getCHPreparationHandler().setCHProfiles(new CHProfile("car"));

            boolean loaded = gh.load();
            if (!loaded) {
                call.resolve(ret);
                return;
            }

            hopper = gh;
            prepared = true;
            call.resolve(baseStatus());
        } catch (Exception e) {
            call.resolve(ret);
        }
    }

    private static String iconForSign(int sign) {
        if (sign == Instruction.TURN_LEFT || sign == Instruction.TURN_SHARP_LEFT || sign == Instruction.TURN_SLIGHT_LEFT || sign == Instruction.KEEP_LEFT) {
            return "left";
        }
        if (sign == Instruction.TURN_RIGHT || sign == Instruction.TURN_SHARP_RIGHT || sign == Instruction.TURN_SLIGHT_RIGHT || sign == Instruction.KEEP_RIGHT) {
            return "right";
        }
        if (sign == Instruction.U_TURN_LEFT || sign == Instruction.U_TURN_RIGHT || sign == Instruction.U_TURN_UNKNOWN) {
            return "uturn";
        }
        if (sign == Instruction.FINISH) {
            return "arrive";
        }
        return "straight";
    }

    @PluginMethod
    public void route(PluginCall call) {
        long start = System.nanoTime();
        JSObject status = baseStatus();

        if (!prepared || hopper == null) {
            status.put("route", null);
            status.put("latencyMs", 0);
            call.resolve(status);
            return;
        }

        Double startLng = call.getDouble("startLng");
        Double startLat = call.getDouble("startLat");
        Double endLng = call.getDouble("endLng");
        Double endLat = call.getDouble("endLat");
        String profile = call.getString("profile", "car");
        String locale = call.getString("locale", "en");

        if (startLng == null || startLat == null || endLng == null || endLat == null) {
            status.put("route", null);
            status.put("latencyMs", 0);
            call.resolve(status);
            return;
        }

        try {
            GHRequest req = new GHRequest(startLat, startLng, endLat, endLng)
                    .setProfile(profile)
                    .setLocale(locale);

            GHResponse rsp = hopper.route(req);
            if (rsp.hasErrors()) {
                status.put("route", null);
                status.put("latencyMs", (System.nanoTime() - start) / 1_000_000.0);
                call.resolve(status);
                return;
            }

            ResponsePath best = rsp.getBest();
            PointList points = best.getPoints();

            JSArray coords = new JSArray();
            for (int i = 0; i < points.size(); i += 1) {
                JSArray pair = new JSArray();
                pair.put(points.getLon(i));
                pair.put(points.getLat(i));
                coords.put(pair);
            }

            TranslationMap map = hopper.getTranslationMap();
            Locale javaLocale = Locale.forLanguageTag(locale);
            Translation tr = map.getWithFallBack(javaLocale);

            InstructionList list = best.getInstructions();
            JSArray instructions = new JSArray();
            for (Instruction inst : list) {
                JSObject step = new JSObject();
                step.put("text", inst.getTurnDescription(tr));
                step.put("dist", inst.getDistance());
                step.put("icon", iconForSign(inst.getSign()));
                instructions.put(step);
            }

            JSObject route = new JSObject();
            route.put("coords", coords);
            route.put("distance", best.getDistance());
            route.put("duration", best.getTime() / 1000.0);
            route.put("instructions", instructions);

            status.put("route", route);
            status.put("latencyMs", (System.nanoTime() - start) / 1_000_000.0);
            call.resolve(status);
        } catch (Exception e) {
            status.put("route", null);
            status.put("latencyMs", (System.nanoTime() - start) / 1_000_000.0);
            call.resolve(status);
        }
    }
}