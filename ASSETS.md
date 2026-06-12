# Assets

Source code is ISC. See `LICENSE`.

This is a non-commercial portfolio project. The repository owner has cleared the shipped media below for use in this repo. Exact original authors and licenses are not recorded in git.

## Weapon models

- `client/public/weapons/glTF/AR_1.gltf`
- `client/public/weapons/glTF/AR_2.gltf`
- `client/public/weapons/glTF/AR_4.gltf`
- `client/public/weapons/glTF/AR_5.gltf`
- `client/public/weapons/glTF/Pistol_1.gltf`
- `client/public/weapons/glTF/Sniper_1.gltf`
- `client/public/weapons/glTF/Sniper_2.gltf`
- `client/public/weapons/glTF/Grenade_2.gltf`
- `client/public/weapons/glTF/Grenade_3.gltf`

Each file's `asset.generator` string is `Khronos glTF Blender I/O v1.6.16` (exporter only).

## Skybox

- `client/public/skybox/cyberpunk/{px,nx,py,ny,pz,nz}.png`

Added in commit `999b10f`.

## Sounds in the tree

- `client/public/sounds/weapons/ar_shot.wav`
- `client/public/sounds/weapons/sniper_shot.wav`
- `client/public/sounds/weapons/generic_shot.wav`
- `client/public/sounds/footsteps/footstep.wav`

Added in commits `855ab25` and `c8cb01c`.

`AudioManager` also requests some `.ogg` UI/weapon files that are not in the repo. Those loads fail silently. Guns that have a `.wav` still play.
