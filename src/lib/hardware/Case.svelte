<script lang="ts">
  import type { CaseGeometry } from "./geometry";
  import { place, dot } from "./rect";
  import { machine } from "../emulator/machine.svelte";
  import { ui } from "../ui.svelte";
  import { sfx } from "../sfx";
  import SevenSegment from "./SevenSegment.svelte";
  import Disc from "../media/Disc.svelte";

  let { geo }: { geo: CaseGeometry } = $props();

  const aspect = $derived(geo.size[0] / geo.size[1]);
  let turbo = $state(true);
  let pressed = $state<string | null>(null);

  function press(name: string, action: () => void) {
    pressed = name;
    setTimeout(() => (pressed = null), 160);
    action();
  }

  function floppyClick() {
    if (machine.fda) return;
    ui.open("floppies");
  }

  function ejectFloppy() {
    press("feject", () => void machine.ejectFloppy());
  }

  function cdEject() {
    press("ceject", () => {
      if (ui.trayOpen) {
        sfx.trayClose();
        ui.trayOpen = false;
      } else {
        sfx.trayOpen();
        ui.trayOpen = true;
      }
    });
  }

  function trayClick() {
    if (machine.cdrom) {
      machine.ejectCd();
      ui.open("cds");
    } else {
      ui.open("cds");
    }
  }

  const on = $derived(machine.power !== "off");
</script>

