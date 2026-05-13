param(
  [string]$OutputDir = "android/app/src/main/jniLibs",
  [string]$AndroidApi = "24"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw "cargo is required."
}

if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
  throw "rustup is required."
}

if (-not (Get-Command cargo-ndk -ErrorAction SilentlyContinue)) {
  Write-Host "[info] cargo-ndk is not installed. Installing..." -ForegroundColor Cyan
  cargo install cargo-ndk
  if ($LASTEXITCODE -ne 0) {
    throw "cargo-ndk installation failed"
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$crateDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$jniOut = Join-Path $repoRoot $OutputDir

$targets = @("arm64-v8a", "armeabi-v7a", "x86_64")
$rustTargets = @("aarch64-linux-android", "armv7-linux-androideabi", "x86_64-linux-android")

Write-Host "[info] Building Rust search for Android targets: $($targets -join ', ')" -ForegroundColor Cyan
Push-Location $crateDir
try {
  rustup target add $rustTargets
  if ($LASTEXITCODE -ne 0) {
    throw "rustup target add failed"
  }

  $ndkArgs = @("ndk")
  foreach ($target in $targets) {
    $ndkArgs += @("-t", $target)
  }
  $ndkArgs += @("-o", $jniOut, "--platform", $AndroidApi, "build", "--release")

  & cargo @ndkArgs
  if ($LASTEXITCODE -ne 0) {
    throw "cargo ndk build failed"
  }
}
finally {
  Pop-Location
}

Write-Host "[ok] Rust Android libraries emitted to: $jniOut" -ForegroundColor Green
