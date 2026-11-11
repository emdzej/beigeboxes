<script lang="ts">
  import Overlay from "./Overlay.svelte";
  import { machine } from "../emulator/machine.svelte";
  import { MODELS } from "../machines/catalog";
  import { ui } from "../ui.svelte";

  const on = $derived(machine.model.id);

  function take(id: string) {
    if (machine.choose(id)) {
      machine.restoreDrives(ui.library);
      ui.close();
    }
  }
</script>

<Overlay label="Computer catalogue">
  <div class="catalogue">
    <header>
      <h1>HOME COMPUTER <span>CATALOGUE</span></h1>
      <p>Everything for the den, the study and the bedroom · prices on request · allow 28 days for delivery</p>
    </header>

    <div class="items">
      {#each MODELS as m (m.id)}
        <article class:current={m.id === on} class:soon={!m.driver}>
          <div class="year">{m.year}</div>
          <h2>{m.name}</h2>
          <p class="maker">{m.maker}</p>
          <p class="blurb">{m.blurb}</p>

          {#if m.id === "pc-pentium" && m.id === on}
            <div class="options">
              <span>Case:</span>
              <label><input type="radio" bind:group={machine.settings.caseStyle} value="tower" /> midi tower</label>
              <label><input type="radio" bind:group={machine.settings.caseStyle} value="desktop" /> desktop</label>
            </div>
            <div class="options">
              <span>Monitor:</span>
              <label><input type="radio" bind:group={machine.settings.display} value="crt" /> 15" CRT</label>
              <label><input type="radio" bind:group={machine.settings.display} value="lcd" /> 15" LCD</label>
            </div>
          {/if}

          <footer>
            {#if m.id === on}
              <span class="stamp ok">ON YOUR DESK</span>
            {:else if m.driver}
              <button onclick={() => take(m.id)}>put it on the desk</button>
            {:else}
              <span class="stamp">BACK-ORDERED</span>
            {/if}
            <small>runs on {m.emulator}</small>
          </footer>
        </article>
      {/each}
    </div>
  </div>
</Overlay>

<style>
  .catalogue {
    max-height: 88vh;
    overflow: auto;
    padding: 2cqw 2.5cqw;
    background: #fbf7ea;
    color: #1d1d1d;
    box-shadow: 0 2cqw 4cqw rgb(0 0 0 / 0.6);
    font: 1.5cqw/1.3 Georgia, serif;
  }
  header {
    border-bottom: 0.4cqw double #9b1d20;
    margin-bottom: 1.5cqw;
  }
  h1 {
    margin: 0;
    font: italic 900 4cqw/1 Georgia, serif;
    letter-spacing: -0.05em;
    color: #9b1d20;
  }
  h1 span {
    color: #1b2a6b;
  }
  header p {
    margin: 0.4cqw 0 0.8cqw;
    font-size: 1.3cqw;
    color: #555;
  }
  .items {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(28cqw, 1fr));
    gap: 1.5cqw;
  }
  article {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 1.2cqw;
    border: 0.15cqw solid #ccc;
    background: #fff;
  }
  article.current {
    border-color: #1b2a6b;
    box-shadow: 0 0 0 0.25cqw #1b2a6b33;
  }
  article.soon {
    background: #f4f1e6;
  }
  .year {
    font: 900 1.6cqw Georgia, serif;
    color: #b9a77a;
  }
  h2 {
    margin: 0;
    font: 700 2cqw/1.1 Georgia, serif;
  }
  .maker {
    margin: 0.2cqw 0 0.6cqw;
    font-style: italic;
    color: #666;
  }
  .blurb {
    margin: 0 0 0.8cqw;
    flex: 1;
  }
  .options {
    display: flex;
    gap: 1cqw;
    flex-wrap: wrap;
    margin-bottom: 0.4cqw;
    font-size: 1.35cqw;
  }
  .options span {
    font-weight: 700;
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1cqw;
    margin-top: 0.4cqw;
  }
  footer small {
    color: #888;
    font-size: 1.1cqw;
  }
  button {
    padding: 0.4cqw 1.2cqw;
    border: 0;
    background: #9b1d20;
    color: #fff;
    font: 700 1.4cqw Georgia, serif;
    cursor: pointer;
  }
  .stamp {
    padding: 0.1cqw 0.6cqw;
    border: 0.2cqw solid #9b1d20;
    color: #9b1d20;
    font: 700 1.3cqw "Courier New", monospace;
    rotate: -4deg;
  }
  .stamp.ok {
    border-color: #1f7a3a;
    color: #1f7a3a;
  }
</style>
