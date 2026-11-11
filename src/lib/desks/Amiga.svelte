<script lang="ts">
  import Monitor from "../hardware/Monitor.svelte";
  import Loupe from "../hardware/Loupe.svelte";
  import { A500 as geo, A500_PSU as psu, A500_SIDE as side, C1084 } from "../hardware/geometry";
  import { place, dot } from "../hardware/rect";
  import { machine } from "../emulator/machine.svelte";
  import { ui } from "../ui.svelte";
  import type { DeskProps } from "./desk";

  /**
   * 1988, at the same ~15 mm/cqw as the other desks: an Amiga 500 in front of
   * its 14" monitor, the tank mouse, the power brick (the switch is on it), a
   * box of 3½" disks. The drive is on the A500's right flank, so it gets a close-up.
   */
  let { screen, glassEl = $bindable() }: DeskProps = $props();

  const on = $derived(machine.power !== "off");
  const aspect = geo.size[0] / geo.size[1];

  function drive() {
    if (machine.fda) void machine.ejectFloppy("fda");
    else {
      ui.floppyTarget = "fda";
      ui.open("floppies");
    }
  }
</script>

<button class="item floppybox" onclick={() => ((ui.floppyTarget = "fda"), ui.open("floppies"))} title="Floppy disks">
  <img src="art/floppybox.webp" alt="A box of floppy disks" draggable="false" />
</button>

<div class="item monitor"><Monitor geo={C1084} kind="crt" {screen} bind:glassEl /></div>

<div class="item unit">
  <img src={geo.image} alt="An Amiga 500-style home computer" draggable="false" />
  <i class="led power-led" class:lit={on} style={dot(geo.powerLed, geo.ledSize, aspect)}></i>
  <i class="led drive-led" class:lit={on && machine.led.fdd} style={dot(geo.driveLed, geo.ledSize, aspect)}></i>
</div>

<div class="item side">
  <Loupe image={side.image} alt="The A500's right side: the floppy drive" caption="DF0:, on the right-hand side">
    <button class="slot" class:loaded={machine.fda} style={place(side.slot)} title={machine.fda ? `${machine.fda.label} — press eject` : "DF0: put a disk in"} onclick={drive}></button>
    <button class="eject" style={place(side.eject)} title={machine.fda ? "Eject" : "Eject (the drive is empty)"} onclick={() => machine.fda && void machine.ejectFloppy("fda")}></button>
  </Loupe>
</div>

<div class="item psu">
  <img src={psu.image} alt="The Amiga's power supply" draggable="false" />
  <button class="power" class:on style={place(psu.power)} title={on ? "Power: off" : "Power: on"} onclick={() => void machine.togglePower()}></button>
</div>

<img class="item mouse" src="art/amiga/mouse.webp" alt="" draggable="false" />

<button class="item screwdriver" onclick={() => ui.open("inside")} title="Turn it over and open the trapdoor">
  <img src="art/screwdriver.webp" alt="A screwdriver" draggable="false" />
</button>

<style>
  .item {
    position: absolute;
    display: block;
    padding: 0;
    border: 0;
    background: none;
  }
  /* The photo sets each box's height, so whatever sits over it lands where
     it is drawn in every browser (an aspect-ratio box didn't, in Safari). */
  .item img {
    display: block;
    width: 100%;
    height: auto;
    user-select: none;
  }
  button.item {
    cursor: pointer;
    transition: filter 0.2s, transform 0.2s;
  }
  button.item:hover {
    filter: brightness(1.12) drop-shadow(0 0 1cqw rgb(255 210 140 / 0.35));
    transform: translateY(-1%);
  }
  .psu button {
    position: absolute;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .psu button:hover {
    box-shadow: 0 0 0 0.15cqw rgb(255 220 140 / 0.6);
  }
  .slot.loaded {
    /* A disk in: its blue-grey back edge fills the slot. */
    background: linear-gradient(transparent 20%, #2a3240 20% 80%, transparent 80%);
  }
  .power.on {
    /* Rocked over to I. */
    background: rgb(0 0 0 / 0.25);
  }
  /* Same desk lines as the other machines: wall at 41cqw, front lip at 43.2cqw.
     Real widths at ~15 mm/cqw: A500 470 mm, 1084S 370, the brick 165. */
  .unit {
    left: 3%;
    width: 31.3cqw;
    bottom: calc(100cqh - 44.4cqw);
    filter: drop-shadow(0 0.6cqw 0.8cqw rgb(0 0 0 / 0.55));
  }
  .side {
    left: 35%;
    width: 7.5cqw;
    bottom: calc(100cqh - 43.4cqw);
  }
  .monitor {
    left: 23%;
    width: 24.7cqw;
    bottom: calc(100cqh - 41.4cqw);
  }
  .psu {
    left: 57%;
    width: 11cqw;
    bottom: calc(100cqh - 42.4cqw);
    filter: drop-shadow(0 0.5cqw 0.6cqw rgb(0 0 0 / 0.5));
  }
  .mouse {
    left: 50%;
    width: 5cqw;
    bottom: calc(100cqh - 44.2cqw);
    filter: drop-shadow(0 0.4cqw 0.5cqw rgb(0 0 0 / 0.55));
    pointer-events: none;
  }
  .floppybox {
    left: 71%;
    width: 10cqw;
    bottom: calc(100cqh - 42.4cqw);
    filter: drop-shadow(0 0.5cqw 0.6cqw rgb(0 0 0 / 0.5));
  }
  .screwdriver {
    left: 83%;
    width: 13cqw;
    bottom: calc(100cqh - 43.8cqw);
    filter: drop-shadow(0 0.3cqw 0.4cqw rgb(0 0 0 / 0.55));
  }
  .led {
    position: absolute;
    border-radius: 50%;
    background: rgb(30 30 20 / 0.5);
    pointer-events: none;
  }
  .power-led.lit {
    background: #4cff3a;
    box-shadow: 0 0 0.5cqw rgb(80 255 60 / 0.7);
  }
  .drive-led.lit {
    background: #ffb020;
    box-shadow: 0 0 0.5cqw rgb(255 170 30 / 0.7);
  }
</style>
