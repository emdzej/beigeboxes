#!/usr/bin/env python3
"""Swap the character-generator bitmaps that MartyPC's core compiles in (include_bytes! of
crates/lib/marty_core/assets/*.bin) for the ones in ../fonts/, which are generated from VileR's
Ultimate Oldschool PC Font Pack (CC BY-SA 4.0) by tools/fon2bin.py.

Runs on the raw rustc output, before wasm-bindgen and wasm-opt (which may split data segments).
Each upstream bitmap must occur exactly once; the replacement has the same size.

usage: patch_fonts.py MODULE.wasm UPSTREAM_ASSETS_DIR OUR_FONTS_DIR
"""
import os, sys

FONTS = ['mda_8by14.bin', 'cga_8by8.bin', 'tga_8by9.bin']
# Built without MartyPC's `ega`/`vga` features: these must not be in the module at all.
ABSENT = ['ega_8by14.bin']  # (ega_8by8.bin is byte-identical to cga_8by8.bin)

def main():
    wasm_path, upstream, ours = sys.argv[1:4]
    wasm = bytearray(open(wasm_path, 'rb').read())
    for name in FONTS:
        old = open(os.path.join(upstream, name), 'rb').read()
        new = open(os.path.join(ours, name), 'rb').read()
        if len(old) != len(new):
            sys.exit(f'patch_fonts: {name}: size mismatch ({len(old)} upstream vs {len(new)} ours)')
        at = wasm.find(old)
        if at < 0 or wasm.find(old, at + 1) >= 0:
            sys.exit(f'patch_fonts: {name}: expected exactly one copy in {wasm_path}')
        wasm[at:at + len(old)] = new
        same = 'bit-identical' if old == new else f'{sum(a != b for a, b in zip(old, new))} bytes differ'
        print(f'  {name}: replaced at 0x{at:x} ({same})')
    for name in ABSENT:
        if wasm.find(open(os.path.join(upstream, name), 'rb').read()) >= 0:
            sys.exit(f'patch_fonts: {name} is linked in; is an ega/vga feature on?')
    open(wasm_path, 'wb').write(wasm)

if __name__ == '__main__':
    main()
