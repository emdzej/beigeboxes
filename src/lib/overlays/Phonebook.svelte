<script lang="ts">
  import Overlay from "./Overlay.svelte";
  import { machine } from "../emulator/machine.svelte";

  let newNumber = $state("");
  let newUrl = $state("");

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

<Overlay label="Modem phone book">
  <div class="card">
    <h1>Phone book <small>— by the modem</small></h1>

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

    <p class="foot">
      {#if machine.power !== "off"}The phone line is plugged in or out next time you switch on.{/if}
      Dial with <code>ATDT</code> from any terminal program on COM2.
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
</style>
