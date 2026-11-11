<script lang="ts">
  import Overlay from "./Overlay.svelte";
  import { ui } from "../ui.svelte";
  import { machine } from "../emulator/machine.svelte";
  import { clearRom, getRom, identifyMacRom, putRom } from "../emulator/roms";

  /**
   * The envelope the Mac's ROM comes in. Apple's ROM can't ship with the
   * site, so it's yours: read here, kept in this browser, never sent anywhere.
   */
  const ID = "mac-plus";
  let fileInput: HTMLInputElement;
  let have = $state<string | null>(null);
  let problem = $state<string | null>(null);

  async function check() {
    const bytes = await getRom(ID);
    have = bytes ? identifyMacRom(bytes).name : null;
  }
  void check();

  async function chosen(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const id = identifyMacRom(bytes);
    if (!id.ok) {
      problem = id.name;
      return;
    }
    problem = null;
    await putRom(ID, bytes);
    have = id.name;
    ui.say(`${id.name} is in. Flip the switch round the back.`, 5000);
  }

  async function forget() {
    if (machine.power !== "off") await machine.powerOff();
    await clearRom(ID);
    have = null;
  }
</script>

<Overlay label="The ROM">
  <div class="envelope">
    {#if have}
      <p class="what"><b>{have}</b> is in the envelope.</p>
      <div class="extras">
        <button onclick={() => fileInput.click()}>use a different ROM…</button>
        <button onclick={forget}>take it out</button>
      </div>
    {:else}
      <p class="what">The envelope is empty. A Mac won't start without its ROM, and Apple's can't come with this site.</p>
      <div class="extras"><button onclick={() => fileInput.click()}>+ your Mac Plus ROM file…</button></div>
    {/if}
    {#if problem}<p class="problem">{problem}</p>{/if}
    <p class="hint">It's read here and kept in this browser. Nothing is uploaded.</p>
  </div>
  <input bind:this={fileInput} type="file" hidden onchange={chosen} />
</Overlay>

<style>
  .envelope {
    width: 44cqw;
    margin: 0 auto;
    padding: 3cqw 3.5cqw;
    background: linear-gradient(160deg, #e2c697, #bf9a63);
    border-radius: 0.6cqw;
    box-shadow: 0 1.2cqw 2cqw rgb(0 0 0 / 0.6);
    color: #2a1d0c;
    font: 1.6cqw/1.35 "Caveat", cursive;
    text-align: center;
    rotate: -1deg;
  }
  .what b {
    font-family: "Permanent Marker", cursive;
    font-weight: normal;
  }
  .problem {
    color: #8a1010;
  }
  .hint {
    font-size: 1.2cqw;
    opacity: 0.8;
  }
  .extras {
    display: flex;
    justify-content: center;
    gap: 1.5cqw;
    margin: 1.5cqw 0;
  }
  .extras button {
    padding: 0.5cqw 1.2cqw;
    border: 0;
    background: #fff27a;
    color: #1b2a6b;
    font: 1.2cqw "Permanent Marker", cursive;
    box-shadow: 0 0.3cqw 0.5cqw rgb(0 0 0 / 0.4);
    cursor: pointer;
    rotate: 1.5deg;
  }
</style>
