#!/usr/bin/env bash
# Build the Snow wasm wrapper into public/emulators/mac/.
#
#   emulators/snow-web/build.sh            # release build
#   WASM_OPT=0 emulators/snow-web/build.sh # skip wasm-opt even if it's installed
#   WASM_OPT_BIN=/path/to/wasm-opt build.sh
#
# Needs: git, rustup with the 1.95.0 toolchain + wasm32-unknown-unknown (see rust-toolchain.toml),
# wasm-bindgen-cli 0.2.108 (cargo install wasm-bindgen-cli --version 0.2.108 --locked).
# Optional: wasm-opt (binaryen) on PATH.
set -euo pipefail

CRATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$CRATE_DIR/../.." && pwd)"
OUT_DIR="$REPO_DIR/public/emulators/mac"
TARGET=wasm32-unknown-unknown
BINDGEN_VERSION=0.2.108
SNOW_URL=https://github.com/twvd/snow.git
SNOW_REV=e339af646787bac5effed80426c38be5a2c291cd
SNOW_DIR="$CRATE_DIR/vendor/snow"

cd "$CRATE_DIR"

# Snow at the pinned commit, with patches/snow-wasm.patch applied (and nothing else).
if [[ ! -d "$SNOW_DIR/.git" ]]; then
    echo "==> cloning Snow"
    mkdir -p "$CRATE_DIR/vendor"
    git clone --quiet "$SNOW_URL" "$SNOW_DIR"
fi
if ! git -C "$SNOW_DIR" cat-file -e "$SNOW_REV^{commit}" 2>/dev/null; then
    git -C "$SNOW_DIR" fetch --quiet origin
fi
echo "==> Snow $SNOW_REV + patches/snow-wasm.patch"
git -C "$SNOW_DIR" checkout --quiet --force "$SNOW_REV"
git -C "$SNOW_DIR" clean --quiet -fdx -e target
git -C "$SNOW_DIR" apply "$CRATE_DIR/patches/snow-wasm.patch"

# The pinned toolchain's own cargo/rustc, so a Homebrew cargo on PATH doesn't get in the way.
TOOLCHAIN="$(sed -n 's/^channel *= *"\(.*\)"/\1/p' rust-toolchain.toml)"
SYSROOT="$(rustup run "$TOOLCHAIN" rustc --print sysroot)"
export PATH="$SYSROOT/bin:$PATH"
export RUSTC="$SYSROOT/bin/rustc"
echo "==> rustc: $("$RUSTC" --version)"

if ! command -v wasm-bindgen >/dev/null || [[ "$(wasm-bindgen --version)" != "wasm-bindgen $BINDGEN_VERSION" ]]; then
    echo "error: need wasm-bindgen $BINDGEN_VERSION (cargo install wasm-bindgen-cli --version $BINDGEN_VERSION --locked)" >&2
    exit 1
fi

echo "==> cargo build --release --target $TARGET"
cargo build --release --locked --target "$TARGET"

RAW="$CRATE_DIR/target/$TARGET/release/snow_web.wasm"
WORK="$CRATE_DIR/target/web"
rm -rf "$WORK"
mkdir -p "$WORK"

echo "==> wasm-bindgen --target web"
wasm-bindgen --target web --out-dir "$WORK/pkg" --out-name snow_web "$RAW"

WASM_OPT_BIN="${WASM_OPT_BIN:-wasm-opt}"
if [[ "${WASM_OPT:-1}" != "0" ]] && command -v "$WASM_OPT_BIN" >/dev/null; then
    echo "==> wasm-opt -O3 ($("$WASM_OPT_BIN" --version))"
    "$WASM_OPT_BIN" -O3 \
        --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext \
        --enable-mutable-globals --enable-multivalue --enable-reference-types \
        "$WORK/pkg/snow_web_bg.wasm" -o "$WORK/pkg/snow_web_bg.opt.wasm"
    mv "$WORK/pkg/snow_web_bg.opt.wasm" "$WORK/pkg/snow_web_bg.wasm"
    OPTIMISED="yes ($("$WASM_OPT_BIN" --version))"
else
    echo "==> wasm-opt not found (or WASM_OPT=0): shipping rustc/LTO output as-is"
    OPTIMISED="no"
fi

mkdir -p "$OUT_DIR"
cp "$WORK/pkg/snow_web.js" "$WORK/pkg/snow_web_bg.wasm" "$WORK/pkg/snow_web.d.ts" "$OUT_DIR/"
cp "$CRATE_DIR/web/NOTICE.txt" "$OUT_DIR/NOTICE.txt"
cp "$SNOW_DIR/LICENSE" "$OUT_DIR/LICENSE-Snow-MIT.txt"

WASM_OUT="$OUT_DIR/snow_web_bg.wasm"
RAW_SIZE=$(wc -c < "$WASM_OUT" | tr -d ' ')
GZ_SIZE=$(gzip -9 -c "$WASM_OUT" | wc -c | tr -d ' ')
echo
echo "built $OUT_DIR"
echo "  snow_web_bg.wasm: $RAW_SIZE bytes raw, $GZ_SIZE bytes gzip -9"
echo "  wasm-opt: $OPTIMISED"
