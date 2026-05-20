param(
    [string]$GradleUserHome = "H:\MelangeMaps\gradle-cache",
    [string]$TempRoot = "H:\MelangeMaps\gradle-tmp",
    [string]$ApkOutDir = "H:\MelangeMaps\apks",
    [switch]$NoDaemon = $true
)

$ErrorActionPreference = "Stop"

function Resolve-JavaHome {
    $candidates = @(
        "C:\Program Files\Java\jdk-17",
        "C:\Program Files\Android\Android Studio\jbr"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path (Join-Path $candidate "bin\java.exe")) {
            return $candidate
        }
    }

    if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
        return $env:JAVA_HOME
    }

    throw "No supported Java runtime found. Install JDK 17 or Android Studio JBR."
}

$javaHome = Resolve-JavaHome
New-Item -ItemType Directory -Force -Path $GradleUserHome, $TempRoot, $ApkOutDir | Out-Null

$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"
$env:GRADLE_USER_HOME = $GradleUserHome
$env:TEMP = $TempRoot
$env:TMP = $TempRoot

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$androidRoot = Join-Path $repoRoot "android"

Push-Location $androidRoot
try {
    $arguments = @(":app:assembleDebug", "--console=plain")
    if ($NoDaemon) {
        $arguments += "--no-daemon"
    }

    & ".\gradlew.bat" @arguments
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $apkPath = Join-Path $androidRoot "app\build\outputs\apk\debug\app-debug.apk"
    if (Test-Path $apkPath) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmm"
        $dest = Join-Path $ApkOutDir "MelangeMaps-debug-$stamp.apk"
        Copy-Item -Force $apkPath $dest
        Copy-Item -Force $apkPath (Join-Path $ApkOutDir "MelangeMaps-debug-latest.apk")
        Write-Host "[ok] apk -> $dest"
    } else {
        Write-Warning "APK not found at expected path: $apkPath"
    }
}
finally {
    Pop-Location
}