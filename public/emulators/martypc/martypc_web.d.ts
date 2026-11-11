/* tslint:disable */
/* eslint-disable */

export interface XtConfig {
    /** Conventional memory in KB, 64..640 (default 640). */
    memory_kb?: number;
    /** Display adapter (default "cga"). */
    video?: "mda" | "hercules" | "cga";
    /** System BIOS image, mapped to end at 0xFFFFF. */
    bios: Uint8Array;
    /** Rate for audio(), e.g. AudioContext.sampleRate (default 48000). */
    sample_rate?: number;
    /** 0..4 (default 2). */
    floppy_drives?: number;
    /** Drive type for all drives (default "720k"). */
    floppy_type?: "360k" | "720k" | "1.2m" | "1.44m";
    /** MDA/Hercules monitor colour (default "green"). */
    phosphor?: "green" | "amber" | "white";
    /** XTIDE Universal BIOS for an XT-IDE rev 2 at 0x300; adds the controller (see attach_hdd). */
    xtide_bios?: Uint8Array;
}



/**
 * An IBM PC/XT (5160) driven from JavaScript.
 */
export class XtMachine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Attach a fixed-size VHD (raw sectors + 512-byte "conectix" footer) as the XT-IDE master.
     * Needs `xtide_bios` in the config. The geometry must be one MartyPC's XT-IDE accepts
     * (e.g. 615/4/17 = 20 MB, 306/4/17 = 10 MB, 1024/16/63 ...). XUB scans for drives at POST,
     * so attach before the first run() or call reset() after.
     */
    attach_hdd(bytes: Uint8Array): void;
    /**
     * PC-speaker audio produced since the last call: mono f32 at `sample_rate`.
     */
    audio(): Float32Array;
    /**
     * Effective CPU clock in MHz (4.77 for an XT).
     */
    cpu_mhz(): number;
    /**
     * Send Ctrl+Alt+Del (a warm boot, handled by the BIOS).
     */
    ctrl_alt_del(): void;
    /**
     * Detach the hard disk, returning its bytes (guest writes included), or null if none.
     */
    detach_hdd(): Uint8Array | undefined;
    /**
     * Eject the floppy in `drive`, returning its current bytes, guest writes included (in its
     * original format when fluxfox can write that losslessly, otherwise as a raw sector
     * image), or `null` if the drive was empty.
     */
    eject_floppy(drive: number): Uint8Array | undefined;
    /**
     * Total emulated time since construction, in milliseconds (for measuring speed).
     */
    emulated_ms(): number;
    /**
     * True while that drive's motor is spinning (BIOS turns it off ~2 s after the last access).
     */
    floppy_active(drive: number): boolean;
    /**
     * Number of floppy drives fitted.
     */
    floppy_drives(): number;
    /**
     * The current frame as RGBA bytes (`frame_width() * frame_height() * 4`).
     * MDA/Hercules: 720x350, phosphor-tinted. CGA: 640x200 line-doubled to 640x400 (text and
     * graphics), RGBI colours. Sizes can change with the video mode; read them per frame.
     */
    frame(): Uint8Array;
    frame_height(): number;
    frame_width(): number;
    /**
     * True for ~120 ms (emulated) after each hard-disk sector transfer: the front-panel LED.
     */
    hdd_active(): boolean;
    /**
     * A copy of the attached hard disk's current bytes without detaching it.
     */
    hdd_bytes(): Uint8Array | undefined;
    /**
     * Insert a floppy image (raw .img/.ima of 160K..1.44M, or anything fluxfox reads: IMD,
     * PSI, 86F, HFE, MFM, TC, PRI, MFI, Kryoflux, SCP, zip/gz...). `name` is used for format
     * detection by extension, as a hint. Throws if unreadable or the drive can't take it.
     */
    insert_floppy(drive: number, bytes: Uint8Array, name: string): void;
    /**
     * Press a key by `KeyboardEvent.code` ("KeyA", "Enter", "ShiftLeft", "F1", "Numpad7"...).
     * Returns false if the code has no PC/XT equivalent.
     */
    key_down(code: string): boolean;
    key_up(code: string): boolean;
    /**
     * `config`: `{ memory_kb: 64..640, video: "mda" | "hercules" | "cga", bios: Uint8Array,
     * sample_rate: number, floppy_drives?: 0..4 (default 2), floppy_type?: "360k" | "720k" |
     * "1.2m" | "1.44m" (default "720k"), phosphor?: "green" | "amber" | "white" (MDA/Hercules,
     * default "green"), xtide_bios?: Uint8Array }`.
     *
     * The BIOS image is mapped so that it ends at 0xFFFFF (8K GLaBIOS lands at 0xFE000).
     * With `xtide_bios` (an XTIDE Universal BIOS image configured for an XT-IDE rev 2 at
     * 0x300, such as roms/ide_xtl.bin) the machine also gets MartyPC's XT-IDE controller,
     * with that ROM at 0xC8000; see `attach_hdd`.
     */
    constructor(config: XtConfig);
    /**
     * Read `len` bytes of the 1 MB address space without side effects (video memory included),
     * e.g. `peek(0xB8000, 4000)` for an 80x25 CGA text page, 0xB0000 for MDA. For debugging,
     * tests, or reading the screen as text.
     */
    peek(addr: number, len: number): Uint8Array;
    /**
     * Hard reset: like the power switch, RAM is cleared. Inserted floppies stay in.
     */
    reset(): void;
    /**
     * Run `ms` milliseconds of emulated time (capped at 100 ms per call). Call it with the
     * wall-clock time since the last frame to run in real time.
     */
    run(ms: number): void;
}

/**
 * Set the core's console log level: "off", "error", "warn" (default), "info", "debug", "trace".
 */
export function set_log_level(level: string): void;

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_xtmachine_free: (a: number, b: number) => void;
    readonly set_log_level: (a: number, b: number) => void;
    readonly xtmachine_attach_hdd: (a: number, b: number, c: number) => [number, number];
    readonly xtmachine_audio: (a: number) => [number, number];
    readonly xtmachine_cpu_mhz: (a: number) => number;
    readonly xtmachine_ctrl_alt_del: (a: number) => void;
    readonly xtmachine_detach_hdd: (a: number) => [number, number];
    readonly xtmachine_eject_floppy: (a: number, b: number) => [number, number, number, number];
    readonly xtmachine_emulated_ms: (a: number) => number;
    readonly xtmachine_floppy_active: (a: number, b: number) => number;
    readonly xtmachine_floppy_drives: (a: number) => number;
    readonly xtmachine_frame: (a: number) => [number, number];
    readonly xtmachine_frame_height: (a: number) => number;
    readonly xtmachine_frame_width: (a: number) => number;
    readonly xtmachine_hdd_active: (a: number) => number;
    readonly xtmachine_hdd_bytes: (a: number) => [number, number];
    readonly xtmachine_insert_floppy: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly xtmachine_key_down: (a: number, b: number, c: number) => number;
    readonly xtmachine_key_up: (a: number, b: number, c: number) => number;
    readonly xtmachine_new: (a: any) => [number, number, number];
    readonly xtmachine_peek: (a: number, b: number, c: number) => [number, number];
    readonly xtmachine_reset: (a: number) => void;
    readonly xtmachine_run: (a: number, b: number) => void;
    readonly start: () => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
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
