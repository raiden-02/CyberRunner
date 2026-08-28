/**
 * CyberRunner UI: graphite tactical sci-fi.
 * Cool panels. Cyan information. Amber action. Coral Ghosts / teal Sentinels.
 * Keep WORLD values for in-level materials. Menu/HUD uses THEME.
 */
export const THEME = {
  font: `'Segoe UI', system-ui, sans-serif`,
  overlay: "rgba(7, 9, 13, 0.82)",
  panel: "#0e141c",
  panelRaised: "#151c26",
  panelBorder: "#2a3848",
  paper: "#e8eef4",
  muted: "#8a9aab",
  accent: "#5ec8d8",
  accentDim: "rgba(94, 200, 216, 0.14)",
  accentHover: "rgba(94, 200, 216, 0.28)",
  ink: "#07090d",
  teammate: "#4ec4c8",
  danger: "#d4544a",
  warning: "#e0a04a",
  ghosts: "#e08a5a",
  sentinels: "#4ec4c8",
  hudBg: "rgba(8, 12, 18, 0.55)",
} as const;

export const WORLD = {
  fog: 0x5a5e62,
  gridMajor: 0x8a8274,
  gridMinor: 0x6a6862,
  playerBody: 0x8a7a5c,
  playerHead: 0xc4b49a,
  playerLimb: 0x6b6354,
} as const;
