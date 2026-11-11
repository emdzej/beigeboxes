"""Make the atari800 driver's test media, all written for beigeboxes: an ATR and a CAS that
each boot, print a line and run colour bars; a XEX and an 8 KB cartridge (CAR and raw) of bars.

    python3 -I make_boot_media.py OUTDIR

Copyright (C) 2026 the beigeboxes authors. GPL-3.0-or-later.
"""

import struct
import sys

LOAD = 0x0700


def program(message: str, sectors: int, tape: bool) -> bytes:
    """Boot header + code, padded to whole 128-byte records."""
    text = bytes((ord(c) - 0x20) & 0x3F for c in message.upper()) + b"\xff"
    main = LOAD + 0x20
    msg = main + 0x30
    code = bytearray()
    # header: flags, records, load address, init address (DOSINI for disk, CASINI for tape)
    code += bytes([0, sectors]) + struct.pack("<HH", LOAD, main)
    # +6: continue boot: DOSVEC = main; CLC; RTS
    code += bytes([0xA9, main & 0xFF, 0x85, 0x0A, 0xA9, main >> 8, 0x85, 0x0B, 0x18, 0x60])
    code += b"\xea" * (0x20 - len(code))
    # main: ($CB) = SAVMSC + 40*2; copy message
    body = bytes([
        0x18, 0xA5, 0x58, 0x69, 80, 0x85, 0xCB,  # CLC; LDA SAVMSC; ADC #80; STA $CB
        0xA5, 0x59, 0x69, 0x00, 0x85, 0xCC,      # LDA SAVMSC+1; ADC #0; STA $CC
        0xA0, 0x02,                              # LDY #2
        0xB9, msg & 0xFF, msg >> 8,              # loop: LDA msg-2,Y
        0xC9, 0xFF,                              # CMP #$FF (a space is 0)
        0xF0, 0x05,                              # BEQ done
        0x91, 0xCB,                              # STA ($CB),Y
        0xC8,                                    # INY
        0xD0, 0xF4,                              # BNE loop
        0xA9, 0x3C, 0x8D, 0x02, 0xD3,            # LDA #$3C; STA PACTL: tape motor off
        0xAD, 0x0B, 0xD4,                        # bars: LDA VCOUNT
        0x8D, 0x0A, 0xD4,                        # STA WSYNC
        0x8D, 0x1A, 0xD0,                        # STA COLBK
        0x4C,                                    # JMP bars
    ])
    bars = main + body.index(bytes([0xAD, 0x0B, 0xD4]))
    body += struct.pack("<H", bars)
    assert len(body) <= 0x30, len(body)
    code += body + b"\xea" * (0x30 - len(body))
    # LDA msg-2,Y with Y from 2: point the operand two bytes early
    i = 0x20 + 15 + 1
    struct.pack_into("<H", code, i, msg - 2)
    code += text
    size = sectors * 128
    assert len(code) <= size
    return bytes(code) + bytes(size - len(code))


def atr(data: bytes, total: int = 720) -> bytes:
    paragraphs = total * 128 // 16
    head = struct.pack("<HHHB", 0x0296, paragraphs & 0xFFFF, 128, paragraphs >> 16) + bytes(9)
    return head + data + bytes(total * 128 - len(data))


def cas(data: bytes, description: str) -> bytes:
    def chunk(kind: bytes, aux: int, body: bytes) -> bytes:
        return kind + struct.pack("<HH", len(body), aux) + body

    def record(control: int, payload: bytes) -> bytes:
        r = bytes([0x55, 0x55, control]) + payload
        s = 0
        for b in r:
            s += b
            if s > 0xFF:
                s = (s & 0xFF) + 1
        return r + bytes([s])

    out = chunk(b"FUJI", 0, description.encode()) + chunk(b"baud", 600, b"")
    for n in range(0, len(data), 128):
        # A 10 s leader, then 1 s between records, as the OS writes them.
        out += chunk(b"data", 10000 if n == 0 else 1000, record(0xFC, data[n : n + 128]))
    out += chunk(b"data", 250, record(0xFE, bytes(128)))
    return out


def rainbow_xex() -> bytes:
    """A 24-byte DOS executable at $2000: colour bars, run through RUNAD."""
    code = bytes([0xAD, 0x0B, 0xD4, 0x8D, 0x0A, 0xD4, 0x8D, 0x1A, 0xD0, 0x4C, 0x00, 0x20])
    return b"\xff\xff" + struct.pack("<HH", 0x2000, 0x2000 + len(code) - 1) + code + struct.pack("<HHH", 0x2E0, 0x2E1, 0x2000)


def stripes_rom() -> bytes:
    """An 8 KB left cartridge at $A000 that runs colour bars."""
    c = bytearray(b"\xff" * 8192)
    prog = bytes([0xAD, 0x0B, 0xD4, 0x49, 0xF0, 0x8D, 0x0A, 0xD4, 0x8D, 0x1A, 0xD0, 0x4C, 0x00, 0xA0])
    c[: len(prog)] = prog
    c[0x1FF0] = 0x60  # init: RTS
    c[0x1FFA:0x1FFC] = struct.pack("<H", 0xA000)  # start
    c[0x1FFC] = 0  # a cartridge is present
    c[0x1FFD] = 0x04  # run it
    c[0x1FFE:0x2000] = struct.pack("<H", 0xBFF0)  # init
    return bytes(c)


def main() -> None:
    outdir = sys.argv[1]
    with open(f"{outdir}/bootdisk.atr", "wb") as f:
        f.write(atr(program("beigeboxes: booted from the 1050", 4, False)))
    with open(f"{outdir}/boottape.cas", "wb") as f:
        f.write(cas(program("beigeboxes: booted from the XC12", 2, True), "beigeboxes boot tape"))
    with open(f"{outdir}/rainbow.xex", "wb") as f:
        f.write(rainbow_xex())
    rom = stripes_rom()
    with open(f"{outdir}/stripes.rom", "wb") as f:
        f.write(rom)
    with open(f"{outdir}/stripes.car", "wb") as f:
        f.write(b"CART" + struct.pack(">II", 1, sum(rom) & 0xFFFFFFFF) + bytes(4) + rom)


if __name__ == "__main__":
    main()
