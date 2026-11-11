<script lang="ts">
  import Monitor from "../hardware/Monitor.svelte";
  import { NES as geo, TV } from "../hardware/geometry";
  import { place, dot } from "../hardware/rect";
  import { machine } from "../emulator/machine.svelte";
  import { ui } from "../ui.svelte";
  import type { DeskProps } from "./desk";

  /** 1985: the family TV, the grey toaster under it, one pad and a pile of Game Paks. */
  let { screen, glassEl = $bindable() }: DeskProps = $props();

  const aspect = geo.size[0] / geo.size[1];
  const on = $derived(machine.power !== "off");

  /** Lift the flap: take the cartridge out, or go and get one. */
  function flap() {
    if (machine.cart) {
      const label = machine.cart.label;
      if (machine.setCart(null)) ui.say(`${label} is back on the pile.`);
    } else {
      ui.open("carts");
    }
  }
</script>

<div class="item tv">
  <Monitor geo={TV} kind="crt" {screen} bind:glassEl />
</div>

<div class="item console">
  <img src={geo.image} alt="A grey front-loading 8-bit console" draggable="false" />
  <button
    class="flap"
    class:loaded={machine.cart}
    style={place(geo.flap)}
    title={machine.cart ? `${machine.cart.label} — lift the flap to take it out` : "Lift the flap: put a cartridge in"}
    onclick={flap}
  ></button>
  <button class="power" class:on style={place(geo.power)} title={on ? "POWER: off" : "POWER: on"} onclick={() => void machine.togglePower()}></button>
  <button class="reset" style={place(geo.reset)} title="RESET" onclick={() => machine.reset()}></button>
  <i class="led" class:lit={on} style={dot(geo.led, geo.ledSize, aspect)}></i>
</div>

<img class="item pad" src="art/nes/pad.webp" alt="A game pad" draggable="false" title="Arrows, Z = B, X = A, Enter = Start, right Shift = Select" />

<button class="item carts" onclick={() => ui.open("carts")} title="Cartridges">
  <img src="art/nes/cart.webp" alt="" draggable="false" style="--r:-8deg" />
  <img src="art/nes/cart.webp" alt="" draggable="false" style="--r:5deg" />
  <img src="art/nes/cart.webp" alt="A pile of cartridges" draggable="false" style="--r:-2deg" />
</button>

<style>
  .item {
    position: absolute;
    display: block;
    padding: 0;
    border: 0;
    background: none;
  }
  .item img {
    display: block;
    width: 100%;
    user-select: none;
  }
  /* Same desk lines as the computers: wall at 41cqw, front lip at 43.2cqw. */
  /* Real widths at ~15 mm/cqw: a 19" wood-cased set 500 mm, the console
     256, the pad 120, a Game Pak 120. */
  .tv {
    left: 16%;
    width: 33cqw;
    bottom: calc(100cqh - 41.6cqw);
  }
  .console {
    left: 58%;
    width: 17cqw;
    bottom: calc(100cqh - 42.2cqw);
    filter: drop-shadow(0 0.6cqw 0.8cqw rgb(0 0 0 / 0.5));
  }
  /* The photo sets the box's height, so the buttons over it land where they
     are drawn in every browser (an aspect-ratio box didn't, in Safari). */
  .console img {
    height: auto;
  }
  .console button {
    position: absolute;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .console button:hover {
    box-shadow: 0 0 0 0.15cqw rgb(255 220 140 / 0.6);
  }
  .power.on,
  .reset:active {
    /* Pressed in: a shade darker and a hair lower. */
    background: rgb(0 0 0 / 0.18);
    translate: 0 4%;
  }
  .flap.loaded {
    /* Pushed down, as a front-loader holds it: the flap sits a touch lower. */
    background: linear-gradient(to bottom, rgb(0 0 0 / 0.35), transparent 30%);
  }
  .led {
    position: absolute;
    border-radius: 50%;
    background: rgb(60 10 10 / 0.6);
    pointer-events: none;
  }
  .led.lit {
    background: radial-gradient(circle, #ffd0c0 0 20%, #ff2a10 55%, #8a0a00 90%);
    box-shadow: 0 0 0.6cqw rgb(255 40 20 / 0.8);
  }
  .pad {
    left: 45%;
    width: 8.3cqw;
    bottom: calc(100cqh - 44.2cqw);
    rotate: -4deg;
    filter: drop-shadow(0 0.4cqw 0.5cqw rgb(0 0 0 / 0.55));
  }
  .carts {
    left: 80%;
    width: 8cqw;
    height: 5.4cqw;
    bottom: calc(100cqh - 43.6cqw);
    cursor: pointer;
    transition: filter 0.2s, transform 0.2s;
  }
  .carts:hover {
    filter: brightness(1.12) drop-shadow(0 0 1cqw rgb(255 210 140 / 0.35));
    transform: translateY(-3%);
  }
  .carts img {
    position: absolute;
    bottom: 0;
    left: 0;
    /* Lying flat on the desk, seen from the front: squashed, one on another. */
    transform: perspective(40cqw) rotateX(68deg) rotate(var(--r));
    transform-origin: bottom center;
    filter: drop-shadow(0 0.3cqw 0.3cqw rgb(0 0 0 / 0.6));
  }
  .carts img:nth-child(2) { bottom: 0.5cqw; }
  .carts img:nth-child(3) { bottom: 1cqw; }
</style>
