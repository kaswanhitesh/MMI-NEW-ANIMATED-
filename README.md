# MMIPL — Cinematic 3D website (foundation + Scene 01)

Scroll-driven, cinematic 3D website for **Mega Move India Private Limited**, an Indian
project-logistics and heavy-haul transportation company. This milestone delivers the production
foundation and **Scene 01: a puller truck and a hydraulic axle trailer close on each other, couple in
MMI's fleet garage, depart and U-turn onto the highway, travel past a city and through an industrial
area to the Gemini Engi Fab factory, reverse inside, and have a pressure vessel lifted onto the trailer
by the factory's overhead crane**, with an extensible architecture for the four scenes that follow.

Stack: React 19 · Vite 8 · TypeScript · three.js · React Three Fiber · drei · GSAP + ScrollTrigger · plain CSS.

## Run it locally

```bash
npm install          # once
npm run dev          # http://localhost:5173
```

Scroll down through the first screen: the puller enters from the left and the trailer from the right
at the same time and they couple on the forecourt of MMI's fleet garage as the building appears
behind them. The camera then pulls out to show the whole facility, with the MEGA MOVE INDIA sign on
its branding wall and the highway in front. The coupled combination drives off the apron, makes a
broad left U-turn onto the highway and settles on the right of the frame with the left side clear.
The garage stays where it is; as the camera follows the vehicle it recedes behind it, while daylight
replaces the enclosed-yard atmosphere and an Indian city edge emerges through the garage's
drive-through openings and beyond the end of the building. Scrolling on, the combination drives
along the highway, the garage slides away behind it, and the city shot holds the combination low on
the left with the right side clear. Further on it drives past industrial compounds to the Gemini
Engi Fab factory, stops beyond its gate and reverses — trailer first — through the gate and the tall
bay door; the camera follows it inside, where it parks beside a 16 m pressure vessel on its ground
saddles. The bay's overhead crane travels over the vessel, its rigging is lowered onto the lifting
lugs and tensioned, and the vessel is lifted, carried sideways over the trailer, set down on the
trailer's saddles and released; the crane moves clear. The journey shots are level side views; the
factory shots are level (no roll) three-quarter views. Scroll up and every step reverses.

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

The environments — **garage, exit road, highway, city, industrial area and factory** — and the
heavy-lift equipment — **crane, cargo vessel, saddles and fabrication workpieces** — are temporary
procedural stand-ins too. Each lives in its own replaceable slot (`environment:<name>` in the scene
graph) with a configurable world transform and reserved bounds; setting its `slot.model` in
`src/scenes/scene-01-coupling/config.ts` swaps the stand-in for a detailed GLB without touching
the vehicle rig or the scroll timeline (see the checklist, sections 7 and 8).

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
    environment/        lighting rig, yard floor, environment slots and their procedural stand-ins
                        (garage + wall sign, exit road, highway, city), daylight sky
    industrial/         procedural stand-ins for the closing sequence: industrial zone, Gemini Engi Fab
                        factory, pressure vessels, saddles, overhead crane, lifting rig (types.ts = contracts)
  animation/            GSAP registration, reduced-motion hook, pinned scrub timeline helper
  scenes/
    types.ts            scene module / lifecycle contracts
    registry.ts         scene registry (Scene 01 implemented, Scenes 02–05 planned, never loaded)
    scene-01-coupling/  config.ts (ALL numbers), layout.ts, rig.ts, departurePath.ts (journey + parking paths),
                        loading.ts (heavy-lift choreography), timeline hook, stage, vehicles, section
docs/                   architecture, coordinate system, model replacement checklist
```

Full explanation: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Coordinate conventions: [`docs/COORDINATE-SYSTEM.md`](docs/COORDINATE-SYSTEM.md).
