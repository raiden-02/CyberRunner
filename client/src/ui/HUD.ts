import { WEAPON_DEFINITIONS } from "../weapons/definitions.js";

export interface GameModeState {
  gameMode: string;
  scoreLimit: number;
  localKills?: number;
  timeRemaining: number;
  isGameOver: boolean;
  winnerId: string;
  currentRound: number;
  roundsToWin: number;
  roundTimeRemaining: number;
  isRoundActive: boolean;
  livesRemaining: number;
  lobbyState: string;
  ghostsRoundsWon: number;
  sentinelsRoundsWon: number;
  myTeam: string;
  spikeCarrierId: string;
  spikeState: string;
  spikeTerminalId: string;
  spikeUploadProgress: number;
  spikeDecryptProgress: number;
  spikeDetonationTimer: number;
  hasSpike: boolean;
  isUploading: boolean;
  isDecrypting: boolean;
}

export class HUD {
  private weaponEl: HTMLDivElement;
  private healthEl: HTMLDivElement;
  private roomInfoElement: HTMLDivElement;
  private gameModeElement: HTMLDivElement;
  private currentWeaponId = "AR_1";
  private joinCode: string | null = null;
  private playerCount = 0;
  private maxPlayers = 0;
  private modeState: GameModeState | null = null;

  constructor() {
    this.weaponEl = document.createElement("div");
    this.weaponEl.className = "cr-hud-weapon";
    document.body.appendChild(this.weaponEl);

    this.healthEl = document.createElement("div");
    this.healthEl.className = "cr-hud-health";
    document.body.appendChild(this.healthEl);

    this.roomInfoElement = document.createElement("div");
    this.roomInfoElement.className = "cr-hud-room";
    document.body.appendChild(this.roomInfoElement);

    this.gameModeElement = document.createElement("div");
    this.gameModeElement.className = "cr-hud-match";
    document.body.appendChild(this.gameModeElement);
  }

  public setRoomInfo(joinCode: string, playerCount: number, maxPlayers: number): void {
    this.joinCode = joinCode;
    this.playerCount = playerCount;
    this.maxPlayers = maxPlayers;
    this.updateRoomInfo();
  }

  public updatePlayerCount(count: number): void {
    this.playerCount = count;
    this.updateRoomInfo();
  }

  private updateRoomInfo(): void {
    if (!this.joinCode) {
      this.roomInfoElement.style.display = "none";
      return;
    }
    this.roomInfoElement.style.display = "block";
    this.roomInfoElement.replaceChildren();
    const label = document.createElement("div");
    label.className = "cr-hud-label";
    label.textContent = "Room";
    const value = document.createElement("div");
    value.textContent = `${this.joinCode} · ${this.playerCount}/${this.maxPlayers}`;
    this.roomInfoElement.append(label, value);
  }

  public setWeapon(weaponId: string): void {
    this.currentWeaponId = weaponId;
  }

