# Release Certification Report — Melange Maps v0.9.0-demo-rc1

Date: 2026-05-21
Build: MelangeMaps-v0.9.0-demo-rc1-release.apk
Tester: Codex + Device QA (pending)

## Gate Summary (GO / NO-GO)
- Melange native runtime active (`supportsNativeMelange=true`): [ ] PASS [ ] FAIL
- AI fallback disabled (`fallbackActive=false`): [ ] PASS [ ] FAIL
- GraphHopper active (`routingBackend=graphhopper-native`): [ ] PASS [ ] FAIL
- Graph pack loaded (`graphPackLoaded=true`): [ ] PASS [ ] FAIL
- Airplane-mode navigation stable: [ ] PASS [ ] FAIL
- No critical crashes in smoke tests: [ ] PASS [ ] FAIL

Final decision: [ ] GO  [x] NO-GO
Blocking issues (if NO-GO):`n- Physical-device runtime proof not yet captured for Melange native/no-fallback.`n- Physical-device runtime proof not yet captured for GraphHopper-native/graphPackLoaded.`n- Full airplane-mode certification (3 regions) pending.`n
---

## 1) Runtime Proofs
### AI Health
Command/Console:
```js
window.getAIHealth()
```
Observed output:
```json
{}
```
Result: [ ] PASS [ ] FAIL

### Navigation Health
Command/Console:
```js
window.getNavigationHealth()
```
Observed output:
```json
{}
```
Result: [ ] PASS [ ] FAIL

---

## 2) Device Matrix
| Device | RAM | Android | Build | Startup | Route latency | Result |
|---|---:|---:|---|---|---|---|
| Device A (low-end) | | | | | | [ ] PASS [ ] FAIL |
| Device B (mid-range) | | | | | | [ ] PASS [ ] FAIL |

---

## 3) Airplane-Mode Certification
Regions under test:
- `india_goa`
- `usa_hawaii`
- `kr_seoul_core`

Per-region flow:
1. Install APK
2. Download pack
3. Activate pack
4. Enable airplane mode
5. Semantic search
6. Route generation
7. Start navigation
8. Force reroute
9. Reach destination
10. Reopen app and verify persistence

### Results
| Region | Offline search | Route build | Turn guidance | Reroute | Persistence | Result |
|---|---|---|---|---|---|---|
| india_goa | | | | | | [ ] PASS [ ] FAIL |
| usa_hawaii | | | | | | [ ] PASS [ ] FAIL |
| kr_seoul_core | | | | | | [ ] PASS [ ] FAIL |

---

## 4) Region Pack Lifecycle QA
For each region validate: download ? activate ? delete ? re-download ? re-activate.

| Region | Download | Activate | Delete | Re-download | Re-activate | Rollback safety | Result |
|---|---|---|---|---|---|---|---|
| india_goa | | | | | | | [ ] PASS [ ] FAIL |
| usa_hawaii | | | | | | | [ ] PASS [ ] FAIL |
| kr_seoul_core | | | | | | | [ ] PASS [ ] FAIL |

---

## 5) Log Evidence
Capture script:
```powershell
powershell -ExecutionPolicy Bypass -File tools\android\capture_demo_logs.ps1
```
Log location: `H:\MelangeMaps\logs\`

Attach files:
- [ ] Melange prepare / warmup logs
- [ ] GraphHopper prepare / activation logs
- [ ] Reroute event logs
- [ ] Error logs (if any)

---

## 6) Release APK Artifacts
Required output:
- `H:\MelangeMaps\apks\MelangeMaps-v0.9.0-demo-rc1-release.apk`

Checklist:
- [ ] Release keystore signing configured
- [ ] `assembleRelease` successful
- [ ] APK aligns/installs
- [ ] No debug overlays/log spam

---

## 7) Final Sign-off
Engineering: ____________________  Date: __________
QA: _____________________________  Date: __________
Product/Demo Owner: _____________  Date: __________

