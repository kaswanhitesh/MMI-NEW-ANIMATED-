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
  environment/              ProceduralEnvironment (RoomEnvironment PMREM), StageLighting, YardFloor,
                            EnvironmentSlot (replaceable environment groups) and the procedural
                            stand-ins: FleetGarage + BrandSign, AccessRoad, Highway, CityBackdrop;
                            DaylightSky; slotSpace (world ↔ slot-local maths); roadSurface (layers)

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
   │  initial → approach → couplingHold → establish → departure → highwayHold → city → cityHold
   │  approach: puller and trailer tween to their connected positions together; from 40% of it the
   │            fleet garage fades 0 → 1, reaching 1 as they arrive — it never fades out afterwards
   │  couplingHold / establish: camera stage 0 → 1 → 2 (push-in, then wide pull-out); caption in, then out
   │  departure: ONE scalar, departure.distance 0 → path length; camera stage 2 → 3 as the combination
   │             settles on the highway; atmosphere.daylight 0 → 1 from departure.revealStart to its end
   │  city: city.travel 0 → journey.travel extends the same path along the highway; camera stage 3 → 4
   │        (the city framing follows the combination, so the garage slides away behind it)
   │  tweens plain numbers on the rig
   ▼
CouplingRig { puller, trailer, departure.distance, city.travel, atmosphere.daylight, camera.stage,
              garage.opacity, overlay.* }
   │  read every frame (demand frameloop; the timeline calls invalidate())
   ▼
PoseResolver (departurePath.ts): rig → CouplingPose { puller, trailer: x, z, yaw }
   │  before the departure the approach positions pass straight through; during it the puller rides the
   │  path and the trailer's kingpin stays pinned to the fifth wheel while its rear tracks the path
   ▼
R3F stage: vehicle groups copy the pose; useFramedCamera walks base → heroHold → wide → highway → city;
           fog follows the framing, then blends to the daylight haze; the sky, apron and ground follow the
           daylight; the garage (and its sign) read their opacity; the key light and contact shadows
           follow the combination; overlay opacities are written to the DOM hero / caption elements
           environment slots: garage · road · highway · city — fixed in the world, never animated
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
- **Shadows** — one 2048² PCF shadow map on the key light, frustum fitted to the combination
  (`lighting.key.shadowExtent`); a drei `ContactShadows` plane grounds the vehicles. The key light,
  its target and the contact-shadow plane move with the combination centre, so the shadows stay sharp
  and present during the departure and the highway travel. three r186 removed `PCFSoftShadowMap`, so the
  key light's `shadow.radius` provides the softening.
- **Tone mapping and the horizon** — ACES tone mapping darkens dark colours, and the renderer's
  clear colour is not tone-mapped, so a fogged floor would show its far edge as a line. The floor
  and markings materials are therefore `toneMapped: false`; vehicles keep ACES.
