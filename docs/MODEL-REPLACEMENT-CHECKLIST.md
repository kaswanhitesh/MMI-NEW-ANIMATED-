# Checklist: replacing the placeholders with the final 3D models

The animation timeline, camera and page layout never need to change for a model swap. Only the
files in `public/models/` and the entries in `src/three/assets/modelManifest.ts` are involved.

## 1. Receive and inspect the files

- [ ] You have **binary glTF** files (`.glb`), one per vehicle, textures embedded.
- [ ] Open each in a viewer (e.g. the three.js editor or any glTF viewer) and note:
      the up axis, which way the nose points, the unit (m / cm / mm), and roughly where the
      pivot (origin) sits.
- [ ] Check the triangle count and file size against the budget in `public/models/README.md`.
      Ask for Draco/meshopt-compressed versions if they are heavy, and wire the decoder in
      `configureModelLoader()` (`src/three/assets/ValidatedGLTFLoader.ts`).

## 2. Drop the files in place

- [ ] Copy to `public/models/puller-truck.glb` and `public/models/hydraulic-axle-trailer.glb`
      (exact names; the paths come from `MODEL_MANIFEST[...].path`).
- [ ] Start `npm run dev`. The on-screen "temporary placeholder" badge must disappear for each
      model that loads; the browser console must not show an `[assets]` warning for it.
      If the badge stays, hover it: the reason text tells you whether the file was not found,
      was not a GLB (an HTML page was served instead), or failed to parse.

## 3. Normalise scale, orientation and pivot

Edit the model's `normalisation` block in `src/three/assets/modelManifest.ts`:

- [ ] **Scale** — the vehicle should be life-size in metres (a puller is roughly 3.5–4 m tall).
      If it is 100× too big it was authored in centimetres: `scale: 0.01`.
- [ ] **Rotation** — the nose must point to −X (screen left) and the vehicle must stand upright.
      See the recipes in `docs/COORDINATE-SYSTEM.md`.
- [ ] **Grounding and centring** — leave `alignBottomToGround: true` and `centreFootprint: true`
      unless the model has detached parts (e.g. a separate shadow plane) that distort its bounds;
      in that case fix with `offset`.
- [ ] Re-check: tyres touch the floor (no floating, no sinking) and the vehicle is centred over
      its own position.

## 4. Set the coupling anchors

- [ ] Measure, **after** normalisation, the local coordinates of the puller's fifth-wheel / coupling
      plate and the trailer's gooseneck connection point (x along the vehicle, y height, z lateral,
      metres from the footprint centre at ground level).
- [ ] Enter them as `anchors.coupling` for each model. The final assembly positions are derived from
      these, so the vehicles will meet exactly at `assembly.couplingPoint`.
- [ ] If the two anchor heights differ by more than `assembly.anchorHeightTolerance`, the dev
      console warns — usually a sign the scale or grounding is wrong.
- [ ] Update `footprint` to the real envelope so development diagnostics stay meaningful.

## 5. Tune the composition (optional, config only)

In `src/scenes/scene-01-coupling/config.ts`:

- [ ] `assembly.couplingPoint.x` shifts the whole combination left/right.
- [ ] `phases.approach` sets how much of the pinned scroll the simultaneous travel occupies;
      `easing.approach` shapes it (both vehicles share it so they arrive together).
- [ ] `positions.pullerStart` / `positions.trailerStart` set where the vehicles appear from;
      keep them outside the visible width for the base framing.
- [ ] `camera.framings.*.fitWidth` tighten or loosen each framing (`base`, `heroHold`, `wide`,
      `highway`, `city`); `camera.framings.highway.targetOffset[0]` moves the highway combination
      left/right and `camera.framings.city.screenOffset` places the final city composition on screen.
      Keep every framing's `direction[0]` at 0 so the side views stay level.
- [ ] `departure.turnRadius` / `straightOut` / `straightIn` shape the U-turn;
      `departure.trailerTrackingLength` should be the distance from the trailer's kingpin back to the
      centre of its axle group once the real trailer is in. Keep the coupling anchors accurate: the
      departure pins the trailer's kingpin to the puller's fifth wheel through the turn.
- [ ] `journey.travel` sets how far the combination drives during the city phase;
      `environment.city` sets the skyline layout, palette, haze and street lights.
- [ ] `scroll.distanceVh` and `scroll.scrub` set how long and how smooth the scrub feels.
- [ ] `lighting.*` and `environment.*` for the look. `lighting.key.shadowExtent` must cover the
      full combination.

## 6. Verify

- [ ] `npm run build` passes (`tsc -b` + Vite).
- [ ] Scroll forward and backward through the whole section on desktop and on a phone-sized
      viewport: both vehicles travel together from left and right, couple, the camera pulls out, the
      combination U-turns onto the highway and holds on the right, then drives on as the city fades in
      and holds low on the left; scrolling up reverses all of it.
- [ ] Enable "reduce motion" in the OS and reload: the finished combination is shown statically
      on the highway (or in the city, with `reducedMotion.frame: 'city'`) with the copy visible.
- [ ] Temporarily rename one `.glb` to confirm the placeholder fallback still works — the site must
      stay usable without any model.
- [ ] Remove `placeholders.showBadge` only if you want to hide the badge in production; it never
      shows when both models load.
