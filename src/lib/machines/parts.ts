import type { Board, Build, CardInstance, Part, PartKind } from "./types";

const SIMM = { kind: "simm72", image: "art/parts/simm.webp", size: [1000, 333], pcb: "#2f6b3a" } as const;

/** The spare-parts box: there is always another stick or card in it. */
export const PARTS: Part[] = [
  { ...SIMM, id: "simm-4", name: "4 MB SIMM", kb: 4096, size: [...SIMM.size] },
  { ...SIMM, id: "simm-8", name: "8 MB SIMM", kb: 8192, size: [...SIMM.size] },
  { ...SIMM, id: "simm-16", name: "16 MB SIMM", kb: 16384, size: [...SIMM.size] },
  { ...SIMM, id: "simm-32", name: "32 MB SIMM", kb: 32768, size: [...SIMM.size] },
  { ...SIMM, id: "simm-64", name: "64 MB SIMM", kb: 65536, size: [...SIMM.size] },
  { id: "vga-s3", kind: "pci", name: "S3 Trio64 VGA", role: "video", video: "vga", pcb: "#23913f", image: "art/parts/vga.webp", size: [1000, 616] },
  { id: "sb16", kind: "isa", name: "Sound Blaster 16", role: "sound", pcb: "#1c3f29", image: "art/parts/sb16.webp", size: [1000, 558] },
  { id: "ne2000", kind: "isa", name: "NE2000 ethernet", role: "network", pcb: "#1f5734", image: "art/parts/ne2000.webp", size: [1000, 584] },

  // The XT's: nine 4164 chips make a 64 KB bank; 8-bit cards from 1981–84.
  { id: "dip-64k", kind: "dip64", name: "64 KB (nine 4164s)", kb: 64, pcb: "#1b1b1b", image: "", size: [1, 1] },
  { id: "ibm-mda", kind: "isa8", name: "IBM Monochrome Display Adapter", role: "video", video: "mda", pcb: "#1d5a33", image: "", size: [1, 1] },
  { id: "hercules", kind: "isa8", name: "Hercules Graphics Card", role: "video", video: "hercules", pcb: "#25603a", image: "", size: [1, 1] },
  { id: "ibm-cga", kind: "isa8", name: "IBM Color Graphics Adapter", role: "video", video: "cga", pcb: "#1d5a33", image: "", size: [1, 1] },
  { id: "ibm-fdc", kind: "isa8", name: "IBM floppy controller", role: "floppy", pcb: "#1d5a33", image: "", size: [1, 1] },
  { id: "trapdoor-1536", kind: "trapdoor", name: "1.5 MB trapdoor RAM card", role: "memory", kb: 1536, pcb: "#1b4f8a", image: "", size: [1, 1] },
  { id: "a501", kind: "trapdoor", name: "A501 512 KB expansion", role: "memory", kb: 512, pcb: "#1f6a3c", image: "", size: [1, 1] },
  { id: "sixpak", kind: "isa8", name: "AST SixPakPlus 384 KB", role: "memory", kb: 384, pcb: "#204d8a", image: "", size: [1, 1] },
];

/** Which parts go in which machine: the box only offers what fits the board. */
export function partsFor(board: Board): Part[] {
  const kinds = new Set<PartKind>([...board.memory.map((s) => s.kind), ...board.slots.map((s) => s.bus)]);
  return PARTS.filter((p) => kinds.has(p.kind));
}

export function part(id: string): Part | undefined {
  return PARTS.find((p) => p.id === id);
}

export function cardsWith(build: Build, role: Part["role"]): CardInstance[] {
  return build.cards.filter((c): c is CardInstance => !!c && part(c.part)?.role === role);
}

/**
 * Memory the machine sees: only full banks of matching sticks count, as on a
 * real board. A Pentium's 64-bit bus takes 72-pin SIMMs in pairs.
 */
export function memoryOf(board: Board | undefined, build: Build): { kb: number; halfBanks: number } {
  const per = board?.bank ?? 1;
  let kb = board?.baseKb ?? 0;
  let halfBanks = 0;
  for (let i = 0; i < build.memory.length; i += per) {
    const sticks = build.memory.slice(i, i + per).map((id) => (id ? part(id) : undefined));
    const filled = sticks.filter(Boolean);
    if (!filled.length) continue;
    if (filled.length < per || new Set(filled.map((p) => p!.kb)).size > 1) {
      halfBanks++;
      continue;
    }
    kb += filled.reduce((sum, p) => sum + (p!.kb ?? 0), 0);
  }
  // Memory cards add theirs on top, up to what the machine can address.
  for (const c of cardsWith(build, "memory")) kb += part(c.part)?.kb ?? 0;
  if (board?.maxKb) kb = Math.min(kb, board.maxKb);
  return { kb, halfBanks };
}
