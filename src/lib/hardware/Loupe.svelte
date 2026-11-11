<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * A round close-up of a part of a machine the desk can't show: a switch on
   * its flank, a drive round the side. Buttons go over the photo, placed in
   * fractions of it, like on the machines themselves.
   */
  let { image, alt, caption, children }: { image: string; alt: string; caption: string; children?: Snippet } = $props();
</script>

<div class="loupe">
  <div class="lens">
    <img src={image} {alt} draggable="false" />
    {@render children?.()}
  </div>
  <span class="caption">{caption}</span>
</div>

<style>
  .loupe {
    position: relative;
    width: 100%;
  }
  .lens {
    position: relative;
    width: 100%;
    border-radius: 50%;
    overflow: hidden;
    box-shadow:
      0 0 0 0.3cqw #26262a,
      0 0 0 0.45cqw #9a9aa2,
      0 0.6cqw 1cqw rgb(0 0 0 / 0.6);
  }
  img {
    display: block;
    width: 100%;
    height: auto;
    user-select: none;
  }
  .lens :global(button) {
    position: absolute;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .lens :global(button:hover) {
    box-shadow: 0 0 0 0.2cqw rgb(255 220 140 / 0.85);
  }
  .caption {
    position: absolute;
    left: 50%;
    top: -0.5cqw;
    translate: -50% -100%;
    padding: 0.1cqw 0.5cqw;
    background: #f7f1e1;
    color: #222;
    font: 0.85cqw/1.2 "Caveat", cursive;
    white-space: nowrap;
    rotate: -2deg;
    box-shadow: 0 0.15cqw 0.3cqw rgb(0 0 0 / 0.5);
    pointer-events: none;
  }
</style>
