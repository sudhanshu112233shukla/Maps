# Device Validation Runbook (Android)

## 1) Install debug APK
```powershell
adb install -r H:\maps\Maps\android\app\build\outputs\apk\debug\app-debug.apk
```

## 2) Start clean log capture
```powershell
adb logcat -c
adb logcat | findstr /i "Melange MainActivity GraphHopperRoutingPlugin RoutingManager"
```

## 3) Open app and run health checks in WebView console
Run:
```js
window.getAIHealth()
window.getNavigationHealth()
```

Expected target for demo:
- `supportsNativeMelange: true`
- `fallbackActive: false`
- `routingBackend: "graphhopper-native"`

## 4) Region activation checks
In app Offline Region Manager:
1. Download region pack
2. Activate region
3. Re-run:
```js
window.getNavigationHealth()
```
Validate:
- `graphPackLoaded: true`
- `routingBackend: "graphhopper-native"`

## 5) Airplane-mode certification
1. Enable airplane mode
2. Relaunch app
3. Search destination via semantic query
4. Start route
5. Deviate route intentionally
6. Verify reroute occurs

Pass criteria:
- route builds offline
- turn instructions update
- reroute recovers without JS fallback

## 6) Save technical proof artifacts
- Console output of `window.getAIHealth()`
- Console output of `window.getNavigationHealth()`
- ADB log file showing Melange + GraphHopper prepare/activation
- Short screen recording of airplane-mode navigation
