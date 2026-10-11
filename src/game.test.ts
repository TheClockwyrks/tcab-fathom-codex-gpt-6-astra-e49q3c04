import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { game } from "./game";
import { debug } from "./debug";
import {
  initial,
  directions,
  neighbor,
  distances,
  layer,
  put,
  center,
} from "./simulation";
import * as C from "./constants";

beforeEach(() => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(new Blob())));
  vi.stubGlobal("createImageBitmap", () =>
    Promise.resolve(createCanvas(32, 32)),
  );
});
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const canvas = createCanvas(1280, 720);
  const target = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: 1280,
    height: 720,
    game,
    clock: new ConstantClock(1000 / C.TICK_HZ),
    surface: {
      cssWidth: () => 1280,
      cssHeight: () => 720,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();
  const key = (code: string, down = true) => {
    const event = new Event(down ? "keydown" : "keyup");
    Object.assign(event, { code, repeat: false });
    target.dispatchEvent(event);
  };
  return { engine, key };
}
function fixture() {
  const rows = layer("#");
  for (let x = 1; x < 35; x++) put(rows, x, 13, ".");
  return rows;
}
describe("maze", () => {
  it("is connected, symmetric, narrow, looped and within all proportions", () => {
    const s = initial();
    const cells = [];
    const map = distances(s, 17, 13);
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const t = s.tiles[y][x];
        if (!"dg".includes(t) && !"dg".includes(s.tiles[y][35 - x]))
          expect(t).toBe(s.tiles[y][35 - x]);
        if (t !== ".") continue;
        expect(map[y][x]).toBeLessThan(Infinity);
        const degree = directions.filter((d) => neighbor(s, x, y, d)).length;
        expect(degree).toBeGreaterThanOrEqual(2);
        expect(
          [
            s.tiles[y]?.[x + 1],
            s.tiles[y + 1]?.[x],
            s.tiles[y + 1]?.[x + 1],
          ].every((t) => t === "."),
        ).toBe(false);
        cells.push({ x, y, degree });
      }
    const openness = cells.reduce((n, c) => n + c.degree, 0) / cells.length;
    expect(openness).toBeGreaterThanOrEqual(C.MAZE_OPENNESS_MIN);
    expect(openness).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    expect(cells.length / 544).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    const seen = new Set<string>();
    const runs = [];
    for (const cell of cells.filter((c) => c.degree === 2)) {
      if (seen.has(`${cell.x},${cell.y}`)) continue;
      const queue = [cell];
      seen.add(`${cell.x},${cell.y}`);
      for (let i = 0; i < queue.length; i++)
        for (const d of directions) {
          const n = neighbor(s, queue[i].x, queue[i].y, d);
          const match =
            n &&
            cells.find((c) => c.x === n.tx && c.y === n.ty && c.degree === 2);
          if (match && !seen.has(`${match.x},${match.y}`)) {
            seen.add(`${match.x},${match.y}`);
            queue.push(match);
          }
        }
      runs.push(queue.length);
    }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
  });
});
describe("engine-driven simulation", () => {
  it("moves continuously while held, stops on release, and keeps the previous value immutable", async () => {
    const { engine, key } = await setup();
    engine.apply((s) => debug.clearPredators(debug.setScreen(s, "playing")));
    const old = engine.state;
    key("ArrowLeft");
    await engine.advance(30);
    expect(engine.state.forager.x).toBeCloseTo(old.forager.x - C.TILE);
    expect(old.forager.x).toBe(center(17, 13).x);
    key("ArrowLeft", false);
    const x = engine.state.forager.x;
    await engine.advance(30);
    expect(engine.state.forager.x).toBe(x);
    expect(engine.state.forager.moving).toBe(false);
    engine.destroy();
  });
  it("uses the same ticks regardless of frame partition", async () => {
    const a = await setup(),
      b = await setup();
    a.engine.setClock(new ConstantClock(1000 / 30));
    b.engine.setClock(new ConstantClock(1000 / 60));
    await a.engine.advance(30);
    await b.engine.advance(60);
    expect(a.engine.state.simTime).toBeCloseTo(1);
    expect(debug.snapshot(a.engine.state)).toEqual(
      debug.snapshot(b.engine.state),
    );
    a.engine.destroy();
    b.engine.destroy();
  });
  it("freezes play while paused and reads Escape once", async () => {
    const { engine, key } = await setup();
    engine.apply((s) => debug.setScreen(s, "playing"));
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("paused");
    const before = engine.state.playTime;
    await engine.advance(120);
    expect(engine.state.playTime).toBe(before);
    key("Escape", false);
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    engine.destroy();
  });
  it("decays brightness after its hold, independently of vision masking", async () => {
    const { engine } = await setup();
    engine.apply((s) =>
      debug.setBrightHold(
        debug.setBrightness(
          debug.clearPlankton(
            debug.clearPredators(debug.setScreen(s, "playing")),
          ),
          1,
        ),
        C.BRIGHT_HOLD,
      ),
    );
    await engine.advance(120);
    expect(engine.state.brightness).toBeCloseTo(1);
    await engine.advance(108);
    expect(engine.state.brightness).toBeCloseTo(0.5);
    expect(engine.state.windowRadius).toBeCloseTo(
      C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * 0.5,
    );
    engine.destroy();
  });
  it("sonar advances through corridors and marks only non-amber hunters", async () => {
    const { engine, key } = await setup();
    engine.apply((s) =>
      debug.setForagerTile(
        debug.clearPlankton(
          debug.clearPredators(
            debug.setMaze(debug.setScreen(s, "playing"), fixture()),
          ),
        ),
        5,
        13,
      ),
    );
    for (const kind of C.DEN_ORDER)
      engine.apply((s) =>
        debug.setPredatorMind(
          debug.addPredator(s, kind, 10, 13),
          s.predators.length,
          false,
        ),
      );
    key("Space");
    await engine.advance(1);
    expect(engine.state.predators.every((p) => !p.lit)).toBe(true);
    await engine.advance(44);
    expect(engine.state.predators.map((p) => p.lit)).toEqual([
      false,
      true,
      true,
    ]);
    expect(engine.state.visibility[13][10]).toBe("l");
    engine.destroy();
  });
  it("ink blinds light hunters but close hearing crosses rock and ink", async () => {
    const { engine, key } = await setup();
    engine.apply((s) =>
      debug.setForagerTile(
        debug.clearPlankton(
          debug.clearPredators(
            debug.setMaze(debug.setScreen(s, "playing"), fixture()),
          ),
        ),
        5,
        13,
      ),
    );
    for (const kind of C.DEN_ORDER)
      engine.apply((s) =>
        debug.setPredatorTravel(
          debug.addPredator(s, kind, 7, 13),
          s.predators.length,
          false,
        ),
      );
    key("ShiftLeft");
    await engine.advance(1);
    expect(engine.state.predators.map((p) => p.state)).toEqual([
      "wander",
      "chase",
      "wander",
    ]);
    expect(engine.state.predators[1].hearingLock).toBe(true);
    engine.destroy();
  });
  it("loses reserves, remembers eaten ground and ends only after zero reserves", async () => {
    const { engine } = await setup();
    engine.apply((s) => debug.clearPredators(debug.setScreen(s, "playing")));
    await engine.advance(1);
    const remaining = engine.state.planktonRemaining;
    engine.apply((s) =>
      debug.setPredatorMind(
        debug.addPredator(s, "lanternjaw", s.forager.tx, s.forager.ty),
        0,
        false,
      ),
    );
    await engine.advance(1);
    expect(engine.state.lives).toBe(C.START_LIVES - 1);
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.planktonRemaining).toBe(remaining);
    engine.apply((s) =>
      debug.setLives(debug.setScreen(debug.clearPredators(s), "playing"), 0),
    );
    engine.apply((s) =>
      debug.setPredatorMind(
        debug.addPredator(s, "gloamfin", s.forager.tx, s.forager.ty),
        0,
        false,
      ),
    );
    await engine.advance(1);
    expect(engine.state.screen).toBe("gameover");
    engine.destroy();
  });
  it("clears only by eating and descends with the expanded roster", async () => {
    const { engine } = await setup();
    engine.apply((s) =>
      debug.clearPlankton(debug.clearPredators(debug.setScreen(s, "playing"))),
    );
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    engine.apply((s) => debug.setPlankton(s, s.forager.tx, s.forager.ty, true));
    await engine.advance(1);
    expect(engine.state.score).toBe(C.SCORE_CLEAR + C.SCORE_PLANKTON);
    expect(engine.state.screen).toBe("cleared");
    await engine.advance(241);
    expect(engine.state.depth).toBe(2);
    expect(engine.state.predators).toHaveLength(4);
    expect(engine.state.screen).toBe("countdown");
    engine.destroy();
  });
  it("reconcile is pure, idempotent and does not relight cleared fog", () => {
    const s = debug.clearFog(debug.setBrightness(initial(), 1));
    const next = debug.reconcile(s);
    expect(debug.reconcile(next)).toEqual(next);
    expect(next.simTime).toBe(0);
    expect(next.visibility.every((r) => /^u+$/.test(r))).toBe(true);
    expect(s).toEqual(next);
    expect(() => debug.setDepth(s, 0)).toThrow();
    expect(() => debug.setMaze(s, ["bad"])).toThrow();
  });
});

