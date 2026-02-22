export class Scoreboard {
  private element: HTMLDivElement;
  private visible = false;

  constructor() {
    this.element = document.createElement("div");
    this.element.style.cssText = `
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      min-width: 420px;
      max-width: 720px;
      color: #fff;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 14px;
      background: linear-gradient(180deg, rgba(12, 13, 15, 0.92), rgba(12, 13, 15, 0.72));
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 14px 16px 10px 16px;
      z-index: 9998;
      pointer-events: none;
      display: none;
      backdrop-filter: blur(6px);
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
    `;
    document.body.appendChild(this.element);
  }

  public setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.element.style.display = visible ? "block" : "none";
  }

  public update(playersState: any, localId: string): void {
    if (!playersState || typeof playersState.forEach !== "function") {
      this.element.textContent = "No players";
      return;
    }

    const rows: Array<{
      id: string;
      displayName: string;
      kills: number;
      deaths: number;
      score: number;
      health: number;
      isDead: boolean;
    }> = [];

    playersState.forEach((p: any, id: string) => {
      if (!p) return;
      rows.push({
        id,
        displayName: p.displayName || "Player",
        kills: Number(p.kills || 0),
        deaths: Number(p.deaths || 0),
        score: Number(p.score || 0),
        health: Number(p.health || 0),
        isDead: !!p.isDead
      });
    });

    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;
      return a.id.localeCompare(b.id);
    });

    const header = `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <div style="font-weight:700; letter-spacing:0.8px;">SCOREBOARD</div>
        <div style="opacity:0.7;">${rows.length} players</div>
      </div>
      <div style="display:grid; grid-template-columns: 1.2fr 0.5fr 0.4fr 0.4fr 0.6fr 0.6fr; gap:8px; font-size:12px; opacity:0.7; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px;">
        <div>Player</div>
        <div>Score</div>
        <div>K</div>
        <div>D</div>
        <div>K/D</div>
        <div>HP</div>
      </div>
    `;

    const body = rows.map((r) => {
      const isLocal = r.id === localId;
      const kd = r.deaths > 0 ? (r.kills / r.deaths).toFixed(2) : `${r.kills}.00`;
      const name = isLocal ? `${r.displayName} (YOU)` : r.displayName;
      const hp = r.isDead ? "DEAD" : String(r.health);
      const rowStyle = `
        display:grid;
        grid-template-columns: 1.2fr 0.5fr 0.4fr 0.4fr 0.6fr 0.6fr;
        gap:8px;
        padding:6px 0;
        border-bottom:1px solid rgba(255,255,255,0.04);
        ${isLocal ? "color:#7ee787; font-weight:600;" : ""}
      `;
      return `
        <div style="${rowStyle}">
          <div>${name}</div>
          <div>${r.score}</div>
          <div>${r.kills}</div>
          <div>${r.deaths}</div>
          <div>${kd}</div>
          <div>${hp}</div>
        </div>
      `;
    }).join("");

    this.element.innerHTML = header + body;
  }
}
