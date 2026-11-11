<script lang="ts">
  import { XT_CASE as geo } from "./geometry";
  import { place, dot } from "./rect";
  import { machine } from "../emulator/machine.svelte";
  import { ui } from "../ui.svelte";

  const aspect = geo.size[0] / geo.size[1];
  const on = $derived(machine.power !== "off");
  const DRIVES = ["fda", "fdb"] as const;

  /**
   * A full-height 5¼" drive: the disk goes in the slot, then the lever turns
   * down across it to clamp it. Turning the lever back up lets it out.
   */
  function drive(i: number) {
    const d = DRIVES[i]!;
    if (machine[d]) {
      void machine.ejectFloppy(d);
    } else {
      ui.floppyTarget = d;
      ui.open("floppies");
    }
  }
</script>

<div class="case">
  <img src={geo.image} alt="An IBM Personal Computer XT" draggable="false" />

  <button
    class="switch"
    class:on
    style={place(geo.power)}
    title={on ? "Big red switch: off" : "Big red switch: on"}
    onclick={() => void machine.togglePower()}
  ><i></i></button>

  {#each geo.drives as g, i}
    {@const d = DRIVES[i]!}
    {@const media = machine[d]}
    <button
      class="slot"
      style={place(g.slot)}
      title={media ? `${i ? "B" : "A"}: ${media.label} — open the door` : `Drive ${i ? "B" : "A"}: put a disk in`}
      onclick={() => drive(i)}
    >
      {#if media}<span class="sleeve" style="--c:{media.color}"></span>{/if}
    </button>
    <button
      class="lever"
      class:closed={media}
      style={place(g.lever)}
      title={media ? "Turn the lever up to take the disk out" : `Drive ${i ? "B" : "A"}`}
      onclick={() => drive(i)}
    ><i></i></button>
    <i class="led" class:lit={on && (i === 0 ? machine.led.fdd : machine.led.fdb)} style={dot(g.led, geo.ledSize, aspect)}></i>
  {/each}
</div>

<style>
  .case {
    position: relative;
    width: 100%;
  }
  img {
    display: block;
    width: 100%;
    /* The photo sets the box's height, so everything placed over it in
       fractions lands where it is drawn, in every browser. */
    height: auto;
    user-select: none;
  }
  button {
    position: absolute;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .switch:hover,
  .slot:hover,
  .lever:hover {
    box-shadow: 0 0 0 0.15cqw rgb(255 220 140 / 0.6);
    border-radius: 0.2cqw;
  }
  /* The big red switch: a paddle standing out of the right-hand side. */
  .switch i {
    position: absolute;
    left: 55%;
    top: 22%;
    width: 1.1cqw;
    height: 56%;
    border-radius: 0.25cqw;
    background: linear-gradient(90deg, #8e1212, #d42a24 45%, #a51818);
    box-shadow: 0.15cqw 0.2cqw 0.3cqw rgb(0 0 0 / 0.45);
    /* Off: pushed down, the top tipped away. */
    transform: translateY(40%) perspective(10cqw) rotateX(-30deg);
    transition: transform 0.12s;
  }
  /* Flipped up. */
  .switch.on i {
    transform: translateY(-40%) perspective(10cqw) rotateX(30deg);
  }
  /* A disk in the slot: the top of its label just shows. */
  .sleeve {
    position: absolute;
    inset: 25% 8%;
    background: linear-gradient(#111, #222);
    box-shadow: inset 0 0.1cqw 0 color-mix(in srgb, var(--c) 70%, white);
  }
  /* The lever, turned down across the slot to clamp the disk. */
  .lever i {
    position: absolute;
    inset: 0;
    border-radius: 0.2cqw;
    transition: transform 0.2s;
  }
  .lever.closed i {
    background: linear-gradient(90deg, #1b1b1b, #2c2c2c 50%, #161616);
    box-shadow: 0 0.15cqw 0.3cqw rgb(0 0 0 / 0.6);
    transform: rotate(90deg) scaleY(0.75);
  }
  .led {
    position: absolute;
    border-radius: 50%;
    background: #3a0a0a;
  }
  .led.lit {
    background: radial-gradient(circle at 40% 40%, #ffb0a0, #ff2a10 60%);
    box-shadow: 0 0 0.6cqw 0.2cqw rgb(255 40 20 / 0.7);
  }
</style>
