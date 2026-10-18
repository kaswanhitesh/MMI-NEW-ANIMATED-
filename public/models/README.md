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
  Current files: puller-truck.glb 964 KB / 179k triangles and hydraulic-axle-trailer.glb 176 KB / 137k (both over
  the triangle guideline: the detailed cab front and the 48 trailer tyres; wheel meshes are shared, so the file sizes
  stay small).

## Rebuilding the current vehicles

**Puller truck** — the 6x4 ballast tractor modelled in `art/blender/mmi-tractor-detailed.blend`
(collection `MMI_Tractor_Detailed`, scene `MMI_Puller_Detailed`). Export the collection with its root
empty at the origin as glTF Binary (+Y up, modifiers applied, no cameras/lights; the cab's wheelhouses are
a Boolean whose cutter, `cutter_wheelhouses_steps` in `MMI_Tractor_Cutters`, is parented to the root so it
moves with it — do not export the cutter), then compress with
`npx -y @gltf-transform/cli@4 optimize in.raw.glb public/models/puller-truck.glb --compress meshopt --instance false --join false --flatten false --palette false --simplify false --texture-compress webp --texture-size 1024`
(`--instance false` keeps every wheel as its own named pivot node). It is a drawbar tractor: the rear hitch
pivot is `mmi_tractor_coupling_jaw`, the front one `mmi_tractor_front_coupling`, the wheels
`mmi_tractor_wheel_{front,drive1,drive2}_{L,R}` (pivot empties at the hubs). It carries one texture, the
MEGA MOVE logo decal on the ballast body (WebP, `EXT_texture_webp`).

**Hydraulic axle trailer** — a drawbar modular platform (two identical 6-line modules, 1.5 m axle pitch, 3.0 m
wide, deck top 1.2 m, pendulum axles with twin 17.5" wheels, 2.78 m A-frame towbar with a 50 mm towing eye) in
the same `.blend`, scene `MMI_Trailer_Modular`, collection `MMI_Trailer_Modular`. Export it headlessly from the
saved file (the live exporter picks up the active scene's selection):
`blender --background art/blender/mmi-tractor-detailed.blend --python tools/blender/export_trailer.py -- out.raw.glb`,
then the same gltf-transform command as the puller (no texture flags needed). Named parts: `trailer_towbar`
(pivot on the headboard; the towing eye is 2.78 m ahead of it), `trailer_module_1/2`, `trailer_pendulum_NN_{L,R}`
and `trailer_wheel_NN_{L,R}` (twin pair per side, pivot at the hub) for lines 01–12. It couples to the puller's
rear hitch pin, so there is no gooseneck or fifth wheel any more.

The earlier generated gooseneck trailer is still reproducible from `tools/blender/build_vehicles.py` and
`scripts/optimize-models.sh`.

The loader wires `MeshoptDecoder` in `configureModelLoader()`; meshopt is a required extension, so the
files do not load without it.

See `docs/MODEL-REPLACEMENT-CHECKLIST.md` for the full hand-over checklist and
`docs/COORDINATE-SYSTEM.md` for the scene conventions.
