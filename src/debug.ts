import * as C from "./constants";
import type {
  ReadState,
  FathomState,
  Direction,
  Screen,
  Predator,
} from "./game";
import { menuItems, menuRect } from "./game";
import {
  clone,
  initial,
  reconcile,
  layer,
  center,
  put,
  predator,
  roster,
  changeScreen,
  directions,
  tile,
} from "./simulation";
function requireValue(valid: boolean) {
  if (!valid) throw new RangeError("Invalid Fathom pose");
}
function number(n: number, min = 0, max = Infinity, integer = false) {
  requireValue(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
  );
}
function pose(s: ReadState, fn: (s: FathomState) => void) {
  const n = clone(s);
  fn(n);
  return reconcile(n);
}
function square(s: ReadState, x: number, y: number, allowed = ".") {
  number(x, 0, C.GRID_COLS - 1, true);
  number(y, 0, C.GRID_ROWS - 1, true);
  requireValue(allowed.includes(tile(s, x, y)));
}
function hunter(s: FathomState, i: number) {
  number(i, 0, s.predators.length - 1, true);
  return s.predators[i];
}
function drifter(s: FathomState, i: number) {
  number(i, 0, s.drifters.length - 1, true);
  return s.drifters[i];
}
function direction(d: Direction) {
  requireValue(directions.includes(d));
}
function bool(b: boolean) {
  requireValue(typeof b === "boolean");
}
export const debug = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s: ReadState) => ({ ...initial(), muted: s.muted }),
  snapshot: (s: ReadState) => {
    const n = clone(s);
    const {
      remainder: _r,
      screenTime: _t,
      playTime: _p,
      desired: _d,
      random: _seed,
      marks: _m,
      pointerDown: _pd,
      pending: _pe,
      ...snapshot
    } = n;
    return {
      ...snapshot,
      drifters: n.drifters.map(({ dir: _dir, ...d }) => d),
      predators: n.predators.map((p) => {
        const {
          fix: _f,
          linger: _l,
          alertLeft: _a,
          mark: _mk,
          pingIn: _pi,
          pingAge: _pa,
          searchTime: _st,
          searched: _ss,
          flareIn: _fi,
          flareTime: _ft,
          fade: _fd,
          chaseSpeed: _cs,
          ...reading
        } = p;
        return reading;
      }),
      pulses: n.pulses.map(({ owner: _o, hit: _h, ...p }) => p),
    };
  },
  reconcile: (s: ReadState) => reconcile(clone(s)),
  setScreen: (s: ReadState, value: Screen) =>
    pose(s, (n) => {
      requireValue(
        [
          "title",
          "howto",
          "countdown",
          "playing",
          "paused",
          "cleared",
          "gameover",
        ].includes(value),
      );
      changeScreen(n, value);
    }),
  setMenuIndex: (s: ReadState, i: number) =>
    pose(s, (n) => {
      number(i, 0, menuItems(n).length - 1, true);
      n.menuIndex = i;
    }),
  setTitleIndex: (s: ReadState, i: number) =>
    pose(s, (n) => {
      number(i, 0, C.TITLE_ITEMS.length - 1, true);
      n.titleIndex = i;
    }),
  menuItemRect: menuRect,
  setScore: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, Infinity, true);
      n.score = v;
    }),
  setLives: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, Infinity, true);
      n.lives = v;
    }),
  setDepth: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 1, Infinity, true);
      n.depth = v;
      n.predators = roster(v);
      n.playTime = 0;
    }),
  setMaze: (s: ReadState, rows: readonly string[]) =>
    pose(s, (n) => {
      requireValue(
        rows.length === C.GRID_ROWS &&
          rows.every((r) => r.length === C.GRID_COLS && /^[#.gd]+$/.test(r)),
      );
      const all = rows.join("");
      requireValue(!/[gd]/.test(all) || all.split("g").length === 2);
      n.tiles = [...rows];
    }),
  setPlankton: (s: ReadState, x: number, y: number, present: boolean) =>
    pose(s, (n) => {
      square(n, x, y);
      bool(present);
      put(n.plankton, x, y, present ? "*" : "-");
    }),
  clearPlankton: (s: ReadState) =>
    pose(s, (n) => {
      n.plankton = layer("-");
    }),
  clearFog: (s: ReadState) =>
    pose(s, (n) => {
      n.visibility = layer("u");
      n.marks = n.marks.map((r) => r.map(() => 0));
    }),
  setForagerTile: (s: ReadState, x: number, y: number) =>
    pose(s, (n) => {
      square(n, x, y);
      Object.assign(n.forager, center(x, y), { moving: false });
    }),
  setForagerDir: (s: ReadState, d: Direction) =>
    pose(s, (n) => {
      direction(d);
      n.forager.dir = d;
      n.forager.moving = false;
      n.desired = d;
    }),
  setBrightness: (s: ReadState, g: number) =>
    pose(s, (n) => {
      number(g, 0, 1);
      n.brightness = g;
    }),
  setBrightHold: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, C.BRIGHT_HOLD);
      n.brightHold = v;
    }),
  clearPredators: (s: ReadState) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s: ReadState, k: C.PredatorKind, x: number, y: number) =>
    pose(s, (n) => {
      requireValue(C.DEN_ORDER.includes(k));
      square(n, x, y);
      n.predators.push(predator(k, x, y));
    }),
  setPredatorTile: (s: ReadState, i: number, x: number, y: number) =>
    pose(s, (n) => {
      square(n, x, y, ".dg");
      Object.assign(hunter(n, i), center(x, y));
    }),
  setPredatorDir: (s: ReadState, i: number, d: Direction) =>
    pose(s, (n) => {
      direction(d);
      hunter(n, i).dir = d;
    }),
  setPredatorState: (
    s: ReadState,
    i: number,
    value: Exclude<Predator["state"], "search">,
  ) =>
    pose(s, (n) => {
      requireValue(["den", "wander", "chase"].includes(value));
      const p = hunter(n, i);
      square(n, p.tx, p.ty, value === "den" ? "dg" : ".");
      p.state = value;
      p.fix = value === "chase" ? { tx: n.forager.tx, ty: n.forager.ty } : null;
      p.linger = C.LINGER_TIME;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
      if (value === "den") p.lit = false;
    }),
  setPredatorReleased: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      bool(v);
      hunter(n, i).released = v;
    }),
  setPredatorMind: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      bool(v);
      hunter(n, i).mind = v;
    }),
  setPredatorTravel: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      bool(v);
      hunter(n, i).travel = v;
    }),
  spawnDrifter: (s: ReadState, x: number, y: number) =>
    pose(s, (n) => {
      square(n, x, y);
      n.drifters.push({
        ...center(x, y),
        dir: "up",
        mind: true,
        travel: true,
        lit: false,
      });
    }),
  clearDrifters: (s: ReadState) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      bool(v);
      drifter(n, i).mind = v;
    }),
  setDrifterTravel: (s: ReadState, i: number, v: boolean) =>
    pose(s, (n) => {
      bool(v);
      drifter(n, i).travel = v;
    }),
  setDrifterIn: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v, 0, C.DRIFTER_INTERVAL);
      n.drifterIn = v;
    }),
  setSonarCooldown: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v);
      n.sonar.cooldown = v;
    }),
  setInkCooldown: (s: ReadState, v: number) =>
    pose(s, (n) => {
      number(v);
      n.ink.cooldown = v;
    }),
};
