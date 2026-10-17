# Architecture

This document explains how the site is put together, what each folder is responsible for, and
how a new cinematic scene is added. Read `docs/COORDINATE-SYSTEM.md` for the spatial conventions
and `docs/MODEL-REPLACEMENT-CHECKLIST.md` for swapping placeholders for the real GLBs.

## Stack and the reasons for it

| Concern                    | Choice                                  | Why                                                                 |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| App shell                  | React 19 + Vite 8 + TypeScript (strict) | Fast builds, lazy code-splitting per scene, strict types everywhere |
| 3D                         | three.js + React Three Fiber + drei     | Declarative scene graph; drei only for `ContactShadows`             |
| Scroll-linked animation    | GSAP + ScrollTrigger                    | Pinning, scrubbing (both directions), labels, matchMedia contexts   |
| Styling                    | Plain CSS with custom properties        | No runtime cost, no framework look                                  |

No other runtime libraries are used.

## Folder responsibilities

```
public/models/              GLB drop-in folder (served at /models/*). README documents the hand-over.
src/main.tsx                React root (StrictMode) + global styles
src/App.tsx                 Page composition: header, scenes, static sections, footer

src/site/                   The ordinary website around the 3D scenes
  layout/                   SiteHeader (fixed, responsive nav), SiteFooter
  content/copy.ts           Every string of copy on the site — the editable copy deck
  hero/                     HeroCopy and SceneCaption (overlay text), PlaceholderBadge (asset status)
  sections/                 SceneHost (renders registry scenes), CapabilitiesSection, ContactSection

src/styles/                 tokens.css (palette/type/spacing), base.css (reset, focus, reduced motion),
                            layout.css (header/nav/sections/footer), scene.css (pinned-section contract)

src/three/                  Scene-agnostic 3D engine layer — nothing here knows about Scene 01
  assets/                   Model manifest + loader + normalisation + status store (see below)
  placeholders/             TEMPORARY procedural stand-ins for the vehicles
  canvas/                   SceneCanvas (WebGL probe, DPR clamp, demand frameloop, context loss,
                            error boundary, DOM fallback) and RenderingConfig
  camera/                   useFramedCamera: responsive framing from a FramedCameraSpec
  environment/              ProceduralEnvironment (RoomEnvironment PMREM), StageLighting, YardFloor

src/animation/              gsap.ts (single registration), useReducedMotion, scrollTimeline helpers

src/scenes/                 Cinematic scenes
  types.ts                  SceneModule / SceneDefinition contracts and the lifecycle
  registry.ts               SCENE_REGISTRY: Scene 01 implemented, Scenes 02–05 planned (never loaded)
  scene-01-coupling/        config.ts (ALL numbers) · layout.ts (derived positions + validation) ·
                            rig.ts (mutable animation state) · useCouplingTimeline.ts (GSAP) ·
                            stage/ (R3F contents) · vehicles/ (PullerTruck, HydraulicAxleTrailer) ·
                            CouplingScene.tsx (the pinned section) · index.ts (SceneModule)
docs/                       This file, coordinate system, model replacement checklist
```

## Data flow of Scene 01

```
scroll position
   │  ScrollTrigger (pin + scrub)
   ▼
GSAP timeline (duration 1, labels per phase)       ← config.phases / easing
   │  initial → approach → couplingHold → establish → departure → highwayHold
   │  approach: puller and trailer tween to their connected positions together; from 40% of it the
   │            fleet garage fades 0 → 1, reaching 1 as they arrive
   │  couplingHold / establish: camera stage 0 → 1 → 2 (push-in, then wide pull-out); caption in, then out
   │  departure: ONE scalar, departure.distance 0 → path length; garage 1 → 0 and highway 0 → 1 together
   │             over its first 35%; camera stage 2 → 3 as the combination settles on the highway
   │  tweens plain numbers on the rig
   ▼
CouplingRig { puller, trailer, departure.distance, camera.stage, garage, highway, overlay.* }
   │  read every frame (demand frameloop; the timeline calls invalidate())
   ▼
PoseResolver (departurePath.ts): rig → CouplingPose { puller, trailer: x, z, yaw }
   │  before the departure the approach positions pass straight through; during it the puller rides the
   │  path and the trailer's kingpin stays pinned to the fifth wheel while its rear tracks the path
   ▼
R3F stage: vehicle groups copy the pose; useFramedCamera walks base → heroHold → wide → highway;
           fog follows the framing; garage / highway / yard markings read their opacities;
           overlay opacities are written to the DOM hero / caption elements
```

