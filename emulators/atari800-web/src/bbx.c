/*
 * bbx.c - the beigeboxes side of libatari800: a handful of plain C calls the page
 * drives one frame at a time. Files go through Emscripten's in-memory FS.
 *
 * Copyright (C) 2026 the beigeboxes authors. GPL-3.0-or-later; links atari800 (GPL-2.0-or-later).
 */

#include <emscripten/emscripten.h>
#include <stdio.h>
#include <string.h>

#include "config.h"
#include "libatari800.h"
#include "atari.h"
#include "afile.h"
#include "akey.h"
#include "antic.h"
#include "binload.h"
#include "cartridge.h"
#include "cassette.h"
#include "colours.h"
#include "esc.h"
#include "input.h"
#include "memory.h"
#include "pia.h"
#include "screen.h"
#include "sio.h"

static input_template_t in;
static int disk_activity = 0;

static void on_disk(int drive, int op)
{
	(void)op;
	disk_activity |= 1 << ((drive - 1) & 7);
}

/* pal: PAL (1) or NTSC (0). basic: Altirra BASIC switched in. rate: audio sample rate. */
EMSCRIPTEN_KEEPALIVE int bbx_init(int pal, int basic, int rate)
{
	char rate_s[16];
	char *argv[] = {
		"atari800", "-xl", "-xl-rev", "altirra", "-basic-rev", "altirra",
		pal ? "-pal" : "-ntsc", basic ? "-basic" : "-nobasic",
		"-sound", "-dsprate", rate_s, "-audio16", NULL
	};
	snprintf(rate_s, sizeof rate_s, "%d", rate);
	if (!libatari800_init(-1, argv))
		return 0;
	/* The monitor's bezel has the lights; nothing drawn over the picture. */
	Screen_show_disk_led = FALSE;
	Screen_show_sector_counter = FALSE;
	Screen_show_1200_leds = FALSE;
	Screen_show_atari_speed = FALSE;
	libatari800_continue_emulation_on_brk(TRUE);
	libatari800_set_disk_activity_callback(on_disk);
	libatari800_clear_input_array(&in);
	return 1;
}

/* One video frame. key: an AKEY code with its shift/control bits, or -1 for none.
   consol: bit 0 START, 1 SELECT, 2 OPTION held. joy: bit 0 up, 1 down, 2 left, 3 right. */
EMSCRIPTEN_KEEPALIVE int bbx_frame(int key, int shift, int ctrl, int consol, int joy, int trig)
{
	in.keychar = 0;
	in.keycode = 0;
	in.special = 0;
	if (key == AKEY_l)
		in.keychar = 'l'; /* AKEY_l is 0, which reads as "no key" in keycode */
	else if (key >= 0)
		in.keycode = (UBYTE)key;
	else if (key < -1)
		in.special = (UBYTE)(-key);
	in.shift = (UBYTE)shift;
	in.control = (UBYTE)ctrl;
	in.start = consol & 1;
	in.select = (consol >> 1) & 1;
	in.option = (consol >> 2) & 1;
	in.joy0 = (UBYTE)(joy & 0x0f);
	in.trig0 = (UBYTE)(trig != 0);
	libatari800_next_frame(&in);
	return libatari800_error_code;
}

EMSCRIPTEN_KEEPALIVE UBYTE *bbx_screen(void) { return (UBYTE *)Screen_atari; }
EMSCRIPTEN_KEEPALIVE int bbx_screen_width(void) { return Screen_WIDTH; }
EMSCRIPTEN_KEEPALIVE int bbx_screen_height(void) { return Screen_HEIGHT; }
/* 256 entries of 0x00RRGGBB. */
EMSCRIPTEN_KEEPALIVE int *bbx_palette(void) { return Colours_table; }

EMSCRIPTEN_KEEPALIVE UBYTE *bbx_sound(void) { return libatari800_get_sound_buffer(); }
/* Bytes of 16-bit mono audio made by the last frame. */
EMSCRIPTEN_KEEPALIVE int bbx_sound_len(void) { return libatari800_get_sound_buffer_len(); }

EMSCRIPTEN_KEEPALIVE void bbx_coldstart(void) { Atari800_Coldstart(); }
EMSCRIPTEN_KEEPALIVE void bbx_warmstart(void) { Atari800_Warmstart(); }

