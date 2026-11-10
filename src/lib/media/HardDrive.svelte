<script lang="ts">
  import type { MediaItem } from "./library";
  import { humanSize } from "./plastic";

  let { media }: { media: MediaItem } = $props();
</script>

<div class="hdd">
  <img src="art/hdd.webp" alt="" draggable="false" />
  <div class="label">
    <span class="brand">BEIGEBOX<small>™</small> FIXED DISK</span>
    <span class="cap">{humanSize(media.size)}</span>
    <span class="title">{media.label}</span>
    {#if media.note}<span class="note">{media.note}</span>{/if}
    <span class="meta">
      {media.home === "drawer" ? "kept in this browser" : media.home === "folder" ? "linked folder" : "factory image · read-only"}
    </span>
  </div>
</div>

<style>
  .hdd {
    position: relative;
    width: 100%;
    aspect-ratio: 600 / 983;
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
    left: 18%;
    right: 18%;
    top: 19%;
    height: 50%;
    display: flex;
    flex-direction: column;
    gap: 3cqw;
    padding: 5cqw;
    color: #222;
    overflow: hidden;
  }
  .brand {
    font: 700 6.5cqw/1 Arial, sans-serif;
    letter-spacing: 0.08em;
    border-bottom: 0.6cqw solid #c33;
    padding-bottom: 2cqw;
  }
  .cap {
    font: 700 13cqw/1 Arial, sans-serif;
  }
  .title {
    margin-top: 3cqw;
    font: 11cqw/1.05 "Permanent Marker", cursive;
    color: #1b2a6b;
    word-break: break-word;
  }
  .note {
    font: 700 9cqw/1 "Caveat", cursive;
  }
  .meta {
    margin-top: auto;
    font: 6cqw/1.1 Arial, sans-serif;
    color: #555;
  }
</style>
