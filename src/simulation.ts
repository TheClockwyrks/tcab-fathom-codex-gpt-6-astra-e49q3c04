import * as C from "./constants";
import type {
  Body,
  Direction,
  FathomState,
  Predator,
  ReadState,
  Screen,
  Pulse,
} from "./game";
export const directions: Direction[] = ["up", "right", "down", "left"];
const vectors = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
} as const;
export const opposite = (d: Direction): Direction =>
  directions[(directions.indexOf(d) + 2) % 4];
export const center = (tx: number, ty: number) => ({
  x: C.GRID_ORIGIN_X + (tx + 0.5) * C.TILE,
  y: C.GRID_ORIGIN_Y + (ty + 0.5) * C.TILE,
  tx,
  ty,
});
export function clone(s: ReadState): FathomState {
  return JSON.parse(JSON.stringify(s)) as FathomState;
}
export function layer(c: string) {
  return Array<string>(C.GRID_ROWS).fill(c.repeat(C.GRID_COLS));
}
export function put(rows: string[], x: number, y: number, c: string) {
  rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1);
}
export function maze() {
  const rows = layer("#");
  for (const y of [1, 3, 5, 11, 13, 16])
    for (let x = 1; x < C.GRID_COLS - 1; x++) put(rows, x, y, ".");
  for (const x of [1, 7, 13, 22, 28, 34])
    for (let y = 1; y < C.GRID_ROWS - 1; y++) put(rows, x, y, ".");
  for (let x = 0; x < C.GRID_COLS; x++)
    if (x <= 13 || x >= 22) put(rows, x, 8, ".");
  for (let y = 7; y <= 9; y++)
    for (let x = 16; x <= 19; x++) put(rows, x, y, "d");
  put(rows, 17, 6, "g");
  return rows;
}
export function predator(
  kind: C.PredatorKind,
  tx: number,
  ty: number,
): Predator {
  return {
    ...center(tx, ty),
    dir: "up",
    kind,
    state: "wander",
    released: true,
    mind: true,
    travel: true,
    lit: false,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    pingAge: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searched: false,
    flareIn: C.FLARE_INTERVAL,
    flareTime: 0,
    fade: 0,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
  };
}
export function roster(depth: number) {
  return [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ].map((k, i) => ({
    ...predator(k, 16 + (i % 4), 8 + Math.floor(i / 4)),
    state: "den" as const,
    released: false,
  }));
}
export function initial(): FathomState {
  const tiles = maze();
  return reconcile({
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted: false,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((r) => r.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: layer("u"),
    forager: { ...center(17, 13), dir: "left", moving: false },
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    remainder: 0,
    screenTime: 0,
    playTime: 0,
    desired: "left",
    random: 7251,
    marks: Array.from({ length: C.GRID_ROWS }, () =>
      Array<number>(C.GRID_COLS).fill(0),
    ),
    pointerDown: {},
    pending: [],
  });
}
export function reconcile(s: FathomState): FathomState {
  for (const b of [s.forager, ...s.predators, ...s.drifters]) locate(b);
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(C.SONAR_RANGE_MIN, C.SONAR_RANGE_BASE - s.depth + 1);
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.join("").split("*").length - 1;
  for (const p of s.predators) {
    p.speed =
      p.kind === "lanternjaw" && p.state === "wander"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
  }
  return s;
}
function locate(b: Body) {
  b.tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  b.ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
}
export function changeScreen(s: FathomState, screen: Screen, reset = true) {
  s.screen = screen;
  s.screenTime = 0;
  s.menuIndex =
    screen === "title"
      ? s.titleIndex
      : screen === "paused" || screen === "gameover"
        ? 0
        : null;
  if (screen === "playing" && reset) s.playTime = 0;
}
export function tile(s: ReadState, x: number, y: number) {
  return s.tiles[y]?.[x] ?? "#";
}
export function neighbor(
  s: ReadState,
  x: number,
  y: number,
  d: Direction,
  den = false,
) {
  const [dx, dy] = vectors[d];
  let nx = x + dx;
  const ny = y + dy;
  const wrap = s.tiles.findIndex(
    (r) => r[0] === "." && r[C.GRID_COLS - 1] === ".",
  );
  if (y === wrap) nx = (nx + C.GRID_COLS) % C.GRID_COLS;
  const t = tile(s, nx, ny);
  return t === "." || (den && (t === "d" || t === "g"))
    ? { tx: nx, ty: ny }
    : null;
}
export function distances(s: ReadState, x: number, y: number, den = false) {
  const map = Array.from({ length: C.GRID_ROWS }, () =>
    Array<number>(C.GRID_COLS).fill(Infinity),
  );
  if (!map[y] || x < 0 || x >= C.GRID_COLS) return map;
  map[y][x] = 0;
  const queue = [{ tx: x, ty: y }];
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    for (const d of directions) {
      const n = neighbor(s, q.tx, q.ty, d, den);
      if (n && map[n.ty][n.tx] === Infinity) {
        map[n.ty][n.tx] = map[q.ty][q.tx] + 1;
        queue.push(n);
      }
    }
  }
  return map;
}
function random(s: FathomState) {
  s.random = (Math.imul(s.random, 1664525) + 1013904223) >>> 0;
  return s.random / 4294967296;
}
function wander(s: FathomState, b: Body, den = false) {
  let opts = directions.filter((d) => neighbor(s, b.tx, b.ty, d, den));
  const forward = opts.filter((d) => d !== opposite(b.dir));
  if (forward.length) opts = forward;
  return opts[Math.floor(random(s) * opts.length)] ?? b.dir;
}
function toward(
  s: FathomState,
  b: Body,
  target: { tx: number; ty: number },
  den = false,
) {
  const map = distances(s, target.tx, target.ty, den);
  let best = map[b.ty]?.[b.tx] ?? Infinity;
  let result = b.dir;
  for (const d of directions) {
    const n = neighbor(s, b.tx, b.ty, d, den);
    if (n && map[n.ty][n.tx] < best) {
      best = map[n.ty][n.tx];
      result = d;
    }
  }
  return result;
}
function atCenter(b: Body) {
  const c = center(b.tx, b.ty);
  return Math.abs(b.x - c.x) < 1e-6 && Math.abs(b.y - c.y) < 1e-6;
}
function move(
  s: FathomState,
  b: Body,
  speed: number,
  choose: () => Direction,
  den = false,
) {
  const here = tile(s, b.tx, b.ty);
  if (here !== "." && !(den && (here === "d" || here === "g"))) return false;
  let left = speed * C.TICK_DT;
  let moved = false;
  while (left > 1e-8) {
    if (atCenter(b)) {
      b.dir = choose();
      if (!neighbor(s, b.tx, b.ty, b.dir, den)) break;
    }
    const [dx, dy] = vectors[b.dir];
    const c = center(b.tx, b.ty);
    let distance = dx
      ? dx > 0
        ? c.x - b.x
        : b.x - c.x
      : dy > 0
        ? c.y - b.y
        : b.y - c.y;
    if (distance <= 1e-7) distance += C.TILE;
    const amount = Math.min(left, distance);
    b.x += dx * amount;
    b.y += dy * amount;
    const width = C.GRID_COLS * C.TILE;
    if (b.x < C.GRID_ORIGIN_X) b.x += width;
    if (b.x >= C.GRID_ORIGIN_X + width) b.x -= width;
    locate(b);
    left -= amount;
    moved = true;
  }
  return moved;
}
/** Grid traversal stops at the first rock face; the target face itself is lit. */
export function lineClear(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  let x = Math.floor((a.x - C.GRID_ORIGIN_X) / C.TILE);
  let y = Math.floor((a.y - C.GRID_ORIGIN_Y) / C.TILE);
  const ex = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  const ey = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const sx = Math.sign(dx),
    sy = Math.sign(dy);
  const stepX = dx === 0 ? Infinity : C.TILE / Math.abs(dx);
  const stepY = dy === 0 ? Infinity : C.TILE / Math.abs(dy);
  let crossX =
    dx === 0
      ? Infinity
      : (C.GRID_ORIGIN_X + (x + (sx > 0 ? 1 : 0)) * C.TILE - a.x) / dx;
  let crossY =
    dy === 0
      ? Infinity
      : (C.GRID_ORIGIN_Y + (y + (sy > 0 ? 1 : 0)) * C.TILE - a.y) / dy;
  while (x !== ex || y !== ey) {
    if (tile(s, x, y) === "#") return false;
    if (Math.abs(crossX - crossY) < 1e-10) {
      // A ray through a sealed corner cannot leak between two rock faces.
      if (tile(s, x + sx, y) === "#" && tile(s, x, y + sy) === "#")
        return false;
      x += sx;
      y += sy;
      crossX += stepX;
      crossY += stepY;
    } else if (crossX < crossY) {
      x += sx;
      crossX += stepX;
    } else {
      y += sy;
      crossY += stepY;
    }
  }
  return true;
}
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
function blinded(s: FathomState, p: Predator) {
  const f = s.forager;
  return s.inkClouds.some((c) => {
    const dx = f.x - p.x,
      dy = f.y - p.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((c.x - p.x) * dx + (c.y - p.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    return distance(c, { x: p.x + t * dx, y: p.y + t * dy }) <= c.radius;
  });
}
function acquire(s: FathomState, p: Predator, fresh = false) {
  if (p.kind !== "lanternjaw" && (p.state !== "chase" || fresh)) {
    p.alertLeft = C.ALERT_TIME;
    p.alert = true;
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
  }
  p.fix = { tx: s.forager.tx, ty: s.forager.ty };
  p.state = "chase";
  const route = toward(s, p, p.fix);
  if (route === opposite(p.dir)) p.dir = route;
  p.linger = C.LINGER_TIME;
  p.searchTime = 0;
  p.searched = false;
}
function ping(
  s: FathomState,
  p: Predator,
  i: number,
  tint: "violet" | "orange",
  cues: Set<C.CueName>,
) {
  s.pulses.push({
    source: "gloamfin",
    tint,
    ox: p.tx,
    oy: p.ty,
    front: -1e-6,
    range: C.GLOAMFIN_PING_RANGE,
    owner: i,
    hit: false,
  });
  p.pingIn = C.GLOAMFIN_PING_INTERVAL;
  p.pingAge = 0;
  cues.add(C.CUES.predatorPing);
}
function minds(s: FathomState, cues: Set<C.CueName>) {
  s.predators.forEach((p, i) => {
    if (!p.mind) return;
    p.alertLeft = Math.max(0, p.alertLeft - C.TICK_DT);
    p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;

    p.fade = Math.max(0, p.fade - C.TICK_DT);
    if (p.state === "den") {
      if (s.playTime + 1e-8 >= i * C.DEN_RELEASE_GAP) p.released = true;
      const gate = s.tiles.findIndex((r) => r.includes("g"));
      if (gate < 0 || !s.tiles.some((r) => r.includes("d"))) return;
      if (p.released && p.travel) {
        const target = { tx: s.tiles[gate].indexOf("g"), ty: gate - 1 };
        move(s, p, p.speed, () => toward(s, p, target, true), true);
        if (tile(s, p.tx, p.ty) === ".") p.state = "wander";
      }
      return;
    }
    const f = s.forager;
    if (p.kind === "gloamfin") {
      const lock = distance(p, f) <= C.GLOAMFIN_HEAR;
      const was = p.hearingLock;
      p.hearingLock = lock;
      p.pingIn -= C.TICK_DT;
      p.pingAge += C.TICK_DT;
      if (lock) acquire(s, p, !was);
      if (was && !lock) p.pingIn = 0;
      if (p.state === "chase")
        p.chaseSpeed = Math.min(
          C.GLOAMFIN_CHASE_SPEED,
          p.chaseSpeed +
            ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * C.TICK_DT) /
              C.GLOAMFIN_RAMP_TIME,
        );
      if (
        p.state === "chase" &&
        p.fix &&
        p.tx === p.fix.tx &&
        p.ty === p.fix.ty &&
        !lock &&
        atCenter(p)
      ) {
        p.state = "search";
        p.searchTime = 0;
        p.searched = false;
      }
      if (p.state === "search") {
        p.searchTime += C.TICK_DT;
        if (p.searchTime >= C.GLOAMFIN_GIVEUP) {
          p.state = "wander";
          p.fix = null;
        }
      }
      if (!lock && p.pingAge >= C.GLOAMFIN_PING_MIN_GAP) {
        if (
          p.state === "search" &&
          !p.searched &&
          p.searchTime >= C.GLOAMFIN_SEARCH_DELAY
        ) {
          ping(s, p, i, "orange", cues);
          p.searched = true;
        } else if (p.pingIn <= 0) ping(s, p, i, "violet", cues);
      }
    } else {
      const blind = blinded(s, p);
      const sensed =
        !blind &&
        ((distance(p, f) <= (p.detectRange ?? 0) && lineClear(s, p, f)) ||
          (p.flaring && distance(p, f) <= C.FLARE_RADIUS));
      if (sensed) acquire(s, p);
      else if (p.state === "chase") {
        p.linger -= C.TICK_DT;
        if (blind || p.linger <= 0) {
          p.state = "wander";
          p.fix = null;
          p.flareIn = C.FLARE_INTERVAL;
        }
      }
      if (p.kind === "flarefish") {
        if (p.state === "chase") {
          if (p.flaring) p.fade = 0.4;
          p.flareCharging = false;
          p.flaring = false;
          p.flareTime = 0;
        } else if (p.flareCharging || p.flaring) {
          p.flareTime += C.TICK_DT;
          if (p.flareCharging && p.flareTime >= C.FLARE_CHARGE) {
            p.flareCharging = false;
            p.flaring = true;
            p.flareTime = 0;
            cues.add(C.CUES.flare);
          } else if (p.flaring && p.flareTime >= C.FLARE_BLOOM) {
            p.flaring = false;
            p.flareTime = 0;
            p.flareIn = C.FLARE_INTERVAL;
            p.fade = 0.4;
          }
        } else {
          p.flareIn -= C.TICK_DT;
          if (p.flareIn <= 0) {
            p.flareCharging = true;
            p.flareTime = 0;
          }
        }
        p.flareRadius = p.flaring ? C.FLARE_RADIUS : 0;
      }
    }
    reconcile(s);
    if (p.travel) {
      const choose = () => {
        const old = p.dir;
        let next: Direction;
        if (p.state === "chase" && p.fix) next = toward(s, p, p.fix);
        else if (
          p.state === "search" &&
          p.fix &&
          Math.abs(p.tx - p.fix.tx) + Math.abs(p.ty - p.fix.ty) >=
            C.GLOAMFIN_SEARCH_ROAM
        )
          next = toward(s, p, p.fix);
        else next = wander(s, p);
        if (
          p.kind === "gloamfin" &&
          p.state === "chase" &&
          next !== old &&
          next !== opposite(old)
        ) {
          p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
          p.speed = p.chaseSpeed;
        }
        return next;
      };
      if (!(
        p.state === "chase" &&
        p.fix &&
        p.tx === p.fix.tx &&
        p.ty === p.fix.ty &&
        atCenter(p)
      ))
        move(s, p, p.speed, choose);
    }
  });
}
function pulses(s: FathomState) {
  for (const p of s.pulses) {
    const old = p.front;
    p.front += C.SONAR_WAVE_SPEED * C.TICK_DT;
    const map = distances(s, p.ox, p.oy);
    const reached = (x: number, y: number) =>
      map[y]?.[x] > old && map[y]?.[x] <= p.front && map[y]?.[x] <= p.range;
    if (p.source === "forager") {
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++)
          if (reached(x, y)) {
            s.marks[y][x] = C.SONAR_MARK_TIME;
            for (const [dx, dy] of Object.values(vectors))
              if (
                tile(s, x + dx, y + dy) === "#" &&
                s.marks[y + dy]?.[x + dx] !== undefined
              )
                s.marks[y + dy][x + dx] = C.SONAR_MARK_TIME;
          }
      for (const hunter of s.predators)
        if (
          hunter.state !== "den" &&
          reached(hunter.tx, hunter.ty) &&
          hunter.kind !== "lanternjaw"
        ) {
          hunter.mark = C.SONAR_MARK_TIME;
          if (hunter.kind === "gloamfin" && hunter.mind)
            acquire(s, hunter, true);
        }
    } else if (!p.hit && reached(s.forager.tx, s.forager.ty)) {
      const hunter = s.predators[p.owner];
      if (hunter?.mind) acquire(s, hunter, true);
      p.hit = true;
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
}
export function illuminate(s: FathomState) {
  const f = s.forager;
  const flares = s.predators.filter((p) => p.flaring && p.state !== "den");
  const passive = (b: { x: number; y: number }) =>
    distance(f, b) <= s.visionRadius && lineClear(s, f, b);
  const flare = (b: { x: number; y: number }) =>
    flares.some((p) => distance(p, b) <= C.FLARE_RADIUS);
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const b = center(x, y);
      put(
        s.visibility,
        x,
        y,
        passive(b) || flare(b) || s.marks[y][x] > 0
          ? "l"
          : s.visibility[y][x] === "u"
            ? "u"
            : "r",
      );
    }
  for (const p of s.predators)
    p.lit =
      p.state !== "den" &&
      (passive(center(p.tx, p.ty)) ||
        flare(p) ||
        p.alert ||
        (p.kind !== "lanternjaw" && p.mark > 0));
  for (const d of s.drifters) d.lit = passive(center(d.tx, d.ty)) || flare(d);
}
function attempt(s: FathomState) {
  s.forager = { ...center(17, 13), dir: "left", moving: false };
  s.brightness = 0;
  s.brightHold = 0;
  s.predators = roster(s.depth);
  s.drifters = [];
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.pulses = [];
  s.inkClouds = [];
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.marks = s.marks.map((r) => r.map(() => 0));
  changeScreen(s, "countdown");
}
function down(value: number) {
  return value <= C.TICK_DT + 1e-10 ? 0 : value - C.TICK_DT;
}

export function tick(
  s: FathomState,
  held: boolean,
  actions: C.ActionName[],
  cues: Set<C.CueName>,
) {
  s.simTime += C.TICK_DT;
  s.screenTime += C.TICK_DT;
  if (s.screen === "countdown") {
    illuminate(s);
    if (s.screenTime >= 2) changeScreen(s, "playing");
    return;
  }
  if (s.screen === "cleared") {
    if (s.screenTime >= 2) {
      const fresh = initial();
      const { score, lives, depth, simTime, muted, titleIndex, remainder } = s;
      Object.assign(s, fresh, {
        score,
        lives,
        depth: depth + 1,
        simTime,
        muted,
        titleIndex,
        remainder,
      });
      s.predators = roster(s.depth);
      changeScreen(s, "countdown");
    }
    return;
  }
  if (s.screen !== "playing") return;
  s.sonar.cooldown = down(s.sonar.cooldown);
  s.ink.cooldown = down(s.ink.cooldown);
  if (actions.includes("a") && s.sonar.cooldown === 0) {
    s.pulses.push({
      source: "forager",
      tint: "cyan",
      ox: s.forager.tx,
      oy: s.forager.ty,
      front: -1e-6,
      range: s.sonar.range,
      owner: -1,
      hit: false,
    });
    s.sonar.cooldown = C.SONAR_COOLDOWN;
    cues.add(C.CUES.sonar);
  }
  if (actions.includes("b") && s.ink.cooldown === 0) {
    s.inkClouds.push({
      x: s.forager.x,
      y: s.forager.y,
      radius: C.INK_RADIUS,
      remaining: C.INK_LIFE,
    });
    s.ink.cooldown = C.INK_COOLDOWN;
    cues.add(C.CUES.ink);
  }
  const decay = Math.max(0, C.TICK_DT - s.brightHold);
  s.brightHold = Math.max(0, s.brightHold - C.TICK_DT);
  s.brightness *= Math.pow(0.5, decay / C.BRIGHT_HALFLIFE);
  const f = s.forager;
  if (held && s.desired === opposite(f.dir)) f.dir = s.desired;
  f.moving =
    held &&
    move(s, f, C.FORAGER_SPEED, () =>
      neighbor(s, f.tx, f.ty, s.desired) ? s.desired : f.dir,
    );
  if (s.plankton[f.ty]?.[f.tx] === "*" && tile(s, f.tx, f.ty) === ".") {
    put(s.plankton, f.tx, f.ty, "-");
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    cues.add(C.CUES.eat);
    reconcile(s);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      changeScreen(s, "cleared");
      cues.add(C.CUES.descend);
      return;
    }
  }
  for (const p of s.predators) p.mark = Math.max(0, p.mark - C.TICK_DT);
  for (const row of s.marks)
    for (let i = 0; i < row.length; i++)
      row[i] = Math.max(0, row[i] - C.TICK_DT);
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: c.remaining - C.TICK_DT }))
    .filter((c) => c.remaining > 0);
  reconcile(s);
  minds(s, cues);
  pulses(s);
  for (const d of s.drifters)
    if (d.mind && d.travel) move(s, d, C.DRIFTER_SPEED, () => wander(s, d));
  s.drifters = s.drifters.filter((d) => {
    if (d.tx === f.tx && d.ty === f.ty) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  s.drifterIn = Math.max(0, s.drifterIn - C.TICK_DT);
  if (
    s.drifterIn === 0 &&
    s.planktonRemaining > 0 &&
    s.drifters.length < C.DRIFTER_MAX
  ) {
    const y = s.tiles.findIndex((r) => r.includes("g"));
    if (y >= 0) {
      const x = s.tiles[y].indexOf("g");
      const n = directions.map((d) => neighbor(s, x, y, d)).find(Boolean);
      if (n) {
        s.drifters.push({
          ...center(n.tx, n.ty),
          dir: "up",
          mind: true,
          travel: true,
          lit: false,
        });
        s.drifterIn = C.DRIFTER_INTERVAL;
      }
    }
  }
  if (
    s.predators.some(
      (p) =>
        p.tx === f.tx &&
        p.ty === f.ty &&
        (p.state !== "den" || s.tiles.some((r) => r.includes("d"))),
    )
  ) {
    cues.add(C.CUES.caught);
    if (s.lives === 0) changeScreen(s, "gameover");
    else {
      s.lives--;
      attempt(s);
    }
  }
  s.playTime += C.TICK_DT;
  reconcile(s);
  illuminate(s);
}
export type { Pulse };
