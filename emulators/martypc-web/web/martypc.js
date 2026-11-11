// beigeboxes: entry point for the MartyPC (IBM PC/XT) wasm core.
// SPDX-License-Identifier: GPL-3.0-or-later
//
//   const { default: init, XtMachine, fetchBios } = await import('/emulators/martypc/martypc.js');
//   await init();
//   const pc = new XtMachine({ memory_kb: 640, video: 'cga', bios: await fetchBios(), sample_rate: 48000 });
//
// Single-threaded: works on the main thread or in a plain Worker, no cross-origin isolation.
import wasmInit, { XtMachine, set_log_level } from './martypc_web.js';

export { XtMachine, set_log_level };

/** GLaBIOS 0.4.2 for the 5160 (GPL-3.0), shipped next to this module. */
export const GLABIOS_URL = new URL('./roms/GLABIOS_0.4.2_8X.ROM', import.meta.url).href;

/** XTIDE Universal BIOS r631 (GPL-2.0-or-later), configured for an XT-IDE rev 2 at 0x300. */
export const XTIDE_BIOS_URL = new URL('./roms/ide_xtl.bin', import.meta.url).href;

let ready = null;

/** Load and instantiate the wasm once. `wasmUrl` defaults to martypc_web_bg.wasm beside this file. */
export default function init(wasmUrl) {
  ready ??= wasmInit(wasmUrl ? { module_or_path: wasmUrl } : undefined).then(() => undefined);
  return ready;
}

/** Fetch a ROM image (default: the bundled GLaBIOS) as a Uint8Array. Also for XTIDE_BIOS_URL. */
export async function fetchBios(url = GLABIOS_URL) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BIOS fetch failed: ${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}
