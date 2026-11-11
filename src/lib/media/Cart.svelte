<script lang="ts">
  import type { MediaItem } from "./library";

  /** A grey NES Game Pak: the title on a printed label in the game's colour. */
  let { media }: { media: MediaItem } = $props();
</script>

<div class="cart" class:c64={media.format === "crt"} style="--c:{media.color}">
  {#if media.format !== "crt"}<img src="art/nes/cart.webp" alt="" draggable="false" />{/if}
  <div class="label">
    <span class="band"></span>
    <span class="title">{media.label}</span>
    {#if media.note}<span class="note">{media.note}</span>{/if}
    {#if media.home !== "shelf"}<span class="note">mine</span>{/if}
  </div>
</div>

<style>
  .cart {
    position: relative;
    width: 100%;
    aspect-ratio: 500 / 426;
    container-type: inline-size;
  }
  /* A C64 cartridge: a small brown box, the label across its face. */
  .cart.c64 {
    aspect-ratio: 500 / 340;
    border-radius: 3cqw 3cqw 1cqw 1cqw;
    background: linear-gradient(#5d4b3b, #3a2e23);
    box-shadow: inset 0 -3cqw 0 rgb(0 0 0 / 0.25), inset 0 0 0 0.6cqw rgb(255 255 255 / 0.06);
  }
  .cart.c64 .label {
    top: 12%;
    bottom: 22%;
    left: 10%;
    right: 10%;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
  }
  .label {
    position: absolute;
    left: 16.6%;
    right: 16.6%;
    top: 32%;
    bottom: 16.2%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 2cqw;
    padding: 4cqw;
    overflow: hidden;
    /* Box art: a slab of the game's colour, the title knocked out of black. */
    background: linear-gradient(to bottom, var(--c) 0 58%, #111 58%);
    color: #fff;
    text-align: left;
  }
  .band {
    position: absolute;
    inset: 6cqw 4cqw auto;
    height: 1.6cqw;
    background: repeating-linear-gradient(90deg, rgb(255 255 255 / 0.5) 0 4cqw, transparent 4cqw 6cqw);
  }
  .title {
    overflow-wrap: anywhere;
    font: 800 6cqw/1 "Arial Black", "Helvetica Neue", sans-serif;
    text-transform: uppercase;
    letter-spacing: -0.02em;
  }
  .note {
    font: 600 3.6cqw/1.1 "Helvetica Neue", Arial, sans-serif;
    opacity: 0.75;
  }
</style>
