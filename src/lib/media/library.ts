import type { CsFile, CsFileSystem, WritableFileSystem } from "@emdzej/csfs-core";
import { walkFileSystem, isWritable } from "@emdzej/csfs-core";
import { httpFileSystem } from "@emdzej/csfs-http";
import { opfsFileSystem, isOpfsSupported, persist } from "@emdzej/csfs-opfs";
import { fsaFileSystem, isFsaSupported, pickDirectory } from "@emdzej/csfs-fsa";
import { withArchives, zipFileSystem } from "@emdzej/csfs-zip";
import { BUNDLED } from "./bundled";

/** Where it goes: a floppy drive, the CD-ROM, the IDE cable, a cartridge slot, or the tape deck. */
export type MediaKind = "floppy" | "cdrom" | "hdd" | "cart" | "tape";

/** Where a disk physically lives on the desk. */
export type MediaHome =
  /** Shipped with the site, read over HTTP. Changes are not kept. */
  | "shelf"
  /** Your own, in the browser's private storage (OPFS). */
  | "drawer"
  /** A folder on your computer you linked (File System Access). */
  | "folder";

export interface MediaItem {
  readonly id: string;
  readonly kind: MediaKind;
  readonly label: string;
  /** Second line on the label: OS, what's on it. */
  readonly note: string;
  /** Diskette plastic / label pen colour; stable per item. */
  readonly color: string;
  readonly size: number;
  /** Its file extension, lower case: which machines can read it (`Model.formats`). */
  readonly format: string;
  readonly home: MediaHome;
  readonly fs: CsFileSystem;
  /** Path within `fs`; may address inside a zip with `#`. */
  readonly path: string;
}

/** 2.88 MB, the largest floppy format v86 accepts. */
const FLOPPY_MAX = 2_949_120;
const DISK_EXT = /\.(img|ima|vfd|flp|dsk|iso|hdd|hda|raw|bin|vhd)$/i;

/** Cartridge dumps: NES (iNES), C64 (CRT). */
const CART_EXT = /\.(nes|crt)$/i;
/** C64 tapes. */
const TAPE_EXT = /\.(tap)$/i;
/** Disks in a home computer's own format: C64 (D64, G64, or a bare PRG), Amiga (ADF). */
const HOME_FLOPPY_EXT = /\.(d64|g64|prg|adf)$/i;