describe("predator timing and debug fixtures", () => {
  it("staggers releases on live time while travel remains disabled", async () => {
    const { engine } = await setup();
    engine.apply((s) => debug.setScreen(s, "playing"));
    for (let i = 0; i < 3; i++)
      engine.apply((s) => debug.setPredatorTravel(s, i, false));
    await engine.advance(1);
    expect(engine.state.predators.map((p) => p.released)).toEqual([
      true,
      false,
      false,
    ]);
    await engine.advance(600);
    expect(engine.state.predators.map((p) => p.released)).toEqual([
      true,
      true,
      false,
    ]);
    expect(engine.state.predators.every((p) => p.state === "den")).toBe(true);
    engine.destroy();
  });
  it("charges, blooms through rock and remembers the lit disc", async () => {
    const { engine } = await setup();
    engine.apply((s) =>
      debug.clearPlankton(debug.clearPredators(debug.setScreen(s, "playing"))),
    );
    engine.apply((s) =>
      debug.setPredatorTravel(
        debug.addPredator(s, "flarefish", 28, 3),
        0,
        false,
      ),
    );
    await engine.advance(841);
    expect(engine.state.predators[0].flareCharging).toBe(true);
    await engine.advance(61);
    expect(engine.state.predators[0].flaring).toBe(true);
    expect(engine.state.visibility[3][28]).toBe("l");
    await engine.advance(121);
    expect(engine.state.predators[0].flaring).toBe(false);
    expect(engine.state.visibility[3][28]).toBe("r");
    engine.destroy();
  });
  it("a Gloamfin ping is audible but reveals no fog", async () => {
    const { engine } = await setup();
    engine.apply((s) =>
      debug.clearPlankton(debug.clearPredators(debug.setScreen(s, "playing"))),
    );
    engine.apply((s) =>
      debug.setPredatorTravel(
        debug.addPredator(s, "gloamfin", 28, 3),
        0,
        false,
      ),
    );
    await engine.advance(490);
    expect(engine.state.pulses.some((p) => p.tint === "violet")).toBe(true);
    expect(engine.state.visibility[3][28]).toBe("u");
    expect(engine.state.predators[0].lit).toBe(false);
    engine.destroy();
  });
  it("crosses the wrap in one continuous tile step", async () => {
    const { engine, key } = await setup();
    engine.apply((s) =>
      debug.setForagerDir(
        debug.setForagerTile(
          debug.clearPlankton(
            debug.clearPredators(debug.setScreen(s, "playing")),
          ),
          0,
          8,
        ),
        "left",
      ),
    );
    key("ArrowLeft");
    await engine.advance(30);
    expect(engine.state.forager.x).toBeCloseTo(center(35, 8).x);
    expect(engine.state.forager.ty).toBe(8);
    engine.destroy();
  });
  it("allows disconnected fixtures and holds bodies on tiles closed by a pose", async () => {
    const { engine, key } = await setup();
    engine.apply((s) =>
      debug.setMaze(
        debug.clearPredators(debug.setScreen(s, "playing")),
        layer("#"),
      ),
    );
    const before = engine.state.forager.x;
    key("ArrowLeft");
    await engine.advance(20);
    expect(engine.state.forager.x).toBe(before);
    expect(engine.state.screen).toBe("playing");
    expect(() => debug.spawnDrifter(engine.state, 1, 1)).toThrow();
    engine.destroy();
  });
});

