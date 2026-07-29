import { BaseScreen } from "./BaseScreen.js";
import type { LobbyStateMessage, TeamId } from "../../network/NetworkManager.js";
import { THEME } from "../../theme.js";

export interface TeamLobbyCallbacks {
  onTeamSelect: (teamId: TeamId) => void;
  onStartGame: () => void;
  onLeaveLobby: () => void;
}

export class TeamLobbyScreen extends BaseScreen {
  private callbacks: TeamLobbyCallbacks | null = null;
  private lobbyState: LobbyStateMessage | null = null;
  private localSessionId: string = "";
  private playerNames: Map<string, string> = new Map();
  
  private ghostsColumn!: HTMLDivElement;
  private sentinelsColumn!: HTMLDivElement;
  private startButton!: HTMLButtonElement;
  private statusDiv!: HTMLDivElement;
  private joinCodeDiv!: HTMLDivElement;

  constructor() {
    super("team-lobby-screen");
    this.buildUI();
  }

  private buildUI(): void {
    const panel = this.createPanel("700px");
    
    const title = this.createTitle("SEARCH & DESTROY");
    panel.appendChild(title);

    // Join code display
    this.joinCodeDiv = document.createElement("div");
    this.joinCodeDiv.style.cssText = `
      text-align: center;
      margin-bottom: 20px;
      color: #888;
      font-size: 14px;
    `;
    panel.appendChild(this.joinCodeDiv);

    // Teams container
    const teamsContainer = document.createElement("div");
    teamsContainer.style.cssText = `
      display: flex;
      gap: 24px;
      margin-bottom: 24px;
    `;

    // Ghosts team column
    const ghostsWrapper = document.createElement("div");
    ghostsWrapper.style.cssText = `flex: 1;`;
    
    const ghostsTitle = document.createElement("div");
    ghostsTitle.style.cssText = `
      color: ${THEME.ghosts};
      font-size: 18px;
      font-weight: bold;
      text-align: center;
      padding: 12px;
      background: rgba(196, 92, 58, 0.12);
      border: 1px solid rgba(196, 92, 58, 0.35);
      border-radius: 8px 8px 0 0;
      text-transform: uppercase;
    `;
    ghostsTitle.textContent = "GHOSTS (Attackers)";
    ghostsWrapper.appendChild(ghostsTitle);

    this.ghostsColumn = document.createElement("div");
    this.ghostsColumn.style.cssText = `
      background: rgba(196, 92, 58, 0.06);
      border: 1px solid rgba(196, 92, 58, 0.22);
      border-top: none;
      border-radius: 0 0 8px 8px;
      min-height: 200px;
      padding: 12px;
    `;
    ghostsWrapper.appendChild(this.ghostsColumn);

    const joinGhostsBtn = this.createTeamButton("Join Ghosts", THEME.ghosts);
    joinGhostsBtn.onclick = () => this.callbacks?.onTeamSelect("ghosts");
    ghostsWrapper.appendChild(joinGhostsBtn);

    teamsContainer.appendChild(ghostsWrapper);

    // VS divider
    const vsDiv = document.createElement("div");
    vsDiv.style.cssText = `
      display: flex;
      align-items: center;
      color: #666;
      font-size: 24px;
      font-weight: bold;
    `;
    vsDiv.textContent = "VS";
    teamsContainer.appendChild(vsDiv);

    // Sentinels team column
    const sentinelsWrapper = document.createElement("div");
    sentinelsWrapper.style.cssText = `flex: 1;`;
    
    const sentinelsTitle = document.createElement("div");
    sentinelsTitle.style.cssText = `
      color: ${THEME.sentinels};
      font-size: 18px;
      font-weight: bold;
      text-align: center;
      padding: 12px;
      background: rgba(74, 139, 138, 0.12);
      border: 1px solid rgba(74, 139, 138, 0.35);
      border-radius: 8px 8px 0 0;
      text-transform: uppercase;
    `;
    sentinelsTitle.textContent = "SENTINELS (Defenders)";
    sentinelsWrapper.appendChild(sentinelsTitle);

    this.sentinelsColumn = document.createElement("div");
    this.sentinelsColumn.style.cssText = `
      background: rgba(74, 139, 138, 0.06);
      border: 1px solid rgba(74, 139, 138, 0.22);
      border-top: none;
      border-radius: 0 0 8px 8px;
      min-height: 200px;
      padding: 12px;
    `;
    sentinelsWrapper.appendChild(this.sentinelsColumn);

    const joinSentinelsBtn = this.createTeamButton("Join Sentinels", THEME.sentinels);
    joinSentinelsBtn.onclick = () => this.callbacks?.onTeamSelect("sentinels");
    sentinelsWrapper.appendChild(joinSentinelsBtn);

    teamsContainer.appendChild(sentinelsWrapper);
    panel.appendChild(teamsContainer);

    // Status message
    this.statusDiv = document.createElement("div");
    this.statusDiv.style.cssText = `
      text-align: center;
      color: #888;
      font-size: 14px;
      margin-bottom: 16px;
    `;
    panel.appendChild(this.statusDiv);

    // Start button (host only)
    this.startButton = this.createButton("START GAME");
    this.startButton.onclick = () => this.callbacks?.onStartGame();
    panel.appendChild(this.startButton);

    // Leave button
    const leaveBtn = document.createElement("button");
    leaveBtn.textContent = "Leave Lobby";
    leaveBtn.style.cssText = `
      margin-top: 16px;
      padding: 8px 16px;
      border: none;
      background: transparent;
      color: #666;
      font-size: 14px;
      cursor: pointer;
      width: 100%;
    `;
    leaveBtn.onmouseenter = () => { leaveBtn.style.color = THEME.danger; };
    leaveBtn.onmouseleave = () => { leaveBtn.style.color = "#666"; };
    leaveBtn.onclick = () => this.callbacks?.onLeaveLobby();
    panel.appendChild(leaveBtn);

    this.container.appendChild(panel);
  }

