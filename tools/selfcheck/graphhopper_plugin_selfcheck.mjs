import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainActivity = await readFile('android/app/src/main/java/com/aimapsystem/app/MainActivity.java', 'utf8');
assert(mainActivity.includes('registerPlugin(GraphHopperRoutingPlugin.class)'), 'MainActivity does not register GraphHopperRoutingPlugin');

const buildGradle = await readFile('android/app/build.gradle', 'utf8');
assert(buildGradle.includes('com.graphhopper:graphhopper-core'), 'android/app/build.gradle missing graphhopper-core dependency');

const jsBridge = await readFile('src/routing/GraphHopperBridge.js', 'utf8');
assert(jsBridge.includes("registerPlugin('GraphHopperRouting')"), 'JS bridge missing GraphHopperRouting plugin binding');

process.stdout.write('[ok] graphhopper plugin selfcheck: wiring present (native + JS bridge)\n');