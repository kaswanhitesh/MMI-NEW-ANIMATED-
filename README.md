# MMIPL — Cinematic 3D website (foundation + Scene 01)

Scroll-driven, cinematic 3D website for **Mega Move India Private Limited**, an Indian
project-logistics and heavy-haul transportation company. This milestone delivers the production
foundation and **Scene 01: a puller truck reverses onto a hydraulic axle trailer**, with an
extensible architecture for the four scenes that follow.

Stack: React 19 · Vite 8 · TypeScript · three.js · React Three Fiber · drei · GSAP + ScrollTrigger · plain CSS.

## Run it locally

```bash
npm install          # once
npm run dev          # http://localhost:5173
```

Scroll down through the first screen: the puller enters from the left, the trailer from the right,
they couple, and the finished combination holds. Scroll up and the sequence reverses.

Other scripts:

```bash
npm run typecheck    # tsc -b
npm run build        # tsc -b + vite build  → dist/
npm run preview      # serve the production build at http://localhost:4173
npm run lint         # oxlint
```

## The 3D models are not in the repo yet

Scene 01 expects two GLB files that are still being produced:

```
public/models/puller-truck.glb
public/models/hydraulic-axle-trailer.glb
```

While they are missing (or if a file is not a valid GLB), the scene renders **temporary placeholder
geometry** — plain boxes and cylinders that only communicate the silhouettes, clearly flagged by an
on-screen badge. Nothing breaks and the page keeps its layout. Dropping the files at those paths is
all that is needed to switch to the real models; see
[`public/models/README.md`](public/models/README.md) and
[`docs/MODEL-REPLACEMENT-CHECKLIST.md`](docs/MODEL-REPLACEMENT-CHECKLIST.md).

## Where things live

```
public/models/          GLB drop-in folder (documented), served at /models/*
src/
  main.tsx, App.tsx     entry + page composition
  site/                 global layout (header, footer), copy deck, hero/caption overlay, static sections
  styles/               design tokens, base, layout and scene CSS
  three/                scene-agnostic 3D engine layer
    assets/             model manifest, validated GLB loader, normalisation, Suspense/error fallback, status store
    placeholders/       TEMPORARY procedural stand-ins for the vehicles
    canvas/             SceneCanvas (DPR clamp, demand rendering, WebGL detection + fallback)
    camera/             responsive camera framing
    environment/        procedural environment, lighting rig, yard floor
  animation/            GSAP registration, reduced-motion hook, pinned scrub timeline helper
  scenes/
    types.ts            scene module / lifecycle contracts
    registry.ts         scene registry (Scene 01 implemented, Scenes 02–05 planned, never loaded)
    scene-01-coupling/  config.ts (ALL numbers), layout.ts, rig.ts, timeline hook, stage, vehicles, section
docs/                   architecture, coordinate system, model replacement checklist
```

Full explanation: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Coordinate conventions: [`docs/COORDINATE-SYSTEM.md`](docs/COORDINATE-SYSTEM.md).