- **Environment slots** — the garage, exit road, highway and city are independent environments,
  each rendered by `EnvironmentSlot` as a group named `environment:<name>` at its configured world
  transform (`environment.<name>.slot`). The procedural stand-in of each is authored in its slot's
  local space, so moving or rotating a slot moves everything that belongs to it. `slot.bounds` is the
  reserved box a replacement must fit (drawn as a wireframe with `environment.showSlotBounds`), and
  `slot.model` swaps the stand-in for a GLB loaded through the same validated loader as the vehicles:
  while it loads, or if the file is missing or invalid, the stand-in shows and a development warning
  is logged once. Attachments passed as slot children — the garage's wall sign — stay in the slot
  whichever geometry represents it. Geometry the scene derives in world space (the exit road follows
  the vehicle's path; the kerb and edge-line gaps follow the road) is mapped into each slot's frame
  with `slotSpace.ts`, so it stays aligned when a slot moves.
- **The garage** — `FleetGarage.tsx` is a bounded steel-framed hall: a clean branding wall, five open
  service bays, end walls, a parapet roofline, drive-through openings in the back wall, interior
  columns, trusses, luminaires, inspection zones, a few parked fleet units (the scene's own vehicle
  placeholders), and a concrete forecourt apron bounded by a kerb that breaks only where the exit
  road leaves. Static parts are one instanced mesh per material. Its materials are transparent with
  depth writes kept and explicit front-to-back render orders, and `rig.garage.opacity` is written to
  them (and to per-garage clones of the parked fleet's materials) every rendered frame: it fades in
  during the approach and then stays solid. It casts no shadows; the apron receives the vehicles'.
- **The wall sign** — `BrandSign.tsx` mounts a framed board on stand-off brackets with gooseneck
  lamps on the branding wall, lettered with the exact company name from `garage.sign.text` (drawn
  once into a canvas texture in the site's font stack, auto-fitted and evenly tracked; no logo). It
  is placed so that, with the level cameras, it is fully in frame in the establishing shot, through
  the U-turn and at the highway hold on screens of aspect ≥ 1.7, and out of the coupling shots.
- **Leaving the garage** — nothing in the environment moves or fades during the journey. The vehicle
  drives off the apron and along the highway, and the camera follows it, so the garage recedes behind
  it with true perspective and parallax (and slides out of frame during the city travel); scrolling
  back simply returns the camera and the vehicle. The city is opaque and always present: in the
  enclosed-yard atmosphere the short, dark fog swallows it, and as `atmosphere.daylight` comes up
  (sky dome, longer and lighter haze, daylight ground tone) it emerges in the distance — through the
  garage's drive-through openings and beyond the building's end — and the travel reveals the rest.
- **Fog per framing** — the responsive camera backs off far on phones and in the wide framings;
  `stage/fogDepths.ts` pushes the fog band out past the framed subject for every framing and the stage
  blends the depths with the camera stage, so the vehicles never fog out.
- **Level side views** — every camera framing looks along −Z (direction x = 0) with no roll, so any
  line parallel to X (chassis rails, deck, garage beams, road edges) projects exactly horizontal. The
  composition is moved by panning the camera parallel to the image plane: `targetOffset` moves the
  target in world space and `screenOffset` places the target at a given screen position (normalised
  device coordinates). The camera is never turned to reframe. `validateScene01Config` rejects a
  framing whose direction has a non-zero x.
- **Departure** — `departurePath.ts` is pure: a straight, a 180° left turn of `departure.turnRadius`
  and a straight onto the highway. The puller rides the path; the trailer is pinned at its kingpin to
  the puller's fifth wheel (manifest anchors) and points from a rear reference point further back along
  the path, the way a steered modular trailer tracks its tractor. One tweened distance drives both, so
  scrolling up replays exactly the same poses in reverse.
- **City journey** — forward travel is real: `city.travel` adds to the departure distance, so the
  combination keeps driving along the final straight and the road, its markings and the street lights
  pass under it at the true speed, with no looping or texture scrolling. The `city` framing has
  `follow: 1`, so the camera translates with the combination and it stays anchored bottom-left. The
  city stand-in (`CityBackdrop.tsx`) is deliberately simple: seeded rows of industrial sheds, mid-rise
  blocks and skyline towers behind the garage, one instanced mesh per material with per-instance tone
  variation. Its span covers the widest view (32:9) over the departure and the whole travel, so no
  edge comes into view. The sky (`DaylightSky.tsx`) is a camera-following gradient dome.
- **Road, highway and ground layers** — `AccessRoad.tsx` paves the exit road: the U-turn's band,
  10.5 m wide around the path, clipped at the apron kerb and at the far carriageway edge
  (`describeExitRoad`). `Highway.tsx` lays a two-way road with a generated grain texture (mipmapped,
  anisotropic), markings, shoulders, verges and street lights (none in front of the garage, where a
  pole would stand between the camera and the coupling). Both are opaque and permanent. Layers are
  separated by height so nothing coplanar can z-fight (`roadSurface.ts`): floor (pushed back with a
  polygon offset), apron 2 mm, yard markings 4 mm, highway surfaces 7 mm, exit road 11 mm, paint
  15 mm, contact shadows 20 mm.
- **Reduced motion** — `gsap.matchMedia` renders a completed composition statically with all copy
  visible; no pin, no scrub. `reducedMotion.frame` picks it: `'highway'` (the default: combination on
  the right, the garage and its sign behind it in daylight) or `'city'`. The default is the highway frame because the caption sits bottom-left, which
  is where the city composition puts the vehicle. CSS transitions are also disabled under the same media query.
- **No WebGL** — `SceneCanvas` probes first and renders a same-size text fallback; a runtime
  renderer failure hits the canvas error boundary and shows the same fallback.
- **Resize** — ScrollTrigger refreshes with `invalidateOnRefresh`; mobile address-bar resizes are
  ignored (`ignoreMobileResize`) to avoid pin jumps; R3F's own resize observer updates the camera.
- **Cleanup** — matchMedia revert kills the ScrollTrigger and tweens; PMREM targets, shadow maps
  and model geometries/materials are disposed on unmount.

## Build output

`npm run build` emits the app shell plus separate long-lived vendor chunks (`three`, `r3f`,
`gsap`) and a small per-scene chunk, so scene edits never re-download the 3D runtime.
