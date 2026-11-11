#!/usr/bin/env bash
# Build the MartyPC wasm wrapper into public/emulators/martypc/.
#
#   emulators/martypc-web/build.sh            # release build
#   WASM_OPT=0 emulators/martypc-web/build.sh # skip wasm-opt even if it's installed
#   WASM_OPT_BIN=/path/to/wasm-opt build.sh    # use a wasm-opt that isn't on PATH
#
# Needs: rustup with the 1.92.0 toolchain + wasm32-unknown-unknown (see rust-toolchain.toml),
# wasm-bindgen-cli 0.2.108 (cargo install wasm-bindgen-cli --version 0.2.108 --locked),
# python3. Optional: wasm-opt (binaryen) on PATH.
set -euo pipefail

CRATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$CRATE_DIR/../.." && pwd)"
OUT_DIR="$REPO_DIR/public/emulators/martypc"
TARGET=wasm32-unknown-unknown
BINDGEN_VERSION=0.2.108

cd "$CRATE_DIR"

# Use the pinned toolchain's own cargo/rustc. A Homebrew cargo earlier on PATH would otherwise
# win even under `rustup run`, and it has no wasm32 std.
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

RAW="$CRATE_DIR/target/$TARGET/release/martypc_web.wasm"
WORK="$CRATE_DIR/target/web"
rm -rf "$WORK"
mkdir -p "$WORK"
cp "$RAW" "$WORK/martypc_web.wasm"

# MartyPC compiles its MDA/CGA/Tandy glyph bitmaps into the core. Swap in ours, generated from
# VileR's CC BY-SA 4.0 font pack (see fonts/ and README.md).
MARTY_CORE_DIR="$(cargo metadata --locked --format-version 1 --filter-platform "$TARGET" |
    python3 -I -c 'import json,sys,os; m=json.load(sys.stdin); print(next(os.path.dirname(p["manifest_path"]) for p in m["packages"] if p["name"]=="marty_core"))')"
echo "==> patching character-generator fonts"
python3 -I tools/patch_fonts.py "$WORK/martypc_web.wasm" "$MARTY_CORE_DIR/assets" "$CRATE_DIR/fonts"

echo "==> wasm-bindgen --target web"
wasm-bindgen --target web --no-typescript --out-dir "$WORK/pkg" --out-name martypc_web "$WORK/martypc_web.wasm"
# Keep the .d.ts too; it documents the API for the page.
wasm-bindgen --target web --out-dir "$WORK/pkg-ts" --out-name martypc_web "$WORK/martypc_web.wasm"
cp "$WORK/pkg-ts/martypc_web.d.ts" "$WORK/pkg/"

WASM_OPT_BIN="${WASM_OPT_BIN:-wasm-opt}"
if [[ "${WASM_OPT:-1}" != "0" ]] && command -v "$WASM_OPT_BIN" >/dev/null; then
    echo "==> wasm-opt -O3 ($("$WASM_OPT_BIN" --version))"
    "$WASM_OPT_BIN" -O3 \
        --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext \
        --enable-mutable-globals --enable-multivalue --enable-reference-types \
        "$WORK/pkg/martypc_web_bg.wasm" -o "$WORK/pkg/martypc_web_bg.opt.wasm"
    mv "$WORK/pkg/martypc_web_bg.opt.wasm" "$WORK/pkg/martypc_web_bg.wasm"
    OPTIMISED="yes ($("$WASM_OPT_BIN" --version))"
else
    echo "==> wasm-opt not found (or WASM_OPT=0): shipping rustc/LTO output as-is"
    OPTIMISED="no (wasm-opt not available)"
fi

mkdir -p "$OUT_DIR"
cp "$WORK/pkg/martypc_web.js" "$WORK/pkg/martypc_web_bg.wasm" "$WORK/pkg/martypc_web.d.ts" "$OUT_DIR/"
cp "$CRATE_DIR/web/martypc.js" "$CRATE_DIR/web/martypc.d.ts" "$OUT_DIR/"
cp "$CRATE_DIR/web/NOTICE.txt" "$OUT_DIR/NOTICE.txt"
cp "$CRATE_DIR/fonts/LICENSE-CC-BY-SA-4.0.txt" "$OUT_DIR/LICENSE-fonts-CC-BY-SA-4.0.txt"
cp "$MARTY_CORE_DIR/../../../LICENSE" "$OUT_DIR/LICENSE-MartyPC-MIT.txt"

# The BIOS lives in roms/ (checked in, not built). Make sure it's the one we documented.
ROM="$OUT_DIR/roms/GLABIOS_0.4.2_8X.ROM"
if [[ -f "$ROM" ]]; then
    echo "c2bc9ec1893c0ea4098433c862b97e546c4877c6a21c5bc23792ea2b6639c7d4  $ROM" | shasum -a 256 -c --quiet -
else
    echo "warning: $ROM missing (see README.md, 'ROMs')" >&2
fi

WASM_OUT="$OUT_DIR/martypc_web_bg.wasm"
RAW_SIZE=$(wc -c < "$WASM_OUT" | tr -d ' ')
GZ_SIZE=$(gzip -9 -c "$WASM_OUT" | wc -c | tr -d ' ')
echo
echo "built $OUT_DIR"
echo "  martypc_web_bg.wasm: $RAW_SIZE bytes raw, $GZ_SIZE bytes gzip -9"
echo "  wasm-opt: $OPTIMISED"
