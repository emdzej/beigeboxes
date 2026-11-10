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
  const locked = $derived(machine.power !== "off");
  let selected = $state<MediaItem | null>(null);
  let fileInput: HTMLInputElement;
  let busy = $state<string | null>(null);

  function tilt(id: string): number {
    let h = 0;
    for (const c of id) h = (h * 17 + c.charCodeAt(0)) % 997;
    return (h % 13) - 6;
  }

  function install(slot: "hda" | "hdb") {
    if (!selected) return;
    if (machine.installHdd(slot, selected)) {
      ui.say(`${selected.label} is now ${slot === "hda" ? "C: (primary master)" : "D: (primary slave)"}`);
      selected = null;
    }
  }

  function uninstall(slot: "hda" | "hdb") {
    machine.installHdd(slot, null);
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
    <aside class="ide" class:locked>
      <h2>Inside the case</h2>
      <p class="cable">40-pin IDE · primary channel</p>
      {#each [["hda", "MASTER · C:"], ["hdb", "SLAVE · D:"]] as [slot, name]}
        {@const media = slot === "hda" ? machine.hda : machine.hdb}
        <div class="bay">
          <span class="jumper">{name}</span>
          {#if media}
            <div class="mounted">
              <HardDrive {media} />
              {#if !locked}<button class="pull" onclick={() => uninstall(slot as "hda" | "hdb")}>pull out</button>{/if}
            </div>
          {:else if selected && !locked}
            <button class="empty target" onclick={() => install(slot as "hda" | "hdb")}>install here</button>
          {:else}
            <div class="empty">empty bay</div>
          {/if}
        </div>
      {/each}
      {#if locked}<p class="warn">⚡ It's running. Power off before touching the drives.</p>{/if}
    </aside>

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
      <button disabled={locked} onclick={() => install("hda")}>install as C:</button>
      <button disabled={locked} onclick={() => install("hdb")}>install as D:</button>
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
    grid-template-columns: 22cqw 1fr;
    gap: 2cqw;
    align-items: start;
  }
  .ide {
    padding: 1.5cqw;
    border-radius: 1cqw;
    background:
      repeating-linear-gradient(90deg, rgb(255 255 255 / 0.03) 0 1px, transparent 1px 6px),
      linear-gradient(#2c3a2c, #1c261c);
    box-shadow: inset 0 0 0 0.3cqw #475647, 0 2cqw 3cqw rgb(0 0 0 / 0.6);
    color: #d7e8c8;
    font: 1.4cqw/1.2 "VT323", monospace;
  }
  .ide h2 {
    margin: 0 0 0.3cqw;
    font: 2.2cqw "Permanent Marker", cursive;
    color: #f0e6c8;
  }
  .cable {
    margin: 0 0 1cqw;
    padding: 0.3cqw;
    background: repeating-linear-gradient(90deg, #ccc 0 2px, #999 2px 4px);
    color: #222;
    text-align: center;
    border-left: 0.6cqw solid #c33;
  }
  .bay {
    margin-bottom: 1cqw;
  }
  .jumper {
    display: block;
    margin-bottom: 0.4cqw;
    color: #ffd27a;
  }
  .mounted {
    position: relative;
    width: 60%;
    margin: 0 auto;
  }
  .pull {
    position: absolute;
    bottom: 4%;
    left: 50%;
    translate: -50% 0;
    font: 1.3cqw "Caveat", cursive;
    font-weight: 700;
  }
  .empty {
    display: grid;
    place-items: center;
    height: 9cqw;
    border: 0.25cqw dashed #6f866f;
    border-radius: 0.6cqw;
    color: #8da58d;
    width: 100%;
    background: none;
    font: inherit;
  }
  .target {
    border-color: #ffd27a;
    color: #ffd27a;
    cursor: pointer;
    animation: pulse 1s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    to { background: rgb(255 210 122 / 0.12); }
  }
  .warn {
    color: #ff9a7a;
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
  footer button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  footer .danger {
    color: #9b1d20;
  }
  .busy {
    font-style: italic;
  }
</style>