The rig is the only bridge between the DOM world (GSAP) and the canvas world (three.js). The
timeline never touches a three.js object, so swapping a placeholder for a GLB — or the other way
round — cannot affect the animation.

### Configuration, not coordinates in components

`src/scenes/scene-01-coupling/config.ts` holds every tunable: start positions, coupling point,
approach distances, camera framing, lighting, environment, scroll distance and scrub smoothing,
phase windows, easing, DPR limits. `layout.ts` turns that into concrete start / final
positions and validates the config in development (anchors must meet at the coupling point,
phases must be contiguous and end at 1, entrances must travel in the documented directions).

Final positions are derived from `assembly.couplingPoint` and the models' `anchors.coupling`
(manifest), so they stay correct when the real models' anchors are entered. Explicit overrides
exist (`positions.pullerFinal` / `trailerFinal`) for hand-tuning.

### Asset layer (`src/three/assets/`)

- `modelManifest.ts` — where each GLB lives, its normalisation (scale, rotation, grounding,
  centring, offset), nominal footprint and anchor points.
- `ValidatedGLTFLoader.ts` — reads the bytes first and classifies them. A missing file on Vite's
  dev server or an SPA host comes back as `index.html` with HTTP 200; a plain GLTFLoader would
  choke on it. `ModelLoader` resolves such cases as an `unavailable` result instead of throwing,
  because React Three Fiber reports anything thrown in the canvas through `window.reportError`
  (it would look like a crash in the console and in error monitoring).
- `normalise.ts` — exact bounds after scale + rotation (per vertex, instancing-aware), then the
  grounding / centring offset.
- `ModelAsset.tsx` — the one component scenes use. Suspense fallback and unavailable fallback are
  both the supplied TEMPORARY placeholder; an error boundary guards against the unexpected.
- `modelStatusStore.ts` — `loading | gltf | placeholder` per model, read by the overlay badge.
- `modelCache.ts` — `preloadModel` (warm the cache when the scene code arrives) and
  `releaseModel` (dispose GPU memory when the scene unmounts).

### Placeholders (`src/three/placeholders/`)

Boxes and cylinders sized from the manifest footprint, with the coupling features on the manifest
anchors so the assembly maths is exercised before the real models exist. They are labelled
TEMPORARY in code and on screen, and make no claim to represent any real vehicle. Tyres and rims
are instanced (one draw call per set); a shared unit box / cylinder keeps GPU geometry to a minimum.

## Scene lifecycle and adding Scene 02+

1. **Register** — add a `SceneDefinition` to `SCENE_REGISTRY` with `status: 'planned'` first (it
   is listed on the Capabilities section, nothing is loaded).
2. **Implement** — create `src/scenes/scene-02-.../` with its own `config.ts`, a rig, a timeline
   hook (use `createPinnedScrubTimeline` from `src/animation/scrollTimeline.ts`), a stage, and a
   Section component that renders `<SceneCanvas>` + overlay. Export a `SceneModule` as default.
3. **Switch on** — set `status: 'implemented'` and `load: () => import('./scene-02-...')`.
   `SceneHost` lazy-loads it in a fixed-height skeleton (no layout shift) and calls `preload()`.
