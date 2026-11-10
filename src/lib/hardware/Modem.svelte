<script lang="ts">
  import { MODEM } from "./geometry";
  import { machine } from "../emulator/machine.svelte";
  import { ui } from "../ui.svelte";

  const ready = $derived(machine.settings.modem.enabled && machine.power !== "off");
  const lit = $derived([
    false, // AA: we never auto-answer
    machine.modemLed.cd,
    machine.modemLed.oh,
    machine.modemLed.rd,
    machine.modemLed.sd,
    ready && machine.modemLed.tr,
    ready,
    ready,
  ]);
  const aspect = MODEM.size[0] / MODEM.size[1];
</script>

<button
  class="modem"
  class:unplugged={!machine.settings.modem.enabled}
  style="aspect-ratio:{MODEM.size[0]}/{MODEM.size[1]}"
  title={machine.settings.modem.enabled ? "56K modem on COM2 — phonebook" : "Modem (unplugged) — set it up"}
  onclick={() => ui.open("setup")}
>
  <img src={MODEM.image} alt="An external 56K modem" draggable="false" />
  {#each MODEM.leds as x, i}
    <i class:lit={lit[i]} style="left:{(x - 0.009) * 100}%;top:{(MODEM.ledY - 0.009 * aspect) * 100}%;width:1.8%;height:{1.8 * aspect}%"></i>
  {/each}
</button>

<style>
  .modem {
    position: relative;
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    filter: drop-shadow(0 0.5cqw 0.6cqw rgb(0 0 0 / 0.55));
  }
  .modem:hover {
    filter: drop-shadow(0 0.5cqw 0.6cqw rgb(0 0 0 / 0.55)) brightness(1.08);
  }
  img {
    display: block;
    width: 100%;
  }
  i {
    position: absolute;
    border-radius: 2px;
    background: rgb(40 0 0 / 0.65);
  }
  i.lit {
    background: radial-gradient(circle, #ffd0c0 0 20%, #ff3020 55%, #a00 90%);
    box-shadow: 0 0 0.4cqw rgb(255 50 30 / 0.8);
  }
</style>
