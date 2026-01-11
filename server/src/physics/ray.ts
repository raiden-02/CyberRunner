import RAPIER from "@dimforge/rapier3d-compat";

export function raycast(world: RAPIER.World, from: RAPIER.Vector3, dir: RAPIER.Vector3, max = 2.0) {
  const ray = new RAPIER.Ray(from, dir);
  const hit = world.castRay(ray, max, true);
  return hit;
}

export function raycastWithNormal(world: RAPIER.World, from: RAPIER.Vector3, dir: RAPIER.Vector3, max = 2.0) {
  const ray = new RAPIER.Ray(from, dir);
  const hit = world.castRayAndGetNormal(ray, max, true);
  return hit;
}