  private createTeamButton(text: string, color: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.style.cssText = `
      width: 100%;
      padding: 10px;
      margin-top: 8px;
      border: 1px solid ${color};
      border-radius: 4px;
      background: transparent;
      color: ${color};
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    btn.onmouseenter = () => {
      btn.style.background = `${color}22`;
    };
    btn.onmouseleave = () => {
      btn.style.background = "transparent";
    };
    return btn;
  }

  setCallbacks(callbacks: TeamLobbyCallbacks): void {
    this.callbacks = callbacks;
  }

  setLocalSessionId(sessionId: string): void {
    this.localSessionId = sessionId;
  }

  setJoinCode(code: string): void {
    this.joinCodeDiv.innerHTML = `Join Code: <span style="color: ${THEME.accent}; font-weight: bold;">${code}</span>`;
  }

  setPlayerName(sessionId: string, name: string): void {
    this.playerNames.set(sessionId, name);
    this.updateTeamDisplay();
  }

  updateLobbyState(state: LobbyStateMessage): void {
    this.lobbyState = state;
    this.updateTeamDisplay();
    this.updateControls();
  }

  private updateTeamDisplay(): void {
    if (!this.lobbyState) return;

    // Update Ghosts column
    this.ghostsColumn.innerHTML = "";
    for (const playerId of this.lobbyState.ghostPlayers) {
      const playerEl = this.createPlayerElement(playerId, "ghosts");
      this.ghostsColumn.appendChild(playerEl);
    }
    if (this.lobbyState.ghostPlayers.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.style.cssText = `color: #555; text-align: center; padding: 20px;`;
      emptyEl.textContent = "No players";
      this.ghostsColumn.appendChild(emptyEl);
    }

    // Update Sentinels column
    this.sentinelsColumn.innerHTML = "";
    for (const playerId of this.lobbyState.sentinelPlayers) {
      const playerEl = this.createPlayerElement(playerId, "sentinels");
      this.sentinelsColumn.appendChild(playerEl);
    }
    if (this.lobbyState.sentinelPlayers.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.style.cssText = `color: #555; text-align: center; padding: 20px;`;
      emptyEl.textContent = "No players";
      this.sentinelsColumn.appendChild(emptyEl);
    }
  }

  private createPlayerElement(playerId: string, team: TeamId): HTMLDivElement {
    const el = document.createElement("div");
    const isHost = this.lobbyState?.hostId === playerId;
    const isLocal = playerId === this.localSessionId;
    const name = this.playerNames.get(playerId) || playerId.substring(0, 8);
    const teamColor = team === "ghosts" ? THEME.ghosts : THEME.sentinels;
    
    el.style.cssText = `
      padding: 8px 12px;
      margin: 4px 0;
      background: ${isLocal ? `${teamColor}22` : "transparent"};
      border-radius: 4px;
      color: ${isLocal ? teamColor : "#ccc"};
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    el.innerHTML = `
      <span>${name}${isLocal ? " (You)" : ""}</span>
      ${isHost ? `<span style="color: ${THEME.accent}; font-size: 12px;">HOST</span>` : ""}
    `;
    
    return el;
  }

  private updateControls(): void {
    if (!this.lobbyState) return;

    const isHost = this.lobbyState.hostId === this.localSessionId;
    const canStart = this.lobbyState.canStart;

    if (isHost) {
      this.startButton.style.display = "block";
      this.startButton.disabled = !canStart;
      this.startButton.style.opacity = canStart ? "1" : "0.5";
      this.startButton.style.cursor = canStart ? "pointer" : "not-allowed";
      
      if (!canStart) {
        this.statusDiv.textContent = "Need at least 1 player on each team to start";
      } else if (this.lobbyState.ghostPlayers.length === 0 || this.lobbyState.sentinelPlayers.length === 0) {
        this.statusDiv.textContent = "Forge walk. One player is enough to start.";
      } else {
        this.statusDiv.textContent = "Ready to start!";
      }
    } else {
      this.startButton.style.display = "none";
      this.statusDiv.textContent = "Waiting for host to start the game...";
    }
  }

  protected override onShow(): void {
    this.updateTeamDisplay();
    this.updateControls();
  }
}
