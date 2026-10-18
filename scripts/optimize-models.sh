#!/usr/bin/env bash
# Compresses the raw Blender exports into the GLBs served from public/models/.
#   scripts/optimize-models.sh <dir with *.raw.glb>
# meshopt geometry compression + GPU instancing of shared meshes (wheels, bogies).
# join / flatten / palette / simplify are OFF: they would merge the named moving
# parts (fifth_wheel, gooseneck, wheel_*) and replace the plain materials with a
# palette texture. Add `--texture-compress ktx2` (needs KTX-Software's `ktx` on
# PATH) only once a model carries real textures, and wire KTX2Loader at that point.
set -euo pipefail
src="${1:?usage: $0 <dir with *.raw.glb>}"
cd "$(dirname "$0")/.."
for raw in "$src"/*.raw.glb; do
  name="$(basename "$raw" .raw.glb)"
  npx -y @gltf-transform/cli@4 optimize "$raw" "public/models/$name.glb" \
    --compress meshopt --instance true --instance-min 2 \
    --join false --flatten false --palette false --simplify false
  ls -l "public/models/$name.glb"
done
