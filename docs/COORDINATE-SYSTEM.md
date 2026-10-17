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
holds the whole U-turn) and `highway` (final shot, combination on the right, left ~40% clear). A
framing may set its own `maxDistance` and `portrait` overrides (target, fit, distance) for narrow
screens, where the final shot centres the combination instead of right-aligning it.

## Scroll → timeline

The pinned section maps scroll position to timeline progress 0–1 (`scroll.distanceVh` viewport
heights of scrolling). Phase windows in `SCENE_01_CONFIG.phases` are fractions of that progress and
become GSAP labels of the same name (`initial`, `approach`, `couplingHold`, `establish`,
`departure`, `highwayHold`, plus `end`).
