# 3D model drop-in folder

Place the final production models here. The application looks for these exact paths
(served from the site root, so `public/models/x.glb` → `/models/x.glb`):

| Model                   | File                                   | Used by                      |
| ----------------------- | -------------------------------------- | ---------------------------- |
| Puller truck            | `public/models/puller-truck.glb`       | Scene 01 (`PullerTruck`)     |
| Hydraulic axle trailer  | `public/models/hydraulic-axle-trailer.glb` | Scene 01 (`HydraulicAxleTrailer`) |

Until a file exists — or if it is not a valid GLB — the scene renders a clearly labelled
**temporary placeholder** built from procedural geometry. The placeholder is a layout stand-in
only; it is not a representation of any real vehicle.

Environment and equipment models (garage, exit road, highway, city, industrial area, factory,
crane, cargo vessel, saddles, fabrication workpieces) are optional and go in
`public/models/environment/`. They are NOT looked up automatically: each one is switched on by
setting its slot's `model` in `src/scenes/scene-01-coupling/config.ts` (e.g.
`environment.garage.slot.model`, `industry.crane.slot.model`), so no request is made for a file that
does not exist yet. See `docs/MODEL-REPLACEMENT-CHECKLIST.md`, sections 7 and 8 (a crane model needs
`bridge`, `trolley` and `hook` nodes to be animated).

## Requirements for the delivered vehicle files

(Environment and equipment models are different: they are not normalised, grounded or centred.
Author them in their slot's local frame, in metres, Y up — see the checklist, sections 7 and 8.)

- Format: binary glTF 2.0 (`.glb`), single file, textures embedded. Draco / meshopt compression is
  supported once a decoder is wired in `src/three/assets/ValidatedGLTFLoader.ts` (`configureModelLoader`).
- Scale: ideally 1 unit = 1 metre. If not, set `normalisation.scale` in
  `src/three/assets/modelManifest.ts` (e.g. `0.01` for a model authored in centimetres).
- Orientation: ideally Y up, vehicle nose pointing to −X. If not, set `normalisation.rotation`
  (Euler XYZ, radians) in the manifest. Typical fix for a model whose nose points +Z: `[0, Math.PI / 2, 0]`
  (check in the browser; a wrong sign simply flips the vehicle).
- Pivot: anything. The loader measures the model and (by default) grounds it at y = 0 and centres
  it on x = 0 / z = 0. Use `normalisation.offset` for fine corrections.
- Coupling anchors: update `anchors.coupling` in the manifest to the real model's fifth-wheel
  (puller) / gooseneck connection (trailer) position, measured **after** normalisation. The timeline
  derives the final assembly positions from these anchors, so nothing else needs editing.
- Size budget (on the wire, after compression): hero model 0.6–1.5 MB and 40–100k triangles at most;
  Scene 01's models together ≤ 2.5 MB. The earlier 8 MB per model is far too heavy for mobile networks.
  Current files: puller-truck.glb 959 KB / 111k triangles / 42 draw calls and hydraulic-axle-trailer.glb 199 KB /
  29k unique triangles (100k drawn with the 24 instanced wheel pairs) / 19 draw calls. Both are produced by
  `scripts/slim-vehicle-glb.mjs`, which is what keeps Scene 01 smooth: it strips the clearcoat/specular material
  extensions (so three.js uses MeshStandardMaterial), joins every static part per material into one draw call, decimates
  the wheel/hose/box meshes and GPU-instances meshes used three or more times. Without it the same models cost
  331 draw calls per pass and 32 MeshPhysicalMaterials.

## Rebuilding the current vehicles

**Puller truck** — the 6x4 ballast tractor modelled in `art/blender/mmi-tractor-detailed.blend`
(collection `MMI_Tractor_Detailed`, scene `MMI_Puller_Detailed`). Export the collection with its root
empty at the origin as glTF Binary (+Y up, modifiers applied, no cameras/lights; the cab's wheelhouses are
a Boolean whose cutter, `cutter_wheelhouses_steps` in `MMI_Tractor_Cutters`, is parented to the root so it
moves with it — do not export the cutter), then run
`node scripts/slim-vehicle-glb.mjs in.raw.glb public/models/puller-truck.glb`.
It is a drawbar tractor: the rear hitch pivot is `mmi_tractor_coupling_jaw`, the front one
`mmi_tractor_front_coupling` (both kept as named nodes with their geometry); the wheels are two instanced
batches, `mmi_tractor_wheel_front_x3` and `mmi_tractor_wheel_twin_x4` (per-wheel pivots exist only in the
.blend — pass `--keep` a wider regex and accept the extra draw calls if a wheel must be animated on its own).
Everything else is merged per material under `MMI_Tractor_Detailed_static`. It carries one texture, the
MEGA MOVE logo decal on the ballast body (WebP, `EXT_texture_webp`).

**Hydraulic axle trailer** — a drawbar modular platform (two identical 6-line modules, 1.5 m axle pitch, 3.0 m
wide, deck top 1.2 m, pendulum axles with twin 17.5" wheels, 2.78 m A-frame towbar with a 50 mm towing eye) in
the same `.blend`, scene `MMI_Trailer_Modular`, collection `MMI_Trailer_Modular`. Export it headlessly from the
saved file (the live exporter picks up the active scene's selection):
`blender --background art/blender/mmi-tractor-detailed.blend --python tools/blender/export_trailer.py -- out.raw.glb`,
then `node scripts/slim-vehicle-glb.mjs out.raw.glb public/models/hydraulic-axle-trailer.glb`. Named parts in the
GLB: `trailer_towbar` (pivot on the headboard; the towing eye is 2.78 m ahead of it) and the instanced batches
`trailer_wheel_twin_x24` / `trailer_pendulum_arm_x24`; the deck modules, end plates, lamps, lettering and the
rear power pack (`tools/blender/add_trailer_power_pack.py`) are merged per material under
`MMI_Trailer_Modular_static`. The .blend keeps every line as `trailer_pendulum_NN_{L,R}` / `trailer_wheel_NN_{L,R}`.
It couples to the puller's rear hitch pin, so there is no gooseneck or fifth wheel any more.

The earlier generated gooseneck trailer is still reproducible from `tools/blender/build_vehicles.py` and
`scripts/optimize-models.sh`.

The loader wires `MeshoptDecoder` in `configureModelLoader()`; meshopt is a required extension, so the
files do not load without it.

See `docs/MODEL-REPLACEMENT-CHECKLIST.md` for the full hand-over checklist and
`docs/COORDINATE-SYSTEM.md` for the scene conventions.