<div class="case" style="aspect-ratio:{geo.size[0]}/{geo.size[1]}">
  <img src={geo.image} alt="A beige PC case" draggable="false" />

  <!-- power, reset, turbo -->
  <button
    class="btn"
    class:down={pressed === "power" || on}
    style={place(geo.power)}
    title={on ? "Power off" : "Power on"}
    onclick={() => press("power", () => void machine.togglePower())}
  ></button>
  <button
    class="btn round"
    class:down={pressed === "reset"}
    style={place(geo.reset)}
    title="Reset"
    onclick={() => press("reset", () => machine.reset())}
  ></button>
  <button
    class="btn round"
    class:down={pressed === "turbo" || turbo}
    style={place(geo.turbo)}
    title="Turbo (it never did anything, did it?)"
    onclick={() => press("turbo", () => { sfx.click(); turbo = !turbo; })}
  ></button>

  <i class="led green" class:lit={on} style={dot(geo.powerLed, geo.ledSize, aspect)}></i>
  <i class="led amber" class:lit={on && machine.led.hdd} style={dot(geo.hddLed, geo.ledSize, aspect)}></i>

  {#if geo.display}
    <div class="display" style={place(geo.display)}>
      <SevenSegment value={on ? (turbo ? "133" : " 66") : ""} />
    </div>
  {/if}

  <!-- floppy drive -->
  <button
    class="slot"
    class:full={machine.fda}
    style={place(geo.floppy.slot)}
    title={machine.fda ? `A: ${machine.fda.label}` : "Insert a floppy"}
    onclick={floppyClick}
  >
    {#if machine.fda}<span class="sliver" style="background:{machine.fda.color}"></span>{/if}
  </button>
  <button
    class="btn eject"
    class:out={machine.fda}
    class:down={pressed === "feject"}
    style={place(geo.floppy.eject)}
    title="Eject floppy"
    onclick={ejectFloppy}
  ></button>
  <i class="led green" class:lit={machine.led.fdd} style={dot(geo.floppy.led, geo.ledSize * 0.8, aspect)}></i>

  <!-- CD-ROM drive -->
  <button
    class="bay"
    style={place(geo.cd.tray)}
    title={machine.cdrom ? `CD: ${machine.cdrom.label}` : "Open the CD-ROM tray"}
    onclick={cdEject}
  ></button>
  <button
    class="btn eject"
    class:down={pressed === "ceject"}
    style={place(geo.cd.eject)}
    title="Open / close tray"
    onclick={cdEject}
  ></button>
  <i class="led green" class:lit={machine.led.cd} style={dot(geo.cd.led, geo.ledSize * 0.7, aspect)}></i>

  <div
    class="tray"
    class:open={ui.trayOpen}
    style="left:{geo.cd.tray.x * 100}%;width:{geo.cd.tray.w * 100}%;top:{(geo.cd.tray.y + geo.cd.tray.h) * 100}%"
  >
    <button class="tray-face" onclick={trayClick} title={machine.cdrom ? "Take the CD out" : "Put a CD on the tray"}>
      <span class="recess">
        {#if machine.cdrom}<Disc media={machine.cdrom} />{/if}
      </span>
    </button>
  </div>
</div>

<style>
  .case {
    position: relative;
    width: 100%;
    filter: drop-shadow(0 1.2cqw 1.2cqw rgb(0 0 0 / 0.55));
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
  }
  button {
    position: absolute;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  .btn {
    border-radius: 6%;
    transition: box-shadow 80ms, transform 80ms;
  }
  .btn:hover {
    box-shadow: 0 0 0 0.12cqw rgb(255 240 200 / 0.6);
  }
  .btn.down {
    transform: scale(0.94);
    box-shadow: inset 0 0.2cqw 0.4cqw rgb(0 0 0 / 0.45);
  }
  .round {
    border-radius: 50%;
  }
  .eject.out {
    /* A disk in the drive pushes the eject button out. */
    box-shadow: 0 -0.12cqw 0 rgb(255 255 255 / 0.45), 0 0.15cqw 0.2cqw rgb(0 0 0 / 0.4);
    transform: translateY(-6%);
  }
  .slot,
  .bay {
    border-radius: 2px;
  }
  .slot:hover,
  .bay:hover {
    box-shadow: 0 0 0 0.12cqw rgb(255 240 200 / 0.7), 0 0 1cqw rgb(255 220 150 / 0.35);
  }
  .sliver {
    position: absolute;
    inset: 30% 8%;
    border-radius: 1px;
    opacity: 0.9;
    box-shadow: inset 0 1px 1px rgb(0 0 0 / 0.6);
  }
  .led {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    /* Unlit: the photographed LED, dimmed. */
    background: rgb(20 20 10 / 0.55);
    transition: background 40ms, box-shadow 40ms;
  }
  .led.green.lit {
    background: radial-gradient(circle, #eaffd0 0 20%, #4cff3a 45%, #1a9c10 80%);
    box-shadow: 0 0 0.6cqw 0.15cqw rgb(80 255 60 / 0.7);
  }
  .led.amber.lit {
    background: radial-gradient(circle, #fff4c0 0 20%, #ffb020 45%, #b86a00 80%);
    box-shadow: 0 0 0.6cqw 0.15cqw rgb(255 170 30 / 0.75);
  }
  .display {
    position: absolute;
    background: #1a0303;
    border-radius: 2px;
    box-shadow: inset 0 0 0.4cqw #000;
    pointer-events: none;
  }
  .tray {
    position: absolute;
    height: 0;
    overflow: visible;
    z-index: 2;
    perspective: 30cqw;
  }
  .tray-face {
    position: relative;
    left: 0;
    top: -0.2cqw;
    width: 100%;
    aspect-ratio: 1.9;
    transform-origin: top center;
    transform: rotateX(-88deg) scaleY(0.02);
    transition: transform 0.9s cubic-bezier(0.45, 0, 0.3, 1);
    background: linear-gradient(#e3dbc3, #cfc5a8 60%, #b8ad8e);
    border-radius: 0 0 4px 4px;
    box-shadow: 0 1cqw 1.5cqw rgb(0 0 0 / 0.45);
    pointer-events: none;
  }
  .tray.open .tray-face {
    transform: rotateX(52deg) scaleY(1);
    pointer-events: auto;
  }
  .recess {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 72%;
    aspect-ratio: 1;
    translate: -50% -50%;
    border-radius: 50%;
    background: radial-gradient(circle, #9a8f73 0 16%, #3a352a 17% 19%, #bdb294 20% 100%);
    box-shadow: inset 0 0.3cqw 0.6cqw rgb(0 0 0 / 0.5);
    display: grid;
    place-items: center;
  }
</style>
