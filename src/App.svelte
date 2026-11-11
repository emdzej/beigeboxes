<script lang="ts">
  import { onMount } from "svelte";
  import type { Desk as DeskComponent } from "./lib/desks/desk";
  import Pc96 from "./lib/desks/Pc96.svelte";
  import Xt from "./lib/desks/Xt.svelte";
  import Nes from "./lib/desks/Nes.svelte";
  import C64 from "./lib/desks/C64.svelte";
  import Amiga from "./lib/desks/Amiga.svelte";
  import Atari from "./lib/desks/Atari.svelte";
  import Mac from "./lib/desks/Mac.svelte";
  import FloppyBox from "./lib/overlays/FloppyBox.svelte";
  import CdWallet from "./lib/overlays/CdWallet.svelte";
  import Drawer from "./lib/overlays/Drawer.svelte";
  import Phonebook from "./lib/overlays/Phonebook.svelte";
  import Inside from "./lib/overlays/Inside.svelte";
  import Catalogue from "./lib/overlays/Catalogue.svelte";
  import CartBox from "./lib/overlays/CartBox.svelte";
  import TapeBox from "./lib/overlays/TapeBox.svelte";
  import RomBox from "./lib/overlays/RomBox.svelte";
  import { sfx } from "./lib/sfx";
  import TechSupport from "./lib/overlays/TechSupport.svelte";
  import { support } from "./lib/support.svelte";
  import { machine } from "./lib/emulator/machine.svelte";
  import { ui } from "./lib/ui.svelte";
  import { classify, importToDrawer } from "./lib/media/library";

  /*
   * The one screen element v86 ever gets. Built here, outside any monitor,
   * so it survives swapping the CRT for the LCD mid-session.
   */
  const screen = document.createElement("div");
  screen.className = "v86-screen";
  screen.innerHTML = `<div style="white-space:pre;font:14px monospace;line-height:14px"></div><canvas></canvas>`;
  machine.attachScreen(screen);

  /** What stands on the desk depends on the machine: case, monitor, keyboard, its disks. */
  const DESKS: Record<string, DeskComponent> = {
    "pc-pentium": Pc96,
    "pc-xt": Xt,
    nes: Nes,
    c64: C64,
    "amiga-500": Amiga,
    "atari-65xe": Atari,
    "mac-plus": Mac,
  };
  /** The one line of instructions under the desk, for whatever is on it. */
  const INTRO: Record<string, string> = {
    "pc-pentium":
      "Press the big POWER button. Disks are in the box, CDs in the wallet, hard drives in the drawer.<br />The screwdriver opens the case, the catalogue on the shelf has other machines. Drop your own .img / .iso anywhere.",
    "pc-xt":
      "Flip the big red switch on the side. 5¼-inch disks are in the box; turn a drive's lever to let one out.<br />The screwdriver opens the case, the catalogue on the shelf has other machines.",
    c64: "The power switch is on its right side: there's a close-up beside it. Disks go in the 1541; cassettes in the Datasette, then LOAD\"\",1 and PLAY.<br />Cartridges go in with the power off. A gamepad is the joystick in port 2.",
    "amiga-500": "The power switch is on the brick. The drive is on the right-hand side: put the AROS disk in it.<br />The screwdriver turns it over: the trapdoor takes a memory card, and AROS gets further with the 1.5 MB one.",
    "atari-65xe":
      "The power switch and the cartridge slot are round the back: there's a close-up beside it. Disks go in the 1050, cassettes in the XC12.<br />With nothing in, it starts in BASIC. F2, F3 and F4 are START, SELECT and OPTION; a gamepad is the joystick.",
    "mac-plus":
      "Bring your own ROM: it's in the envelope, and it stays in this browser. The power switch is round the back.<br />Disks go in the slot under the screen; the Mac ejects them itself. The mouse is your mouse.",
    nes: "Lift the flap and put a cartridge in, then press POWER. Arrows, Z and X, Enter for Start; a gamepad works too.<br />The catalogue on the shelf has other machines. Drop your own .nes anywhere.",
  };
  const Desk = $derived(DESKS[machine.model.id] ?? Pc96);
  const room = $derived(machine.settings.era === "80s" ? "art/room80s.webp" : "art/room.webp");
  let muted = $state(sfx.muted);

  function flipYear() {
    machine.settings.era = machine.settings.era === "80s" ? "90s" : "80s";
  }


  let stage: HTMLElement;
  let glassEl = $state<HTMLElement>();
  let lean = $state("");
  let dragging = $state(false);

  /** Zoom the whole scene so the monitor glass fills the window. */
  function computeLean() {
    if (!ui.leanIn || !glassEl || !stage) {
      lean = "";
      return;
    }
    const s = stage.getBoundingClientRect();
    // Measure the glass without the current transform.
    const scene = stage.querySelector<HTMLElement>(".scene")!;
    const prev = scene.style.transform;
    scene.style.transition = "none";
    scene.style.transform = "none";
    const g = glassEl.getBoundingClientRect();
    scene.style.transform = prev;
    void scene.offsetWidth;
    scene.style.transition = "";
    const scale = Math.min((window.innerWidth * 0.94) / g.width, (window.innerHeight * 0.9) / g.height);
    const cx = g.left + g.width / 2 - s.left;
    const cy = g.top + g.height / 2 - s.top;
    const vx = window.innerWidth / 2 - s.left;
    const vy = window.innerHeight / 2 - s.top;
    lean = `translate(${vx - cx * scale}px, ${vy - cy * scale}px) scale(${scale})`;
  }

  $effect(() => {
    void ui.leanIn;
    void machine.settings.caseStyle;
    void machine.settings.display;
    requestAnimationFrame(computeLean);
  });

  $effect(() => {
    if (machine.power === "off") ui.leanIn = false;
  });

  function key(e: KeyboardEvent) {
    // Ctrl+Alt+Del never reaches a web page; Ctrl+Alt+End stands in for it.
    if (e.ctrlKey && e.altKey && e.key === "End") {
      e.preventDefault();
      machine.sendCtrlAltDel();
    }
    if (e.key === "Escape" && ui.leanIn && !document.pointerLockElement && !ui.overlay) ui.leanIn = false;
  }

  async function drop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const files = [...(e.dataTransfer?.files ?? [])];
    const where = { floppy: "floppy box", cdrom: "CD wallet", hdd: "drawer", cart: "cartridge stack", tape: "shoebox of cassettes" } as const;
    for (const file of files) {
      const kind = classify(file.name, file.size) ?? "hdd";
      const media = await importToDrawer(file, kind);
      if (!media) {
        ui.say("This browser can't keep files (no OPFS). Try Chrome, Edge, Firefox or Safari 17+.");
        return;
      }
      ui.say(`Filed ${file.name} in your ${where[kind]}`);
    }
    await ui.refresh();
  }

  onMount(() => {
    void ui.refresh();
    support.start();
    const ro = new ResizeObserver(computeLean);
    ro.observe(stage);
    return () => ro.disconnect();
  });
