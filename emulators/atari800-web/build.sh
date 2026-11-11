#!/usr/bin/env bash
# Build atari800 (as libatari800) to wasm into public/emulators/atari800/.
#
#   emulators/atari800-web/build.sh
#   EMSDK=/path/to/emsdk emulators/atari800-web/build.sh   # default: ~/emsdk
#
# Needs: git, autoconf + automake (configure.ac -> configure), an activated emsdk (emcc).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$HERE/../.." && pwd)"
OUT_DIR="$REPO_DIR/public/emulators/atari800"
BUILD="$HERE/build"
SRC="$BUILD/atari800"

# atari800 7.2.1 release.
ATARI800_REPO=https://github.com/atari800/atari800.git
ATARI800_TAG=ATARI800_7_2_1
ATARI800_COMMIT=63a381884175e3cbfc745ff00dfb3d70d928eb50

if ! command -v emcc >/dev/null; then
    # shellcheck disable=SC1091
    source "${EMSDK:-$HOME/emsdk}/emsdk_env.sh" >/dev/null 2>&1
fi
echo "==> $(emcc --version | head -1)"

mkdir -p "$BUILD"
if [[ ! -d "$SRC/.git" ]]; then
    echo "==> cloning atari800 $ATARI800_TAG"
    git clone --quiet --depth 1 --branch "$ATARI800_TAG" "$ATARI800_REPO" "$SRC"
fi
if [[ "$(git -C "$SRC" rev-parse HEAD)" != "$ATARI800_COMMIT" ]]; then
    echo "error: $SRC is not at $ATARI800_COMMIT" >&2
    exit 1
fi

cd "$SRC"
# Our fixes on top of the release (see patches/); applied once, to a clean tree.
if [[ ! -f .bbx-patched ]]; then
    for p in "$HERE"/patches/*.patch; do
        echo "==> patch $(basename "$p")"
        git apply "$p"
    done
    touch .bbx-patched
fi
if [[ ! -f Makefile ]]; then
    echo "==> autogen + emconfigure --target=libatari800"
    ./autogen.sh >/dev/null
    # No monitor, recording, networking or PBI extras: a 65XE with its disk drive,
    # tape deck and cartridge slot. AltirraOS + Altirra BASIC are compiled in.
    emconfigure ./configure --host=wasm32-unknown-emscripten --target=libatari800 \
        --disable-monitorasm --disable-monitorbreak --disable-monitorhints \
        --disable-monitorutf8 --disable-monitoransi --disable-eventrecording \
        --disable-pbi_mio --disable-pbi_bb --disable-pbi_xld --disable-voicebox \
        --disable-netsio --disable-riodevice --disable-audiorecording \
        --disable-videorecording --disable-screenshots --disable-crashmenu \
        --enable-altirra_bios \
        CFLAGS="-O2 -fno-strict-aliasing -Wno-macro-redefined" >/dev/null
fi
echo "==> emmake make libatari800.a"
emmake make -C src -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)" AR=emar RANLIB=emranlib libatari800.a >/dev/null

echo "==> linking atari800.mjs + atari800.wasm"
mkdir -p "$OUT_DIR"
EXPORTS=$(sed -n 's/^EMSCRIPTEN_KEEPALIVE [A-Za-z].* \**\(bbx_[a-z_0-9]*\)(.*/_\1/p' "$HERE/src/bbx.c" | paste -sd, -)
emcc -O2 -flto -Wno-macro-redefined \
    -I"$SRC/src" -I"$SRC" -I"$SRC/src/libatari800" \
    "$HERE/src/bbx.c" "$SRC/src/libatari800.a" -lm \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createAtari800 \
    -sENVIRONMENT=web,worker -sFILESYSTEM=1 -sFORCE_FILESYSTEM=1 \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16MB -sSTACK_SIZE=256KB \
    -sEXPORTED_FUNCTIONS="_malloc,_free,$EXPORTS" \
    -sEXPORTED_RUNTIME_METHODS=FS,HEAPU8,HEAP32,HEAP16 \
    -sINCOMING_MODULE_JS_API=locateFile,print,printErr \
    -sEXIT_RUNTIME=0 -sASSERTIONS=0 \
    -o "$OUT_DIR/atari800.mjs"

cp "$SRC/COPYING" "$OUT_DIR/COPYING.txt"
cat > "$OUT_DIR/NOTICE.txt" <<EOF
atari800 $ATARI800_TAG ($ATARI800_COMMIT), $ATARI800_REPO
Copyright (C) the Atari800 development team (see DOC/CREDITS in the source).
GNU General Public License, version 2 or later: COPYING.txt.

Built as libatari800 with Emscripten by emulators/atari800-web/build.sh, with the
glue in emulators/atari800-web/src/bbx.c and the fixes in
emulators/atari800-web/patches/ (source: the beigeboxes repository).

The operating system and BASIC are AltirraOS 3.49 and Altirra BASIC 1.59,
Copyright (C) Avery Lee,
compiled into atari800 (src/roms/): "Copying and distribution of this file, with
or without modification, are permitted in any medium without royalty provided the
copyright notice and this notice are preserved. This file is offered as-is,
without any warranty."
EOF
ls -l "$OUT_DIR"
