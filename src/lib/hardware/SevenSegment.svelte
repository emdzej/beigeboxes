<script lang="ts">
  /** A red LED 7-segment readout, drawn rather than set in a font. */
  let { value }: { value: string } = $props();

  // Segments a–g, clockwise from the top, then the middle.
  const DIGITS: Record<string, string> = {
    "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc",
    "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcfgd",
    " ": "", "-": "g", H: "bcefg", L: "fed", P: "abefg",
  };

  const SEG: Record<string, string> = {
    a: "M2,1 L8,1 L7,2 L3,2 Z",
    b: "M8,1.4 L8,8.6 L7,7.8 L7,2.4 Z",
    c: "M8,9.4 L8,16.6 L7,15.6 L7,10.2 Z",
    d: "M2,17 L8,17 L7,16 L3,16 Z",
    e: "M2,9.4 L2,16.6 L3,15.6 L3,10.2 Z",
    f: "M2,1.4 L2,8.6 L3,7.8 L3,2.4 Z",
    g: "M2.4,9 L3.2,8.4 L6.8,8.4 L7.6,9 L6.8,9.6 L3.2,9.6 Z",
  };

  const chars = $derived(value.padStart(3, " ").slice(-3).split(""));
</script>

<svg viewBox="0 0 31 18" preserveAspectRatio="xMidYMid meet">
  {#each chars as ch, i}
    <g transform="translate({i * 10 + 0.5},0) skewX(-6)">
      {#each Object.entries(SEG) as [name, d]}
        <path {d} class:on={DIGITS[ch]?.includes(name)} />
      {/each}
    </g>
  {/each}
</svg>

<style>
  svg {
    width: 100%;
    height: 100%;
    display: block;
    padding: 6% 8%;
    box-sizing: border-box;
  }
  path {
    fill: #3a0b08;
  }
  path.on {
    fill: #ff2a1a;
    filter: drop-shadow(0 0 0.6px #ff5040);
  }
</style>
