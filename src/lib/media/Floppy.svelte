<script lang="ts">
  import type { MediaItem } from "./library";
  import { plasticFilter, humanSize } from "./plastic";

  /** `stored`: shutter down, label edge up — how they stood in a disk box. */
  /** `five`: a 5¼" disk in its paper sleeve; the label is written on the sleeve. */
  let { media, stored = false, five = false }: { media: MediaItem; stored?: boolean; five?: boolean } = $props();
</script>

<div class="floppy" class:stored class:five style="--c:{media.color}">
  {#if five}
    <img src="art/xt/floppy525.webp" alt="" draggable="false" />
  {:else}
    <img src="art/floppy.webp" alt="" draggable="false" style="filter:{plasticFilter(media.color)}" />
  {/if}
  <div class="label">
    <span class="title">{media.label}</span>
    {#if media.note}<span class="note">{media.note}</span>{/if}
    <span class="meta">{humanSize(media.size)}{media.home === "drawer" ? " · mine" : media.home === "folder" ? " · linked" : ""}</span>
  </div>
</div>

<style>
  .floppy {
    position: relative;
    width: 100%;
    aspect-ratio: 500 / 531;
    container-type: inline-size;
  }
  img {
    width: 100%;
    height: 100%;
    display: block;
    user-select: none;
  }
  .label {
    position: absolute;
    left: 12%;
    right: 13%;
    top: 43%;
    bottom: 7%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3cqw;
    padding: 4cqw 5cqw;
    /* Ruled label paper. */
    background: repeating-linear-gradient(to bottom, transparent 0 13cqw, rgb(80 120 200 / 0.25) 13cqw 13.6cqw);
    color: #1b2a6b;
    overflow: hidden;
    transform: rotate(-1deg);
  }
  .stored img {
    rotate: 180deg;
  }
  .five {
    aspect-ratio: 600 / 452;
  }
  .five img,
  .five.stored img {
    rotate: none;
  }
  .five .label,
  .five.stored .label {
    left: 53%;
    right: 4%;
    top: 8%;
    bottom: 10%;
    padding: 2cqw 3cqw;
    justify-content: flex-start;
    border-top: 2cqw solid var(--c, #1f3f8f);
    transform: rotate(0.6deg);
  }
  .five .title {
    font-size: 9cqw;
  }
  .five .note {
    font-size: 7cqw;
  }
  .five .meta {
    font-size: 6cqw;
  }
  .stored .label {
    top: 6%;
    bottom: 43%;
    padding-top: 1.5cqw;
    justify-content: flex-start;
    transform: rotate(0.8deg);
  }
  .title {
    font: 13cqw/1 "Permanent Marker", cursive;
    word-break: break-word;
  }
  .note {
    font: 600 10cqw/1 "Caveat", cursive;
    color: #3a3a3a;
  }
  .meta {
    font: 600 8cqw/1 "Caveat", cursive;
    color: #7a2020;
  }
</style>
