<script lang="ts">
  import type { Entry, Ticket } from "alias-support";
  import Overlay from "./Overlay.svelte";
  import { machine } from "../emulator/machine.svelte";
  import { support } from "../support.svelte";

  let note = $state("");
  let shot = $state<Blob | null>(null);
  let shotUrl = $derived(shot ? URL.createObjectURL(shot) : null);
  let email = $state("");
  let agree = $state(false);
  let preview = $state<{ context?: Record<string, unknown>; telemetry?: Record<string, unknown>; removable: string[] } | null>(null);
  let keep = $state<Record<string, boolean>>({});
  let busy = $state(false);
  let error = $state<string | null>(null);
  let open = $state<Ticket | null>(null);
  let answer = $state("");
  /** The email given before, if any. */
  let contact = $state<string | null>(null);

  const product = $derived(support.product);
  const STATUS: Record<string, string> = {
    open: "on hold",
    in_progress: "looking into it",
    waiting: "waiting for you",
    resolved: "fixed",
    closed: "closed",
  };

  $effect(() => {
    void support.loadProduct();
    void support.load();
    support.markSeen();
    void refreshPreview();
    void loadContact();
  });

  async function loadContact() {
    if (!support.known) return;
    try {
      contact = (await support.client.getContact()).contact?.value ?? null;
    } catch {
      contact = null;
    }
  }

  async function withdraw() {
    await support.client.withdrawContact();
    contact = null;
  }

  $effect(() => () => {
    if (shotUrl) URL.revokeObjectURL(shotUrl);
  });

  async function refreshPreview() {
    try {
      preview = await support.client.previewTelemetry();
      keep = Object.fromEntries(preview.removable.map((p) => [p, true]));
    } catch {
      preview = null;
    }
  }

  async function snap() {
    shot = await machine.screenshot();
    if (!shot) error = "The screen's dark. Switch the PC on first.";
  }

  async function blackOut() {
    if (!shot) return;
    const { openRedactor } = await import("alias-support/redact");
    const out = await openRedactor(shot, { type: "image/png" });
    if (out) shot = out;
  }

  async function send() {
    if (!note.trim()) return;
    busy = true;
    error = null;
    try {
      const remove = Object.entries(keep).filter(([, k]) => !k).map(([p]) => p);
      const t = await support.client.report({
        note: note.trim(),
        attachments: shot ? [{ name: "screen.png", data: shot }] : [],
        remove,
      });
      if (email.trim() && agree && product?.contact_consent) {
        await support.client.setContact("email", email.trim(), product.contact_consent);
        contact = email.trim();
      }
      support.start();
      await support.load();
      note = "";
      shot = null;
      email = "";
      agree = false;
      open = await support.ticket(t.id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function show(t: Ticket) {
    error = null;
    try {
      open = await support.ticket(t.id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function reply() {
    if (!open || !answer.trim()) return;
    busy = true;
    try {
      await support.reply(open.id, answer.trim());
      answer = "";
      open = await support.ticket(open.id);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function download() {
    const data = await support.client.myData();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "beigeboxes-support.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function forget() {
    if (!confirm("Erase every call, its pictures and any email you gave — for good?")) return;
    await support.erase();
    open = null;
  }

  function who(e: Entry): string {
    if (e.author === "user") return "you";
    return e.agent ? `${e.name ?? "support"} (automated)` : (e.name ?? "support");
  }

  function when(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function show_value(v: unknown): string {
    return typeof v === "string" ? v : JSON.stringify(v);
  }

  // Watch for answers while the pad is open.
  $effect(() => {
    if (!open) return;
    const id = open.id;
    const t = support.tickets.find((x) => x.id === id);
    if (t && t.updated_at !== open.updated_at) void support.ticket(id).then((x) => (open = x));
  });
</script>

<Overlay label="Tech support">
  <div class="pad">
    <header>
      <h1>TECH SUPPORT</h1>
      <p>We're here to help. No account, no name — just tell us what it's doing.</p>
    </header>

    {#if support.closed}
      <p class="closed">{support.closed}</p>
    {:else}
      <div class="cols">
        <section class="form">
          <h2>New call</h2>
          <label class="what">
            What's it doing?
            <textarea bind:value={note} rows="5" placeholder="It says “Non-system disk or disk error” and beeps at me…"></textarea>
          </label>

          <div class="shot">
            {#if shotUrl}
              <img src={shotUrl} alt="The screen, as it will be sent" />
              <div>
                <button onclick={blackOut}>black out bits…</button>
                <button onclick={() => (shot = null)}>don't send it</button>
              </div>
            {:else}
              <button onclick={snap} disabled={machine.power === "off"}>
                + a picture of the screen
              </button>
              {#if machine.power === "off"}<small>(switch the PC on first)</small>{/if}
            {/if}
          </div>

          {#if preview}
            <details>
              <summary>What else goes with it</summary>
              <dl>
                {#each Object.entries(preview.context ?? {}) as [k, v]}
                  <dt>{k}</dt><dd>{show_value(v)}</dd>
                {/each}
                {#each Object.entries(preview.telemetry ?? {}) as [k, v]}
                  {@const path = `/telemetry/${k}`}
                  <dt>
                    {#if path in keep}<input type="checkbox" bind:checked={keep[path]} title="Send this" />{/if}
                    {k}
                  </dt>
                  <dd class:struck={path in keep && !keep[path]}>{show_value(v)}</dd>
                {/each}
              </dl>
            </details>
          {/if}

          {#if contact}
            <p class="given">We'll also answer at {contact}. <button onclick={withdraw}>withdraw it</button></p>
          {:else if product?.contact === "optional" && product.contact_consent}
            <label class="email">
              Email, if you'd like an answer there too <small>(optional)</small>
              <input type="email" bind:value={email} placeholder="you@example.com" />
            </label>
            {#if email.trim()}
              <label class="consent">
                <input type="checkbox" bind:checked={agree} />
                {product.contact_consent.text}
              </label>
            {/if}
          {/if}

          <button class="send" onclick={send} disabled={busy || !note.trim() || (!!email.trim() && !agree)}>
            {busy ? "dialling…" : "Call it in"}
          </button>
          {#if error}<p class="error">{error}</p>{/if}
        </section>

        <section class="calls">
          {#if open}
            <button class="back" onclick={() => (open = null)}>← all calls</button>
            <h2>Call #{open.id} <span class="status s-{open.status}">{STATUS[open.status] ?? open.status}</span></h2>
            <ol class="thread">
              <li class="user">
                <b>you</b> <time>{when(open.created_at)}</time>
                <p>{open.note}</p>
                {#if open.attachments?.length}<small>{open.attachments.length} picture{open.attachments.length > 1 ? "s" : ""} sent</small>{/if}
              </li>
              {#each open.thread ?? [] as e (e.id)}
                {#if e.kind === "comment"}
                  <li class={e.author}>
                    <b>{who(e)}</b> <time>{when(e.created_at)}</time>
                    <p>{e.body}</p>
                  </li>
                {:else if e.kind === "status"}
                  <li class="note">{STATUS[e.body] ?? e.body} · <time>{when(e.created_at)}</time></li>
                {/if}
              {/each}
            </ol>
            {#if open.status !== "closed"}
              <div class="reply">
                <textarea bind:value={answer} rows="2" placeholder="Write back…"></textarea>
                <button onclick={reply} disabled={busy || !answer.trim()}>Send</button>
              </div>
            {/if}
          {:else}
            <h2>Calls so far</h2>
            {#if support.tickets.length}
              <ul class="list">
                {#each support.tickets as t (t.id)}
                  <li>
                    <button onclick={() => show(t)}>
                      <span class="id">#{t.id}</span>
                      <span class="text">{t.note.split("\n")[0]}</span>
                      <span class="status s-{t.status}">{STATUS[t.status] ?? t.status}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="empty">No calls yet. Answers show up here as they come in.</p>
            {/if}
          {/if}
        </section>
      </div>

      <footer>
        Answered through <a href="https://getalias.support" target="_blank" rel="noreferrer">ALIAS</a>, anonymously.
        <a href="privacy.html" target="_blank">What's kept</a>
        {#if support.known}
          · <button onclick={download}>download my data</button>
          · <button onclick={forget}>erase it all</button>
        {/if}
      </footer>
    {/if}
  </div>
</Overlay>

<style>
  .pad {
    box-sizing: border-box;
    width: min(88cqw, 140vh);
    max-height: 90vh;
    overflow: auto;
    margin: 0 auto;
    padding: 2.4cqw 3cqw 1.6cqw;
    /* A yellow legal pad. */
    background:
      linear-gradient(90deg, transparent 4.2cqw, rgb(200 60 60 / 0.45) 4.2cqw 4.35cqw, transparent 4.35cqw),
      repeating-linear-gradient(to bottom, transparent 0 2.4cqw, rgb(80 120 200 / 0.28) 2.4cqw 2.48cqw),
      #fdf3a8;
    color: #1b2a6b;
    font: 600 1.45cqw/1.35 "Caveat", cursive;
    box-shadow: 0 2cqw 4cqw rgb(0 0 0 / 0.6);
    rotate: -0.6deg;
  }
  header {
    padding-left: 3cqw;
  }
  h1 {
    margin: 0;
    font: 3.4cqw/1 "Permanent Marker", cursive;
    color: #9b1d20;
    letter-spacing: 0.1em;
  }
  header p {
    margin: 0.3cqw 0 1cqw;
  }
  h2 {
    margin: 0 0 0.6cqw;
    font: 1.9cqw "Permanent Marker", cursive;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 3cqw;
    padding-left: 3cqw;
  }
  label {
    display: block;
    margin-bottom: 0.8cqw;
  }
  textarea,
  input[type="email"] {
    display: block;
    box-sizing: border-box;
    width: 100%;
    margin-top: 0.3cqw;
    padding: 0.5cqw 0.7cqw;
    border: 0.12cqw solid rgb(27 42 107 / 0.35);
    border-radius: 0.3cqw;
    background: rgb(255 255 255 / 0.55);
    color: #111;
    font: 1.25cqw/1.4 "VT323", monospace;
    resize: vertical;
  }
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .shot button,
  .reply button,
  footer button {
    padding: 0;
    border: 0;
    background: none;
    text-decoration: underline;
  }
  .shot {
    display: flex;
    gap: 1cqw;
    align-items: center;
    margin-bottom: 0.8cqw;
  }
  .shot img {
    width: 14cqw;
    border: 0.3cqw solid #fff;
    box-shadow: 0 0.3cqw 0.6cqw rgb(0 0 0 / 0.35);
    rotate: 1.5deg;
    image-rendering: pixelated;
  }
  .shot div {
    display: flex;
    flex-direction: column;
    gap: 0.4cqw;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  details {
    margin-bottom: 0.8cqw;
  }
  summary {
    cursor: pointer;
  }
  dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.1cqw 1cqw;
    margin: 0.4cqw 0 0;
    font: 1.05cqw/1.3 "VT323", monospace;
    color: #333;
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  dd.struck {
    text-decoration: line-through;
    opacity: 0.5;
  }
  .given button {
    padding: 0;
    border: 0;
    background: none;
    text-decoration: underline;
  }
  .consent {
    display: flex;
    gap: 0.6cqw;
    align-items: flex-start;
    font-size: 1.2cqw;
    color: #333;
  }
  .send {
    margin-top: 0.4cqw;
    padding: 0.5cqw 2cqw;
    border: 0;
    background: #9b1d20;
    color: #fdf3a8;
    font: 1.6cqw "Permanent Marker", cursive;
    box-shadow: 0 0.3cqw 0.5cqw rgb(0 0 0 / 0.35);
    rotate: -1deg;
  }
  .error {
    color: #9b1d20;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .list button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.8cqw;
    width: 100%;
    padding: 0.3cqw 0;
    border: 0;
    border-bottom: 0.1cqw dashed rgb(27 42 107 / 0.3);
    background: none;
    text-align: left;
  }
  .text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .status {
    padding: 0 0.6cqw;
    border: 0.12cqw solid currentColor;
    border-radius: 0.4cqw;
    font-size: 1.1cqw;
    white-space: nowrap;
  }
  .s-waiting {
    color: #9b1d20;
  }
  .s-resolved,
  .s-closed {
    color: #1f7a3a;
  }
  .back {
    padding: 0;
    border: 0;
    background: none;
  }
  .thread {
    max-height: 28cqw;
    overflow: auto;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .thread li {
    margin-bottom: 0.8cqw;
  }
  .thread li p {
    margin: 0.1cqw 0 0;
    white-space: pre-wrap;
    font: 1.2cqw/1.35 "VT323", monospace;
    color: #111;
  }
  .thread li.support b {
    color: #9b1d20;
  }
  .thread li.note {
    color: #666;
    font-size: 1.15cqw;
  }
  time {
    color: #777;
    font-size: 1.05cqw;
  }
  .reply {
    display: flex;
    gap: 1cqw;
    align-items: flex-end;
  }
  .empty {
    color: #555;
  }
  footer {
    margin-top: 1.4cqw;
    padding-left: 3cqw;
    font-size: 1.15cqw;
    color: #555;
  }
  footer a {
    color: inherit;
  }
  .closed {
    padding-left: 3cqw;
    color: #9b1d20;
  }
</style>
