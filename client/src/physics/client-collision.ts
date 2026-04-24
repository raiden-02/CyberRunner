import { SHOOT_HOUSE_NEON } from "../world/maps/shoot-house-neon.js";

const CAPSULE_RADIUS = 0.35;

interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

let cachedAABBs: AABB[] | null = null;

function buildAABBs(): AABB[] {
  if (cachedAABBs) return cachedAABBs;
  
  const aabbs: AABB[] = [];
  const map = SHOOT_HOUSE_NEON;
  
  for (const obs of map.obstacles) {
    aabbs.push({
      minX: obs.x - obs.hx,
      maxX: obs.x + obs.hx,
      minZ: obs.z - obs.hz,
      maxZ: obs.z + obs.hz,
      minY: obs.y - obs.hy,
      maxY: obs.y + obs.hy,
    });
  }
  
  for (const occ of map.occluders) {
    aabbs.push({
      minX: occ.x - occ.hx,
      maxX: occ.x + occ.hx,
      minZ: occ.z - occ.hz,
      maxZ: occ.z + occ.hz,
      minY: occ.y - occ.hy,
      maxY: occ.y + occ.hy,
    });
  }
  
  const halfSize = map.boundsHalfSize;
  const wallHeight = map.wallHeight;
  const thick = map.wallThickness;
  
  aabbs.push({ minX: halfSize, maxX: halfSize + thick * 2, minZ: -halfSize, maxZ: halfSize, minY: 0, maxY: wallHeight });
  aabbs.push({ minX: -halfSize - thick * 2, maxX: -halfSize, minZ: -halfSize, maxZ: halfSize, minY: 0, maxY: wallHeight });
  aabbs.push({ minX: -halfSize, maxX: halfSize, minZ: halfSize, maxZ: halfSize + thick * 2, minY: 0, maxY: wallHeight });
  aabbs.push({ minX: -halfSize, maxX: halfSize, minZ: -halfSize - thick * 2, maxZ: -halfSize, minY: 0, maxY: wallHeight });
  
  cachedAABBs = aabbs;
  return aabbs;
}

function circleAABBIntersection(
  cx: number,
  cz: number,
  radius: number,
  aabb: AABB
): { penetration: number; normalX: number; normalZ: number } | null {
  const closestX = Math.max(aabb.minX, Math.min(cx, aabb.maxX));
  const closestZ = Math.max(aabb.minZ, Math.min(cz, aabb.maxZ));
  
  const dx = cx - closestX;
  const dz = cz - closestZ;
  const distSq = dx * dx + dz * dz;
  
  if (distSq >= radius * radius) {
    return null;
  }
  
  const dist = Math.sqrt(distSq);
  
  if (dist < 0.001) {
    const midX = (aabb.minX + aabb.maxX) / 2;
    const midZ = (aabb.minZ + aabb.maxZ) / 2;
    const toMidX = cx - midX;
    const toMidZ = cz - midZ;
    const halfW = (aabb.maxX - aabb.minX) / 2;
    const halfH = (aabb.maxZ - aabb.minZ) / 2;
    
    const overlapX = halfW + radius - Math.abs(toMidX);
    const overlapZ = halfH + radius - Math.abs(toMidZ);
    
    if (overlapX < overlapZ) {
      return {
        penetration: overlapX,
        normalX: toMidX > 0 ? 1 : -1,
        normalZ: 0,
      };
    } else {
      return {
        penetration: overlapZ,
        normalX: 0,
        normalZ: toMidZ > 0 ? 1 : -1,
      };
    }
  }
  
  const penetration = radius - dist;
  return {
    penetration,
    normalX: dx / dist,
    normalZ: dz / dist,
  };
}

export function resolveCollisions(
  x: number,
  y: number,
  z: number,
  radius: number = CAPSULE_RADIUS
): { x: number; z: number } {
  const aabbs = buildAABBs();
  let resolvedX = x;
  let resolvedZ = z;
  
  for (let iteration = 0; iteration < 4; iteration++) {
    let moved = false;
    
    for (const aabb of aabbs) {
      if (y < aabb.minY || y > aabb.maxY + 0.5) continue;
      
      const collision = circleAABBIntersection(resolvedX, resolvedZ, radius, aabb);
      if (collision && collision.penetration > 0.001) {
        resolvedX += collision.normalX * collision.penetration;
        resolvedZ += collision.normalZ * collision.penetration;
        moved = true;
      }
    }
    
    if (!moved) break;
  }
  
  return { x: resolvedX, z: resolvedZ };
}
