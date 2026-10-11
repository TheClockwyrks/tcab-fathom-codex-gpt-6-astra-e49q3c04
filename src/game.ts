import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { initial, reconcile, clone, tick, changeScreen } from "./simulation";
import { debug } from "./debug";
import { render, loadArt } from "./presentation";
export const BACKGROUND = "#03060c";
export type Direction = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Direction;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: C.PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: { tx: number; ty: number } | null;
  linger: number;
  alertLeft: number;
  mark: number;
  pingIn: number;
  pingAge: number;
  searchTime: number;
  searched: boolean;
  flareIn: number;
  flareTime: number;
  fade: number;
  chaseSpeed: number;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number;
  hit: boolean;
}
export interface FathomState {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Body & { moving: boolean };
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: { x: number; y: number; radius: number; remaining: number }[];
  simTime: number;
  remainder: number;
  screenTime: number;
  playTime: number;
  desired: Direction;
  random: number;
  marks: number[][];
  pointerDown: Record<number, number>;
  pending: C.ActionName[];
}
export type ReadState = DeepReadonly<FathomState>;
export type FathomDebugApi = typeof debug;
export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i % 2 ? "triangle" : "sine",
        freq: [780, 220, 80, 310, 130, 180, 430][i],
        freqTo: [1100, 950, 35, 620, 850, 40, 1000][i],
        durationMs: [65, 450, 280, 350, 500, 600, 700][i],
        gain: 0.12,
      }),
    );
    for (const key of [
      "screen",
      "depth",
      "score",
      "lives",
      "brightness",
      "visionRadius",
      "windowRadius",
      "planktonRemaining",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "senses",
      (s) =>
        `sonar ${s.sonar.cooldown.toFixed(2)} / ink ${s.ink.cooldown.toFixed(2)}`,
    );
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    for (let i = 0; i < C.DEN_ORDER.length * C.ROSTER_CAP; i++)
      api.diagnostics.register(`hunter ${i + 1}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(1)} alert:${p.alert}`
          : "—";
      });
    await loadArt(api);
    return [initial(), debug];
  },
  update(previous, api, dt) {
    let s = clone(previous);
    const edges = C.ACTIONS.filter((a) => api.input.pressed(a));
    if (edges.includes("mute")) api.audio.setMuted(!api.audio.muted());
    s.muted = api.audio.muted();
    s.pending.push(...edges.filter((a) => a !== "mute"));
    const held = (["up", "down", "left", "right"] as Direction[]).filter(
      (a) => api.input.value(a) > 0,
    );
    for (const d of held)
      if (edges.includes(d) || !held.includes(s.desired)) s.desired = d;
    for (const sample of api.input.pointerSamples()) {
      const index = menuItems(s).findIndex((_, i) => {
        const r = menuRect(s, i);
        return (
          r &&
          sample.x >= r.x &&
          sample.x <= r.x + r.w &&
          sample.y >= r.y &&
          sample.y <= r.y + r.h
        );
      });
      if (index >= 0) s.menuIndex = index;
      if (sample.type === "down")
        s.pointerDown[sample.id] = s.screen === "howto" ? -2 : index;
      if (sample.type === "up") {
        if (
          (s.pointerDown[sample.id] === index && index >= 0) ||
          (s.screen === "howto" && s.pointerDown[sample.id] === -2)
        )
          s.pending.push("confirm");
        delete s.pointerDown[sample.id];
      }
    }
    s.remainder += dt;
    while (s.remainder + 1e-10 >= C.TICK_DT) {
      s.remainder -= C.TICK_DT;
      const actions = s.pending;
      s.pending = [];
      const cues = new Set<C.CueName>();
      s = controls(s, actions);
      tick(s, held.length > 0, actions, cues);
      for (const cue of cues) api.audio.play(cue);
    }
    return reconcile(s);
  },
  render,
};
export function menuItems(s: ReadState): readonly string[] {
  return s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function menuRect(s: ReadState, i: number) {
  return i >= 0 && i < menuItems(s).length
    ? { x: 100, y: 415 + i * 60, w: 330, h: 48 }
    : null;
}

function controls(s: FathomState, a: C.ActionName[]): FathomState {
  const screen = s.screen;
  if (screen === "playing" && a.includes("pause")) {
    changeScreen(s, "paused");
    return s;
  }
  if (screen === "paused" && (a.includes("pause") || a.includes("back"))) {
    changeScreen(s, "playing", false);
    return s;
  }
  const title = () => {
    const n = initial();
    n.muted = s.muted;
    n.simTime = s.simTime;
    n.titleIndex = s.titleIndex;
    n.menuIndex = s.titleIndex;
    return n;
  };
  if (
    (screen === "howto" && (a.includes("confirm") || a.includes("back"))) ||
    (screen === "gameover" && a.includes("back"))
  )
    return title();
  const items = menuItems(s);
  if (!items.length) return s;
  if (a.includes("up"))
    s.menuIndex = ((s.menuIndex ?? 0) + items.length - 1) % items.length;
  if (a.includes("down")) s.menuIndex = ((s.menuIndex ?? 0) + 1) % items.length;
  if (!a.includes("confirm")) return s;
  const i = s.menuIndex ?? 0;
  if (screen === "title") {
    s.titleIndex = i;
    if (i === 1) {
      changeScreen(s, "howto");
      return s;
    }
  }
  if (screen === "paused" && i === 0) {
    changeScreen(s, "playing", false);
    return s;
  }
  if ((screen === "paused" && i === 2) || (screen === "gameover" && i === 1))
    return title();
  const n = title();
  changeScreen(n, "countdown");
  return n;
}
