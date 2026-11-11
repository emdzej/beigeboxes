import type { Component } from "svelte";

/** Every desk gets the one emulator screen element and hands back its monitor's glass, to lean in to. */
export interface DeskProps {
  screen: HTMLElement;
  glassEl?: HTMLElement | undefined;
}

export type Desk = Component<DeskProps, {}, "glassEl">;