describe("menu and pose contracts", () => {
  it("remembers the title selection and restarts a fresh dive", async () => {
    const { engine, key } = await setup();
    key("ArrowDown");
    await engine.advance(1);
    key("ArrowDown", false);
    key("Enter");
    await engine.advance(1);
    key("Enter", false);
    expect(engine.state.screen).toBe("howto");
    key("Escape");
    await engine.advance(1);
    key("Escape", false);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    engine.apply((s) => debug.setMenuIndex(s, 0));
    key("Enter");
    await engine.advance(1);
    key("Enter", false);
    expect(engine.state.screen).toBe("countdown");
    await engine.advance(240);
    expect(engine.state.screen).toBe("playing");
    engine.apply((s) =>
      debug.setMenuIndex(debug.setScreen(debug.setScore(s, 1000), "paused"), 1),
    );
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.score).toBe(0);
    expect(engine.state.depth).toBe(1);
    engine.destroy();
  });
  it("restores every run field on reset, retaining only the mute preference", () => {
    let s = initial();
    s.muted = true;
    s = debug.setDepth(s, 9);
    s = debug.setScore(s, 12345);
    s = debug.setLives(s, 18);
    s = debug.setBrightness(s, 1);
    s = debug.setDrifterIn(s, 0);
    s = debug.setSonarCooldown(s, 100);
    s = debug.setInkCooldown(s, 100);
    s = debug.spawnDrifter(s, 1, 1);
    s = debug.setDrifterMind(s, 0, false);
    s = debug.setDrifterTravel(s, 0, false);
    s = debug.setPredatorTile(s, 0, 1, 1);
    s = debug.setPredatorState(s, 0, "chase");
    s = debug.setPredatorDir(s, 0, "right");
    s = debug.setPredatorReleased(s, 0, true);
    expect(s.predators[0].speed).toBe(C.PREDATOR_SPEED);
    expect(debug.reset(s)).toEqual({ ...initial(), muted: true });
    expect(debug.menuItemRect(s, 99)).toBeNull();
    expect(() => debug.setPredatorState(s, 0, "den")).toThrow();
    expect(() => debug.setBrightness(s, 2)).toThrow();
    expect(() =>
      debug.setMenuIndex(debug.setScreen(s, "playing"), 0),
    ).toThrow();
  });
  it("a frozen hunter loses its sonar mark after the normal window", async () => {
    const { engine, key } = await setup();
    engine.apply((s) =>
      debug.setForagerTile(
        debug.clearPlankton(
          debug.clearPredators(
            debug.setMaze(debug.setScreen(s, "playing"), fixture()),
          ),
        ),
        5,
        13,
      ),
    );
    engine.apply((s) =>
      debug.setPredatorMind(debug.addPredator(s, "gloamfin", 10, 13), 0, false),
    );
    key("Space");
    await engine.advance(50);
    expect(engine.state.predators[0].lit).toBe(true);
    await engine.advance(181);
    expect(engine.state.predators[0].lit).toBe(false);
    engine.destroy();
  });
});
