export const DEFAULT_LIVE_BRIEF =
  "Use playtest evidence to make Ghost routing less one-sided between sites A and B. Keep both sites reachable and avoid introducing hard geometry or navigation failures.";

export const LIVE_STARTING_MAP_ID = "map-contract-smoke";
export const LIVE_STARTING_MAP_LABEL = "ArenaForge Test Range";
export const LIVE_STARTING_MAP_NOTE = "Internal test map";

export const LIVE_DOCS_HREF =
  "https://github.com/raiden-02/CyberRunner/blob/HEAD/docs/arena-forge-live.md";

export function startingMapLabel(id: string): string {
  return id === LIVE_STARTING_MAP_ID ? LIVE_STARTING_MAP_LABEL : id;
}

export function liveProviderLine(provider?: string, model?: string): string {
  const name = provider === "anthropic" ? "Anthropic" : provider === "openai" ? "OpenAI" : "";
  if (!name) return "";
  return model ? `${name} · ${model}` : name;
}

export function liveRunBadge(provider?: string, model?: string): string {
  const line = liveProviderLine(provider, model);
  return line ? `Live run · ${line}` : "Live run";
}

export function liveDisabledCopy(): string {
  return "Live runs are disabled on this server. The recorded run above is fully playable.";
}

export function liveCostCopy(): string {
  return "Live design uses the configured provider account and may incur API charges.";
}

export function liveLocalLinkLabel(): string {
  return "Run live locally";
}
