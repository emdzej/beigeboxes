<script lang="ts">
  import Case from "../hardware/Case.svelte";
  import Monitor from "../hardware/Monitor.svelte";
  import Modem from "../hardware/Modem.svelte";
  import { TOWER, DESKTOP, CRT, LCD } from "../hardware/geometry";
  import { machine } from "../emulator/machine.svelte";
  import { ui } from "../ui.svelte";
  import type { DeskProps } from "./desk";

  /** The 1996 Pentium: tower or desktop, CRT or LCD, mouse, modem, CDs. */
  let { screen, glassEl = $bindable() }: DeskProps = $props();

  const tower = $derived(machine.settings.caseStyle === "tower");
  const crt = $derived(machine.settings.display === "crt");
</script>

    <!-- floppy box, left of the monitor -->
    <button class="item floppybox" onclick={() => { ui.floppyTarget = "fda"; ui.open("floppies"); }} title="Floppy disks">
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

    <!-- a screwdriver, for opening the case -->
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
    /* A 430 mm desktop case, at the ~15 mm/cqw every desk uses. */
    left: 28.5%;
    width: 29cqw;
    bottom: calc(100cqh - 41.9cqw);
  }
  .desktop-mode {
    /* On the case: its lid is the case's top edge, 11cqw up, less the
       lip the monitor's foot sinks behind. */
    left: 31%;
    width: 24cqw;
    bottom: calc(100cqh - 41.9cqw + 9.7cqw);
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
    left: 12%;
    width: 10.5cqw;
    bottom: calc(100cqh - 42.4cqw);
    filter: drop-shadow(0 0.5cqw 0.6cqw rgb(0 0 0 / 0.5));
  }
  .cdwallet {
    left: 88%;
    width: 9.5cqw;
    bottom: calc(100cqh - 43.3cqw);
    filter: drop-shadow(0 0.4cqw 0.6cqw rgb(0 0 0 / 0.5));
  }
  .screwdriver {
    left: 75.5%;
    width: 13cqw;
    bottom: calc(100cqh - 43.8cqw);
    filter: drop-shadow(0 0.3cqw 0.4cqw rgb(0 0 0 / 0.55));
  }
  .modem {
    left: 72.5%;
    width: 13cqw;
    bottom: calc(100cqh - 41.7cqw);
  }
</style>
