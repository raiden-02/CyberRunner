import { describe, expect, it } from "vitest";
import { fillDesignPlan, setUntrustedText } from "../../shared/ui/untrusted-text.js";

describe("untrusted text rendering", () => {
  it("keeps a model plan XSS string as textContent", () => {
    const xss = '<img src=x onerror=alert(1)>';
    const children: Array<{ textContent: string | null }> = [];
    const host = {
      replaceChildren() {
        children.length = 0;
      },
      appendChild(node: { textContent: string | null }) {
        children.push(node);
        return node;
      },
    };
    fillDesignPlan(
      host,
      { summary: xss, layout: [xss], priorities: [xss] },
      () => ({ textContent: "", style: { cssText: "" } }),
    );
    expect(children.some((c) => c.textContent === xss || c.textContent === `· ${xss}`)).toBe(true);
    expect(children.every((c) => !String(c.textContent).includes("<img") || c.textContent?.includes("<img src=x"))).toBe(true);
    expect(JSON.stringify(children)).toContain("<img src=x onerror=alert(1)>");
    expect(JSON.stringify(children)).not.toContain("innerHTML");
  });

  it("keeps a map name script tag as text", () => {
    const el = { textContent: "" as string | null };
    const xss = "<script>alert(1)</script>";
    setUntrustedText(el, xss);
    expect(el.textContent).toBe(xss);
  });
});
