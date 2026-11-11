<script lang="ts">
  import Monitor from "../hardware/Monitor.svelte";
  import Loupe from "../hardware/Loupe.svelte";
  import { C1702, C64 as geo, C64_SIDE as side, DATASETTE as deck, DRIVE1541 as drive } from "../hardware/geometry";
  import { place, dot } from "../hardware/rect";
  import { machine } from "../emulator/machine.svelte";
  import { ui } from "../ui.svelte";
  import type { DeskProps } from "./desk";

  /**
   * 1984, all at one scale (about 15 mm to 1cqw): the breadbin in front of its
   * monitor, the 1541 and the Datasette along the wall. The power switch is on
   * the C64's right flank, which the desk can't show, so it gets a close-up.
   */
  let { screen, glassEl = $bindable() }: DeskProps = $props();

  const on = $derived(machine.power !== "off");

  function disk() {
    if (machine.fda) void machine.ejectFloppy("fda");
    else {
      ui.floppyTarget = "fda";
      ui.open("floppies");
    }
  }

  function lid() {
    if (machine.tape) void machine.ejectTape();
    else ui.open("tapes");
  }
</script>

<button class="item diskbox" onclick={() => ((ui.floppyTarget = "fda"), ui.open("floppies"))} title="5¼-inch disks">
  <img src="art/xt/diskbox525.webp" alt="A box of 5¼-inch disks" draggable="false" />
</button>

