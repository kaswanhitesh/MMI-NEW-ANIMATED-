# Coordinate system and model conventions

Everything in the 3D scenes is expressed in **metres** in a right-handed, **Y-up** world.

| Axis | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| X    | Longitudinal (travel) axis. **Vehicle noses point to −X (screen left).** Couplings face +X. |
| Y    | Up. The common floor plane is `y = SCENE_01_CONFIG.world.groundY` (0).  |
| Z    | Towards the camera. Positive Z is nearer the viewer.                    |

## Scene 01 choreography in these terms

- The **puller truck** starts outside the frame at −X (left) and travels towards +X. Its nose points
  to −X, so it travels coupling-first, the way a puller is presented to a trailer.
- The **hydraulic axle trailer** starts outside the frame at +X (right) and travels towards −X with
  its front connection (gooseneck) leading.
- Both travel during the single `approach` phase, over the same timeline window with the same ease,
  so they move simultaneously and arrive together at `assembly.couplingPoint`. The puller's
  `anchors.coupling` and the trailer's `anchors.coupling` (model manifest) are brought to that world
  point, so the final positions are *derived*: `final = couplingPoint − anchor` (plus half of
  `connectedGap` on each side).
- After the coupling hold and the wide establishing shot, the coupled combination **departs**: the
  puller drives forward (−X) for `departure.straightOut`, makes a 180° **left** turn of radius
  `departure.turnRadius` (towards +Z, i.e. towards the camera), then drives `departure.straightIn`
  along +X onto the highway, where it ends in the far lane (left-hand traffic) facing +X.
- During the **city** phase the same path continues along +X for `journey.travel` metres. The city
  stands far behind the garage, at negative Z, so it never comes between the camera and the vehicle.
- During the **industrial** phase it continues along the same lane, past the industrial area, to a
  stop at world (490, 28) beyond the Gemini Engi Fab gate. The distance is derived: it is the far
  end of the **parking path** (`parking`), which runs from the parked puller (456, −30), facing +Z,
  straight out of bay A's door for `bayStraight`, through a left turn of `turnRadius` onto the lane,
  and `roadStraight` along it. The combination then **reverses** along that path (factory entry and
  parking phases): the trailer leads through the gate and the door and the puller ends parked facing
  the door, beside the vessel. The same trailer tracking keeps the kingpin on the fifth wheel.
- The **heavy lift** (craneApproach … release) moves only the cargo, the crane and the rigging; the
  combination stays parked. The vessel rests on ground saddles 7 m to the trailer's left (world
  x 463), is lifted until it clears every saddle horn by `loading.cargo.liftClearance`, carried
  along −X over the trailer deck (trailer-local x `deckOffset`), lowered onto the trailer saddles and
  released. Its axis stays parallel to the trailer's throughout.

### Environment layout (world)

| Environment | Slot origin (world)      | Extent                                                                 |
| ----------- | ------------------------ | ---------------------------------------------------------------------- |
| Garage      | `(0, 0, −26)`            | Facade front plane at z −26; hall to z −66; building x −50 … 35; forecourt apron to z 16 (kerb), x −90 … 90 |
| Exit road   | `(0, 0, 0)`              | Under the U-turn from the apron kerb (z 16) to the far carriageway edge (z 26.2), x ≈ −35 … −16 |
| Highway     | `(0, 0, 29.9)`           | Centre line at z 29.9 along X; carriageway z 26.15 … 33.65; verges to z 21.65 and 38.15 |
| City        | `(0, 0, −95)`            | Industry z −95 … −165, mid-rise z −170 … −290 (x −1200 … 330), skyline z −460 … −936 (x −1200 … 2400) |
| Industrial area | `(0, 0, 21.65)`      | Along the highway's far verge, x 300 … 1100 except 380 … 540 (the factory compound); compounds run to −Z |
| Factory     | `(430, 0, 6)`            | Front (door) wall at z 6, hall to z −114; bay B x 394 … 430, bay A x 430 … 472; bay A door x 436 … 466 (18 m high); yard to the boundary wall at z 19.5, gate x 440 … 478; driveway x 440 … 496 to the carriageway |
| Crane       | `(451, 0, 0)`            | Bay A's centre line; runway along Z inside the hall, span 40.3 m, rails at 17 m |
| Workpieces  | `(430, 0, 6)`            | The factory's frame: vessels standing in the fabrication stations |
| Cargo       | the vessel's frame       | Moves with the cargo pose (see `loading.ts`); rests at (463, 1.2, −44.05), loaded at (456, 1.7, −44.05) |

The coupling happens on the apron, 26 m in front of the facade. Each environment's stand-in is
authored in its slot's LOCAL space (slot origin + rotation about Y), so a slot can be moved or
rotated, or its stand-in replaced by a GLB authored in the same local frame (see the model
replacement checklist, section 7). Nothing in the environments moves during the scroll: forward
travel is the vehicle driving and the camera following it.

