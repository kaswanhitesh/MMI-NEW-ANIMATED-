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

Environment models (garage, exit road, highway, city) are optional and go in
`public/models/environment/`. They are NOT looked up automatically: each one is switched on by
setting its slot's `model` in `src/scenes/scene-01-coupling/config.ts` (e.g.
`environment.garage.slot.model`), so no request is made for a file that does not exist yet. See
`docs/MODEL-REPLACEMENT-CHECKLIST.md`, section 7.

## Requirements for the delivered files

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
- Size budget: aim for ≤ 8 MB per model (compressed) and ≤ 300k triangles for the pair combined.

See `docs/MODEL-REPLACEMENT-CHECKLIST.md` for the full hand-over checklist and
`docs/COORDINATE-SYSTEM.md` for the scene conventions.