4. **Clean up** — the Section's unmount must revert its GSAP context (`gsap.matchMedia().revert()`
   does this) and release its models (`releaseModel`). `SceneCanvas` disposes the renderer.

Engine-layer pieces (`SceneCanvas`, `useFramedCamera`, `StageLighting`, `YardFloor`,
`ProceduralEnvironment`, the asset layer) take typed config blocks and are meant to be reused.

## Performance and robustness decisions

- **Demand frameloop** — the canvas renders only when something calls `invalidate()`: the timeline
  on every scrub update, components after imperative changes, the context-loss guard on restore.
  No rendering while the visitor reads.
- **DPR clamp** — `[1, 2]` on fine-pointer devices, `[1, 1.5]` on coarse-pointer devices.
- **Shadows** — one 2048² PCF shadow map on the key light, frustum fitted to the assembly area;
  a drei `ContactShadows` plane grounds the vehicles. three r186 removed `PCFSoftShadowMap`, so the
  key light's `shadow.radius` provides the softening.
- **Tone mapping and the horizon** — ACES tone mapping darkens dark colours, and the renderer's
  clear colour is not tone-mapped, so a fogged floor would show its far edge as a line. The floor
  and markings materials are therefore `toneMapped: false`; vehicles keep ACES.
- **Fleet-garage backdrop** — `src/three/environment/FleetGarage.tsx` is a procedural heavy-haul
  assembly hall (open service bays between steel columns, cladding, slab, interior column rows, roof
  trusses, luminaires, inspection zones) drawn through one instanced mesh per material, plus a few
  stationary fleet units that reuse the scene's own placeholder components. Its materials are
  transparent with depth writes kept and explicit front-to-back render orders, and the stage writes
  `rig.garage.opacity` into them (and into per-garage clones of the parked fleet's materials) every
  rendered frame, so the same scrubbed timeline fades it in and out. It casts no shadows, which would
  otherwise land at full strength before the building had appeared.
- **Fog per framing** — the responsive camera backs off far on phones and in the wide framings;
  `stage/fogDepths.ts` pushes the fog band out past the framed subject for every framing and the stage
  blends the depths with the camera stage, so the vehicles never fog out.
- **Departure** — `departurePath.ts` is pure: a straight, a 180° left turn of `departure.turnRadius`
  and a straight onto the highway. The puller rides the path; the trailer is pinned at its kingpin to
  the puller's fifth wheel (manifest anchors) and points from a rear reference point further back along
  the path, the way a steered modular trailer tracks its tractor. One tweened distance drives both, so
  scrolling up replays exactly the same poses in reverse.
- **Highway and ground layers** — `src/three/environment/Highway.tsx` lays a two-way road with a
  generated grain texture, markings, shoulders and verges, plus the paved access road the scene derives
  from the departure path (`describeAccessRoad`), which breaks the far verge at the junction. Layers are
  separated by height so nothing coplanar can z-fight: floor (pushed back with a polygon offset), yard
  markings 4 mm, access road 7 mm, highway 8 mm, paint 12 mm, contact shadows 20 mm.
- **Reduced motion** — `gsap.matchMedia` renders the completed combination statically with all copy
  visible; no pin, no scrub. CSS transitions are also disabled under the same media query.
- **No WebGL** — `SceneCanvas` probes first and renders a same-size text fallback; a runtime
  renderer failure hits the canvas error boundary and shows the same fallback.
- **Resize** — ScrollTrigger refreshes with `invalidateOnRefresh`; mobile address-bar resizes are
  ignored (`ignoreMobileResize`) to avoid pin jumps; R3F's own resize observer updates the camera.
- **Cleanup** — matchMedia revert kills the ScrollTrigger and tweens; PMREM targets, shadow maps
  and model geometries/materials are disposed on unmount.

## Build output

`npm run build` emits the app shell plus separate long-lived vendor chunks (`three`, `r3f`,
`gsap`) and a small per-scene chunk, so scene edits never re-download the 3D runtime.
