<script lang="ts">
  import Overlay from "./Overlay.svelte";
  import HardDrive from "../media/HardDrive.svelte";
  import { ui } from "../ui.svelte";
  import { machine } from "../emulator/machine.svelte";
  import {
    canLinkFolder,
    importToDrawer,
    linkFolder,
    newDrive,
    open,
    removeFromDrawer,
    type MediaItem,
  } from "../media/library";

  const installed = $derived(new Set([machine.hda?.id, machine.hdb?.id].filter(Boolean)));
  const drives = $derived(ui.of("hdd").filter((m) => !installed.has(m.id)));
  let selected = $state<MediaItem | null>(null);
  let fileInput: HTMLInputElement;
  let busy = $state<string | null>(null);

  function tilt(id: string): number {
    let h = 0;
    for (const c of id) h = (h * 17 + c.charCodeAt(0)) % 997;
    return (h % 13) - 6;
  }

  async function unwrap() {
    const size = prompt("A brand-new drive, still in its antistatic bag.\nHow many megabytes? (20, 40, 120, 540, 2000)", "120");
    const mb = Number(size);
    if (!mb || mb < 1 || mb > 8000) return;
    const name = prompt("Write on its label:", `${mb}MB DRIVE`) ?? `${mb}MB`;
    busy = "Unwrapping…";
    try {
      const media = await newDrive(name, mb);
      if (!media) return ui.say("This browser has no private storage for drives.");
      await ui.refresh();
      ui.say("Blank and unpartitioned — boot a DOS floppy and run FDISK.", 6000);
    } finally {
      busy = null;
    }
  }

  async function imported(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    busy = "Copying into the drawer…";
    try {
      for (const f of files) await importToDrawer(f, "hdd");
      await ui.refresh();
    } finally {
      busy = null;
    }
  }

  async function link() {
    try {
      await linkFolder();
      await ui.refresh();
      ui.say("Linked. Disk images in that folder are in the drawer now.");
    } catch {
      /* cancelled */
    }
  }

  async function bin(media: MediaItem) {
    if (!confirm(`Throw away "${media.label}"? Everything on it is lost.`)) return;
    await removeFromDrawer(media);
    selected = null;
    await ui.refresh();
  }

  async function download(media: MediaItem) {
    const file = await open(media);
    const url = URL.createObjectURL(new Blob([await file.arrayBuffer()]));
    const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
</script>

<Overlay label="Hard disk drawer">
  <div class="layout">

    <div class="drawer">
      <img src="art/drawer.webp" alt="An open wooden drawer" draggable="false" />
      <div class="felt">
        {#each drives as media (media.id)}
          <button
            class="drive"
            class:sel={selected?.id === media.id}
            style="rotate:{tilt(media.id)}deg"
            onclick={() => (selected = selected?.id === media.id ? null : media)}
          >
            <HardDrive {media} />
          </button>
        {:else}
          <p class="nothing">Just paper clips.<br />Unwrap a new drive, or bring your own image.</p>
        {/each}
      </div>
    </div>
  </div>

  <footer>
    {#if selected}
      <span class="sel-name">{selected.label}:</span>
      <span class="hint">to fit it, open the case with the screwdriver</span>
      <button onclick={() => download(selected!)}>save a copy…</button>
      {#if selected.home === "drawer"}<button class="danger" onclick={() => bin(selected!)}>throw away</button>{/if}
    {:else}
      <button onclick={unwrap}>unwrap a new drive</button>
      <button onclick={() => fileInput.click()}>bring an image…</button>
      {#if canLinkFolder()}<button onclick={link}>link a folder…</button>{/if}
    {/if}
    {#if busy}<span class="busy">{busy}</span>{/if}
  </footer>
  <input bind:this={fileInput} type="file" multiple accept=".img,.hdd,.raw,.bin,.ima,.zip" hidden onchange={imported} />
</Overlay>

<style>
  .layout {
    display: grid;
  }
  .drawer {
    position: relative;
    aspect-ratio: 1800 / 1005;
  }
  .drawer > img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 0.6cqw;
    box-shadow: 0 2cqw 4cqw rgb(0 0 0 / 0.7);
  }
  .felt {
    position: absolute;
    left: 17%;
    right: 17%;
    top: 13%;
    bottom: 13%;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 1.5cqw;
    padding: 1cqw;
    overflow: auto;
  }
  .drive {
    width: 10cqw;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    filter: drop-shadow(0.3cqw 0.6cqw 0.6cqw rgb(0 0 0 / 0.6));
    transition: transform 0.2s, filter 0.2s;
  }
  .drive:hover {
    transform: translateY(-4%) scale(1.04);
  }
  .drive.sel {
    transform: translateY(-8%) scale(1.08);
    filter: drop-shadow(0 0 1cqw rgb(255 220 120 / 0.9));
  }
  .nothing {
    margin: auto;
    text-align: center;
    color: #e8dcc0;
    font: 600 2.4cqw/1.2 "Caveat", cursive;
    text-shadow: 0 1px 3px #000;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 1cqw;
    align-items: center;
    justify-content: center;
    margin-top: 2cqw;
    color: #e8dcc0;
    font: 600 2cqw "Caveat", cursive;
  }
  footer button {
    padding: 0.5cqw 1.4cqw;
    border: 0;
    border-radius: 0.3cqw;
    background: #f3ecd2;
    color: #1b2a6b;
    font: 1.7cqw "Permanent Marker", cursive;
    box-shadow: 0 0.3cqw 0 #b9ad88;
    cursor: pointer;
    rotate: -1deg;
  }
  footer button:nth-child(even) {
    rotate: 1.2deg;
  }
  .hint {
    font-style: italic;
  }
  footer .danger {
    color: #9b1d20;
  }
  .busy {
    font-style: italic;
  }
</style>
