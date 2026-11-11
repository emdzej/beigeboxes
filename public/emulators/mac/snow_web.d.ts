/* tslint:disable */
/* eslint-disable */

export class MacMachine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * A SCSI hard disk at ID 0..6: a whole-disk image with an Apple partition map and driver
     * (as HD SC Setup writes it, or a BlueSCSI image), a multiple of 512 bytes. Plus only.
     */
    attach_hdd(id: number, bytes: Uint8Array): void;
    /**
     * The sound since the last call: mono, `audio_rate()` Hz, -1..1.
     */
    audio(): Float32Array;
    audio_rate(): number;
    /**
     * Emulated CPU cycles so far.
     */
    cycles(): number;
    /**
     * Take a disk out from the host side. Returns its bytes if the guest wrote to it and they
     * can be saved in the image's format, otherwise undefined.
     */
    eject_floppy(drive: number): Uint8Array | undefined;
    /**
     * The disk's bytes now, with the guest's writes; undefined if unchanged or unsaveable.
     */
    floppy_bytes(drive: number): Uint8Array | undefined;
    floppy_inserted(drive: number): boolean;
    /**
     * The drive motor is on: the light, and the noise.
     */
    floppy_motor(drive: number): boolean;
    /**
     * The last frame as RGBA, `frame_width` x `frame_height`. Empty before the first.
     */
    frame(): Uint8Array;
    frame_height(): number;
    /**
     * A new frame since the last `frame()`.
     */
    frame_ready(): boolean;
    frame_width(): number;
    /**
     * Drives the guest ejected a disk from since the last call (the Mac ejects by itself:
     * Eject in the Finder, dragging a disk to the Trash, shutting down).
     */
    guest_ejects(): Uint32Array;
    /**
     * A counter bumped on every SCSI disk access: changed since last frame means busy.
     */
    hdd_activity(): number;
    /**
     * The disk's bytes if the guest wrote to it since it was attached (or last asked).
     */
    hdd_bytes(id: number): Uint8Array | undefined;
    /**
     * A disk in drive 0 (internal) or 1 (external): raw 400K/800K, DiskCopy 4.2, MOOF and
     * the other formats Snow reads. `locked`: the write-protect tab is open.
     */
    insert_floppy(drive: number, bytes: Uint8Array, name: string, locked: boolean): void;
    /**
     * The Programmer's Switch: interrupt.
     */
    interrupt(): void;
    /**
     * A key by `KeyboardEvent.code`. False if the Mac has no such key.
     */
    key_down(code: string): boolean;
    key_up(code: string): boolean;
    /**
     * Which machine it is: "Macintosh Plus", ...
     */
    model_name(): string;
    /**
     * The pointer at screen pixel (x, y). Absolute mode only: the Mac's cursor jumps there.
     */
    mouse_abs(x: number, y: number): void;
    mouse_button(down: boolean): void;
    /**
     * Mouse movement, in screen pixels. Relative mode only.
     */
    mouse_rel(dx: number, dy: number): void;
    /**
     * `model`: "plus", "512k", "128k", or "" to tell from the ROM (an unknown 128 KB ROM runs
     * as a Plus). `ram_kb`: 1024, 2048 or 4096 on a Plus; the 128K and 512K have what they have.
     */
    constructor(rom: Uint8Array, model: string, ram_kb: number);
    /**
     * RAM fitted, in KB.
     */
    ram_kb(): number;
    /**
     * Let go of every key and the mouse button: the page lost focus.
     */
    release_all(): void;
    /**
     * The reset switch: disks stay in.
     */
    reset(): void;
    /**
     * Run `ms` of emulated time (at most 100 at once).
     */
    run(ms: number): void;
    running(): boolean;
    /**
     * "absolute": the cursor follows the pointer, by writing the Mac's own mouse globals
     * (fine for the system and most applications). "relative": a real mouse's quadrature
     * signals, for games that read the hardware; wants pointer lock.
     */
    set_mouse_mode(mode: string): void;
    /**
     * What the guest ejected from `drive`: its bytes if written to, else undefined. Clears it.
     */
    take_guest_eject(drive: number): Uint8Array | undefined;
    /**
     * Something Snow wants to tell the user, or undefined.
     */
    take_message(): string | undefined;
}

/**
 * What a ROM is to Snow: "plus", "512k", "128k", or "" if Snow doesn't know it.
 */
export function rom_model(rom: Uint8Array): string;

export function set_log_level(level: string): void;

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_macmachine_free: (a: number, b: number) => void;
    readonly macmachine_attach_hdd: (a: number, b: number, c: number, d: number) => [number, number];
    readonly macmachine_audio: (a: number) => [number, number];
    readonly macmachine_audio_rate: (a: number) => number;
    readonly macmachine_cycles: (a: number) => number;
    readonly macmachine_eject_floppy: (a: number, b: number) => [number, number];
    readonly macmachine_floppy_bytes: (a: number, b: number) => [number, number];
    readonly macmachine_floppy_inserted: (a: number, b: number) => number;
    readonly macmachine_floppy_motor: (a: number, b: number) => number;
    readonly macmachine_frame: (a: number) => [number, number];
    readonly macmachine_frame_height: (a: number) => number;
    readonly macmachine_frame_ready: (a: number) => number;
    readonly macmachine_frame_width: (a: number) => number;
    readonly macmachine_guest_ejects: (a: number) => [number, number];
    readonly macmachine_hdd_activity: (a: number) => number;
    readonly macmachine_hdd_bytes: (a: number, b: number) => [number, number];
    readonly macmachine_insert_floppy: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly macmachine_interrupt: (a: number) => void;
    readonly macmachine_key_down: (a: number, b: number, c: number) => number;
    readonly macmachine_key_up: (a: number, b: number, c: number) => number;
    readonly macmachine_model_name: (a: number) => [number, number];
    readonly macmachine_mouse_abs: (a: number, b: number, c: number) => void;
    readonly macmachine_mouse_button: (a: number, b: number) => void;
    readonly macmachine_mouse_rel: (a: number, b: number, c: number) => void;
    readonly macmachine_new: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly macmachine_ram_kb: (a: number) => number;
    readonly macmachine_release_all: (a: number) => void;
    readonly macmachine_reset: (a: number) => void;
    readonly macmachine_run: (a: number, b: number) => void;
    readonly macmachine_running: (a: number) => number;
    readonly macmachine_set_mouse_mode: (a: number, b: number, c: number) => void;
    readonly macmachine_take_guest_eject: (a: number, b: number) => [number, number];
    readonly macmachine_take_message: (a: number) => [number, number];
    readonly rom_model: (a: number, b: number) => [number, number];
    readonly set_log_level: (a: number, b: number) => void;
    readonly start: () => void;
    readonly __wbindgen_exn_store_command_export: (a: number) => void;
    readonly __externref_table_alloc_command_export: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free_command_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc_command_export: (a: number, b: number) => number;
    readonly __wbindgen_realloc_command_export: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc_command_export: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
