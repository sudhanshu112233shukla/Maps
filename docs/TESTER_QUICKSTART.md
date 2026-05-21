# Tester Quickstart (Melange Maps RC1)

## APK
- `H:\MelangeMaps\apks\MelangeMaps-v0.9.0-demo-rc1-release.apk`

## 1) Install
```powershell
adb install -r H:\MelangeMaps\apks\MelangeMaps-v0.9.0-demo-rc1-release.apk
```

## 2) App Permissions
- Allow location (precise)
- Allow microphone (for voice tests)
- Allow storage/files if prompted

## 3) Start log capture (required)
```powershell
powershell -ExecutionPolicy Bypass -File tools\android\capture_demo_logs.ps1
```

## 4) Runtime checks (WebView console)
```js
window.getAIHealth()
window.getNavigationHealth()
```
Required:
- `supportsNativeMelange=true`
- `fallbackActive=false`
- `routingBackend="graphhopper-native"`
- `graphPackLoaded=true`

## 5) Region test flow
Run for:
- `india_goa`
- `usa_hawaii`
- `kr_seoul_core`

For each region:
1. Download pack
2. Activate pack
3. Search destination
4. Start route
5. Deviate to force reroute
6. Delete pack
7. Re-download and re-activate

## 6) Airplane-mode certification
1. Activate a region pack
2. Turn airplane mode ON
3. Restart app
4. Search semantically
5. Route + navigate + reroute
6. Close/reopen app and verify state persists

## 7) Report bugs
Include:
- Device model + Android version
- Region tested
- Exact step where failure happened
- Screenshot/screen recording
- Corresponding log lines from capture file
