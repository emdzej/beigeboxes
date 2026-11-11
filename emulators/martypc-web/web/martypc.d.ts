// beigeboxes: types for martypc.js. XtMachine/XtConfig are declared in martypc_web.d.ts.
export { XtMachine, XtConfig, set_log_level } from './martypc_web.js';

/** URL of the bundled GLaBIOS 0.4.2 (5160) ROM. */
export const GLABIOS_URL: string;
/** URL of the bundled XTIDE Universal BIOS r631 (XT-IDE rev 2 @ 0x300). */
export const XTIDE_BIOS_URL: string;
/** Load and instantiate the wasm (once; later calls return the same promise). */
export default function init(wasmUrl?: string | URL): Promise<void>;
/** Fetch a ROM image as bytes (default: GLaBIOS). */
export function fetchBios(url?: string | URL): Promise<Uint8Array>;
