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
  Current files: puller-truck.glb 64 KB / 13.8k triangles, hydraulic-axle-trailer.glb 46 KB / 35.9k.

## Rebuilding the current vehicles

Both GLBs are generated, not hand-modelled: `tools/blender/build_vehicles.py` builds them in Blender
(GUI: run it from the Text Editor; headless: `blender --background --python tools/blender/build_vehicles.py -- <out> [Anton-Regular.ttf]`),
then `scripts/optimize-models.sh <out>` applies meshopt compression and GPU instancing. The loader
wires `MeshoptDecoder` in `configureModelLoader()`; meshopt is a required extension, so the files do
not load without it. Moving parts are pivot nodes: `fifth_wheel` (puller, at the coupling point) and
`gooseneck` (trailer, on the deck hinge). Wheels and bogies are GPU-instanced (one draw call per batch),
so they are NOT individually named nodes in the GLB.

See `docs/MODEL-REPLACEMENT-CHECKLIST.md` for the full hand-over checklist and
`docs/COORDINATE-SYSTEM.md` for the scene conventions.
