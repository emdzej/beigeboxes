<script lang="ts">
  import Overlay from "./Overlay.svelte";
  import { ui } from "../ui.svelte";
  import { machine } from "../emulator/machine.svelte";
  import { acceptFor, importToDrawer, type MediaItem } from "../media/library";

  const tapes = $derived(ui.of("tape").filter((m) => m.id !== machine.tape?.id));
  let fileInput: HTMLInputElement;
  const atari = $derived(machine.model.id === "atari-65xe");
  const accept = $derived(acceptFor(machine.model.formats ?? ["tap"], "tape"));

  async function insert(media: MediaItem) {
    ui.close();
    await machine.insertTape(media);
    ui.say(
      atari
        ? `${media.label} is in. Switched on with it in, it boots by itself; in BASIC, type CLOAD and press PLAY.`
        : `${media.label} is in. Type LOAD"",1 then press PLAY.`,
      5000,
    );
  }

  async function imported(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    for (const f of files) await importToDrawer(f, "tape");
    await ui.refresh();
    if (files.length) ui.say(`${files.length} cassette${files.length > 1 ? "s" : ""} in the shoebox`);
  }
</script>

<Overlay label="Cassettes">
  <div class="shoebox">
    {#each tapes as media, i (media.id)}
      <button class="cassette" style="--c:{media.color};--r:{((i * 29) % 7) - 3}deg" onclick={() => insert(media)} title="Put {media.label} in the Datasette">
        <span class="label"><b>{media.label}</b>{#if media.note}<small>{media.note}</small>{/if}</span>
        <span class="window"><i></i><i></i></span>
      </button>
    {/each}
    {#if !tapes.length}<p class="empty">No cassettes. The one you had is in the {atari ? "recorder" : "Datasette"}.</p>{/if}
  </div>
  <div class="extras"><button onclick={() => fileInput.click()}>+ cassette from a {accept.split(",").join(" / ")} file…</button></div>
  <p class="hint">
    {atari ? "Put a tape in and switch on: it boots by itself. The leader takes ten seconds." : 'On these ROMs a plain LOAD asks the disk drive: tapes need LOAD"",1.'}
  </p>
  <input bind:this={fileInput} type="file" multiple {accept} hidden onchange={imported} />
</Overlay>

<style>
  .shoebox {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 3cqw;
    min-height: 14cqw;
  }
  .cassette {
    position: relative;
    width: 20cqw;
    aspect-ratio: 10 / 6.4;
    padding: 0;
    border: 0;
    border-radius: 0.6cqw;
    background: linear-gradient(#2c2c30, #151517);
    box-shadow: 0 1cqw 1.4cqw rgb(0 0 0 / 0.6), inset 0 0 0 0.2cqw #3a3a40;
    rotate: var(--r);
    cursor: pointer;
    transition: transform 0.2s;
  }
  .cassette:hover {
    transform: translateY(-6%) scale(1.04);
  }
  .label {
    position: absolute;
    inset: 8% 7% 28%;
    display: flex;
    flex-direction: column;
    padding: 0.5cqw 0.8cqw;
    border-top: 1.2cqw solid var(--c);
    background: #f1ecd8;
    color: #1b2a6b;
    text-align: left;
  }
  .label b {
    font: 1.5cqw "Permanent Marker", cursive;
  }
  .label small {
    font: 600 1.2cqw "Caveat", cursive;
  }
  .window {
    position: absolute;
    left: 28%;
    right: 28%;
    bottom: 34%;
    height: 22%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 6%;
    border-radius: 1cqw;
    background: rgb(40 30 20 / 0.85);
  }
  .window i {
    width: 2.2cqw;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle, #eee 0 30%, #5a4632 32%);
  }
  .empty {
    align-self: center;
    color: #a89c80;
    font: 600 2.4cqw "Caveat", cursive;
  }
  .extras {
    display: flex;
    justify-content: center;
    margin-top: 3cqw;
  }
  .extras button {
    padding: 0.8cqw 1.2cqw;
    border: 0;
    background: #fff27a;
    color: #1b2a6b;
    font: 1.5cqw "Permanent Marker", cursive;
    box-shadow: 0 0.4cqw 0.8cqw rgb(0 0 0 / 0.5);
    rotate: -2deg;
    cursor: pointer;
  }
  .hint {
    margin-top: 2cqw;
    text-align: center;
    color: #e8dcc0;
    font: 600 2.2cqw/1 "Caveat", cursive;
  }
</style>
