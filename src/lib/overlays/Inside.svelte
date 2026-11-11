<script lang="ts">
  import Overlay from "./Overlay.svelte";
  import HardDrive from "../media/HardDrive.svelte";
  import { place } from "../hardware/rect";
  import { machine } from "../emulator/machine.svelte";
  import { memoryOf, part, partsFor } from "../machines/parts";
  import type { NetworkChoice, Part, PartKind } from "../machines/types";
  import type { MediaItem } from "../media/library";
  import { ui } from "../ui.svelte";
  import { sfx } from "../sfx";

  const board = $derived(machine.model.board!);
  const build = $derived(machine.build);
  const locked = $derived(machine.power !== "off");
  const memory = $derived(memoryOf(board, build));

  /** In hand: a part from the box, or a drive from the drawer. */
  let held = $state<{ part: Part } | { drive: MediaItem } | null>(null);
  /** The network card whose cable is being plugged in. */
  let wiring = $state<number | null>(null);

  const mounted = $derived(new Set([machine.hda?.id, machine.hdb?.id].filter(Boolean)));
  const loose = $derived(ui.of("hdd").filter((m) => !mounted.has(m.id)));

  const heldKind = $derived(held && "part" in held ? held.part.kind : null);

  function fits(kind: PartKind): boolean {
    return heldKind === kind;
  }

  function guard(): boolean {
    if (!locked) return true;
    machine.message = "It's on! Switch it off before you put your hands in there.";
    return false;
  }

  function pick(p: Part) {
    if (!guard()) return;
    held = held && "part" in held && held.part.id === p.id ? null : { part: p };
  }

  function pickDrive(m: MediaItem) {
    if (!guard()) return;
    held = held && "drive" in held && held.drive.id === m.id ? null : { drive: m };
  }

  function socket(i: number) {
    if (!guard()) return;
    if (held && "part" in held && held.part.kind === board.memory[i]!.kind) {
      build.memory[i] = held.part.id;
      sfx.click();
      held = null;
    } else if (build.memory[i]) {
      build.memory[i] = null;
      sfx.click();
    }
  }

  function slot(i: number) {
    if (!guard()) return;
    if (held && "part" in held && held.part.kind === board.slots[i]!.bus) {
      build.cards[i] = held.part.role === "network" ? { part: held.part.id, net: { kind: "none" } } : { part: held.part.id };
      sfx.click();
      held = null;
    } else if (build.cards[i]) {
      build.cards[i] = null;
      if (wiring === i) wiring = null;
      sfx.click();
    }
  }

  function bay(which: "hda" | "hdb") {
    if (!guard()) return;
    if (held && "drive" in held) {
      if (machine.installHdd(which, held.drive)) {
        ui.say(`${held.drive.label} is ${which === "hda" ? "C:, primary master" : "D:, primary slave"}`);
        held = null;
      }
    } else if (machine[which]) {
      machine.installHdd(which, null);
    }
  }

  function cable(i: number, net: NetworkChoice) {
    const card = build.cards[i];
    if (card) card.net = net;
  }

  const MEMORY_KINDS = new Set<PartKind>(["simm72", "dip64"]);
  const sticks = $derived(partsFor(board).filter((p) => MEMORY_KINDS.has(p.kind)));
  const cards = $derived(partsFor(board).filter((p) => !MEMORY_KINDS.has(p.kind)));
  const vertical = $derived(board.bracket.side === "top");

  function size(kb: number): string {
    return kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`;
  }

  /**
   * A fitted card seen from straight above is its top edge: from the bracket
   * screwed to the back panel to just past the end of its slot.
   */
  function cardStyle(i: number, p: Part): string {
    const r = board.slots[i]!.rect;
    const at = board.bracket.at;
    if (vertical) {
      const h = r.y + r.h + 0.02 - at;
      const w = r.w * 1.5;
      return `top:${at * 100}%;height:${h * 100}%;left:${(r.x + r.w / 2 - w / 2) * 100}%;width:${w * 100}%;--pcb:${p.pcb}`;
    }
    const w = r.x + r.w + 0.015 - at;
    const h = r.h * 1.5;
    return `left:${at * 100}%;width:${w * 100}%;top:${(r.y + r.h / 2 - h / 2) * 100}%;height:${h * 100}%;--pcb:${p.pcb}`;
  }
</script>

<Overlay label="Inside the case">
  <div class="bench" class:holding={held}>
    <div class="board" style="aspect-ratio:{board.size[0]}/{board.size[1]}">
      <img src={board.image} alt="The open case: motherboard, slots and drive bays" draggable="false" />

      {#each board.memory as s, i}
        {@const stick = build.memory[i] ? part(build.memory[i]!) : null}
        <button
          class="socket"
          class:fits={fits(s.kind)}
          style={place(s.rect)}
          onclick={() => socket(i)}
          title={stick ? `${stick.name} — take it out` : `Memory socket ${i + 1} (bank ${Math.floor(i / board.bank)})`}
        >
          {#if s.kind === "dip64"}
            <!-- The photo has the chips in; an empty bank is nine bare sockets. -->
            {#if !stick}<span class="dips"></span>{/if}
          {:else if stick}
            <span class="simm" style="--pcb:{stick.pcb}"><b>{(stick.kb ?? 0) / 1024}</b></span>
          {/if}
        </button>
      {/each}

      {#each board.slots as s, i}
        <button class="slot" class:fits={fits(s.bus)} style={place(s.rect)} onclick={() => slot(i)} title={s.bus === "trapdoor" ? "The trapdoor expansion connector" : `${s.bus.toUpperCase()} slot ${i + 1}`}></button>
      {/each}
      {#each board.slots as _, i}
        {@const card = build.cards[i]}
        {@const p = card ? part(card.part) : null}
        {#if card && p}
          {#if p.kind === "trapdoor"}
            <!-- Seen from underneath, the A501 lies flat in its bay, chips up. -->
            <button class="flat" style="{place(board.slots[i]!.rect)};--pcb:{p.pcb}" onclick={() => slot(i)} title={`${p.name} — pull it out`}>
              <span class="chips"></span><i class="clock"></i><b class="sticker">{p.name}</b>
            </button>
          {:else}
          <button class="card" class:vertical style={cardStyle(i, p)} onclick={() => slot(i)} title={`${p.name} — pull it out`}>
            <i class="bracket"></i>
            <span class="edge"></span>
            <b class="sticker">{p.name}</b>
          </button>
          {/if}
          {#if p.role === "network"}
            <button class="cable-tag" style="left:2%;top:{board.slots[i]!.rect.y * 100 - 1.5}%" onclick={() => (wiring = wiring === i ? null : i)}>
              🔌 {card.net?.kind === "relay" ? "ethernet relay" : card.net?.kind === "fetch" ? "web only" : "unplugged"}
            </button>
          {/if}
        {/if}
      {/each}

      {#each board.bays as b}
        {@const media = b.slot === "hda" ? machine.hda : machine.hdb}
        <button
          class="bay"
          class:fits={held !== null && "drive" in held}
          class:full={media}
          style={place(b.rect)}
          onclick={() => bay(b.slot)}
          title={media ? `${media.label} — unscrew it` : b.slot === "hda" ? "Bay for the primary master (C:)" : "Bay for the primary slave (D:)"}
        >
          {#if media}
            <span class="drive"><HardDrive {media} /></span>
          {:else}
            <span class="jumper">{b.slot === "hda" ? "MASTER · C:" : "SLAVE · D:"}</span>
          {/if}
        </button>
      {/each}
    </div>

    <aside class="box">
      <h2>Spare parts</h2>
      <p class="summary">
        {size(memory.kb)} fitted{#if memory.halfBanks} · <em>a half-filled bank doesn't count</em>{/if}
      </p>
      {#if board.memory.length}
      <h3>Memory <small>{board.memory[0]?.kind === "dip64" ? "a bank of nine chips, 64 KB" : "72-pin, in pairs"}</small></h3>
      <div class="tray">
        {#each sticks as p}
          <button class="loose simm-loose" class:held={held && "part" in held && held.part.id === p.id} onclick={() => pick(p)}>
            {#if p.image}<img src={p.image} alt="" draggable="false" />{:else}<span class="tube"></span>{/if}<b>{size(p.kb ?? 0)}</b>
          </button>
        {/each}
      </div>
      {/if}
      <h3>Cards</h3>
      <div class="tray">
        {#each cards as p}
          <button class="loose" class:held={held && "part" in held && held.part.id === p.id} onclick={() => pick(p)}>
            {#if p.image}<img src={p.image} alt="" draggable="false" />{:else}<span class="pcb" style="--pcb:{p.pcb}"></span>{/if}<b>{p.name}</b><small>{p.kind === "isa8" ? "8-bit ISA" : p.kind === "trapdoor" ? "trapdoor" : p.kind.toUpperCase()}</small>
          </button>
        {/each}
      </div>
      {#if board.bays.length}
      <h3>Drives <small>from the drawer</small></h3>
      <div class="tray drives">
        {#each loose as m (m.id)}
          <button class="loose hdd" class:held={held && "drive" in held && held.drive.id === m.id} onclick={() => pickDrive(m)}>
            <HardDrive media={m} />
          </button>
        {:else}
          <p class="none">The drawer's empty — unwrap a new drive there.</p>
        {/each}
      </div>
      {/if}
    </aside>
  </div>

  {#if wiring !== null && build.cards[wiring]}
    {@const net = build.cards[wiring]!.net ?? { kind: "none" }}
    <div class="wiring">
      <b>Network cable:</b>
      <label><input type="radio" checked={net.kind === "none"} onchange={() => cable(wiring!, { kind: "none" })} /> unplugged</label>
      <label title="HTTP only, straight from the browser"><input type="radio" checked={net.kind === "fetch"} onchange={() => cable(wiring!, { kind: "fetch" })} /> web only</label>
      <label><input type="radio" checked={net.kind === "relay"} onchange={() => cable(wiring!, { kind: "relay", url: "wss://relay.widgetry.org/" })} /> ethernet relay</label>
      {#if net.kind === "relay"}
        <input class="line" value={net.url} onchange={(e) => cable(wiring!, { kind: "relay", url: e.currentTarget.value })} />
      {:else if net.kind === "fetch"}
        <input class="line" value={net.corsProxy ?? ""} placeholder="CORS proxy (optional)" onchange={(e) => cable(wiring!, { kind: "fetch", ...(e.currentTarget.value ? { corsProxy: e.currentTarget.value } : {}) })} />
      {/if}
    </div>
  {/if}

  <footer>
    {#if locked}
      ⚡ It's running — switch it off before you touch anything.
    {:else if held}
      {"part" in held ? `Holding a ${held.part.name}` : `Holding ${held.drive.label}`} — click where it goes.
      <button onclick={() => (held = null)}>put it back</button>
    {:else}
      Pick a part from the box, then click where it goes. Click anything fitted to take it out.
    {/if}
  </footer>
</Overlay>

<style>
  .bench {
    display: grid;
    grid-template-columns: 1fr 22cqw;
    gap: 1.5cqw;
    align-items: start;
  }
  .board {
    position: relative;
    perspective: 140cqw;
    container-type: inline-size;
  }
  .board > img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 0.6cqw;
    box-shadow: 0 2cqw 4cqw rgb(0 0 0 / 0.7);
  }
  .board button {
    position: absolute;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .socket,
  .slot,
  .bay {
    border-radius: 0.3cqw;
    transition: box-shadow 0.2s, background 0.2s;
  }
  .socket:hover,
  .slot:hover,
  .bay:hover {
    box-shadow: 0 0 0 0.2cqw rgb(255 230 150 / 0.7);
  }
  .fits {
    box-shadow: 0 0 0 0.25cqw #ffd27a, 0 0 1.5cqw #ffd27a;
    animation: pulse 0.9s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    to { background: rgb(255 210 122 / 0.3); }
  }
  /* From straight above a stick in its socket is a green line, its chips'
     edges standing proud down one side. */
  .simm {
    position: absolute;
    inset: 1.5% 22%;
    display: block;
    pointer-events: none;
    background:
      linear-gradient(90deg, transparent 0 40%, var(--pcb) 40% 68%, transparent 68%),
      repeating-linear-gradient(to bottom, transparent 0 3%, #4a4a4a 3% 11%, transparent 11% 12.5%) 0 0 / 40% 100% no-repeat;
    filter: drop-shadow(0.25cqw 0.15cqw 0.15cqw rgb(0 0 0 / 0.6));
  }
  .simm b {
    position: absolute;
    left: 50%;
    top: -1.4cqw;
    translate: -50% 0;
    padding: 0 0.2cqw;
    background: #f5efd8;
    color: #222;
    font: 0.9cqw "VT323", monospace;
    white-space: nowrap;
  }
  .card {
    filter: drop-shadow(0 0.25cqw 0.2cqw rgb(0 0 0 / 0.6));
    transition: filter 0.2s;
  }
  .card:hover {
    filter: drop-shadow(0 0 0.6cqw rgb(255 220 140 / 0.9));
  }
  /* The bracket's top fold, screwed down over the slot cover. */
  .card .bracket {
    position: absolute;
    left: 0;
    top: -60%;
    width: 4%;
    height: 220%;
    border-radius: 0.1cqw;
    background: linear-gradient(90deg, #8a8d90, #e4e6e8 45%, #a3a6a9);
    box-shadow: inset 0 0 0 0.05cqw #6b6e71;
  }
  .card .bracket::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 20%;
    width: 0.7cqw;
    height: 0.7cqw;
    translate: -50% 0;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #f2f2f2, #6d6d6d);
  }
  /* The board's edge, with the tops of the chips and capacitors along one side. */
  .card .edge {
    position: absolute;
    left: 4%;
    right: 0;
    top: 0;
    bottom: 0;
    background:
      linear-gradient(to bottom, transparent 0 40%, var(--pcb) 40% 70%, transparent 70%),
      repeating-linear-gradient(90deg, transparent 0 2.5%, #3b3b3b 2.5% 7%, transparent 7% 9%, #8a7a5a 9% 10.5%, transparent 10.5% 13%) 0 5% / 100% 35% no-repeat;
  }
  /* The XT's slots run front to back: the same edge, turned. */
  .card.vertical .bracket {
    left: -60%;
    top: 0;
    width: 220%;
    height: 4%;
    background: linear-gradient(180deg, #8a8d90, #e4e6e8 45%, #a3a6a9);
  }
  .card.vertical .bracket::after {
    left: 20%;
    top: 50%;
    translate: 0 -50%;
  }
  .card.vertical .edge {
    left: 0;
    right: 0;
    top: 4%;
    bottom: 0;
    background:
      linear-gradient(90deg, transparent 0 40%, var(--pcb) 40% 70%, transparent 70%),
      repeating-linear-gradient(180deg, transparent 0 2.5%, #3b3b3b 2.5% 7%, transparent 7% 9%, #8a7a5a 9% 10.5%, transparent 10.5% 13%) 5% 0 / 35% 100% no-repeat;
  }
  .card.vertical .sticker {
    left: 50%;
    top: 30%;
    translate: -50% 0;
    writing-mode: vertical-rl;
    rotate: 180deg;
  }
  /* An empty bank: nine sockets, two rows of holes each. */
  .dips {
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(to bottom, #2a2a2a 0 8.5%, transparent 8.5% 11.1%),
      #1d4d2c;
    box-shadow: inset 0 0 0 0.2cqw #1d4d2c;
  }
  .dips::after {
    content: "";
    position: absolute;
    inset: 0 12%;
    background: repeating-linear-gradient(90deg, #888 0 0.15cqw, transparent 0.15cqw 0.6cqw);
    mask: repeating-linear-gradient(to bottom, #000 0 8.5%, transparent 8.5% 11.1%);
    opacity: 0.6;
  }
  .loose .tube {
    display: block;
    height: 2cqw;
    margin-bottom: 0.3cqw;
    border-radius: 0.3cqw;
    background: repeating-linear-gradient(90deg, #111 0 0.9cqw, #333 0.9cqw 1cqw), #111;
  }
  .loose .pcb {
    display: block;
    aspect-ratio: 2.2;
    margin-bottom: 0.3cqw;
    background:
      repeating-linear-gradient(90deg, transparent 0 8%, #222 8% 16%, transparent 16% 20%) 50% 30% / 80% 30% no-repeat,
      linear-gradient(to top, #c9a74a 0 8%, transparent 8%) 70% 100% / 60% 100% no-repeat,
      var(--pcb);
  }
  .card .sticker {
    position: absolute;
    left: 6%;
    top: -95%;
    padding: 0 0.3cqw;
    background: #f5efd8;
    color: #222;
    font: 0.9cqw "VT323", monospace;
    white-space: nowrap;
    rotate: -1deg;
  }
  .cable-tag {
    z-index: 2;
    padding: 0.1cqw 0.5cqw !important;
    background: #f5efd8 !important;
    color: #1b2a6b;
    font: 600 1.2cqw "Caveat", cursive;
    border-radius: 0.2cqw;
    box-shadow: 0 0.2cqw 0.4cqw rgb(0 0 0 / 0.5);
    white-space: nowrap;
  }
  .bay {
    display: grid;
    place-items: center;
  }
  .bay .jumper {
    color: #555;
    font: 1.2cqw "VT323", monospace;
  }
  .bay .drive {
    display: block;
    width: 28%;
    rotate: -90deg;
    pointer-events: none;
  }
  .box {
    max-height: 80vh;
    overflow: auto;
    padding: 1.2cqw;
    border-radius: 0.6cqw;
    background:
      repeating-linear-gradient(45deg, rgb(0 0 0 / 0.05) 0 0.4cqw, transparent 0.4cqw 0.8cqw),
      #b58a55;
    box-shadow: inset 0 0 0 0.3cqw #8a6439, 0 2cqw 3cqw rgb(0 0 0 / 0.6);
    color: #2b1b0b;
  }
  h2 {
    margin: 0;
    font: 2.2cqw "Permanent Marker", cursive;
  }
  h3 {
    margin: 1cqw 0 0.4cqw;
    font: 1.6cqw "Permanent Marker", cursive;
  }
  h3 small {
    font: 600 1.3cqw "Caveat", cursive;
  }
  .summary {
    margin: 0.2cqw 0 0;
    font: 1.5cqw "VT323", monospace;
  }
  .tray {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6cqw;
  }
  .loose {
    position: relative;
    width: calc(50% - 0.3cqw);
    padding: 0.4cqw;
    border: 0;
    border-radius: 0.3cqw;
    background: rgb(140 170 200 / 0.35); /* the antistatic bag */
    box-shadow: inset 0 0 0 0.15cqw rgb(255 255 255 / 0.4);
    cursor: pointer;
    font: 600 1.2cqw/1.1 "Caveat", cursive;
    color: #1b1b1b;
    transition: transform 0.15s;
  }
  .loose img {
    display: block;
    width: 100%;
  }
  .loose small {
    display: block;
    font: 1cqw "VT323", monospace;
  }
  .simm-loose {
    width: calc(33% - 0.4cqw);
  }
  .loose:hover {
    transform: translateY(-0.2cqw);
  }
  .loose.held {
    outline: 0.25cqw solid #ffd27a;
    transform: translateY(-0.4cqw) rotate(-2deg);
  }
  .drives .hdd {
    width: calc(33% - 0.4cqw);
  }
  .none {
    margin: 0;
    font: 600 1.4cqw "Caveat", cursive;
  }
  .wiring {
    display: flex;
    flex-wrap: wrap;
    gap: 1cqw;
    align-items: center;
    margin-top: 1cqw;
    padding: 0.8cqw 1.2cqw;
    background: #f5efd8;
    color: #1b2a6b;
    font: 600 1.6cqw "Caveat", cursive;
    border-radius: 0.3cqw;
  }
  .wiring .line {
    flex: 1;
    min-width: 20cqw;
    border: 0;
    border-bottom: 1px dashed #1b2a6b;
    background: transparent;
    font: inherit;
    color: inherit;
  }
  footer {
    display: flex;
    gap: 1cqw;
    align-items: center;
    justify-content: center;
    margin-top: 1.2cqw;
    color: #e8dcc0;
    font: 600 1.8cqw "Caveat", cursive;
  }
  footer button {
    padding: 0.3cqw 1cqw;
    border: 0;
    border-radius: 0.3cqw;
    background: #f3ecd2;
    color: #1b2a6b;
    font: 1.4cqw "Permanent Marker", cursive;
    cursor: pointer;
  }
  /* The A501 from below: a green board filling the bay, a row of DRAMs and the clock battery. */
  .flat {
    position: absolute;
    z-index: 3;
    padding: 0;
    border: 0;
    border-radius: 0.2cqw;
    background:
      linear-gradient(rgb(255 255 255 / 0.06), transparent 40%),
      var(--pcb);
    box-shadow: 0 0.3cqw 0.6cqw rgb(0 0 0 / 0.55), inset 0 0 0 0.12cqw rgb(0 0 0 / 0.35);
    cursor: pointer;
  }
  .flat .chips {
    position: absolute;
    left: 8%;
    right: 30%;
    top: 18%;
    height: 34%;
    background: repeating-linear-gradient(90deg, #17171a 0 9%, transparent 9% 12.5%);
  }
  .flat .clock {
    position: absolute;
    right: 9%;
    top: 16%;
    width: 13%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #e6e6ea, #8a8a92 70%);
  }
  .flat .sticker {
    position: absolute;
    left: 8%;
    bottom: 12%;
    padding: 0.1cqw 0.5cqw;
    background: #f1ecd8;
    color: #222;
    font: 600 0.9cqw/1.2 "Helvetica Neue", Arial, sans-serif;
  }
</style>
