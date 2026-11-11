<script lang="ts">
  import Overlay from "./Overlay.svelte";
  import Floppy from "../media/Floppy.svelte";
  import { ui } from "../ui.svelte";
  import { machine } from "../emulator/machine.svelte";
  import { importToDrawer, newFloppy, XT_FLOPPY_MAX, type MediaItem } from "../media/library";

  /** The XT and the 1541 take 5¼" disks; the XT's are double density, so only those it can read are in its box. */
  const five = $derived(machine.model.id === "pc-xt" || machine.model.id === "c64");
  const xt = $derived(machine.model.id === "pc-xt");
  const amiga = $derived(machine.model.id === "amiga-500");
  /** A blank to format: the PCs format raw images, AmigaDOS an empty ADF. A 1541 blank needs a real 1541 ROM. */
  const blanks = $derived(machine.model.id !== "c64");
  const disks = $derived(
    ui.of("floppy").filter((m) => m.id !== machine.fda?.id && m.id !== machine.fdb?.id && (!xt || m.size <= XT_FLOPPY_MAX)),
  );
  const accept = $derived((machine.model.formats ?? ["img", "ima", "vfd", "flp", "dsk"]).map((f) => `.${f}`).join(",") + ",.zip");
  const drive = $derived(ui.floppyTarget);
  const letter = $derived(drive === "fdb" ? "B" : "A");
  let picked = $state<string | null>(null);
  let fileInput: HTMLInputElement;

  async function insert(media: MediaItem) {
    picked = media.id;
    // Let the disk fly out of the box before the box goes away.
    await new Promise((r) => setTimeout(r, 420));
    ui.close();
    await machine.insertFloppy(media, drive);
    ui.floppyTarget = "fda";
    ui.say(`${letter}: ${media.label}`);
  }

  async function blank() {
    const name = prompt("Write a label for the new diskette:", "MY DISK");
    if (!name) return;
    const media = await newFloppy(name, amiga ? 901_120 : xt ? 368_640 : 1_474_560, amiga ? "adf" : "img");
    if (!media) return ui.say("No room: this browser has no private storage.");
    await ui.refresh();
    ui.say(amiga ? `New 880KB disk "${name}" — format it from the Workbench` : `New ${xt ? "360KB" : "1.44MB"} diskette "${name}" — format it with FORMAT ${letter}:`);
  }

  async function imported(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    for (const f of files) await importToDrawer(f, "floppy");
    await ui.refresh();
    if (files.length) ui.say(`Filed ${files.length} disk${files.length > 1 ? "s" : ""} in the box`);
  }
</script>

<Overlay label="Floppy disk box">
  <div class="box">
    <img src="art/floppybox-open.webp" alt="An open floppy disk box" draggable="false" />
    <!-- Front to back, as they stand in the box: the nearest is whole, the
         ones behind show only their top edge and label. -->
    <div class="tub" style="--n:{disks.length}">
      {#each [...disks].reverse() as media, j (media.id)}
        {@const depth = disks.length - 1 - j}
        <button
          class="disk"
          class:picked={picked === media.id}
          style="--d:{depth}"
          onclick={() => insert(media)}
          title="Insert {media.label}"
        >
          <Floppy {media} stored {five} />
        </button>
      {/each}
      {#if !disks.length}<p class="empty">Empty. Every disk is in a drive.</p>{/if}
    </div>
    <div class="extras">
      {#if blanks}<button onclick={blank}>+ blank disk</button>{/if}
      <button onclick={() => fileInput.click()}>+ disk from a file…</button>
    </div>
    <p class="hint">Pick a disk to put it in {amiga ? "DF0:" : machine.model.id === "c64" ? "drive 8" : `drive ${letter}:`}. Your own disks keep what you write to them.</p>
  </div>
  <input bind:this={fileInput} type="file" multiple {accept} hidden onchange={imported} />
</Overlay>

<style>
  .box {
    position: relative;
    width: min(70cqw, 92vh);
    margin: 0 auto;
    aspect-ratio: 1200 / 1047;
  }
  .box > img {
    position: absolute;
    inset: 0;
    width: 100%;
    filter: drop-shadow(0 3cqw 3cqw rgb(0 0 0 / 0.6));
  }
  .tub {
    --step: min(14%, calc(52% / max(var(--n), 1)));
    position: absolute;
    left: 10%;
    right: 10%;
    top: 22%;
    bottom: 13%;
  }
  .disk {
    position: absolute;
    left: 50%;
    bottom: calc(var(--d) * var(--step));
    width: 46%;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    translate: -50% 0;
    transform-origin: bottom center;
    transform: scale(calc(1 - var(--d) * 0.025));
    transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2), filter 0.2s, opacity 0.3s;
    filter: drop-shadow(0 -0.4cqw 0.5cqw rgb(0 0 0 / 0.55)) brightness(calc(1 - var(--d) * 0.06));
  }
  .disk:hover,
  .disk:focus-visible {
    z-index: 100;
    transform: translateY(-38%) scale(1.04) rotate(-2deg);
    filter: drop-shadow(0 1.5cqw 1.5cqw rgb(0 0 0 / 0.6)) brightness(1.05);
    outline: none;
  }
  .disk.picked {
    z-index: 100;
    transform: translateY(-150%) rotate(8deg) scale(0.7);
    opacity: 0;
    transition: transform 0.4s ease-in, opacity 0.3s 0.15s;
  }
  .empty {
    position: absolute;
    inset: 40% 0 auto;
    text-align: center;
    color: #a89c80;
    font: 600 2.4cqw "Caveat", cursive;
  }
  .extras {
    position: absolute;
    right: -15%;
    top: 40%;
    display: flex;
    flex-direction: column;
    gap: 1.2cqw;
  }
  .extras button {
    padding: 0.8cqw 1.2cqw;
    border: 0;
    background: #fff27a;
    color: #1b2a6b;
    font: 1.5cqw "Permanent Marker", cursive;
    box-shadow: 0 0.4cqw 0.8cqw rgb(0 0 0 / 0.5);
    rotate: 3deg;
    cursor: pointer;
  }
  .extras button + button {
    rotate: -2deg;
    background: #bdf0ff;
  }
  .hint {
    position: absolute;
    bottom: -5%;
    width: 100%;
    text-align: center;
    color: #e8dcc0;
    font: 600 2.2cqw/1 "Caveat", cursive;
  }
</style>