</script>

<svelte:window onkeydown={key} />

<main
  class="room"
  class:dragging
  ondragover={(e) => { e.preventDefault(); dragging = true; }}
  ondragleave={(e) => { if (e.target === e.currentTarget) dragging = false; }}
  ondrop={drop}
>
  <div class="stage" bind:this={stage} class:leaning={ui.leanIn}>
    <div class="scene" style:transform={lean || null}>
      <img class="backdrop" src={room} alt={`A ${machine.settings.era === "80s" ? "1980s" : "1990s"} bedroom desk at night`} draggable="false" />
      <div class="lamp-glow"></div>

      <!-- a pocket calendar pinned to the board: which decade the room is in -->
      <button class="pinned calendar" onclick={flipYear} title="Flip to the {machine.settings.era === '80s' ? '90s' : '80s'}">
        <b>{machine.settings.era === "80s" ? "1986" : "1996"}</b>
        <span class="grid">{#each Array(28) as _, i}<i class:today={i === 10}>{i + 1}</i>{/each}</span>
      </button>

      <!-- mail-order catalogues on the shelf -->
      <button class="item catalogue" onclick={() => ui.open("catalogue")} title="The computer catalogue">
        <img src="art/catalogue.webp" alt="A stack of computer catalogues" draggable="false" />
      </button>

      <!-- the tech support flyer, with tear-off tabs; one's already gone -->
      <button class="pinned flyer" onclick={() => ui.open("support")} title="Tech support">
        <b>COMPUTER<br />TROUBLE?</b>
        <span>Friendly tech support. No appointment, no name needed.</span>
        <span class="tabs">
          {#each [0, 1, 2, 3, 4, 5] as i}
            <i class:gone={i === 2}>TECH SUPPORT</i>
          {/each}
        </span>
        {#if support.unread}<em class="badge">{support.unread} new!</em>{/if}
      </button>

      <Desk {screen} bind:glassEl />

      <!-- The desk's own drawer: its front is lifted out of the photo so it
           can slide out, showing the dark gap behind it. -->
      <div class="drawer-gap"></div>
      <button
        class="drawer-front"
        style="background-image:url({room})"
        onclick={() => ui.open("drawer")}
        title="The drawer with the hard disks"
      >
        <span class="tag">HDDs</span>
      </button>
    </div>
  </div>

  {#if ui.leanIn}
    <div class="lean-hint">
      click the screen to capture the mouse · <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>End</kbd> = Ctrl+Alt+Del ·
      <button onclick={() => (ui.leanIn = false)}>lean back (Esc)</button>
    </div>
  {:else if machine.power === "off" && !ui.overlay}
    <div class="intro">
      <h1>beigeboxes</h1>
      <p>{@html INTRO[machine.model.id] ?? INTRO["pc-pentium"]}</p>
    </div>
  {/if}

  {#if machine.message}
    <button class="sticky" onclick={() => (machine.message = null)}>{machine.message}</button>
  {/if}
  {#if ui.toast}<div class="toast">{ui.toast}</div>{/if}
  <button
    class="mute"
    title={muted ? "Sound off — the clicks and whirrs are muted" : "Sound on"}
    onclick={() => { muted = !muted; sfx.setMuted(muted); }}
  >{muted ? "🔇" : "🔊"}</button>
  {#if dragging}<div class="dropzone">Drop it on the desk — I'll file it away</div>{/if}

  {#if ui.overlay === "floppies"}<FloppyBox />{/if}
  {#if ui.overlay === "cds"}<CdWallet />{/if}
  {#if ui.overlay === "drawer"}<Drawer />{/if}
  {#if ui.overlay === "phonebook"}<Phonebook />{/if}
  {#if ui.overlay === "inside"}<Inside />{/if}
  {#if ui.overlay === "catalogue"}<Catalogue />{/if}
  {#if ui.overlay === "carts"}<CartBox />{/if}
  {#if ui.overlay === "tapes"}<TapeBox />{/if}
  {#if ui.overlay === "rom"}<RomBox />{/if}
  {#if ui.overlay === "support"}<TechSupport />{/if}
</main>

<style>
  .room {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: #0d0a07;
  }
  .stage {
    position: relative;
    width: min(100vw, 177.78vh);
    aspect-ratio: 16 / 9;
    container-type: size;
  }
  .scene {
    position: absolute;
    inset: 0;
    transform-origin: 0 0;
    transition: transform 0.8s cubic-bezier(0.5, 0, 0.2, 1);
  }
  .backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    user-select: none;
  }
  .lamp-glow {
    position: absolute;
    left: 10%;
    top: 30%;
    width: 30%;
    height: 50%;
    background: radial-gradient(ellipse at 40% 30%, rgb(255 190 110 / 0.16), transparent 65%);
    pointer-events: none;
    mix-blend-mode: screen;
  }
  .leaning .lamp-glow {
    opacity: 0;
  }
  /* An emulator in an iframe (C64, Amiga) would swallow the click that leans
     in; from across the room the glass takes it, close up the machine does. */
  .stage:not(.leaning) :global(.scene iframe) {
    pointer-events: none;
  }
  .item {
    position: absolute;
    display: block;
    padding: 0;
    border: 0;
    background: none;
  }
  button.item {
    cursor: pointer;
    transition: filter 0.2s, transform 0.2s;
  }
  button.item:hover {
    filter: brightness(1.12) drop-shadow(0 0 1cqw rgb(255 210 140 / 0.35));
    transform: translateY(-1%);
  }
  .item img {
    display: block;
    width: 100%;
    user-select: none;
  }

  .catalogue {
    /* On the shelf, right of the middle: clear of the tallest monitor. */
    left: 61%;
    width: 10cqw;
    bottom: calc(100cqh - 11.7cqw);
    filter: drop-shadow(0 0.3cqw 0.5cqw rgb(0 0 0 / 0.5));
  }
  .pinned {
    position: absolute;
    left: 2.4%;
    top: 19cqw;
    width: 8cqw;
    padding: 0.6cqw;
    border: 0;
    background:
      repeating-linear-gradient(to bottom, transparent 0 1.1cqw, rgb(80 120 200 / 0.35) 1.1cqw 1.18cqw),
      #fbf7ea;
    color: #1b2a6b;
    font: 600 1.15cqw/1.1 "Caveat", cursive;
    text-align: left;
    rotate: -4deg;
    box-shadow: 0 0.4cqw 0.8cqw rgb(0 0 0 / 0.5);
    cursor: pointer;
    transition: rotate 0.2s, scale 0.2s;
  }
  .pinned b {
    font: 1.4cqw "Permanent Marker", cursive;
    color: #9b1d20;
  }
  .pinned::before {
    content: "";
    position: absolute;
    top: -0.4cqw;
    left: 45%;
    width: 1cqw;
    height: 1cqw;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #ff8a7a, #b0201a);
    box-shadow: 0 0.2cqw 0.3cqw rgb(0 0 0 / 0.5);
  }
  .pinned:hover {
    rotate: -1deg;
    scale: 1.08;
  }
  .calendar {
    left: 4%;
    top: 6cqw;
    width: 7.5cqw;
    padding: 0.5cqw;
    background: #fff;
    text-align: center;
    rotate: -3deg;
  }
  .calendar b {
    display: block;
    margin-bottom: 0.3cqw;
    padding: 0.2cqw 0;
    background: #9b1d20;
    color: #fff;
    font: 1.5cqw "Permanent Marker", cursive;
  }
  .calendar .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.1cqw;
    font: 0.7cqw/1.2 "VT323", monospace;
    color: #333;
  }
  .calendar i {
    font-style: normal;
  }
  .calendar i.today {
    outline: 0.1cqw solid #9b1d20;
    border-radius: 50%;
  }
  .flyer {
    /* On the cork board, right of the calendar. */
    left: 14.5%;
    top: 5.5cqw;
    width: 10.5cqw;
    padding: 0.8cqw 0.7cqw 0;
    background: #f7f1e1;
    color: #222;
    font: 600 1cqw/1.15 "Caveat", cursive;
    text-align: center;
    rotate: 2.5deg;
  }
  .flyer b {
    display: block;
    margin-bottom: 0.3cqw;
    font: 1.3cqw/1.05 "Permanent Marker", cursive;
    color: #1b2a6b;
  }
  .flyer::before {
    background: radial-gradient(circle at 35% 35%, #8ab8ff, #1d4fb0);
  }
  .flyer:hover {
    rotate: 1deg;
  }
  .tabs {
    /* Six equal strips; a vertical-text flex item sizes itself oddly. */
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    margin: 0.6cqw -0.7cqw 0;
    border-top: 0.1cqw dashed #999;
  }
  .tabs i {
    min-width: 0;
    overflow: hidden;
    height: 4.6cqw;
    border-right: 0.1cqw dashed #bbb;
    writing-mode: vertical-rl;
    font: normal 0.75cqw/1 "VT323", monospace;
    color: #333;
    display: grid;
    place-items: center;
  }
  .tabs i.gone {
    visibility: hidden;
  }
  .badge {
    position: absolute;
    top: -0.6cqw;
    right: -1.2cqw;
    padding: 0.15cqw 0.5cqw;
    background: #9b1d20;
    color: #fff;
    font: normal 0.95cqw "Permanent Marker", cursive;
    rotate: 8deg;
    box-shadow: 0 0.2cqw 0.4cqw rgb(0 0 0 / 0.5);
  }
  /* The drawer in the photo: x 1.3–27cqw, y 46.8–53.4cqw. */
  .drawer-gap,
  .drawer-front {
    position: absolute;
    left: 1.3cqw;
    top: 46.8cqw;
    width: 25.7cqw;
    height: 6.6cqw;
  }
  .drawer-gap {
    background: #050403;
    box-shadow: inset 0 0.6cqw 0.8cqw #000;
  }
  .drawer-front {
    padding: 0;
    border: 0;
    background-size: 100cqw 100cqh;
    background-position: -1.3cqw -46.8cqw;
    cursor: pointer;
    transform-origin: 50% 100%;
    transition: transform 0.25s, filter 0.25s;
  }
  .drawer-front:hover {
    /* Pulled an inch toward you: a little lower, a little larger. */
    transform: translateY(0.5cqw) scale(1.025);
    filter: brightness(1.15);
    box-shadow: 0 -0.3cqw 0.6cqw rgb(0 0 0 / 0.7);
  }
  .tag {
    position: absolute;
    right: 3cqw;
    top: 1.6cqw;
    padding: 0.1cqw 0.5cqw;
    background: #fbf7ea;
    color: #1b2a6b;
    font: 0.95cqw "Permanent Marker", cursive;
    rotate: 3deg;
    box-shadow: 0 0.1cqw 0.2cqw rgb(0 0 0 / 0.5);
  }

  .intro {
    position: fixed;
    left: 50%;
    bottom: 1.2rem;
    translate: -50% 0;
    max-width: 52rem;
    text-align: center;
    color: #f3e6c8;
    text-shadow: 0 2px 6px #000;
    pointer-events: none;
    animation: fadein 2s 0.5s both;
  }
  .intro h1 {
    margin: 0;
    font: 2.2rem "Permanent Marker", cursive;
  }
  .intro p {
    margin: 0.2rem 0 0;
    font: 600 1.25rem/1.3 "Caveat", cursive;
  }
  @keyframes fadein {
    from { opacity: 0; }
  }
  .lean-hint {
    position: fixed;
    bottom: 0.5rem;
    left: 50%;
    translate: -50% 0;
    color: #a89c80;
    font: 1rem "VT323", monospace;
    white-space: nowrap;
  }
  .lean-hint button {
    font: inherit;
    color: #e8dcc0;
    background: none;
    border: 1px solid #6b604a;
    cursor: pointer;
  }
  kbd {
    padding: 0 0.3em;
    border: 1px solid #6b604a;
    border-radius: 3px;
  }
  .mute {
    position: fixed;
    right: 1rem;
    bottom: 0.8rem;
    z-index: 40;
    border: 0;
    background: none;
    font-size: 1.3rem;
    opacity: 0.6;
    cursor: pointer;
  }
  .mute:hover {
    opacity: 1;
  }
  .sticky {
    position: fixed;
    top: 1rem;
    left: 1rem;
    z-index: 60;
    max-width: 16rem;
    padding: 1rem;
    border: 0;
    background: #fff27a;
    color: #222;
    font: 600 1.3rem/1.2 "Caveat", cursive;
    text-align: left;
    rotate: -2deg;
    box-shadow: 0 6px 14px rgb(0 0 0 / 0.5);
    cursor: pointer;
  }
  .toast {
    position: fixed;
    top: 1.2rem;
    left: 50%;
    translate: -50% 0;
    z-index: 70;
    padding: 0.5rem 1.2rem;
    background: #fbf7ea;
    color: #1b2a6b;
    font: 1.15rem "Permanent Marker", cursive;
    box-shadow: 0 6px 14px rgb(0 0 0 / 0.5);
    rotate: -1deg;
    animation: rise 0.3s ease-out;
  }
  @keyframes rise {
    from { translate: -50% -1rem; opacity: 0; }
  }
  .dropzone {
    position: fixed;
    inset: 1rem;
    z-index: 80;
    display: grid;
    place-items: center;
    border: 4px dashed #f3e6c8;
    border-radius: 1rem;
    background: rgb(0 0 0 / 0.45);
    color: #f3e6c8;
    font: 2rem "Permanent Marker", cursive;
    pointer-events: none;
  }
</style>
