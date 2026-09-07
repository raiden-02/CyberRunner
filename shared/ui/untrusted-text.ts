/** Model and user strings are untrusted. Assign with textContent only. */

export type TextSink = { textContent: string | null };

export function setUntrustedText(el: TextSink, value: string): void {
  el.textContent = value;
}

export type DesignPlanText = {
  summary: string;
  layout: string[];
  priorities: string[];
};

export function designPlanText(plan: DesignPlanText): DesignPlanText {
  return {
    summary: plan.summary,
    layout: plan.layout.map((line) => line),
    priorities: plan.priorities.map((line) => line),
  };
}

export function fillDesignPlan<T extends TextSink>(
  host: { replaceChildren: () => void; appendChild: (node: T) => unknown },
  plan: DesignPlanText,
  create: (tag: string) => T & { style?: { cssText: string } },
): void {
  const safe = designPlanText(plan);
  host.replaceChildren();
  const kicker = create("div");
  setUntrustedText(kicker, "DESIGN PLAN");
  if (kicker.style) {
    kicker.style.cssText =
      "letter-spacing:0.08em;text-transform:uppercase;font-size:12px;margin-bottom:6px;";
  }
  host.appendChild(kicker);
  const summaryHead = create("div");
  setUntrustedText(summaryHead, "Summary");
  if (summaryHead.style) summaryHead.style.cssText = "font-size:12px;margin:4px 0;";
  const summary = create("div");
  setUntrustedText(summary, safe.summary);
  if (summary.style) summary.style.cssText = "font-weight:600;margin-bottom:8px;";
  host.appendChild(summaryHead);
  host.appendChild(summary);
  const layoutHead = create("div");
  setUntrustedText(layoutHead, "Layout");
  if (layoutHead.style) layoutHead.style.cssText = "font-size:12px;margin:4px 0;";
  host.appendChild(layoutHead);
  for (const line of safe.layout) {
    const row = create("div");
    setUntrustedText(row, `· ${line}`);
    host.appendChild(row);
  }
  const priorHead = create("div");
  setUntrustedText(priorHead, "Priorities");
  if (priorHead.style) priorHead.style.cssText = "font-size:12px;margin:8px 0 4px 0;";
  host.appendChild(priorHead);
  for (const line of safe.priorities) {
    const row = create("div");
    setUntrustedText(row, `· ${line}`);
    host.appendChild(row);
  }
}

export function fillNamedLines<T extends TextSink>(
  host: { replaceChildren: () => void; appendChild: (node: T) => unknown },
  lines: readonly string[],
  create: (tag: string) => T,
): void {
  host.replaceChildren();
  for (const line of lines) {
    const row = create("div");
    setUntrustedText(row, line);
    host.appendChild(row);
  }
}
