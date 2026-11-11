<script lang="ts">
  import Overlay from "./Overlay.svelte";
  import Cart from "../media/Cart.svelte";
  import { ui } from "../ui.svelte";
  import { machine } from "../emulator/machine.svelte";
  import { importToDrawer, type MediaItem } from "../media/library";

  const carts = $derived(ui.of("cart").filter((m) => m.id !== machine.cart?.id));
  let picked = $state<string | null>(null);
  let fileInput: HTMLInputElement;

  async function insert(media: MediaItem) {
    picked = media.id;
    await new Promise((r) => setTimeout(r, 380));
    ui.close();
    if (machine.setCart(media)) ui.say(machine.model.id === "nes" ? `${media.label} is in. Push it down and switch on.` : `${media.label} is in the expansion port. Switch on.`);
  }

  async function imported(e: Event) {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    for (const f of files) await importToDrawer(f, "cart");
    await ui.refresh();
    if (files.length) ui.say(`${files.length} cartridge${files.length > 1 ? "s" : ""} on the pile`);
  }
</script>

<Overlay label="Cartridges">
  <div class="pile">
    {#each carts as media, i (media.id)}
      <button
        class="cart"
        class:picked={picked === media.id}
        style="--r:{((i * 37) % 9) - 4}deg"
        onclick={() => insert(media)}
        title="Put {media.label} in the console"
      >
        <Cart {media} />
      </button>
    {/each}
    {#if !carts.length}<p class="empty">Nothing here. The cartridge is in the console.</p>{/if}
  </div>
  <div class="extras">
    <button onclick={() => fileInput.click()}>+ cartridge from a {machine.model.id === "c64" ? ".crt" : ".nes"} file…</button>
  </div>
  <p class="hint">Pick a cartridge. It only goes in with the console off.</p>
  <input bind:this={fileInput} type="file" multiple accept={machine.model.id === "c64" ? ".crt" : ".nes"} hidden onchange={imported} />
</Overlay>

<style>
  .pile {
    display: grid;
    grid-template-columns: repeat(4, 16cqw);
    gap: 3cqw 2.5cqw;
    justify-content: center;
    min-height: 20cqw;
  }
  .cart {
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    rotate: var(--r);
    filter: drop-shadow(0 1cqw 1.2cqw rgb(0 0 0 / 0.6));
    transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 0.3s;
  }
  .cart:hover,
  .cart:focus-visible {
    transform: translateY(-6%) scale(1.06);
    outline: none;
  }
  .cart.picked {
    transform: translateY(-80%) scale(0.6);
    opacity: 0;
    transition: transform 0.35s ease-in, opacity 0.3s 0.1s;
  }
  .empty {
    grid-column: 1 / -1;
    align-self: center;
    text-align: center;
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
