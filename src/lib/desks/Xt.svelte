<script lang="ts">
  import Monitor from "../hardware/Monitor.svelte";
  import XtCase from "../hardware/XtCase.svelte";
  import { M5151, M5153 } from "../hardware/geometry";
  import { machine } from "../emulator/machine.svelte";
  import { cardsWith, part } from "../machines/parts";
  import { ui } from "../ui.svelte";
  import type { DeskProps } from "./desk";

  /** The 1983 PC/XT: system unit, its monitor on top, a Model F, a box of 5¼" disks. */
  let { screen, glassEl = $bindable() }: DeskProps = $props();

  /**
   * The monitor follows the card: MDA and Hercules drive the green 5151, CGA
   * the 5153 colour display. With no video card the 5153 sits there, dark.
   */
  const video = $derived(cardsWith(machine.build, "video").map((c) => part(c.part)?.video)[0]);
  const mono = $derived(video === "mda" || video === "hercules");

  function disks() {
    ui.floppyTarget = machine.fda && !machine.fdb ? "fdb" : "fda";
    ui.open("floppies");
  }
</script>

<button class="item diskbox" onclick={disks} title="5¼-inch floppy disks">
  <img src="art/xt/diskbox525.webp" alt="A box of 5¼-inch floppy disks" draggable="false" />
</button>

<div class="item unit"><XtCase /></div>

<div class="item monitor" class:mono>
  {#if mono}
    <Monitor geo={M5151} kind="crt" phosphor="green" {screen} bind:glassEl />
  {:else}
    <Monitor geo={M5153} kind="crt" {screen} bind:glassEl />
  {/if}
</div>

<img class="item keyboard" src="art/xt/modelf.webp" alt="" draggable="false" />

<button class="item screwdriver" onclick={() => ui.open("inside")} title="Open the case">
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
  /* Same desk lines as the 1996 desk: wall at 41cqw, front lip at 43.2cqw.
     Real widths at ~15 mm/cqw: 5160 500 mm, 5151/5153 380, keyboard 470,
     a 5¼" disk box 170. */
  .unit {
    left: 30.3%;
    width: 33.3cqw;
    bottom: calc(100cqh - 42.1cqw);
    filter: drop-shadow(0 0.6cqw 0.8cqw rgb(0 0 0 / 0.5));
  }
  .monitor {
    /* On the system unit, as IBM intended: its top is 11.4cqw up, less the
       lip the monitor's feet sit back from. */
    left: 34.5%;
    width: 25.4cqw;
    bottom: calc(100cqh - 42.1cqw + 10.3cqw);
  }
  .monitor.mono {
    width: 25cqw;
  }
  .keyboard {
    left: 32%;
    width: 30cqw;
    bottom: calc(100cqh - 43.8cqw);
    filter: drop-shadow(0 0.4cqw 0.5cqw rgb(0 0 0 / 0.55));
    pointer-events: none;
  }
  .diskbox {
    left: 13%;
    width: 11.3cqw;
    bottom: calc(100cqh - 42.6cqw);
    filter: drop-shadow(0 0.5cqw 0.6cqw rgb(0 0 0 / 0.5));
  }
  .screwdriver {
    left: 74%;
    width: 13cqw;
    bottom: calc(100cqh - 43.8cqw);
    filter: drop-shadow(0 0.3cqw 0.4cqw rgb(0 0 0 / 0.55));
  }
</style>