/* Drive lights since the last call: bit n = drive Dn+1: was read or written. */
EMSCRIPTEN_KEEPALIVE int bbx_disk_activity(void)
{
	int a = disk_activity;
	disk_activity = 0;
	return a;
}

/* SIO patch: disks and tapes load at once (on), or at 19200/600 baud (off). */
EMSCRIPTEN_KEEPALIVE void bbx_sio_patch(int on) { ESC_enable_sio_patch = on; ESC_UpdatePatches(); }

/* --- Disk drives --- */
EMSCRIPTEN_KEEPALIVE int bbx_mount_disk(int drive, const char *path, int readonly)
{
	return SIO_Mount(drive, path, readonly);
}

EMSCRIPTEN_KEEPALIVE void bbx_unmount_disk(int drive) { SIO_Dismount(drive); }

/* A DOS executable (XEX/COM/EXE): loaded by the built-in loader on the next cold start. */
EMSCRIPTEN_KEEPALIVE int bbx_load_exe(const char *path)
{
	return BINLOAD_Loader(path);
}

/* --- Cartridge slot --- */
static int type_for_size(int kb)
{
	switch (kb) {
	case 2: return CARTRIDGE_STD_2;
	case 4: return CARTRIDGE_STD_4;
	case 8: return CARTRIDGE_STD_8;
	case 16: return CARTRIDGE_STD_16;
	case 32: return CARTRIDGE_XEGS_32;
	case 64: return CARTRIDGE_XEGS_07_64;
	case 128: return CARTRIDGE_XEGS_128;
	case 256: return CARTRIDGE_XEGS_256;
	case 512: return CARTRIDGE_XEGS_512;
	case 1024: return CARTRIDGE_XEGS_1024;
	default: return CARTRIDGE_NONE;
	}
}

/* CAR files carry their type; a raw dump gets the plain or XEGS type for its size.
   Returns the cartridge type, or 0 if it could not be used. */
EMSCRIPTEN_KEEPALIVE int bbx_insert_cart(const char *path)
{
	int kb = CARTRIDGE_Insert(path);
	if (kb < 0 && kb != CARTRIDGE_BAD_CHECKSUM)
		return 0;
	if (kb > 0) {
		int type = type_for_size(kb);
		if (type == CARTRIDGE_NONE) {
			CARTRIDGE_Remove();
			return 0;
		}
		CARTRIDGE_SetType(&CARTRIDGE_main, type);
	}
	return CARTRIDGE_main.type;
}

EMSCRIPTEN_KEEPALIVE void bbx_remove_cart(void) { CARTRIDGE_Remove(); }

/* --- Tape deck --- */
EMSCRIPTEN_KEEPALIVE int bbx_insert_tape(const char *path) { return CASSETTE_Insert(path); }
EMSCRIPTEN_KEEPALIVE void bbx_remove_tape(void) { CASSETTE_Remove(); }
EMSCRIPTEN_KEEPALIVE int bbx_tape_position(void) { return (int)CASSETTE_GetPosition(); }
EMSCRIPTEN_KEEPALIVE int bbx_tape_size(void) { return (int)CASSETTE_GetSize(); }
EMSCRIPTEN_KEEPALIVE void bbx_tape_seek(int block) { CASSETTE_Seek((unsigned int)block); }
/* Boot from tape on the next cold start, as if START were held at power on. */
EMSCRIPTEN_KEEPALIVE void bbx_tape_boot(int on) { CASSETTE_hold_start = on; }
/* The motor line from the PIA: PACTL bit 3 low = on. */
EMSCRIPTEN_KEEPALIVE int bbx_tape_motor(void) { return (PIA_PACTL & 0x08) == 0; }

/* BASIC on the next cold start (on), or OPTION held through it, as you did to boot a game. */
EMSCRIPTEN_KEEPALIVE void bbx_set_basic(int on) { Atari800_disable_basic = !on; }

/* The 64 KB the CPU sees (RAM under the ROMs aside): for tests that read the screen. */
EMSCRIPTEN_KEEPALIVE UBYTE *bbx_memory(void) { return MEMORY_mem; }
