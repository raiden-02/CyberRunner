/**
 * SHOOT HOUSE NEON - MAP DATA
 * Shoot House (MW 2019) inspired layout with cyberpunk aesthetic.
 * COMPETITIVE FOCUS: Clean sightlines, clear lanes, minimal visual clutter.
 */
import type { ShootHouseMapDefinition } from "./map-types.js";

export const SHOOT_HOUSE_NEON: ShootHouseMapDefinition = {
  name: "shoot-house-neon",
  displayName: "Shoot House Neon",
  boundsHalfSize: 28,
  wallHeight: 4.5,
  wallThickness: 0.5,
  groundThickness: 0.1,

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSTACLES - Streamlined cover layout
  // ═══════════════════════════════════════════════════════════════════════════
  obstacles: [
    // ─────────────────────────────────────────────────────────────────────────
    // CENTRAL WALL (The iconic Shoot House mid-wall)
    // ─────────────────────────────────────────────────────────────────────────
    { x: 0, y: 1.5, z: 0, hx: 5, hy: 1.5, hz: 1 },

    // ─────────────────────────────────────────────────────────────────────────
    // LEFT LANE DIVIDER (thin wall separating left from center)
    // ─────────────────────────────────────────────────────────────────────────
    { x: -9, y: 1.5, z: -10, hx: 0.4, hy: 1.5, hz: 8 },
    { x: -9, y: 1.5, z: 10, hx: 0.4, hy: 1.5, hz: 8 },

    // Left lane cover
    { x: -18, y: 1.2, z: -14, hx: 1.5, hy: 1.2, hz: 1.5 },
    { x: -16, y: 1.2, z: 0, hx: 1.5, hy: 1.2, hz: 1.5 },
    { x: -18, y: 1.2, z: 14, hx: 1.5, hy: 1.2, hz: 1.5 },

    // Right lane divider
    { x: 9, y: 1.5, z: -10, hx: 0.4, hy: 1.5, hz: 8 },
    { x: 9, y: 1.5, z: 10, hx: 0.4, hy: 1.5, hz: 8 },

    // Right lane cover
    { x: 16, y: 1.2, z: -14, hx: 1.5, hy: 1.2, hz: 1.5 },
    { x: 18, y: 1.2, z: 0, hx: 1.5, hy: 1.2, hz: 1.5 },
    { x: 16, y: 1.2, z: 14, hx: 1.5, hy: 1.2, hz: 1.5 },

    // Center lane cover
    { x: -3, y: 1.1, z: -12, hx: 0.8, hy: 1.1, hz: 0.8 },
    { x: 3, y: 1.1, z: 12, hx: 0.8, hy: 1.1, hz: 0.8 },

    // Spawn area cover
    { x: -10, y: 1.2, z: -24, hx: 1.5, hy: 1.2, hz: 0.8 },
    { x: 10, y: 1.2, z: -24, hx: 1.5, hy: 1.2, hz: 0.8 },
    { x: -10, y: 1.2, z: 24, hx: 1.5, hy: 1.2, hz: 0.8 },
    { x: 10, y: 1.2, z: 24, hx: 1.5, hy: 1.2, hz: 0.8 },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // OCCLUDERS - Tall structures (buildings only)
  // ═══════════════════════════════════════════════════════════════════════════
  occluders: [
    // Left lane building
    { x: -24, y: 2.5, z: 0, hx: 3, hy: 2.5, hz: 8 },

    // Right lane building  
    { x: 24, y: 2.5, z: 0, hx: 3, hy: 2.5, hz: 8 },

    // Spawn sightline blocks
    { x: -5, y: 1.5, z: -20, hx: 1.5, hy: 1.5, hz: 1 },
    { x: 5, y: 1.5, z: -20, hx: 1.5, hy: 1.5, hz: 1 },
    { x: -5, y: 1.5, z: 20, hx: 1.5, hy: 1.5, hz: 1 },
    { x: 5, y: 1.5, z: 20, hx: 1.5, hy: 1.5, hz: 1 },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // BREAKABLES
  // ═══════════════════════════════════════════════════════════════════════════
  breakables: [
    { x: -5, y: 0.8, z: -5, hx: 1, hy: 0.8, hz: 1, hp: 50 },
    { x: 5, y: 0.8, z: 5, hx: 1, hy: 0.8, hz: 1, hp: 50 },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SPAWN PROTECTION ZONES
  // ═══════════════════════════════════════════════════════════════════════════
  spawnProtectionZones: [
    { x: 0, y: 2, z: -26, hx: 24, hy: 3, hz: 2 },
    { x: 0, y: 2, z: 26, hx: 24, hy: 3, hz: 2 },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SPAWN POINTS (shallow - fast re-engagement)
  // ═══════════════════════════════════════════════════════════════════════════
  spawnPoints: [
    // North spawns
    { x: -18, y: 1, z: -26 },
    { x: -8, y: 1, z: -26 },
    { x: 0, y: 1, z: -26 },
    { x: 8, y: 1, z: -26 },
    { x: 18, y: 1, z: -26 },

    // South spawns
    { x: -18, y: 1, z: 26 },
    { x: -8, y: 1, z: 26 },
    { x: 0, y: 1, z: 26 },
    { x: 8, y: 1, z: 26 },
    { x: 18, y: 1, z: 26 },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILDINGS (Visual only - collision handled by occluders)
  // ═══════════════════════════════════════════════════════════════════════════
  buildings: [
    // Left lane building
    { x: -24, y: 2.5, z: 0, hx: 3, hy: 2.5, hz: 8, type: "warehouse", windowColor: 0xd4893a },

    // Right lane building
    { x: 24, y: 2.5, z: 0, hx: 3, hy: 2.5, hz: 8, type: "bar", windowColor: 0x4a8b8a },

    // Central billboard structure (visual only)
    { x: 0, y: 4, z: 0, hx: 6, hy: 4, hz: 1.5, type: "billboard", windowColor: 0xd4893a },
  ],

  catwalks: [],
  ramps: [],

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTORS (Fast flank routes between lanes)
  // ═══════════════════════════════════════════════════════════════════════════
  connectors: [
    // Left-to-Center
    { x: -6, y: 1.5, z: -6, hx: 1.5, hy: 1.5, hz: 1.5, type: "doorway", lighting: "warm" },
    { x: -6, y: 1.5, z: 6, hx: 1.5, hy: 1.5, hz: 1.5, type: "doorway", lighting: "warm" },

    // Center-to-Right
    { x: 6, y: 1.5, z: -6, hx: 1.5, hy: 1.5, hz: 1.5, type: "doorway", lighting: "cool" },
    { x: 6, y: 1.5, z: 6, hx: 1.5, hy: 1.5, hz: 1.5, type: "doorway", lighting: "cool" },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // NEON SIGNS (Minimal - key landmarks only)
  // ═══════════════════════════════════════════════════════════════════════════
  neonSigns: [
    // Central billboard (primary landmark)
    { x: 0, y: 5, z: 1.6, width: 8, height: 2.5, rotationY: 0, color: "orange", flicker: false },
    { x: 0, y: 5, z: -1.6, width: 8, height: 2.5, rotationY: Math.PI, color: "teal", flicker: false },

    // Spawn zone markers
    { x: 0, y: 2.5, z: -27, width: 4, height: 1, rotationY: 0, color: "orange", flicker: false },
    { x: 0, y: 2.5, z: 27, width: 4, height: 1, rotationY: Math.PI, color: "teal", flicker: false },
  ],

  props: [],

  // Lane lights (ceiling mounted)
  laneLights: [
    { x: -16, y: 8, z: 0, color: 0xd4893a, intensity: 0.9, distance: 18, decay: 1.6 },
    { x: 0, y: 10, z: 0, color: 0xf0e6d4, intensity: 1.2, distance: 28, decay: 1.3 },
    { x: 16, y: 8, z: 0, color: 0x4a8b8a, intensity: 0.7, distance: 18, decay: 1.6 },
    { x: 0, y: 6, z: -26, color: 0xd4893a, intensity: 0.8, distance: 16, decay: 1.5 },
    { x: 0, y: 6, z: 26, color: 0x4a8b8a, intensity: 0.65, distance: 16, decay: 1.5 },
  ],

  spawnLightColors: {
    north: 0xd4893a,
    south: 0x4a8b8a,
  },

  // Upload Terminals for Search & Destroy mode
  uploadTerminals: [
    { id: "A", x: -16, y: 0, z: 0, radius: 2.5 },
    { id: "B", x: 16, y: 0, z: 0, radius: 2.5 },
  ],
};
