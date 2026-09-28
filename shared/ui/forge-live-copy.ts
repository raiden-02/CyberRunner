export const LIVE_DOCS_HREF =
  "https://github.com/raiden-02/CyberRunner/blob/HEAD/docs/arena-forge-live.md";

export const LIVE_DISABLED_COPY =
  "Live runs are disabled on this server. The recorded run above is fully playable.";
export const LIVE_COST_COPY =
  "Live design uses the configured provider account and may incur API charges.";
export const LIVE_LOCAL_LINK_LABEL = "Run live locally";

export function liveProviderLine(provider?: string, model?: string): string {
  const name = provider === "anthropic" ? "Anthropic" : provider === "openai" ? "OpenAI" : "";
  if (!name) return "";
  return model ? `${name} · ${model}` : name;
}

export function liveRunBadge(provider?: string, model?: string): string {
  const line = liveProviderLine(provider, model);
  return line ? `Live run · ${line}` : "Live run";
}