### Yaw convention during the departure

Vehicles rotate about Y only. A yaw of θ turns the local forward (−X) to world `(−cos θ, 0, sin θ)`:
θ = 0 faces −X (the assembly orientation), θ = π/2 faces +Z (towards the camera), θ = π faces +X.
The trailer's kingpin (its `anchors.coupling`) is kept exactly on the puller's fifth wheel (the
puller's `anchors.coupling`), so entering the real models' anchors keeps them coupled through the turn.

## Model local space (after normalisation)

Every model — placeholder or GLB — must obey the same local convention so the timeline can treat
them interchangeably:

- Local origin = **centre of the footprint at ground level** (x = 0, z = 0 at the centre of the
  bounding box; y = 0 at the lowest point, i.e. the tyre contact patch).
- Length runs along X, width along Z, height along Y.
- Nose at −X.

The asset layer (`src/three/assets/normalise.ts`) enforces the origin rule automatically when
`alignBottomToGround` and `centreFootprint` are true in the manifest; scale and orientation are
fixed with `normalisation.scale` and `normalisation.rotation`. The three transforms are applied in
this order: scale → rotation → automatic bounding-box fit → manual `offset`.

### Quick recipes for common export conventions

| Delivered model                              | Manifest `normalisation` change                       |
| -------------------------------------------- | ----------------------------------------------------- |
| Authored in centimetres                      | `scale: 0.01`                                         |
| Z-up (e.g. some CAD exports)                 | `rotation: [-Math.PI / 2, 0, 0]`                      |
| Nose points +Z                               | `rotation: [0, Math.PI / 2, 0]` (flip sign if reversed) |
| Nose points +X                               | `rotation: [0, Math.PI, 0]`                           |
| Pivot at the front axle instead of centre    | leave `centreFootprint: true` (automatic)             |
| Model floats / sinks after import            | leave `alignBottomToGround: true`; fine-tune `offset` |

## Camera

`SCENE_01_CONFIG.camera` describes the view as a **target** plus a **direction** from the target
towards the camera and a **fit width / fit height** in metres. The actual distance is derived at
runtime for the viewport's aspect ratio, so phones (portrait) and ultra-wides both keep the whole
combination in frame. The named framings are walked in `camera.sequence` order by one tweened
"stage" value: `base` (approach), `heroHold` (push-in while coupled), `wide` (establishing shot that
holds the whole U-turn), `highway` (combination on the right, left ~38% clear), `city` (combination in
the lower third on the left, right ~40–45% clear), `entry` (static wide shot of the factory front from
the road), `doorway` (at bay A's door, looking in), `loading` (inside bay A: the parked puller's
front in three-quarter view on the left, trailer and vessel beside and behind it, the right ~35–40%
of the frame clear) and `lift` (the same view pulled back with the subject lower, so the crane and
rigging are in frame while they work; the camera returns to `loading` for the final hold).

The journey framings (`base` … `city`, and the factory `entry` shot) have a direction with **x = 0**:
the camera looks straight along −Z, tilted down only, with no roll. Lines parallel to X therefore
stay horizontal on screen. Inside the factory, `doorway` and `loading` are three-quarter views (the
direction has an x component); the camera still has no roll, so verticals stay vertical. A framing
may set its own `fov` and a fixed `distance` (the doorway shot is pinned at the door so the camera
always passes through the opening). To place the subject, a framing moves the camera parallel to
the image plane, never turns it:

- `targetOffset` moves the look-at point in world metres.
- `screenOffset` puts the look-at point at a screen position in normalised device coordinates
  (−1 to 1; `[-0.39, -0.56]` is left of centre and low).
- `follow` (0–1) makes the camera translate with the combination's displacement from its coupled rest
  position, so a moving combination keeps its place on screen.

A framing may also set its own `maxDistance` and `portrait` overrides (target, fit, distance, follow,
screen offset) for narrow screens.

## Scroll → timeline

The pinned section maps scroll position to timeline progress 0–1 (`scroll.distanceVh` viewport
heights of scrolling). Phase windows in `SCENE_01_CONFIG.phases` are fractions of that progress and
become GSAP labels of the same name (`initial`, `approach`, `couplingHold`, `establish`,
`departure`, `highwayHold`, `city`, `cityHold`, `industrial`, `factoryEntry`, `parking`,
`craneApproach`, `rigging`, `lift`, `transfer`, `lowering`, `release`, `loadedHold`, plus `end`).
Each phase's scroll length is set in viewport heights (`SCENE_01_PHASE_VH`); the windows are derived
from it, so adding a phase never changes the pace of the others.
