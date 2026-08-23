export type QuickPlayFollowThrough = "join" | "create" | "invalid";

export function quickPlayFollowThrough(result: {
  action?: string;
  roomId?: string | null;
}): QuickPlayFollowThrough {
  if (result.action === "join" && result.roomId) return "join";
  if (result.action === "create") return "create";
  return "invalid";
}