export function classify(path: string, size: number): MediaKind | null {
  const lower = path.toLowerCase();
  if (CART_EXT.test(lower)) return "cart";
  if (TAPE_EXT.test(lower)) return "tape";
  if (HOME_FLOPPY_EXT.test(lower)) return "floppy";
  // A kind directory is the strongest hint: `/floppy/…`, `/cdrom/…`, `/hdd/…`.
  if (/(^|\/)(floppy|floppies|fd)\//.test(lower)) return "floppy";
  if (/(^|\/)(cdrom|cd|iso)\//.test(lower)) return "cdrom";
  if (/(^|\/)(hdd|hd|disks?)\//.test(lower)) return "hdd";
  if (!DISK_EXT.test(lower)) return null;
  if (lower.endsWith(".iso")) return "cdrom";
  return size <= FLOPPY_MAX ? "floppy" : "hdd";
}

const PLASTIC = ["#1f3f8f", "#202024", "#9b1d20", "#d9a400", "#1f7a3a", "#5a2a82", "#d65a00", "#6a6a6a"];

function colorFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PLASTIC[h % PLASTIC.length]!;
}

function prettyName(path: string): string {
  const base = path.split(/[/#]/).filter(Boolean).pop() ?? path;
  return base.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").toUpperCase();
}

export function formatOf(path: string): string {
  const base = path.split(/[/#]/).filter(Boolean).pop() ?? path;
  return /\.([^.]+)$/.exec(base)?.[1]?.toLowerCase() ?? "";
}

function item(fs: CsFileSystem, home: MediaHome, path: string, size: number, kind: MediaKind): MediaItem {
  const id = `${home}:${path}`;
  const meta = home === "shelf" ? BUNDLED[path] : undefined;
  return {
    id,
    kind,
    label: meta?.label ?? prettyName(path),
    note: meta?.note ?? "",
    color: meta?.color ?? colorFor(id),
    size,
    format: formatOf(path),
    home,
    fs,
    path,
  };
}

/**
 * Every disk image under `fs`, including those inside zip archives.
 *
 * A zip on the shelf is opened by range — its central directory, not its
 * bytes — so a 700 MB archive of a CD costs a few kilobytes to list.
 */
async function scan(fs: CsFileSystem, home: MediaHome): Promise<MediaItem[]> {
  const found: MediaItem[] = [];
  const archived = withArchives(fs);
  for await (const entry of walkFileSystem(fs, "/")) {
    if (entry.kind !== "file") continue;
    if (/\.zip$/i.test(entry.path)) {
      const archive = await fs.file(entry.path);
      if (!archive) continue;
      try {
        for await (const inner of walkFileSystem(zipFileSystem(archive), "/")) {
          if (inner.kind !== "file") continue;
          const path = `${entry.path}#${inner.path}`;
          const kind = classify(entry.path + inner.path, inner.size);
          if (kind) found.push(item(archived, home, path, inner.size, kind));
        }
      } catch (err) {
        console.warn(`beigeboxes: cannot open ${entry.path}`, err);
      }
      continue;
    }
    // Handle-backed listings (OPFS, a picked folder) report no sizes; the
    // size decides floppy-or-hard-disk and goes on the label, so ask.
    const size = entry.size || ((await fs.file(entry.path))?.size ?? 0);
    const kind = classify(entry.path, size);
    if (kind) found.push(item(fs, home, entry.path, size, kind));
  }
  return found;
}

// --- the shelf: what ships with the site ---------------------------------

export function shelf(): CsFileSystem {
  return httpFileSystem(new URL(`${import.meta.env.BASE_URL}media/`, location.href).href);
}

// --- the drawer: your disks, in OPFS -------------------------------------

let drawerFs: Promise<WritableFileSystem | null> | undefined;

export function drawer(): Promise<WritableFileSystem | null> {
  drawerFs ??= isOpfsSupported()
    ? opfsFileSystem({ namespace: "beigeboxes" }).catch((err) => {
        console.warn("beigeboxes: OPFS unavailable", err);
        return null;
      })
    : Promise.resolve(null);
  return drawerFs;
}

/** Copy a file the user dropped or picked into the drawer. */
export async function importToDrawer(file: File, kind?: MediaKind): Promise<MediaItem | null> {
  const fs = await drawer();
  if (!fs) return null;
  void persist({ signal: AbortSignal.timeout(5000) });
  const k = kind ?? classify(file.name, file.size) ?? "hdd";
  const path = `/${k}/${file.name}`;
  await fs.write(path, file.stream());
  return item(fs, "drawer", path, file.size, k);
}

/**
 * A brand-new drive, fresh from the box: all zeros, unpartitioned. FDISK and
 * FORMAT it from a boot floppy, exactly as in 1995.
 */
export async function newDrive(name: string, megabytes: number): Promise<MediaItem | null> {
  const fs = await drawer();
  if (!fs) return null;
  const size = megabytes * 1024 * 1024;
  const chunk = new Uint8Array(1024 * 1024);
  let left = size;
  const zeros = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (left <= 0) return controller.close();
      const n = Math.min(left, chunk.length);
      controller.enqueue(n === chunk.length ? chunk : chunk.subarray(0, n));
      left -= n;
    },
  });
  const path = `/hdd/${name.replace(/[^\w.-]+/g, "_")}.img`;
  await fs.write(path, zeros);
  return item(fs, "drawer", path, size, "hdd");
}

/** A blank diskette: 1.44 MB 3½", a 360 KB 5¼" for an XT, or an 880 KB Amiga ADF. */
export async function newFloppy(name: string, size = 1_474_560, ext = "img"): Promise<MediaItem | null> {
  const fs = await drawer();
  if (!fs) return null;
  const path = `/floppy/${name.replace(/[^\w.-]+/g, "_")}.${ext}`;
  await fs.write(path, new Uint8Array(size));
  return item(fs, "drawer", path, size, "floppy");
}

/** The biggest image a 5¼" double-density XT drive can read (720 KB for a 3½" one on a later BIOS). */
export const XT_FLOPPY_MAX = 737_280;

export async function removeFromDrawer(media: MediaItem): Promise<void> {
  if (media.home === "shelf" || !isWritable(media.fs)) return;
  await media.fs.remove(media.path);
}

// --- linked folders: File System Access ----------------------------------

export const canLinkFolder = isFsaSupported;

const linked: CsFileSystem[] = [];

export async function linkFolder(): Promise<void> {
  const handle = await pickDirectory("readwrite");
  linked.push(fsaFileSystem(handle, { caseInsensitive: true }));
}

// --- everything ----------------------------------------------------------

export async function loadLibrary(): Promise<MediaItem[]> {
  const sources: Promise<MediaItem[]>[] = [
    scan(shelf(), "shelf").catch((err) => {
      console.warn("beigeboxes: shelf unavailable", err);
      return [];
    }),
    drawer().then((fs) => (fs ? scan(fs, "drawer") : [])),
    ...linked.map((fs) => scan(fs, "folder")),
  ];
  return (await Promise.all(sources)).flat();
}

export async function open(media: MediaItem): Promise<CsFile> {
  const file = await media.fs.file(media.path);
  if (!file) throw new Error(`${media.label} has gone missing (${media.path})`);
  return file;
}

export function canPersist(media: MediaItem): boolean {
  return media.home !== "shelf" && isWritable(media.fs) && !media.path.includes("#");
}
