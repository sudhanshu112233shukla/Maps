#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CRATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$REPO_ROOT/ios/App/App/Frameworks}"

mkdir -p "$OUT_DIR"

pushd "$CRATE_DIR" >/dev/null

rustup target add aarch64-apple-ios x86_64-apple-ios

cargo build --release --target aarch64-apple-ios
cargo build --release --target x86_64-apple-ios

ARM64_LIB="$CRATE_DIR/target/aarch64-apple-ios/release/libmelange_rust_search.a"
X64_LIB="$CRATE_DIR/target/x86_64-apple-ios/release/libmelange_rust_search.a"
UNIVERSAL_LIB="$OUT_DIR/libmelange_rust_search.a"

lipo -create -output "$UNIVERSAL_LIB" "$ARM64_LIB" "$X64_LIB"

popd >/dev/null

echo "[ok] iOS universal static library: $UNIVERSAL_LIB"
