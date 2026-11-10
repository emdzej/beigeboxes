<script lang="ts">
  import type { MediaItem } from "./library";

  let { media, spinning = false }: { media: MediaItem; spinning?: boolean } = $props();
</script>

<div class="disc" class:spinning>
  <img src="art/cd.webp" alt="" draggable="false" />
  <span class="title">{media.label}</span>
  {#if media.note}<span class="note">{media.note}</span>{/if}
</div>

<style>
  .disc {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    container-type: inline-size;
  }
  .spinning img {
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { rotate: 360deg; }
  }
  img {
    width: 100%;
    height: 100%;
    display: block;
    user-select: none;
  }
  .title,
  .note {
    position: absolute;
    left: 50%;
    translate: -50% 0;
    white-space: nowrap;
    color: #111;
    text-shadow: 0 0 2px rgb(255 255 255 / 0.5);
    rotate: -4deg;
  }
  .title {
    top: 15%;
    font: 11cqw/1 "Permanent Marker", cursive;
    max-width: 70%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .note {
    bottom: 16%;
    font: 700 8cqw/1 "Caveat", cursive;
  }
</style>
