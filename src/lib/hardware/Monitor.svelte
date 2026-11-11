<script lang="ts">
  import type { MonitorGeometry } from "./geometry";
  import { place, dot } from "./rect";
  import { machine } from "../emulator/machine.svelte";
  import { ui } from "../ui.svelte";

  let {
    geo,
    kind,
    screen,
    glassEl = $bindable(),
    phosphor,
  }: {
    geo: MonitorGeometry;
    kind: "crt" | "lcd";
    screen: HTMLElement;
    glassEl?: HTMLElement | undefined;
    /** A monochrome tube: the picture comes out in its phosphor's colour. */
    phosphor?: "green";
  } = $props();

  const aspect = $derived(geo.size[0] / geo.size[1]);
  // No video card, no sync: the monitor sits in standby with the machine on.
  const signal = $derived(machine.power !== "off" && machine.signal);
  const lit = $derived(machine.monitorOn && signal);

  /**
   * v86 is handed its screen element once, at power-on. Moving that node
   * between monitors — rather than making a new one — is what lets the
   * monitor be swapped while the machine is running.
   */
  function adopt(node: HTMLElement) {
    node.appendChild(screen);
  }

  function glassClick() {
    if (!signal) return;
    if (!ui.leanIn) ui.leanIn = true;
    else machine.lockMouse();
  }
</script>

<div class="monitor {kind}">
  <img src={geo.image} alt={kind === "crt" ? "A CRT" : "An early LCD monitor"} draggable="false" />

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="glass"
    class:lit
    class:standby={machine.monitorOn && !signal}
    bind:this={glassEl}
    style={place(geo.glass)}
    onclick={glassClick}
  >
    <div class="tube" class:green={phosphor === "green"} use:adopt>
      <!-- One scanline per guest pixel row, so a line never eats half a glyph. -->
      <div class="lines" class:near={ui.leanIn} style="--rows:{machine.screen.height}"></div>
    </div>
    {#if kind === "lcd" && machine.monitorOn && !signal}
      <div class="osd">No Signal</div>
    {/if}
    <div class="fx"></div>
  </div>

  {#if geo.power}
    <button class="power" style={place(geo.power)} title="Monitor power" onclick={() => machine.toggleMonitor()}></button>
  {/if}
  {#if geo.led}
    <i class="led" class:on={machine.monitorOn} class:standby={machine.monitorOn && !signal} style={dot(geo.led, 0.014, aspect)}></i>
  {/if}
</div>

<style>
  .monitor {
    position: relative;
    width: 100%;
    filter: drop-shadow(0 1cqw 1.4cqw rgb(0 0 0 / 0.5));
  }
  img {
    position: relative;
    z-index: 1;
    display: block;
    width: 100%;
    /* The photo sets the box's height, so everything placed over it in
       fractions lands where it is drawn, in every browser. */
    height: auto;
    user-select: none;
    /* The glass is a hole in the photo; clicks fall through to the screen. */
    pointer-events: none;
  }
  .glass {
    position: absolute;
    overflow: hidden;
    background: #050605;
    cursor: zoom-in;
  }
  .crt .glass {
    /* The tube bulges: a darker rim and a soft inner shadow. */
    box-shadow: inset 0 0 0.8cqw 0.2cqw rgb(0 0 0 / 0.85);
  }
  /* A CRT never lit the glass to its edge: the picture sat inside a black
     border, which also keeps the rim's shadow off the first column. */
  .crt .tube {
    inset: 4.5% 4%;
  }
  .tube {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    opacity: 0;
    transform: scale(1, 0.004);
    filter: brightness(3);
    transition:
      transform 0.25s cubic-bezier(0.6, 0, 0.4, 1),
      opacity 0.3s,
      filter 0.6s;
  }
  .lit .tube {
    opacity: 1;
    transform: none;
    filter: none;
    transition:
      transform 0.45s 0.15s cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 0.1s,
      filter 1.2s 0.2s;
  }
  .lcd .tube {
    transform: none;
    filter: none;
    transition: opacity 0.6s;
  }
  .crt.monitor .glass.standby {
    /* Tube warm, no picture: the faint grey glow of an idle CRT. */
    background: radial-gradient(ellipse at center, #1a1d1a, #070807 70%);
  }
  .lcd .glass.standby {
    background: #0c0d10;
  }
  .lcd .glass.lit {
    background: #000;
  }
  /* A green-phosphor tube shows a mono picture in its own colour. */
  .tube.green :global(canvas) {
    filter: grayscale(1) sepia(1) hue-rotate(65deg) saturate(5) brightness(0.95) !important;
  }
  /* The guest's own screen, scaled to the glass. */
  .tube :global(canvas) {
    width: 100% !important;
    height: 100% !important;
    object-fit: fill;
  }
  .tube :global(canvas) {
    /* The scene is scaled up to lean in; smoothing a 720×400 text screen
       across that turns it to mush. */
    image-rendering: pixelated;
  }
  .crt .tube :global(canvas) {
    filter: contrast(1.1) saturate(1.15) brightness(1.08);
  }
  .lines {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.6s;
  }
  .crt .lines {
    background: linear-gradient(to bottom, transparent 65%, rgb(0 0 0 / 0.28) 65%) 0 0 / 100% calc(100% / var(--rows));
  }
  /* From across the room a row is under a device pixel and the lines alias
     into moiré; only show them up close. */
  .crt .lines.near {
    opacity: 1;
  }
  .tube :global(.v86-screen) {
    position: absolute;
    inset: 0;
  }
  .tube :global(.v86-screen > div) {
    display: none;
  }
  .fx {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .crt .fx {
    background:
      radial-gradient(ellipse 60% 45% at 28% 18%, rgb(255 255 255 / 0.07), transparent 70%),
      radial-gradient(ellipse at center, transparent 62%, rgb(0 0 0 / 0.4) 100%);
    mix-blend-mode: normal;
  }
  .lcd .fx {
    background:
      linear-gradient(135deg, rgb(255 255 255 / 0.04), transparent 40%);
  }
  .osd {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    padding: 0.4cqw 1cqw;
    border: 1px solid #5b8cff;
    background: rgb(10 20 80 / 0.85);
    color: #dfe8ff;
    font: 1.1cqw/1 "VT323", monospace;
    animation: drift 9s ease-in-out infinite alternate;
  }
  @keyframes drift {
    from { translate: -80% -120%; }
    to { translate: -20% 40%; }
  }
  .power,
  .led {
    z-index: 2;
  }
  .power {
    position: absolute;
    border: 0;
    padding: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }
  .power:hover {
    box-shadow: 0 0 0 0.12cqw rgb(255 240 200 / 0.6);
  }
  .led {
    position: absolute;
    border-radius: 50%;
    background: rgb(20 20 10 / 0.5);
    pointer-events: none;
  }
  .led.on {
    background: radial-gradient(circle, #eaffd0 0 20%, #4cff3a 50%, #1a9c10 85%);
    box-shadow: 0 0 0.5cqw rgb(80 255 60 / 0.7);
  }
  .led.standby {
    background: radial-gradient(circle, #fff4c0 0 20%, #ffb020 50%, #b86a00 85%);
    box-shadow: 0 0 0.5cqw rgb(255 170 30 / 0.7);
  }
</style>
