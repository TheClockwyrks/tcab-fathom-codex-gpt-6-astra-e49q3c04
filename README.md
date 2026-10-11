# Fathom — Kindle

A bioluminescent deep-sea maze chase. Graze plankton to grow your light, send sonar around blind corners, and escape three hunters that track light, sound, and the flash of a flare. Explored corridors stay remembered, but only the circular window around you makes them visible. Clear the maze to descend into a denser predator roster.

## Run

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

The complete static site is emitted to `dist/`. Serve that directory at a server root or sub-path; artwork and scripts resolve relative to the page. No backend, external fonts, or runtime service is required.

## Controls

| Input | Action |
| --- | --- |
| Arrow keys / WASD | Swim while held; choose menu items |
| Space | Sonar pulse |
| Shift | Ink cloud |
| Enter / Space | Confirm a menu item |
| Escape / P | Pause or resume |
| Escape | Return from a menu or guide |
| M | Toggle sound |
| Backtick | Engine diagnostics |

Menus also accept pointer and touch. The engine supplies a directional pad and two action buttons on touch devices. Sonar and ink are unlimited and recharge between uses. You begin with three reserve lives in addition to the current attempt.

## Development

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The simulation advances at 120 ticks per second through the Simple 2D engine. Tests drive counted engine frames and exercise the same state transitions as play. `src/game.ts` exports the state contract, game, and debug API type; the engine exposes the debug poses through `engine.debug`. Nothing is installed on the browser's global object.

`src/simulation.ts` owns movement, sensing, and progression; `src/debug.ts` implements pure state poses; `src/presentation.ts` loads the seeded artwork and renders the screens. The store-page description and captured media live in `showcase/`.
