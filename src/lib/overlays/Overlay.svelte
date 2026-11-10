<script lang="ts">
  import type { Snippet } from "svelte";
  import { ui } from "../ui.svelte";

  let { children, label }: { children: Snippet; label: string } = $props();

  function key(e: KeyboardEvent) {
    if (e.key === "Escape") ui.close();
  }
</script>

<svelte:window onkeydown={key} />

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && ui.close()}>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={label}>
    {@render children()}
  </div>
  <button class="close" onclick={() => ui.close()} title="Put it back (Esc)">✕</button>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: radial-gradient(ellipse at center, rgb(10 6 2 / 0.55), rgb(5 3 1 / 0.88));
    backdrop-filter: blur(3px);
    animation: fade 0.25s ease-out;
  }
  .sheet {
    position: relative;
    width: min(94vw, 150vh);
    max-height: 94vh;
    animation: rise 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.1);
    container-type: inline-size;
  }
  .close {
    position: fixed;
    top: 1.2rem;
    right: 1.4rem;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 50%;
    border: 2px solid #e8dcc0;
    background: rgb(40 30 20 / 0.7);
    color: #e8dcc0;
    font-size: 1.2rem;
    cursor: pointer;
  }
  @keyframes fade {
    from { opacity: 0; }
  }
  @keyframes rise {
    from { transform: translateY(6vh) scale(0.94); opacity: 0; }
  }
</style>