  public setGameModeState(state: GameModeState): void {
    this.modeState = state;
    this.updateGameModeDisplay();
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  private updateGameModeDisplay(): void {
    if (!this.modeState) {
      this.gameModeElement.style.display = "none";
      return;
    }

    this.gameModeElement.style.display = "block";
    const s = this.modeState;

    if (s.isGameOver) {
      this.gameModeElement.innerHTML = `<div class="cr-hud-label">Match</div><div class="cr-hud-value">Over</div>`;
      return;
    }

    if (s.gameMode === "deathmatch") {
      this.gameModeElement.innerHTML = `
        <div class="cr-hud-row">
          <div><div class="cr-hud-label">Deathmatch</div><div>Kills</div></div>
          <div><div class="cr-hud-label">Score</div><div class="cr-hud-value">${s.localKills ?? 0} / ${s.scoreLimit}</div></div>
          <div><div class="cr-hud-label">Time</div><div class="cr-hud-value">${this.formatTime(s.timeRemaining)}</div></div>
        </div>`;
      return;
    }

    if (s.gameMode === "search_destroy") {
      if (s.lobbyState === "waiting") {
        this.gameModeElement.style.display = "none";
        return;
      }
      const isGhost = s.myTeam === "ghosts";
      const teamName = isGhost ? "Ghosts" : "Sentinels";
      const teamColor = isGhost ? "var(--cr-ghost)" : "var(--cr-sentinel)";
      let spike = "";
      if (s.spikeState === "ground") {
        spike = isGhost ? "Spike on ground" : "Defend the sites";
      } else if (s.spikeState === "carried" || s.spikeState === "dropped") {
        if (s.hasSpike) spike = "You have the spike";
        else if (s.spikeState === "dropped") spike = "Spike dropped";
        else spike = isGhost ? "Teammate has the spike" : "Enemy has the spike";
      } else if (s.spikeState === "uploading") {
        spike = isGhost
          ? `Upload ${s.spikeTerminalId} ${Math.round(s.spikeUploadProgress)}%`
          : "Enemy uploading";
      } else if (s.spikeState === "uploaded" || s.spikeState === "decrypting") {
        spike = isGhost
          ? `Spike live · ${s.spikeTerminalId}`
          : s.isDecrypting
            ? `Decrypting ${Math.round(s.spikeDecryptProgress)}%`
            : "Spike live · find it";
      }

      const spikePlanted = s.spikeState === "uploaded" || s.spikeState === "decrypting";
      const timerLabel = spikePlanted ? "Detonation" : "Time";
      const timerValue = spikePlanted ? s.spikeDetonationTimer : s.roundTimeRemaining;

      this.gameModeElement.innerHTML = `
        <div class="cr-hud-row">
          <div><div class="cr-hud-label">Team</div><div style="color:${teamColor}">${teamName}</div></div>
          <div><div class="cr-hud-label">Score</div><div><span style="color:var(--cr-ghost)">${s.ghostsRoundsWon}</span> — <span style="color:var(--cr-sentinel)">${s.sentinelsRoundsWon}</span></div></div>
          <div><div class="cr-hud-label">Round</div><div class="cr-hud-value">${s.currentRound}</div></div>
          <div><div class="cr-hud-label">${timerLabel}</div><div class="cr-hud-value">${this.formatTime(timerValue)}</div></div>
          <div><div class="cr-hud-label">Lives</div><div class="cr-hud-value">${s.livesRemaining}</div></div>
        </div>
        <div class="cr-hud-label" style="margin-top:6px">${spike}</div>`;
    }
  }

  private getWeaponDisplayName(weaponId: string): string {
    return WEAPON_DEFINITIONS[weaponId]?.name ?? weaponId;
  }

  public update(
    ammoInMag?: number,
    ammoReserve?: number,
    health?: number,
    maxHealth?: number,
    isDead?: boolean,
    respawnTime?: number,
    isReloading?: boolean,
  ): void {
    const weaponName = this.getWeaponDisplayName(this.currentWeaponId);
    let ammo = "";
    if (ammoInMag !== undefined && ammoReserve !== undefined) {
      ammo = isReloading ? "Reloading" : `${ammoInMag} / ${ammoReserve}`;
    }
    this.weaponEl.innerHTML = `
      <div class="cr-hud-label">Weapon</div>
      <div>${weaponName}</div>
      <div class="cr-hud-label">Ammo</div>
      <div class="cr-hud-value">${ammo}</div>`;

    if (health !== undefined && maxHealth !== undefined) {
      const percent = Math.round((health / maxHealth) * 100);
      let extra = "";
      if (isDead && respawnTime !== undefined && respawnTime > 0) {
        extra = `<div class="cr-hud-label">Respawn ${respawnTime.toFixed(1)}s</div>`;
      } else if (isDead) {
        extra = `<div class="cr-hud-label">Down</div>`;
      }
      this.healthEl.innerHTML = `
        <div class="cr-hud-label">Health</div>
        <div class="cr-hud-value">${health} / ${maxHealth}</div>
        <div class="cr-hud-label">${percent}%</div>
        ${extra}`;
    }
  }

  show(): void {
    this.weaponEl.style.display = "block";
    this.healthEl.style.display = "block";
    this.roomInfoElement.style.display = "block";
    this.gameModeElement.style.display = "block";
  }

  hide(): void {
    this.weaponEl.style.display = "none";
    this.healthEl.style.display = "none";
    this.roomInfoElement.style.display = "none";
    this.gameModeElement.style.display = "none";
  }

  destroy(): void {
    this.weaponEl.remove();
    this.healthEl.remove();
    this.roomInfoElement.remove();
    this.gameModeElement.remove();
  }
}
