<script lang="ts">
  import Monitor from "../hardware/Monitor.svelte";
  import Loupe from "../hardware/Loupe.svelte";
  import { MAC_BACK as back, MAC_PLUS as geo } from "../hardware/geometry";
  import { place } from "../hardware/rect";
  import { machine } from "../emulator/machine.svelte";
  import { ui } from "../ui.svelte";
  import type { DeskProps } from "./desk";

  /**
   * 1986, at the ~15 mm/cqw every desk uses: a Mac Plus, its keyboard and
   * mouse, a box of 3½" disks, and the envelope the ROM came in. The Mac is its
   * own monitor; the power switch is round the back, so it gets a close-up.
   */
  let { screen, glassEl = $bindable() }: DeskProps = $props();

  const on = $derived(machine.power !== "off");

  // A compact Mac has no monitor switch: the screen comes on with the machine.
  $effect(() => {
    if (!machine.monitorOn) machine.toggleMonitor();
  });

  /** The Mac ejects its own disks; from outside there's only the slot. */
  function slot() {
    if (machine.fda) {
      if (on) ui.say("A Mac keeps hold of its disk: drag it to the Trash, or choose Eject.");
      else void machine.ejectFloppy("fda");
    } else {
      ui.floppyTarget = "fda";
      ui.open("floppies");
    }
  }
</script>

<button class="item floppybox" onclick={() => ((ui.floppyTarget = "fda"), ui.open("floppies"))} title="3½-inch disks">
  <img src="art/floppybox.webp" alt="A box of floppy disks" draggable="false" />
</button>

<div class="item mac">
  <Monitor geo={geo} kind="crt" {screen} bind:glassEl />
  <div class="front">
    <button class="slot" class:loaded={machine.fda} style={place(geo.slot)} title={machine.fda ? `${machine.fda.label}` : "Put a disk in"} onclick={slot}></button>
  </div>
</div>

<div class="item side">
  <Loupe image={back.image} alt="The back of the Mac: the power switch above the mains socket" caption="round the back">
    <button class="power" class:on style={place(back.power)} title={on ? "Power switch: off" : "Power switch: on"} onclick={() => void machine.togglePower()}></button>
  </Loupe>
</div>

<img class="item keyboard" src="art/mac/keyboard.webp" alt="The keyboard and mouse" draggable="false" />

<button class="item rom" onclick={() => ui.open("rom")} title="The ROM: bring your own">
  <span>ROM</span>
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
     it is drawn in every browser. */
  .item img,
  img.item {
    display: block;
    height: auto;
    user-select: none;
  }
  .item img {
    width: 100%;
  }
  button.item {
    cursor: pointer;
    transition: filter 0.2s, transform 0.2s;
  }
  button.item:hover {
    filter: brightness(1.12) drop-shadow(0 0 1cqw rgb(255 210 140 / 0.35));
    transform: translateY(-1%);
  }
  /* Same desk lines as the other machines: wall at 41cqw, front lip at 43.2cqw.
     Real widths at ~15 mm/cqw: Mac Plus 246 mm, the keyboard and mouse 580. */
  .mac {
    left: 30%;
    width: 16.4cqw;
    bottom: calc(100cqh - 41.4cqw);
  }
  .front {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }
  .front button {
    position: absolute;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    pointer-events: auto;
  }
  .front button:hover,
  .side :global(button:hover) {
    box-shadow: 0 0 0 0.15cqw rgb(255 220 140 / 0.6);
  }
  .slot.loaded {
    /* A disk in: its blue-grey back edge fills the slot. */
    background: linear-gradient(transparent 30%, #2a3240 30% 70%, transparent 70%);
  }
  .side {
    /* Beside the Mac, up in the air: the switch is on its back. */
    left: 47.5%;
    width: 7.5cqw;
    bottom: calc(100cqh - 35.5cqw);
  }
  .power.on {
    background: rgb(0 0 0 / 0.25);
  }
  .keyboard {
    left: 18%;
    width: 38.9cqw;
    bottom: calc(100cqh - 44.4cqw);
    filter: drop-shadow(0 0.4cqw 0.5cqw rgb(0 0 0 / 0.55));
    pointer-events: none;
  }
  .floppybox {
    left: 66%;
    width: 10cqw;
    bottom: calc(100cqh - 42.4cqw);
    filter: drop-shadow(0 0.5cqw 0.6cqw rgb(0 0 0 / 0.5));
  }
  /* A padded envelope with the ROM in it: you supply your own. */
  .rom {
    left: 80%;
    width: 9cqw;
    height: 5.5cqw;
    bottom: calc(100cqh - 43cqw);
    background: linear-gradient(160deg, #d9b98a, #b9935e);
    border-radius: 0.3cqw;
    box-shadow: 0 0.4cqw 0.6cqw rgb(0 0 0 / 0.5);
    rotate: -4deg;
  }
  .rom span {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    padding: 0.2cqw 0.6cqw;
    background: #f7f1e1;
    color: #1b2a6b;
    font: 1.1cqw/1.1 "Permanent Marker", cursive;
    rotate: 3deg;
  }
</style>
