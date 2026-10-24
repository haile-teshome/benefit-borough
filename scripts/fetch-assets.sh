#!/usr/bin/env bash
# Downloads the CC0 KayKit models used by Expire Valley into public/models/kaykit.
# Source: Kay Lousberg (kaylousberg.com), official GitHub repos, License: CC0 1.0.
set -euo pipefail
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/models/kaykit"
HEX="https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0/main/addons/kaykit_medieval_hexagon_pack/Assets/gltf"
ADV="https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf"
mkdir -p "$OUT/hex" "$OUT/characters"

get() { # url dest
  [ -s "$2" ] || curl -sSfL "$1" -o "$2"
}

hex_models=(
  tiles/base/hex_grass tiles/base/hex_water tiles/base/hex_grass_sloped_low tiles/base/hex_grass_sloped_high
  buildings/neutral/building_dirt buildings/neutral/building_grain buildings/neutral/fence_wood_straight buildings/neutral/fence_wood_straight_gate buildings/neutral/building_bridge_A
  buildings/green/building_windmill_green buildings/green/building_well_green buildings/green/building_market_green buildings/green/building_tavern_green buildings/green/building_watermill_green buildings/green/building_church_green
  buildings/red/building_home_A_red buildings/blue/building_home_A_blue buildings/yellow/building_home_A_yellow buildings/green/building_home_A_green
  buildings/red/building_home_B_red buildings/blue/building_home_B_blue buildings/yellow/building_home_B_yellow buildings/green/building_home_B_green
  decoration/nature/trees_A_large decoration/nature/trees_A_medium decoration/nature/trees_A_small decoration/nature/trees_B_large decoration/nature/trees_B_medium decoration/nature/trees_B_small
  decoration/nature/tree_single_A decoration/nature/tree_single_B decoration/nature/rock_single_A decoration/nature/rock_single_B decoration/nature/rock_single_C decoration/nature/rock_single_D
  decoration/nature/hills_A_trees decoration/nature/hills_B_trees decoration/nature/hills_C_trees decoration/nature/mountain_A_grass_trees decoration/nature/mountain_B_grass_trees decoration/nature/mountain_C_grass_trees
  decoration/nature/cloud_big decoration/nature/cloud_small decoration/nature/waterlily_A decoration/nature/waterlily_B decoration/nature/waterplant_A decoration/nature/waterplant_B
  decoration/props/barrel decoration/props/crate_A_small decoration/props/sack decoration/props/wheelbarrow decoration/props/bucket_water decoration/props/resource_lumber
  decoration/props/flag_red decoration/props/flag_blue decoration/props/flag_yellow decoration/props/flag_green decoration/props/tent decoration/props/pallet
)
for m in "${hex_models[@]}"; do
  name="$(basename "$m")"
  get "$HEX/$m.gltf" "$OUT/hex/$name.gltf"
  get "$HEX/$m.bin" "$OUT/hex/$name.bin"
done
get "$HEX/tiles/base/hexagons_medieval.png" "$OUT/hex/hexagons_medieval.png"

for c in Mage Knight Barbarian Rogue Rogue_Hooded; do get "$ADV/$c.glb" "$OUT/characters/$c.glb"; done

# Quaternius Ultimate Animated Animal Pack (CC0 1.0, quaternius.com), via the quaternius-showcase mirror.
QUAT="https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/HEAD/public/glb/animals_pack"
mkdir -p "$OUT/../quaternius/animals"
for a in Fox ShibaInu Husky Deer Alpaca Cow; do get "$QUAT/$a.glb" "$OUT/../quaternius/animals/$a.glb"; done
printf 'Quaternius - Ultimate Animated Animal Pack\nLicense: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)\nSource: https://quaternius.com/packs/ultimateanimatedanimals.html\n' > "$OUT/../quaternius/LICENSE.txt"

get "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0/main/LICENSE.txt" "$OUT/LICENSE-hexagon.txt"
get "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/main/LICENSE.txt" "$OUT/LICENSE-adventurers.txt"
echo "KayKit assets in $OUT"
