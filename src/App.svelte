<script lang="ts">
  import { onMount } from "svelte";
  import Case from "./lib/hardware/Case.svelte";
  import Monitor from "./lib/hardware/Monitor.svelte";
  import Modem from "./lib/hardware/Modem.svelte";
  import FloppyBox from "./lib/overlays/FloppyBox.svelte";
  import CdWallet from "./lib/overlays/CdWallet.svelte";
  import Drawer from "./lib/overlays/Drawer.svelte";
  import Setup from "./lib/overlays/Setup.svelte";
  import { TOWER, DESKTOP, CRT, LCD } from "./lib/hardware/geometry";
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

  const tower = $derived(machine.settings.caseStyle === "tower");
  const crt = $derived(machine.settings.display === "crt");

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
    const where = { floppy: "floppy box", cdrom: "CD wallet", hdd: "drawer" } as const;
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
      <img class="backdrop" src="art/room.webp" alt="A 1990s bedroom desk at night" draggable="false" />
      <div class="lamp-glow"></div>

      <!-- the setup card, pinned to the cork board -->
      <button class="pinned card" onclick={() => ui.open("setup")} title="Setup notes">
        <b>MY PC</b><br />setup &amp; phone #s
      </button>

      <!-- floppy box, left of the monitor -->
      <button class="item floppybox" onclick={() => ui.open("floppies")} title="Floppy disks">
        <img src="art/floppybox.webp" alt="A box of floppy disks" draggable="false" />
      </button>

      <!-- the modem sits on the magazines -->
      <div class="item modem"><Modem /></div>

      <!-- CD wallet, front right -->
      <button class="item cdwallet" onclick={() => ui.open("cds")} title="CDs">
        <img src="art/cdwallet.webp" alt="A CD wallet" draggable="false" />
      </button>

      {#if tower}
        <div class="item monitor tower-mode" class:lcd={!crt}>
          {#if crt}<Monitor geo={CRT} kind="crt" {screen} bind:glassEl />{:else}<Monitor geo={LCD} kind="lcd" {screen} bind:glassEl />{/if}
        </div>
        <div class="item tower"><Case geo={TOWER} /></div>
      {:else}
        <div class="item desktop"><Case geo={DESKTOP} /></div>
        <div class="item monitor desktop-mode" class:lcd={!crt}>
          {#if crt}<Monitor geo={CRT} kind="crt" {screen} bind:glassEl />{:else}<Monitor geo={LCD} kind="lcd" {screen} bind:glassEl />{/if}
        </div>
      {/if}

      <img class="item keyboard" src="art/keyboard.webp" alt="" draggable="false" />
      <img class="item mouse" src="art/mouse.webp" alt="" draggable="false" />

      <!-- The desk's own drawer: its front is lifted out of the photo so it
           can slide out, showing the dark gap behind it. -->
      <div class="drawer-gap"></div>
      <button
        class="drawer-front"
        style="background-image:url(art/room.webp)"
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
      <h1>beigebox</h1>
      <p>Press the big POWER button. Disks are in the box, CDs in the wallet, hard drives in the drawer.<br />Drop your own .img / .iso anywhere.</p>
    </div>
  {/if}

  {#if machine.message}
    <button class="sticky" onclick={() => (machine.message = null)}>{machine.message}</button>
  {/if}
  {#if ui.toast}<div class="toast">{ui.toast}</div>{/if}
  {#if dragging}<div class="dropzone">Drop it on the desk — I'll file it away</div>{/if}

  {#if ui.overlay === "floppies"}<FloppyBox />{/if}
  {#if ui.overlay === "cds"}<CdWallet />{/if}
  {#if ui.overlay === "drawer"}<Drawer />{/if}
  {#if ui.overlay === "setup"}<Setup />{/if}
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
  img.item {
    user-select: none;
  }

  /* Layout in container units: 100cqw is the stage's width, 100cqh its
     height. The desk is seen almost edge-on: its top runs from the wall at
     41cqw down to the front lip at 43.2cqw, so things stand on it by their
     bottom edge — further back, higher up. */
  .tower-mode {
    left: 29%;
    width: 25cqw;
    bottom: calc(100cqh - 41.9cqw);
  }
  .tower-mode.lcd {
    left: 29.5%;
    width: 24cqw;
  }
  .tower {
    left: 57%;
    width: 13.6cqw;
    bottom: calc(100cqh - 42.2cqw);
  }
  .desktop {
    left: 25%;
    width: 36cqw;
    bottom: calc(100cqh - 41.9cqw);
  }
  .desktop-mode {
    /* On the case: its lid is the case's top edge, 13.7cqw up, less the
       lip the monitor's foot sinks behind. */
    left: 31%;
    width: 24cqw;
    bottom: calc(100cqh - 41.9cqw + 12cqw);
  }
  .desktop-mode.lcd {
    left: 31.5%;
    width: 23cqw;
  }
  .keyboard {
    /* At the very front, its lip over the desk's edge. */
    left: 26.5%;
    width: 30cqw;
    bottom: calc(100cqh - 43.7cqw);
    filter: drop-shadow(0 0.4cqw 0.5cqw rgb(0 0 0 / 0.55));
    pointer-events: none;
  }
  .mouse {
    /* On its pad, right of the keyboard; the cable runs off to the tower. */
    left: 56.8%;
    width: 17cqw;
    bottom: calc(100cqh - 43.6cqw);
    filter: drop-shadow(0 0.3cqw 0.4cqw rgb(0 0 0 / 0.55));
    pointer-events: none;
  }
  .floppybox {
    left: 10%;
    width: 14cqw;
    bottom: calc(100cqh - 42.4cqw);
    filter: drop-shadow(0 0.5cqw 0.6cqw rgb(0 0 0 / 0.5));
  }
  .cdwallet {
    left: 88%;
    width: 9.5cqw;
    bottom: calc(100cqh - 43.3cqw);
    filter: drop-shadow(0 0.4cqw 0.6cqw rgb(0 0 0 / 0.5));
  }
  .modem {
    left: 72.5%;
    width: 13cqw;
    bottom: calc(100cqh - 41.7cqw);
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
