/**
 * Puts what the browser needs next to the site before vite runs:
 *
 * - v86's wasm, from the npm package, into `public/v86/` (the BIOS images
 *   are committed there already — the npm package does not ship them);
 * - a csfs manifest for `public/media/`, because a static host cannot list a
 *   directory. Drop an image into `public/media/<floppy|cdrom|hdd>/` and it
 *   is on the shelf after the next build.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const v86 = dirname(require.resolve("v86/package.json"));

mkdirSync("public/v86", { recursive: true });
cpSync(join(v86, "build/v86.wasm"), "public/v86/v86.wasm");
for (const bios of ["seabios.bin", "vgabios.bin"]) {
  if (!existsSync(`public/v86/${bios}`)) throw new Error(`public/v86/${bios} is missing — copy it from v86's bios/`);
}

execFileSync("csfs", ["manifest", "public/media", "--label", "beigebox shelf"], { stdio: "inherit", shell: process.platform === "win32" });
