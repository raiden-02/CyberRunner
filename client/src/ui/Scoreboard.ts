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

    this.element.replaceChildren();
    const head = document.createElement("div");
    head.className = "cr-scoreboard__head";
    const title = document.createElement("div");
    title.textContent = "Scoreboard";
    const count = document.createElement("div");
    count.textContent = `${rows.length} players`;
    head.append(title, count);

    const cols = document.createElement("div");
    cols.className = "cr-scoreboard__grid cr-scoreboard__cols";
    for (const label of ["Player", "Score", "K", "D", "K/D", "HP"]) {
      const cell = document.createElement("div");
      cell.textContent = label;
      cols.appendChild(cell);
    }

    this.element.append(head, cols);
    for (const r of rows) {
      const isLocal = r.id === localId;
      const row = document.createElement("div");
      row.className = isLocal ? "cr-scoreboard__grid cr-scoreboard__you" : "cr-scoreboard__grid";
      const kd = r.deaths > 0 ? (r.kills / r.deaths).toFixed(2) : `${r.kills}.00`;
      const values = [
        isLocal ? `${r.displayName} (you)` : r.displayName,
        String(r.score),
        String(r.kills),
        String(r.deaths),
        kd,
        r.isDead ? "Down" : String(r.health),
      ];
      for (const value of values) {
        const cell = document.createElement("div");
        cell.textContent = value;
        row.appendChild(cell);
      }
      this.element.appendChild(row);
    }
  }

  destroy(): void {
    this.element.remove();
  }
}
