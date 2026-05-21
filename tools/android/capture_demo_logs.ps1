param(
  [string]$OutDir = "H:\MelangeMaps\logs",
  [string]$TagFilter = "Melange MainActivity GraphHopperRoutingPlugin RoutingManager"
)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$logFile = Join-Path $OutDir "demo_logcat_$timestamp.txt"

Write-Host "Clearing logcat buffer..."
adb logcat -c

Write-Host "Capturing logs to: $logFile"
Write-Host "Press Ctrl+C to stop capture."

adb logcat | findstr /i $TagFilter | Tee-Object -FilePath $logFile
