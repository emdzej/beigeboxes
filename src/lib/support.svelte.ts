import { AliasClient, AliasError, LocalStorageIdentityStore, type Product, type Ticket } from "alias-support";
import { machine } from "./emulator/machine.svelte";

/**
 * Tech support, through ALIAS (https://getalias.support): anonymous, no account. The service gives this
 * browser an id and a secret the first time a report is sent; nothing about the user is asked for.
 *
 * The key is the product's browser key: it names the product, it isn't a secret (the origins it may be
 * used from are set on the product). Rotate it with `aliasctl keys issue beigebox <name>`.
 */
const ALIAS_URL = "https://help.getalias.support";
const KEY = "alias_beigebox_35xvdfio3fvf6aejyzb3i2yxzsmkzcir4p364pygnt3khglm";
const SEEN_KEY = "beigebox:support-seen";

function describeMachine(): string {
  const s = machine.settings;
  return `${s.caseStyle}, ${s.display.toUpperCase()}, ${s.memoryMB} MB`;
}

function describeDisks(): string {
  const d = [
    machine.fda && `A: ${machine.fda.label}`,
    machine.cdrom && `CD: ${machine.cdrom.label}`,
    machine.hda && `C: ${machine.hda.label}`,
    machine.hdb && `D: ${machine.hdb.label}`,
  ].filter(Boolean);
  return d.length ? d.join(", ") : "none";
}

class Support {
  readonly client = new AliasClient({
    url: ALIAS_URL,
    key: KEY,
    store: new LocalStorageIdentityStore("beigebox:support-identity"),
    appVersion: __APP_VERSION__,
    context: () => ({ machine: describeMachine(), disks: describeDisks(), power: machine.power }),
    telemetry: () => ({
      memoryMB: machine.settings.memoryMB,
      network: machine.settings.network.kind,
      modem: Object.keys(machine.settings.modem.phonebook).length > 0,
      screen: `${machine.screen.width}x${machine.screen.height}`,
      browser: navigator.userAgent,
    }),
  });

  tickets = $state<Ticket[]>([]);
  product = $state<Product | null>(null);
  /** Support answered since the user last looked. */
  unread = $state(0);
  /** The service said no for good (this build's key revoked), with support's words if any. */
  closed = $state<string | null>(null);
  private stopWatch: (() => void) | null = null;

  /** Only a browser that has already reported has an identity; don't make one just to look. */
  known = $state(localStorage.getItem("beigebox:support-identity") !== null);

  start(): void {
    this.known = localStorage.getItem("beigebox:support-identity") !== null;
    if (!this.known || this.stopWatch) return;
    void this.load();
    this.stopWatch = this.client.watch(() => void this.load());
  }

  async loadProduct(): Promise<Product | null> {
    try {
      this.product ??= await this.client.product();
    } catch (e) {
      this.refused(e);
    }
    return this.product;
  }

  async load(): Promise<void> {
    if (!this.known) return;
    try {
      const list = await this.client.tickets();
      this.tickets = list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      const seen = localStorage.getItem(SEEN_KEY) ?? "";
      this.unread = list.filter((t) => t.support_at && t.support_at > seen).length;
    } catch (e) {
      this.refused(e);
    }
  }

  async ticket(id: number): Promise<Ticket> {
    const t = await this.client.ticket(id);
    void this.client.markRead(id).catch(() => {});
    return t;
  }

  markSeen(): void {
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
    this.unread = 0;
  }

  async reply(id: number, body: string): Promise<Ticket> {
    return this.client.reply(id, { body });
  }

  async erase(): Promise<void> {
    this.stopWatch?.();
    this.stopWatch = null;
    await this.client.eraseMe();
    this.known = false;
    localStorage.removeItem(SEEN_KEY);
    this.tickets = [];
    this.unread = 0;
  }

  private refused(e: unknown): void {
    if (e instanceof AliasError && e.keyRevoked) this.closed = e.reason ?? "This number is no longer in service.";
    else throw e;
  }
}

export const support = new Support();
