import type { InitApi, RenderApi } from "@clockwyrks/simple-2d";
import type { FathomState, ReadState, Direction } from "./game";
import { BACKGROUND, menuItems, menuRect } from "./game";
import * as C from "./constants";
import {
  center,
  distances,
  tile,
  directions,
  neighbor,
  lineClear,
} from "./simulation";
// Immutable decoded art is a render resource, never simulation state.
const art: Record<string, ImageBitmap[]> = {};
export async function loadArt(api: InitApi<FathomState>) {
  await Promise.all(
    [
      ["glimmerfin", 8],
      ["lanternjaw", 16],
      ["gloamfin", 8],
      ["flarefish", 8],
      ["drifter", 8],
      ["flare-bloom", 8],
      ["trench-walls", 19],
    ].map(async ([name, count]) => {
      const key = String(name);
      art[key] = await Promise.all(
        Array.from({ length: Number(count) }, (_, i) =>
          api.assets.loadImage(`${key}/${i}.png`),
        ),
      );
    }),
  );
}
const cyan = "#7df5e6",
  dim = "#56757e",
  white = "#dfefec";
const facing: Record<Direction, number> = { down: 0, up: 2, left: 4, right: 6 };
export function render(s: ReadState, { ctx: c }: RenderApi) {
  c.imageSmoothingEnabled = false;
  const text = (
    value: string,
    x: number,
    y: number,
    size = 16,
    color = white,
  ) => {
    c.font = `${size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    c.fillStyle = color;
    c.fillText(value, x, y);
  };
  const line = (
    x: number,
    y: number,
    x2: number,
    y2: number,
    color = "#1d3940",
  ) => {
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x2, y2);
    c.stroke();
  };
  const sprite = (
    key: string,
    frame: number,
    x: number,
    y: number,
    size = C.TILE,
  ) => {
    const image = art[key]?.[frame];
    if (image) c.drawImage(image, x - size / 2, y - size / 2, size, size);
  };
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const disc = (x: number, y: number, r: number) => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
  };
  const terrain = (force = false) => {
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const v = s.visibility[y][x];
        if (v === "u" && !force) {
          const p = center(x, y);
          sprite("trench-walls", 17, p.x, p.y);
          continue;
        }
        const t = tile(s, x, y);
        let frame = 16;
        if (t === "#")
          frame =
            (tile(s, x, y - 1) === "#" ? 1 : 0) +
            (tile(s, x + 1, y) === "#" ? 2 : 0) +
            (tile(s, x, y + 1) === "#" ? 4 : 0) +
            (tile(s, x - 1, y) === "#" ? 8 : 0);
        else if (t === "g") frame = 18;
        const p = center(x, y);
        c.globalAlpha = force ? 1 : v === "l" ? 1 : 0.28;
        sprite("trench-walls", frame, p.x, p.y);
        if (s.plankton[y][x] === "*") {
          c.fillStyle = cyan;
          c.shadowColor = cyan;
          c.shadowBlur = v === "l" ? 9 : 0;
          disc(p.x, p.y, C.PLANKTON_DOT / 2);
          c.fill();
          c.shadowBlur = 0;
        }
      }
    c.globalAlpha = 1;
  };
  const amber = (x: number, y: number) => {
    glow(x, y, 22, "#f574344d");
    c.fillStyle = "#ffb46a";
    disc(x, y, 3);
    c.fill();
  };
  const world = () => {
    c.save();
    c.beginPath();
    c.rect(
      C.GRID_ORIGIN_X,
      C.GRID_ORIGIN_Y,
      C.GRID_COLS * C.TILE,
      C.GRID_ROWS * C.TILE,
    );
    c.clip();
    c.fillStyle = BACKGROUND;
    c.fillRect(
      C.GRID_ORIGIN_X,
      C.GRID_ORIGIN_Y,
      C.GRID_COLS * C.TILE,
      C.GRID_ROWS * C.TILE,
    );
    c.save();
    disc(s.forager.x, s.forager.y, s.windowRadius);
    c.clip();
    terrain();
    glow(s.forager.x, s.forager.y, s.windowRadius, "#2cd9c312");
    for (const p of s.predators)
      if (p.kind === "lanternjaw" && p.state !== "den") amber(p.x, p.y);
    for (const d of s.drifters) amber(d.x, d.y);
    c.restore();
    for (const p of s.predators)
      if (p.flaring) {
        c.save();
        disc(p.x, p.y, C.FLARE_RADIUS);
        c.clip();
        terrain(true);
        c.restore();
      }
    for (const pulse of s.pulses) {
      const map = distances(s, pulse.ox, pulse.oy);
      c.strokeStyle =
        pulse.tint === "cyan"
          ? cyan
          : pulse.tint === "violet"
            ? "#b48fff"
            : "#ff9a58";
      c.shadowColor = c.strokeStyle;
      c.shadowBlur = 14;
      c.lineWidth = 3;
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++) {
          const delta = pulse.front - map[y][x];
          if (delta < 0 || delta > 1.4) continue;
          const p = center(x, y);
          c.globalAlpha = 1 - delta / 1.4;
          // A crest crosses each BFS edge, so branches and bends carry the wave.
          for (const d of directions) {
            const n = neighbor(s, x, y, d);
            if (!n || map[n.ty][n.tx] !== map[y][x] + 1) continue;
            const dx = d === "left" ? -1 : d === "right" ? 1 : 0;
            const dy = d === "up" ? -1 : d === "down" ? 1 : 0;
            const travel = Math.min(1, delta) * C.TILE;
            const px = p.x + dx * travel,
              py = p.y + dy * travel;
            c.beginPath();
            c.moveTo(px - dy * 11, py + dx * 11);
            c.lineTo(px + dy * 11, py - dx * 11);
            c.stroke();
          }
        }
      c.globalAlpha = 1;
      c.shadowBlur = 0;
    }
    for (const d of s.drifters)
      if (d.lit) sprite("drifter", Math.floor(s.simTime * 8) % 8, d.x, d.y);
    for (const p of s.predators) {
      if (p.lit) {
        const frame =
          p.kind === "lanternjaw" && p.state === "wander"
            ? 8 + (Math.floor(s.simTime * 8) % 8)
            : facing[p.dir] + (Math.floor(s.simTime * 7) % 2);
        const passive =
          Math.hypot(p.x - s.forager.x, p.y - s.forager.y) <= s.visionRadius &&
          lineClear(s, s.forager, p);
        const flared = s.predators.some(
          (f) =>
            f.flaring && Math.hypot(f.x - p.x, f.y - p.y) <= C.FLARE_RADIUS,
        );
        c.globalAlpha =
          !passive && !flared && !p.alert && p.mark > 0
            ? Math.max(0.15, p.mark / C.SONAR_MARK_TIME)
            : 1;
        sprite(p.kind, frame, p.x, p.y);
        c.globalAlpha = 1;
      }
      if (p.alert) {
        c.globalAlpha = p.alertLeft / C.ALERT_TIME;
        c.strokeStyle = p.kind === "gloamfin" ? "#bc98ff" : "#ffb264";
        c.lineWidth = 2;
        disc(p.x, p.y, 18 + (1 - p.alertLeft / C.ALERT_TIME) * 28);
        c.stroke();
        c.globalAlpha = 1;
      }
      if (p.flareCharging || p.flaring || p.fade > 0) {
        const frame = p.flareCharging
          ? Math.min(2, Math.floor((p.flareTime / C.FLARE_CHARGE) * 3))
          : p.flaring
            ? 3 + Math.min(2, Math.floor((p.flareTime / C.FLARE_BLOOM) * 3))
            : p.fade > 0.2
              ? 6
              : 7;
        sprite("flare-bloom", frame, p.x, p.y, C.FLARE_RADIUS * 2);
      }
    }
    for (const cloud of s.inkClouds) {
      glow(cloud.x, cloud.y, cloud.radius, "#000000f5");
      c.fillStyle = "#010307cf";
      disc(cloud.x, cloud.y, cloud.radius * 0.78);
      c.fill();
    }
    glow(s.forager.x, s.forager.y, 38, "#70ffe744");
    sprite(
      "glimmerfin",
      facing[s.forager.dir] +
        (s.forager.moving ? Math.floor(s.simTime * 9) % 2 : 0),
      s.forager.x,
      s.forager.y,
    );
    c.restore();
    text("F A T H O M", 64, 34, 18, cyan);
    text(C.DIVE_LABEL, 64, 59, 12, dim);
    text(String(s.score).padStart(6, "0"), 510, 60, 48);
    text(`${s.planktonRemaining} MOTES REMAIN`, 990, 35, 14, dim);
    text(s.muted ? "M  SOUND OFF" : "M  SOUND ON", 1050, 59, 12, dim);
    line(64, 72, 1216, 72);
    line(64, 665, 1216, 665);
    text(`DEPTH ${s.depth}`, 64, 699, 18, cyan);
    for (let i = 0; i < s.lives; i++)
      sprite("glimmerfin", 6, 226 + i * 27, 694, 24);
    const gauge = (
      label: string,
      x: number,
      cooldown: number,
      total: number,
    ) => {
      text(label, x, 690, 12, dim);
      c.fillStyle = "#18323a";
      c.fillRect(x, 701, 165, 4);
      c.fillStyle = cyan;
      c.fillRect(x, 701, 165 * (1 - cooldown / total), 4);
      text(
        cooldown === 0 ? "READY" : `${cooldown.toFixed(1)}s`,
        x + 108,
        690,
        12,
        cyan,
      );
    };
    gauge("SPACE / SONAR", 465, s.sonar.cooldown, C.SONAR_COOLDOWN);
    gauge("SHIFT / INK", 720, s.ink.cooldown, C.INK_COOLDOWN);
    text("ESC  PAUSE", 1100, 699, 13, dim);
  };
  if (["playing", "paused", "countdown", "cleared"].includes(s.screen)) world();
  if (s.screen === "title" || s.screen === "gameover" || s.screen === "howto") {
    // A cartographic specimen plate introduces the abyss without revealing live fog.
    glow(910, 330, 360, "#0c605538");
    c.save();
    c.beginPath();
    c.rect(610, 90, 606, 550);
    c.clip();
    terrain(true);
    c.restore();
    c.fillStyle = "#030b12bb";
    c.fillRect(610, 80, 606, 580);
    for (const r of [120, 205, 285]) {
      c.strokeStyle = "#25444a";
      c.lineWidth = 1;
      disc(930, 345, r);
      c.stroke();
    }
    line(625, 345, 1210, 345);
    line(930, 85, 930, 631);
    glow(930, 345, 145, "#3cffcb25");
    sprite("glimmerfin", 6, 930, 345, 96);
    for (const [key, x, y] of [
      ["lanternjaw", 800, 490],
      ["gloamfin", 1060, 220],
      ["flarefish", 1070, 490],
    ] as const) {
      sprite(key, 6, x, y, 48);
      text(key.toUpperCase(), x - 45, y + 47, 10, dim);
    }
    text("01 / HADAL ZONE", 96, 70, 12, dim);
    text("A BIOLUMINESCENT MAZE CHASE", 100, 139, 13, cyan);
    text(
      s.screen === "gameover" ? "DIVE LOST" : C.TITLE_TEXT,
      92,
      260,
      s.screen === "gameover" ? 70 : 94,
      white,
    );
    text(
      s.screen === "gameover"
        ? `SCORE ${s.score}  /  DEPTH ${s.depth}`
        : C.TAGLINE_TEXT,
      100,
      306,
      20,
      cyan,
    );
    text("Every light is a choice.", 100, 354, 16, dim);
    text("Every echo has a listener.", 100, 380, 16, dim);
    line(96, 640, 1184, 640);
    text("KINDLE   /   THE LIGHT YOU CARRY", 100, 674, 12, dim);
    text("ARROWS / WASD     ENTER TO SELECT", 823, 674, 12, dim);
  }
  if (s.screen === "howto") {
    c.fillStyle = "#030b12f5";
    c.fillRect(64, 96, 1152, 520);
    text("FIELD GUIDE", 100, 155, 36, cyan);
    text("Learn what listens. Learn what glows.", 100, 194, 18, dim);
    const rows = [
      [
        "MOVE",
        "ARROWS / WASD",
        "Graze the glowing motes. Clear every corridor to descend.",
      ],
      [
        "SONAR",
        "SPACE",
        "Reveal paths around corners. Your echo also calls the Gloamfin.",
      ],
      [
        "INK",
        "SHIFT",
        "Blind the hunters of light. Sound still passes through.",
      ],
      [
        "LANTERNJAW",
        "HUNTS LIGHT",
        "An amber jelly may be a meal — or a mouth.",
      ],
      [
        "GLOAMFIN",
        "HUNTS SOUND",
        "Break its pursuit at corners. Listen for the violet sweep.",
      ],
      [
        "FLAREFISH",
        "HUNTS BY FLASH",
        "A warm bloom sees through stone. Ink buys you darkness.",
      ],
    ];
    rows.forEach((r, i) => {
      const y = 249 + i * 46;
      text(r[0], 100, y, 15, cyan);
      text(r[1], 295, y, 13, dim);
      text(r[2], 480, y, 13);
    });
    text(
      "Eating grows your light. Explored ground beyond your circle sinks back into darkness.",
      100,
      550,
      14,
      dim,
    );
    text(
      "ESC / P  PAUSE     M  MUTE          ENTER / ESC / CLICK  RETURN",
      100,
      593,
      14,
      cyan,
    );
  }
  if (s.screen === "paused") {
    c.fillStyle = "#030b12d9";
    c.fillRect(64, 80, 520, 576);
    text("SUSPENDED", 100, 265, 40, white);
    text("The deep can wait.", 100, 315, 17, dim);
  }
  if (s.screen === "countdown" || s.screen === "cleared") {
    c.fillStyle = "#030b12d9";
    c.fillRect(390, 280, 500, 135);
    text(
      s.screen === "cleared" ? `DEPTH ${s.depth} CLEARED` : "DIVE",
      450,
      335,
      32,
      cyan,
    );
    text(
      s.screen === "cleared"
        ? "Descending into colder water…"
        : `${Math.max(1, Math.ceil(2 - s.screenTime))}  /  FIND YOUR LIGHT`,
      450,
      379,
      17,
    );
  }
  menuItems(s).forEach((item, i) => {
    const r = menuRect(s, i)!;
    const selected = i === s.menuIndex;
    c.fillStyle = selected ? "#123b3f" : "#07171e";
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = selected ? cyan : "#1b343b";
    c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    text(selected ? "›" : "·", r.x + 17, r.y + 31, 23, selected ? cyan : dim);
    text(item, r.x + 48, r.y + 30, 17, selected ? white : dim);
    if (selected) text("↵", r.x + r.w - 34, r.y + 30, 17, cyan);
  });
}
