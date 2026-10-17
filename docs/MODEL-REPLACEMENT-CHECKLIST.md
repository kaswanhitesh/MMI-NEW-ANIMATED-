# Checklist: replacing the placeholders with the final 3D models

The animation timeline, camera and page layout never need to change for a model swap. For the
vehicles, only the files in `public/models/` and the entries in `src/three/assets/modelManifest.ts`
are involved. For the environments (garage, exit road, highway, city), see section 7.

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
      Keep the journey framings' (`base` … `entry`) `direction[0]` at 0 so the side views stay level; the
      factory framings (`doorway`, `loading`, `lift`) are three-quarter views by design.
- [ ] `departure.turnRadius` / `straightOut` / `straightIn` shape the U-turn;
      `departure.trailerTrackingLength` should be the distance from the trailer's kingpin back to the
      centre of its axle group once the real trailer is in. Keep the coupling anchors accurate: the
      departure pins the trailer's kingpin to the puller's fifth wheel through the turn.
- [ ] `journey.travel` sets how far the combination drives during the city phase;
      `environment.atmosphere` sets the daylight sky, haze and ground tone, and `departure.revealStart`
      when the daylight starts to come up.
- [ ] `scroll.distanceVh` and `scroll.scrub` set how long and how smooth the scrub feels.
- [ ] `lighting.*` and `environment.*` for the look. `lighting.key.shadowExtent` must cover the
      full combination.

## 6. Verify

- [ ] `npm run build` passes (`tsc -b` + Vite).
- [ ] Scroll forward and backward through the whole section on desktop and on a phone-sized
      viewport: both vehicles travel together from left and right, couple, the camera pulls out, the
      combination U-turns off the garage apron onto the highway and holds on the right with the garage
      (and its sign) behind it, then drives on as the garage slides away and the city opens up, and
      holds low on the left; it drives on to the Gemini Engi Fab factory, reverses into bay A and
      parks beside the vessel, which the crane lifts onto the trailer; scrolling up reverses all of it.
- [ ] Enable "reduce motion" in the OS and reload: the coupled combination is shown statically in
      the garage with the copy visible (`reducedMotion.frame` also offers `'highway'`, `'city'` and
      `'loaded'`).
- [ ] Temporarily rename one `.glb` to confirm the placeholder fallback still works — the site must
      stay usable without any model.
- [ ] Remove `placeholders.showBadge` only if you want to hide the badge in production; it never
      shows when both models load.

## 7. Replacing an environment (garage, exit road, highway, city)

Each environment is a slot in `src/scenes/scene-01-coupling/config.ts` (`environment.garage.slot`,
`environment.road.slot`, `environment.highway.slot`, `environment.city.slot`). The procedural
stand-ins only establish the spatial relationships; replace them one at a time.

- [ ] Author the model in the slot's LOCAL frame, in metres, Y up (see the table in
      `docs/COORDINATE-SYSTEM.md`): for the garage the facade's front plane is local z = 0, the hall
      runs to −Z and the forecourt to +Z, and the coupling area (world z ≈ 0, i.e. local z ≈ 26) must
      be clear, level ground. Keep it inside `slot.bounds` (set `environment.showSlotBounds: true`
      to see the boxes; keep it false in production).
- [ ] Put the file under `public/models/environment/` and set, for example:

      model: { url: `${import.meta.env.BASE_URL}models/environment/garage.glb`, scale: 1,
               position: [0, 0, 0], rotation: [0, 0, 0], castShadow: false, receiveShadow: true }

      `scale`, `position` and `rotation` correct the export inside the slot; `slot.position` /
      `slot.rotationY` move the whole environment (stand-in, model and attachments together) —
      except the exit road, whose stand-in follows the vehicle's path in world space and stays put.
- [ ] While the file loads, or if it is missing or invalid, the stand-in is shown and the dev
      console logs one `[environment] <name>: …` warning — nothing breaks.
