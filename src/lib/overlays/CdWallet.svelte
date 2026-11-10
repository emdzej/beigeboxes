<script lang="ts">
  import Overlay from "./Overlay.svelte";
  import Disc from "../media/Disc.svelte";
  import { ui } from "../ui.svelte";
  import { machine } from "../emulator/machine.svelte";
  import { importToDrawer, type MediaItem } from "../media/library";

  const discs = $derived(ui.of("cdrom").filter((m) => m.id !== machine.cdrom?.id));
  const PER_SPREAD = 8;
  let spread = $state(0);
  const pages = $derived(Math.max(1, Math.ceil((discs.length + 1) / PER_SPREAD)));
  const visible = $derived(discs.slice(spread * PER_SPREAD, (spread + 1) * PER_SPREAD));
  let fileInput: HTMLInputElement;

  async function insert(media: MediaItem) {
    ui.close();
    if (!ui.trayOpen) {
      ui.trayOpen = true;
      await new Promise((r) => setTimeout(r, 900));
    }
    await machine.insertCd(media);
    ui.trayOpen = false;
    ui.say(`CD: ${media.label}`);
  }

  async function imported(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    for (const f of files) await importToDrawer(f, "cdrom");
    await ui.refresh();
    if (files.length) ui.say(`Slid ${files.length} disc${files.length > 1 ? "s" : ""} into the wallet`);
  }
</script>

<Overlay label="CD wallet">
  <div class="wallet">
    {#each [0, 1] as side}
      <div class="page" class:left={side === 0}>
        {#each Array(PER_SPREAD / 2) as _, slot}
          {@const media = visible[side * (PER_SPREAD / 2) + slot]}
          <div class="sleeve">
            {#if media}
              <button class="cd" onclick={() => insert(media)} title="Put {media.label} in the drive">
                <Disc {media} />
              </button>
            {:else if side * (PER_SPREAD / 2) + slot === visible.length && spread === pages - 1}
              <button class="add" onclick={() => fileInput.click()}>+ burn a CD<br /><small>(from an .iso)</small></button>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
    <div class="spine"></div>
  </div>
  {#if pages > 1}
    <nav>
      <button disabled={spread === 0} onclick={() => (spread -= 1)}>◀ flip</button>
      <span>{spread + 1} / {pages}</span>
      <button disabled={spread === pages - 1} onclick={() => (spread += 1)}>flip ▶</button>
    </nav>
  {/if}
  <input bind:this={fileInput} type="file" multiple accept=".iso,.zip" hidden onchange={imported} />
</Overlay>

<style>
  .wallet {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 3cqw;
    /* Two rows of square sleeves: keep the whole spread inside the window. */
    width: min(86cqw, 150vh);
    box-sizing: border-box;
    margin: 0 auto;
    padding: 3cqw;
    border-radius: 3cqw;
    /* Black ballistic nylon. */
    background:
      repeating-linear-gradient(45deg, rgb(255 255 255 / 0.025) 0 2px, transparent 2px 4px),
      repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.025) 0 2px, transparent 2px 4px),
      #151517;
    box-shadow: 0 3cqw 5cqw rgb(0 0 0 / 0.7), inset 0 0 0 0.6cqw #0b0b0c, inset 0 0 0 0.9cqw #2a2a2e;
  }
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2cqw;
  }
  .spine {
    position: absolute;
    left: 50%;
    top: 2cqw;
    bottom: 2cqw;
    width: 1.4cqw;
    translate: -50% 0;
    background: repeating-linear-gradient(to bottom, #333 0 0.5cqw, #111 0.5cqw 1cqw);
    border-radius: 1cqw;
  }
  .sleeve {
    position: relative;
    aspect-ratio: 1;
    border-radius: 1cqw;
    /* Clear PVC sleeve over white felt. */
    background:
      linear-gradient(160deg, rgb(255 255 255 / 0.18), transparent 35%),
      #e9e6df;
    box-shadow: inset 0 0 0 0.25cqw rgb(255 255 255 / 0.4), 0 0.3cqw 0.6cqw rgb(0 0 0 / 0.5);
    display: grid;
    place-items: center;
  }
  .cd {
    width: 92%;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.3);
  }
  .cd:hover {
    transform: translateY(-12%) rotate(8deg) scale(1.05);
  }
  .add {
    width: 80%;
    aspect-ratio: 1;
    border-radius: 50%;
    border: 0.3cqw dashed #9a9488;
    background: none;
    color: #7a2020;
    font: 1.8cqw/1.1 "Permanent Marker", cursive;
    cursor: pointer;
  }
  .add small {
    font: 600 1.4cqw "Caveat", cursive;
    color: #555;
  }
  nav {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2cqw;
    margin-top: 2cqw;
    color: #e8dcc0;
    font: 600 2cqw "Caveat", cursive;
  }
  nav button {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    cursor: pointer;
  }
  nav button:disabled {
    opacity: 0.3;
  }
</style>
