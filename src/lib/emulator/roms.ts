/**
 * ROMs the user supplies for machines whose ROM we can't ship (the Macintosh's is Apple's).
 * Kept in this browser's IndexedDB and nowhere else: nothing is uploaded.
 */

const DB = "beigeboxes-roms";
const STORE = "roms";

let opened: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  }).catch((err: unknown) => {
    opened = null;
    throw err;
  });
  return opened;
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const store = (await db()).transaction(STORE, mode).objectStore(STORE);
  return new Promise<T>((resolve, reject) => {
    const req = run(store);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/** The ROM stored under `id`, or null. */
export async function getRom(id: string): Promise<Uint8Array | null> {
  const value = await tx<unknown>("readonly", (s) => s.get(id));
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

export async function putRom(id: string, bytes: Uint8Array): Promise<void> {
  // A copy of just these bytes, not a view into somebody's bigger buffer.
  await tx("readwrite", (s) => s.put(bytes.slice(), id));
}

export async function clearRom(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

// --- what a Macintosh ROM is -----------------------------------------------

/**
 * Apple's checksum in a 64K/128K Mac ROM's first long word, the sum of every 16-bit word after
 * it, which the ROM's own start-up test checks.
 */
const MAC_ROMS: Record<number, { size: number; name: string }> = {
  0x28ba61ce: { size: 65536, name: "Macintosh 128K ROM" },
  0x28ba4e50: { size: 65536, name: "Macintosh 512K ROM" },
  0x4d1eeee1: { size: 131072, name: "Macintosh Plus ROM v1 (Lonely Hearts)" },
  0x4d1eeae1: { size: 131072, name: "Macintosh Plus ROM v2 (Lonely Heifers)" },
  0x4d1f8172: { size: 131072, name: "Macintosh Plus ROM v3 (Loud Harmonicas)" },
};

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(8, "0");
}

function checksumOf(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 4; i + 1 < bytes.length; i += 2) sum = (sum + ((bytes[i]! << 8) | bytes[i + 1]!)) >>> 0;
  return sum;
}

function headerOf(bytes: Uint8Array): number {
  return ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
}

/**
 * Whether `bytes` is a ROM the Mac emulator can start: a Macintosh Plus ROM (v1, v2 or v3), or
 * a 128K or 512K one (which make it that machine instead). `name` says what it is, or why not.
 */
export function identifyMacRom(bytes: Uint8Array): { ok: boolean; name: string } {
  if (bytes.length !== 131072 && bytes.length !== 65536) {
    const kb = Math.round(bytes.length / 1024);
    const hint =
      bytes.length === 262144
        ? " That's the size of an SE or Mac II ROM."
        : bytes.length === 524288
          ? " That's the size of a Classic or later ROM."
          : "";
    return { ok: false, name: `Not a Mac Plus ROM: it's ${kb} KB, and a Mac Plus ROM is 128 KB.${hint}` };
  }
  const header = headerOf(bytes);
  const known = MAC_ROMS[header];
  if (!known) {
    const swapped = new Uint8Array(bytes.length);
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      swapped[i] = bytes[i + 1]!;
      swapped[i + 1] = bytes[i]!;
    }
    if (MAC_ROMS[headerOf(swapped)]) {
      return { ok: false, name: "That ROM image is byte-swapped (read from the two chips the wrong way round)." };
    }
    if (checksumOf(bytes) === header) {
      return { ok: false, name: `A Macintosh ROM, but not a Plus, 128K or 512K one (checksum ${hex(header)}).` };
    }
    return { ok: false, name: "That isn't a Macintosh ROM image." };
  }
  if (known.size !== bytes.length) {
    return { ok: false, name: `Looks like a ${known.name}, but it's the wrong size: a bad dump.` };
  }
  const sum = checksumOf(bytes);
  if (sum !== header) {
    return { ok: false, name: `Looks like a ${known.name}, but its checksum is ${hex(sum)}, not ${hex(header)}: a bad dump.` };
  }
  return { ok: true, name: known.name };
}