<div class="item drive">
  <img src={drive.image} alt="A 5¼-inch floppy drive" draggable="false" />
  <button class="slot" style={place(drive.slot)} title={machine.fda ? `${machine.fda.label} — open the door` : "Put a disk in"} onclick={disk}>
    {#if machine.fda}<span class="sleeve" style="--c:{machine.fda.color}"></span>{/if}
  </button>
  <button class="lever" class:closed={machine.fda} style={place(drive.lever)} title={machine.fda ? "Turn the lever to let the disk out" : "Drive 8"} onclick={disk}></button>
  <i class="led green" class:lit={on} style={dot(drive.power, drive.ledSize, drive.size[0] / drive.size[1])}></i>
  <i class="led red" class:lit={on && machine.led.fdd} style={dot(drive.busy, drive.ledSize, drive.size[0] / drive.size[1])}></i>
</div>

<div class="item monitor"><Monitor geo={C1702} kind="crt" {screen} bind:glassEl /></div>

<div class="item deck">
  <img src={deck.image} alt="A cassette deck" draggable="false" />
  <button class="lid" class:loaded={machine.tape} style={place(deck.lid)} title={machine.tape ? `${machine.tape.label} — press STOP/EJECT to take it out` : "Put a cassette in"} onclick={lid}>
    {#if machine.tape}<span class="cassette" class:turning={machine.led.tape} style="--c:{machine.tape.color}"><b>{machine.tape.label}</b></span>{/if}
  </button>
  {#each Object.entries(deck.keys) as [k, r]}
    <button class="key" style={place(r)} title={k === "stop" ? "STOP/EJECT" : k.toUpperCase()} onclick={() => machine.tapeButton(k as "play" | "stop" | "rewind")}></button>
  {/each}
</div>

<div class="item unit">
  <img src={geo.image} alt="A Commodore 64-style home computer" draggable="false" />
  <i class="led red" class:lit={on} style={dot(geo.led, geo.ledSize, geo.size[0] / geo.size[1])}></i>
</div>

<div class="item side">
  <Loupe image={side.image} alt="The C64's right side: power socket, switch and joystick ports" caption="right-hand side">
    <button class="power" class:on style={place(side.power)} title={on ? "Power switch: off" : "Power switch: on"} onclick={() => void machine.togglePower()}></button>
  </Loupe>
</div>

<button class="item carts" onclick={() => ui.open("carts")} title="Cartridges">
  {#each ["#c8a24a", "#b33a2e", "#3c6fb0"] as label}<span style="--l:{label}"></span>{/each}
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
  .item button {
    position: absolute;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .item button:hover {
    box-shadow: 0 0 0 0.15cqw rgb(255 220 140 / 0.6);
  }
  /* Same desk lines as the other machines: wall at 41cqw, front lip at 43.2cqw.
     Widths are the real ones at ~15 mm/cqw: C64 404 mm, 1702 390, 1541 200,
     Datasette 192, a 5¼" disk box 170. */
  .unit {
    left: 3%;
    width: 27cqw;
    bottom: calc(100cqh - 44.4cqw);
    filter: drop-shadow(0 0.6cqw 0.8cqw rgb(0 0 0 / 0.55));
  }
  .side {
    /* Beside the flank it shows, on the desk. */
    left: 30.6%;
    width: 7.5cqw;
    bottom: calc(100cqh - 43.4cqw);
  }
  .power.on {
    /* Rocked over: a hint darker. */
    background: rgb(0 0 0 / 0.25);
  }
  .monitor {
    left: 19%;
    width: 26cqw;
    bottom: calc(100cqh - 41.4cqw);
  }
  .drive {
    left: 47%;
    width: 13.3cqw;
    bottom: calc(100cqh - 41.6cqw);
    filter: drop-shadow(0 0.6cqw 0.8cqw rgb(0 0 0 / 0.5));
  }
  .deck {
    left: 68%;
    width: 12.8cqw;
    bottom: calc(100cqh - 42.6cqw);
    filter: drop-shadow(0 0.5cqw 0.6cqw rgb(0 0 0 / 0.5));
  }
  .diskbox {
    left: 84%;
    width: 11.3cqw;
    bottom: calc(100cqh - 42.6cqw);
    filter: drop-shadow(0 0.5cqw 0.6cqw rgb(0 0 0 / 0.5));
  }
  .slot .sleeve {
    position: absolute;
    left: 30%;
    right: 30%;
    top: -40%;
    height: 60%;
    background: linear-gradient(#1b1b1d, #0c0c0d);
    border-top: 0.25cqw solid var(--c);
  }
  .lever.closed {
    /* Turned down across the slot: the disk is clamped. */
    background: linear-gradient(90deg, transparent 42%, #1d1d20 42% 58%, transparent 58%);
  }
  .lid.loaded {
    background: rgb(20 20 22 / 0.25);
  }
  .cassette {
    position: absolute;
    inset: 22% 18%;
    border-radius: 0.3cqw;
    background:
      radial-gradient(circle at 30% 55%, #ddd 0 6%, #222 6% 14%, transparent 14%),
      radial-gradient(circle at 70% 55%, #ddd 0 6%, #222 6% 14%, transparent 14%),
      linear-gradient(#2b2b2e, #18181a);
    border-top: 0.6cqw solid var(--c);
    opacity: 0.85;
  }
  .cassette b {
    position: absolute;
    left: 8%;
    top: 6%;
    color: #f1ecd8;
    font: 700 0.7cqw/1 "Helvetica Neue", Arial, sans-serif;
  }
  .cassette.turning {
    animation: wobble 0.5s linear infinite;
  }
  @keyframes wobble {
    50% { filter: brightness(1.15); }
  }
  .led {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
  }
  .led.red {
    background: rgb(70 10 10 / 0.6);
  }
  .led.green {
    background: rgb(10 50 10 / 0.6);
  }
  .led.red.lit {
    background: radial-gradient(circle, #ffd0c0 0 20%, #ff2a10 55%, #8a0a00 90%);
    box-shadow: 0 0 0.6cqw rgb(255 40 20 / 0.8);
  }
  .led.green.lit {
    background: radial-gradient(circle, #eaffd0 0 20%, #4cff3a 50%, #1a9c10 85%);
    box-shadow: 0 0 0.5cqw rgb(80 255 60 / 0.7);
  }
  /* A stack of cartridges between the drive and the Datasette: flat black boxes, label up. */
  .carts {
    /* A C64 cartridge is only ~70 mm across. */
    left: 61.5%;
    width: 4.6cqw;
    height: 2.2cqw;
    bottom: calc(100cqh - 43cqw);
  }
  .carts span {
    position: absolute;
    left: 0;
    width: 100%;
    height: 0.7cqw;
    border-radius: 0.12cqw;
    background:
      linear-gradient(var(--l), var(--l)) 18% 30% / 55% 35% no-repeat,
      linear-gradient(#3a3631 0 35%, #1f1c19 35%);
    box-shadow: 0 0.2cqw 0.3cqw rgb(0 0 0 / 0.6);
  }
  .carts span:nth-child(1) { bottom: 0; }
  .carts span:nth-child(2) { bottom: 0.7cqw; left: 5%; rotate: 3deg; }
  .carts span:nth-child(3) { bottom: 1.4cqw; left: -3%; rotate: -2deg; }
</style>
