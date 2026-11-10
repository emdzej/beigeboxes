<script lang="ts">
  import Overlay from "./Overlay.svelte";
  import { machine } from "../emulator/machine.svelte";
  import { sfx } from "../sfx";

  const s = machine.settings;
  let muted = $state(sfx.muted);
  let relayUrl = $state(s.network.kind === "relay" ? s.network.url : "wss://relay.widgetry.org/");
  let corsProxy = $state(s.network.kind === "fetch" ? (s.network.corsProxy ?? "") : "");
  let newNumber = $state("");
  let newUrl = $state("");

  function network(kind: "none" | "fetch" | "relay") {
    machine.settings.network =
      kind === "none" ? { kind } : kind === "fetch" ? { kind, ...(corsProxy ? { corsProxy } : {}) } : { kind, url: relayUrl };
  }

  function addNumber() {
    if (!newNumber || !newUrl) return;
    machine.settings.modem.phonebook = { ...machine.settings.modem.phonebook, [newNumber]: newUrl };
    newNumber = newUrl = "";
  }

  function removeNumber(n: string) {
    const { [n]: _, ...rest } = machine.settings.modem.phonebook;
    machine.settings.modem.phonebook = rest;
  }
</script>

<Overlay label="System setup">
  <div class="card">
    <h1>My PC <small>— setup notes</small></h1>

    <section>
      <h3>Case</h3>
      <label><input type="radio" bind:group={machine.settings.caseStyle} value="tower" /> midi tower</label>
      <label><input type="radio" bind:group={machine.settings.caseStyle} value="desktop" /> desktop</label>
    </section>

    <section>
      <h3>Monitor</h3>
      <label><input type="radio" bind:group={machine.settings.display} value="crt" /> 15" CRT</label>
      <label><input type="radio" bind:group={machine.settings.display} value="lcd" /> 15" LCD (fancy!)</label>
    </section>

    <section>
      <h3>RAM</h3>
      {#each [8, 16, 32, 64, 128, 256] as mb}
        <label><input type="radio" bind:group={machine.settings.memoryMB} value={mb} /> {mb}MB</label>
      {/each}
    </section>

    <section>
      <h3>Network card <small>(NE2000)</small></h3>
      <label><input type="radio" checked={s.network.kind === "none"} name="net" onchange={() => network("none")} /> unplugged</label>
      <label title="HTTP only, straight from the browser">
        <input type="radio" checked={s.network.kind === "fetch"} name="net" onchange={() => network("fetch")} /> web only (fetch)
      </label>
      <label><input type="radio" checked={s.network.kind === "relay"} name="net" onchange={() => network("relay")} /> ethernet relay</label>
      {#if machine.settings.network.kind === "relay"}
        <input class="line" bind:value={relayUrl} onchange={() => network("relay")} placeholder="wss://relay…" />
      {:else if machine.settings.network.kind === "fetch"}
        <input class="line" bind:value={corsProxy} onchange={() => network("fetch")} placeholder="CORS proxy (optional), e.g. https://proxy/?url=" />
      {/if}
    </section>

    <section>
      <h3>Modem <small>(56K on COM2)</small></h3>
      <label><input type="checkbox" bind:checked={machine.settings.modem.enabled} /> plugged into the phone line</label>
      {#if machine.settings.modem.enabled}
        <table>
          <tbody>
            {#each Object.entries(machine.settings.modem.phonebook) as [number, url]}
              <tr>
                <td class="num">ATDT {number}</td>
                <td class="url">{url}</td>
                <td><button onclick={() => removeNumber(number)} title="Cross out">✗</button></td>
              </tr>
            {/each}
            <tr>
              <td><input class="line" bind:value={newNumber} placeholder="555…" /></td>
              <td><input class="line" bind:value={newUrl} placeholder="wss://bbs…" /></td>
              <td><button onclick={addNumber}>+</button></td>
            </tr>
          </tbody>
        </table>
      {/if}
    </section>

    <section>
      <h3>Speaker</h3>
      <label><input type="checkbox" checked={!muted} onchange={(e) => { muted = !e.currentTarget.checked; sfx.setMuted(muted); }} /> clicks, whirrs &amp; grinding</label>
    </section>

    <p class="foot">
      {#if machine.power !== "off"}RAM, network &amp; modem take effect next time you switch on.{/if}
      Powered by <a href="https://github.com/copy/v86" target="_blank" rel="noreferrer">v86</a> &amp;
      <a href="https://github.com/emdzej/csfs" target="_blank" rel="noreferrer">csfs</a>.
    </p>
  </div>
</Overlay>

<style>
  .card {
    width: min(70cqw, 90vh);
    margin: 0 auto;
    padding: 3cqw 4cqw 2cqw 8cqw;
    max-height: 88vh;
    overflow: auto;
    color: #1b2a6b;
    font: 600 2.1cqw/1.25 "Caveat", cursive;
    /* An index card: red margin, blue rules. */
    background:
      linear-gradient(90deg, transparent 6cqw, rgb(220 60 60 / 0.6) 6cqw 6.25cqw, transparent 6.25cqw),
      repeating-linear-gradient(to bottom, transparent 0 3.05cqw, rgb(80 120 200 / 0.3) 3.05cqw 3.15cqw),
      #fbf7ea;
    box-shadow: 0 2cqw 4cqw rgb(0 0 0 / 0.6);
    rotate: -0.6deg;
  }
  h1 {
    margin: 0 0 1cqw;
    font: 3.6cqw/1 "Permanent Marker", cursive;
  }
  h1 small,
  h3 small {
    font: 600 1.8cqw "Caveat", cursive;
    color: #555;
  }
  h3 {
    margin: 0.6cqw 0 0.2cqw;
    font: 2.2cqw "Permanent Marker", cursive;
    color: #7a2020;
  }
  section {
    margin-bottom: 1cqw;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 0.4cqw;
    margin-right: 2cqw;
    cursor: pointer;
  }
  input[type="radio"],
  input[type="checkbox"] {
    accent-color: #1b2a6b;
    width: 1.6cqw;
    height: 1.6cqw;
  }
  .line {
    width: 100%;
    border: 0;
    border-bottom: 1px dashed #1b2a6b;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  td {
    padding: 0.2cqw 0.4cqw;
    vertical-align: middle;
  }
  .num {
    white-space: nowrap;
    font-family: "VT323", monospace;
  }
  .url {
    font-size: 1.7cqw;
    word-break: break-all;
  }
  td button {
    border: 0;
    background: none;
    color: #9b1d20;
    font: inherit;
    cursor: pointer;
  }
  .foot {
    font-size: 1.7cqw;
    color: #555;
  }
  a {
    color: #1b2a6b;
  }
</style>