- [ ] Garage: the model fades in with the approach like the stand-in (its materials are cloned and
      faded; once fully visible its own transparency, render order and shadow flags apply again).
      Unlike the stand-in, its meshes share one render order while part-faded, so inner surfaces can
      show through during the fade. The MEGA MOVE INDIA sign is an attachment of the slot and stays:
      leave its wall area clean (local x −42.8 … −31.8, y 7.7 … 11.6 on the facade plane: the board,
      its frame and the lamp wall plates; the lamp arms reach 1.3 m out from the wall), move it with
      `garage.sign.centre`, or set `garage.sign.enabled: false` if the model carries its own sign.
      The kerb gap and apron belong to the stand-in; the model must provide its own forecourt edge
      with an opening where the exit road leaves (world x ≈ −35 … −24.5 at z 16).
- [ ] Exit road: its stand-in follows the vehicle's path; a modelled road must cover the same band
      (`docs/COORDINATE-SYSTEM.md`) or the trailer's swept path will leave the paving.
- [ ] Highway and city: keep the highway's far lane centre at world z 28 (the vehicle's path) and the
      city entirely behind the garage (world z < −70) so nothing stands between the camera and the
      vehicle. The city must cover the views of the garage and the city journey (world x −1200 … 330 at
      the widest aspect) and keep its near buildings out from behind the industrial area and the
      factory (x 330 on), where only a distant skyline belongs: the drive leaves the city.
- [ ] A model smaller than its slot can be repeated: `model.instances` lists every placement (it
      replaces the single default copy at the slot origin; slot-local position and yaw; the model's own
      `position` / `rotation` / `scale` apply inside each).
      Static scenery with many nodes should set `model.mergeByMaterial: true` (one draw call per
      material per copy instead of one per node).
- [ ] Re-run the checks in section 6.

## 8. Replacing the factory, the crane and the cargo

The closing sequence's stand-ins live in `config.industry` (`zone`, `factory`, `crane`, `cargo`,
`supports`, `workpieces`). Same rules as section 7 — author each in its slot's LOCAL frame (stated
on each type in `src/three/industrial/types.ts`), set `slot.model`, and the stand-in remains the
fallback while the file loads or if it is missing.

- [ ] Factory (`industry.factory.slot`, frame: floor level on the front wall line, −Z into the hall,
      +Z to the road): keep bay A's door opening (local x 6 … 36, 18 m high), the gate (local x
      10 … 48 at z 13.5) and the floor of bay A clear — the combination reverses through them and
      parks there, and the camera flies through the door. The GEMINI ENGI FAB sign is an attachment
      of the slot (`industry.factory.sign`); disable it if the model carries its own.
- [ ] Crane (`industry.crane.slot`, frame: runway along local Z, span along X, floor at y = 0): the
      model must contain three nodes, `bridge` ⊃ `trolley` ⊃ `hook`, each a child of the previous
      one. The scene sets `bridge.position.z`, `trolley.position.x` and `hook.position.y` every frame
      from the crane pose (in the model's units), so author the trolley and hook with their origins
      at y = 0 on the crane's centre line and the hook's slinging point at the hook node's origin.
      Keep `model.position` and `model.rotation` at zero (the config validation warns otherwise; use
      `scale`, or move the slot) and do not set `mergeByMaterial` (it would merge the named nodes away).
      Hoist ropes must belong to the hook node (long enough to reach into the trolley at the lowest
      hook position). The spreader, slings and shackles stay procedural.
- [ ] Cargo (`industry.cargo.slot`, frame: the vessel's — axis along X, y = 0 at its lowest point,
      x = 0 at the shell middle): the slot frame moves with the vessel, so the model is lifted and
      carried without further work. Keep the dimensions in `industry.cargo.vessel` true to the model:
      the lug pins (`lugs.x`, `lugs.height`, `holeDiameter`) place the shackles, and `diameter` and
      the saddles' `height` place it on the supports.
- [ ] Saddles (`industry.supports.models.ground` / `.trailer`, frame: origin under the saddle centre
      on its base, X along the vessel axis): the vessel's lowest point rests at the saddle's
      `height`. The trailer saddles ride with the trailer; `loading.cargo.trailerDeckTop` must equal
      the final trailer model's deck height.
- [ ] Re-run the checks in section 6 and scroll through the factory sequence: the vessel must sit on
      its saddles at rest and after the set-down, the shackles on the lugs while it is lifted.
