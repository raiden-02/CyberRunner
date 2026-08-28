export class Scoreboard {
  private element: HTMLDivElement;
  private visible = false;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "cr-scoreboard";
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
        isDead: !!p.isDead,
      });
    });

    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;
      return a.id.localeCompare(b.id);
    });

    const body = rows
      .map((r) => {
        const isLocal = r.id === localId;
        const kd = r.deaths > 0 ? (r.kills / r.deaths).toFixed(2) : `${r.kills}.00`;
        const name = isLocal ? `${r.displayName} (you)` : r.displayName;
        const hp = r.isDead ? "Down" : String(r.health);
        return `
        <div class="cr-scoreboard__grid${isLocal ? " cr-scoreboard__you" : ""}">
          <div>${name}</div>
          <div>${r.score}</div>
          <div>${r.kills}</div>
          <div>${r.deaths}</div>
          <div>${kd}</div>
          <div>${hp}</div>
        </div>`;
      })
      .join("");

    this.element.innerHTML = `
      <div class="cr-scoreboard__head">
        <div>Scoreboard</div>
        <div>${rows.length} players</div>
      </div>
      <div class="cr-scoreboard__grid cr-scoreboard__cols">
        <div>Player</div>
        <div>Score</div>
        <div>K</div>
        <div>D</div>
        <div>K/D</div>
        <div>HP</div>
      </div>
      ${body}
    `;
  }

  destroy(): void {
    this.element.remove();
  }
}
