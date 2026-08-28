import { BaseScreen } from "./BaseScreen.js";
import type { LobbyStateMessage, TeamId } from "../../network/NetworkManager.js";

export interface TeamLobbyCallbacks {
  onTeamSelect: (teamId: TeamId) => void;
  onStartGame: () => void;
  onLeaveLobby: () => void;
}

export class TeamLobbyScreen extends BaseScreen {
  private callbacks: TeamLobbyCallbacks | null = null;
  private lobbyState: LobbyStateMessage | null = null;
  private localSessionId = "";
  private playerNames = new Map<string, string>();
  private ghostsColumn!: HTMLDivElement;
  private sentinelsColumn!: HTMLDivElement;
  private startButton!: HTMLButtonElement;
  private statusDiv!: HTMLDivElement;
  private joinCodeDiv!: HTMLDivElement;
  private mapBadge!: HTMLDivElement;

  constructor() {
    super("team-lobby-screen");
    this.buildUI();
  }

  private buildUI(): void {
    const panel = this.createPanel("cr-team");
    const title = this.createTitle("Search & Destroy");
    title.classList.add("cr-title--left");
    panel.appendChild(title);

    this.mapBadge = document.createElement("div");
    this.mapBadge.className = "cr-kicker";
    panel.appendChild(this.mapBadge);

    this.joinCodeDiv = document.createElement("div");
    this.joinCodeDiv.className = "cr-copy cr-copy--left";
    panel.appendChild(this.joinCodeDiv);

    const grid = document.createElement("div");
    grid.className = "cr-team__grid";

    const ghosts = document.createElement("div");
    const gh = document.createElement("h2");
    gh.style.color = "var(--cr-ghost)";
    gh.textContent = "Ghosts";
    this.ghostsColumn = document.createElement("div");
    this.ghostsColumn.className = "cr-team-col cr-team-col--ghosts";
    const joinG = this.createButton("Join Ghosts", false);
    joinG.onclick = () => this.callbacks?.onTeamSelect("ghosts");
    ghosts.append(gh, this.ghostsColumn, joinG);

    const vs = document.createElement("div");
    vs.className = "cr-kicker";
    vs.style.alignSelf = "center";
    vs.textContent = "VS";

    const sentinels = document.createElement("div");
    const sh = document.createElement("h2");
    sh.style.color = "var(--cr-sentinel)";
    sh.textContent = "Sentinels";
    this.sentinelsColumn = document.createElement("div");
    this.sentinelsColumn.className = "cr-team-col cr-team-col--sentinels";
    const joinS = this.createButton("Join Sentinels", false);
    joinS.onclick = () => this.callbacks?.onTeamSelect("sentinels");
    sentinels.append(sh, this.sentinelsColumn, joinS);

    grid.append(ghosts, vs, sentinels);
    panel.appendChild(grid);

    this.statusDiv = document.createElement("div");
    this.statusDiv.className = "cr-status";
    panel.appendChild(this.statusDiv);

    this.startButton = this.createButton("Start", true);
    this.startButton.onclick = () => this.callbacks?.onStartGame();
    panel.appendChild(this.startButton);

    const leave = this.createButton("Leave Lobby", false);
    leave.onclick = () => this.callbacks?.onLeaveLobby();
    panel.appendChild(leave);

    this.container.appendChild(panel);
  }

  setCallbacks(callbacks: TeamLobbyCallbacks): void {
    this.callbacks = callbacks;
  }

  setLocalSessionId(sessionId: string): void {
    this.localSessionId = sessionId;
  }

  setJoinCode(code: string): void {
    this.joinCodeDiv.textContent = `Room code  ${code}`;
  }

  setPlayerName(sessionId: string, name: string): void {
    this.playerNames.set(sessionId, name);
    this.updateTeamDisplay();
  }

  updateLobbyState(state: LobbyStateMessage): void {
    this.lobbyState = state;
    this.mapBadge.textContent = "Search & Destroy";
    this.updateTeamDisplay();
    this.updateControls();
  }

  private updateTeamDisplay(): void {
    if (!this.lobbyState) return;
    this.fillColumn(this.ghostsColumn, this.lobbyState.ghostPlayers, "ghosts");
    this.fillColumn(this.sentinelsColumn, this.lobbyState.sentinelPlayers, "sentinels");
  }

  private fillColumn(col: HTMLDivElement, ids: string[], team: TeamId): void {
    col.replaceChildren();
    if (ids.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cr-copy";
      empty.textContent = "No players";
      col.appendChild(empty);
      return;
    }
    for (const id of ids) {
      col.appendChild(this.createPlayerElement(id, team));
    }
  }

  private createPlayerElement(playerId: string, team: TeamId): HTMLDivElement {
    const el = document.createElement("div");
    const isHost = this.lobbyState?.hostId === playerId;
    const isLocal = playerId === this.localSessionId;
    const name = this.playerNames.get(playerId) || playerId.substring(0, 8);
    el.style.color = team === "ghosts" ? "var(--cr-ghost)" : "var(--cr-sentinel)";
    el.style.display = "flex";
    el.style.justifyContent = "space-between";
    el.style.padding = "8px 0";
    el.innerHTML = `<span>${name}${isLocal ? " (You)" : ""}</span>${isHost ? "<span>HOST</span>" : ""}`;
    return el;
  }

  private updateControls(): void {
    if (!this.lobbyState) return;
    const isHost = this.lobbyState.hostId === this.localSessionId;
    const canStart = this.lobbyState.canStart;
    if (isHost) {
      this.startButton.style.display = "flex";
      this.startButton.disabled = !canStart;
      if (!canStart) {
        this.statusDiv.textContent = "Need at least 1 player on each team to start.";
      } else if (this.lobbyState.ghostPlayers.length === 0 || this.lobbyState.sentinelPlayers.length === 0) {
        this.statusDiv.textContent = "Forge walk. One player is enough to start.";
      } else {
        this.statusDiv.textContent = "Ready.";
      }
    } else {
      this.startButton.style.display = "none";
      this.statusDiv.textContent = "Waiting for host.";
    }
  }

  protected override onShow(): void {
    this.updateTeamDisplay();
    this.updateControls();
  }
}
