import type { CsFile } from "@emdzej/csfs-core";

/**
 * A v86 disk buffer over a csfs file.
 *
 * v86 takes anything with `get`/`set`/`load` as a disk (see `add_file` in its
 * starter), so this is the one adapter between the emulator and every place a
 * disk can live: static HTTP by `Range`, a picked folder, OPFS, or an entry
 * inside a zip. Nothing is read until the guest asks for a sector.
 *
 * Writes never reach the source. They land in an in-memory overlay of 256-byte
 * blocks (v86's granularity), which is what makes a read-only HTTP image
 * usable as a hard disk at all; `dirtyBlocks` and `stream()` let the caller
 * decide whether and where to persist them.
 */

/** The smallest unit v86 reads or writes. */
const BLOCK = 256;

export interface DiskBufferOptions {
  /**
   * Read at least this many bytes per request, aligned. Guests read a sector
   * or two at a time, and one HTTP round trip per 512 bytes makes booting
   * unbearable; read-ahead turns a boot into a few dozen requests.
   */
  readAhead?: number;
}

type Done<T> = (value: T) => void;

export class CsfsDiskBuffer {
  readonly byteLength: number;
  onload: ((e: object) => void) | undefined;
  onprogress: ((e: object) => void) | undefined;

  /** Blocks that the guest wrote. Always win over the source. */
  private readonly written = new Map<number, Uint8Array>();
  /** Clean blocks read from the source, kept so read-ahead is not wasted. */
  private readonly cache = new Map<number, Uint8Array>();
  private readonly readAhead: number;
  /** Cap on clean cache, in blocks — a 2 GB image must not end up in memory. */
  private readonly cacheLimit = (64 * 1024 * 1024) / BLOCK;

  /** Called on every guest read/write, for drive LEDs and sounds. */
  onActivity: ((kind: "read" | "write") => void) | undefined;

  constructor(
    private readonly file: CsFile,
    opts: DiskBufferOptions = {},
  ) {
    this.byteLength = file.size;
    this.readAhead = opts.readAhead ?? 64 * 1024;
  }

  get dirty(): boolean {
    return this.written.size > 0;
  }

  load(): void {
    this.onload?.(Object.create(null));
  }

  get(offset: number, len: number, fn: Done<Uint8Array>): void {
    this.onActivity?.("read");
    const hit = this.fromMemory(offset, len);
    if (hit) {
      fn(hit);
      return;
    }

    const start = offset - (offset % this.readAhead);
    const end = Math.min(
      this.byteLength,
      Math.max(offset + len, start + this.readAhead),
    );
    this.file
      .slice(start, end)
      .bytes()
      .then((bytes) => {
        this.remember(start, bytes);
        // Re-read through memory so blocks written meanwhile still win.
        fn(this.fromMemory(offset, len) ?? overlay(bytes, start, offset, len, this.written));
      })
      .catch((err: unknown) => {
        // v86 has no error path for a disk read; the guest sees zeros and
        // reports its own I/O error, which is what a bad sector looks like.
        console.error(`beigeboxes: read ${this.file.path} @${offset}+${len}`, err);
        fn(new Uint8Array(len));
      });
  }

  get_and_cache(offset: number, len: number, fn: Done<Uint8Array>): void {
    this.get(offset, len, fn);
  }

  get_from_cache(offset: number, len: number): Uint8Array | undefined {
    return this.fromMemory(offset, len);
  }

  set(start: number, data: Uint8Array, fn: () => void): void {
    this.onActivity?.("write");
    const first = start / BLOCK;
    for (let i = 0; i < data.length / BLOCK; i++) {
      this.written.set(first + i, data.slice(i * BLOCK, (i + 1) * BLOCK));
      this.cache.delete(first + i);
    }
    fn();
  }

  get_buffer(fn: Done<ArrayBuffer | undefined>): void {
    // Whole-image export is `stream()`, not this: v86 calls it for snapshots
    // and expects nothing for large async images.
    fn(undefined);
  }

  get_state(): unknown[] {
    return [[...this.written]];
  }

  set_state(state: unknown[]): void {
    this.written.clear();
    for (const [index, block] of state[0] as [number, Uint8Array][]) {
      this.written.set(index, block);
    }
  }

  /**
   * The image as the guest now sees it: source bytes with every write laid
   * over them. Streamed so a 500 MB disk is never held whole in memory.
   */
  stream(chunk = 1024 * 1024): ReadableStream<Uint8Array> {
    let offset = 0;
    return new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        if (offset >= this.byteLength) {
          controller.close();
          return;
        }
        const end = Math.min(this.byteLength, offset + chunk);
        const bytes = await this.file.slice(offset, end).bytes();
        controller.enqueue(overlay(bytes, offset, offset, end - offset, this.written));
        offset = end;
      },
    });
  }

  private fromMemory(offset: number, len: number): Uint8Array | undefined {
    const first = offset / BLOCK;
    const count = len / BLOCK;
    const out = new Uint8Array(len);
    for (let i = 0; i < count; i++) {
      const block = this.written.get(first + i) ?? this.cache.get(first + i);
      if (!block) return undefined;
      out.set(block, i * BLOCK);
    }
    return out;
  }

  private remember(start: number, bytes: Uint8Array): void {
    if (this.cache.size > this.cacheLimit) this.cache.clear();
    const first = start / BLOCK;
    for (let i = 0; i < Math.floor(bytes.length / BLOCK); i++) {
      if (!this.written.has(first + i)) {
        this.cache.set(first + i, bytes.subarray(i * BLOCK, (i + 1) * BLOCK));
      }
    }
  }
}

/** `len` bytes at `offset`, out of `bytes` read from `start`, with writes applied. */
function overlay(
  bytes: Uint8Array,
  start: number,
  offset: number,
  len: number,
  written: Map<number, Uint8Array>,
): Uint8Array {
  const out = bytes.slice(offset - start, offset - start + len);
  const first = offset / BLOCK;
  for (let i = 0; i < Math.ceil(len / BLOCK); i++) {
    const block = written.get(first + i);
    if (block) out.set(block.subarray(0, Math.min(BLOCK, len - i * BLOCK)), i * BLOCK);
  }
  return out;
}
