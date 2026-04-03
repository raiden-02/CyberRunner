import { WEAPON_DEFINITIONS } from "../weapons/definitions.js";

export interface GameModeState {
  gameMode: string;
  scoreLimit: number;
  timeRemaining: number;
  isGameOver: boolean;
  winnerId: string;
  currentRound: number;
  roundsToWin: number;
  roundTimeRemaining: number;
  isRoundActive: boolean;
  livesRemaining: number;
  // Team state (S&D)
  lobbyState: string;
  ghostsRoundsWon: number;
  sentinelsRoundsWon: number;
  myTeam: string;
  // Spike state (S&D)
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
  private element: HTMLDivElement;
  private roomInfoElement: HTMLDivElement;
  private gameModeElement: HTMLDivElement;
  private currentWeaponId = "AR_1";
  private joinCode: string | null = null;
  private playerCount = 0;
  private maxPlayers = 0;
  private modeState: GameModeState | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      color: #fff;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      background: linear-gradient(135deg, rgba(0,20,40,0.85) 0%, rgba(0,10,20,0.9) 100%);
      padding: 14px 18px;
      border-radius: 4px;
      border-left: 3px solid #00ffff;
      pointer-events: none;
      min-width: 200px;
      box-shadow: 0 4px 20px rgba(0,255,255,0.15);
      line-height: 1.6;
    `;
    document.body.appendChild(this.element);

    // Room info display (top right)
    this.roomInfoElement = document.createElement("div");
    this.roomInfoElement.style.cssText = `
      position: fixed;
      top: 50px;
      right: 20px;
      color: #fff;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 12px;
      background: linear-gradient(135deg, rgba(0,20,40,0.85) 0%, rgba(0,10,20,0.9) 100%);
      padding: 10px 14px;
      border-radius: 4px;
      border-left: 3px solid #00ff88;
      pointer-events: none;
      box-shadow: 0 4px 20px rgba(0,255,136,0.15);
      display: none;
    `;
    document.body.appendChild(this.roomInfoElement);

    // Game mode display (top center)
    this.gameModeElement = document.createElement("div");
    this.gameModeElement.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: #fff;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      background: linear-gradient(135deg, rgba(0,20,40,0.85) 0%, rgba(0,10,20,0.9) 100%);
      padding: 10px 20px;
      border-radius: 4px;
      border-bottom: 2px solid #ff6600;
      pointer-events: none;
      box-shadow: 0 4px 20px rgba(255,102,0,0.2);
      text-align: center;
      display: none;
    `;
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
    this.roomInfoElement.innerHTML = `
      <div style="color:#00ff88;font-weight:600;margin-bottom:4px;">JOIN CODE</div>
      <div style="font-size:18px;font-weight:bold;letter-spacing:2px;margin-bottom:6px;">${this.joinCode}</div>
      <div style="color:#888;">Players: ${this.playerCount}/${this.maxPlayers}</div>
    `;
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
    
    let html = "";
    
    if (s.isGameOver) {
      html = `<div style="color:#ff6600;font-weight:bold;font-size:18px;">GAME OVER</div>`;
    } else if (s.gameMode === "deathmatch") {
      html = `
        <div style="display:flex;gap:24px;align-items:center;">
          <div>
            <div style="color:#888;font-size:10px;">MODE</div>
            <div style="color:#ff6600;font-weight:600;">DEATHMATCH</div>
          </div>
          <div>
            <div style="color:#888;font-size:10px;">TARGET</div>
            <div>${s.scoreLimit} kills</div>
          </div>
          <div>
            <div style="color:#888;font-size:10px;">TIME</div>
            <div>${this.formatTime(s.timeRemaining)}</div>
          </div>
        </div>
      `;
    } else if (s.gameMode === "search_destroy") {
      // Don't show game UI if in lobby state
      if (s.lobbyState === "waiting") {
        this.gameModeElement.style.display = "none";
        return;
      }
      
      const isGhost = s.myTeam === "ghosts";
      const teamColor = isGhost ? "#ff4444" : "#4488ff";
      const teamName = isGhost ? "GHOSTS" : "SENTINELS";
      
      // Spike status
      let spikeHtml = "";
      if (s.spikeState === "ground") {
        if (isGhost) {
          spikeHtml = `<div style="color:#ffaa00;">SPIKE ON GROUND - Pick it up!</div>`;
        } else {
          spikeHtml = `<div style="color:#4488ff;">Defend the terminals</div>`;
        }
      } else if (s.spikeState === "carried" || s.spikeState === "dropped") {
        if (s.hasSpike) {
          spikeHtml = `<div style="color:#ff3300;font-weight:bold;">YOU HAVE THE SPIKE</div>`;
        } else if (s.spikeState === "dropped") {
          spikeHtml = `<div style="color:#ffaa00;">SPIKE DROPPED</div>`;
        } else if (s.spikeCarrierId) {
          spikeHtml = isGhost 
            ? `<div style="color:#ff4444;">Teammate has spike</div>`
            : `<div style="color:#4488ff;">Enemy has spike</div>`;
        }
      } else if (s.spikeState === "uploading") {
        // Only Ghosts (planting team) see terminal ID during upload
        if (isGhost) {
          spikeHtml = `
            <div style="color:#ff3300;">UPLOADING ${s.spikeTerminalId}</div>
            <div style="background:#333;height:6px;width:100px;border-radius:3px;overflow:hidden;">
              <div style="background:#ff3300;height:100%;width:${s.spikeUploadProgress}%;"></div>
            </div>
          `;
        } else {
          spikeHtml = `<div style="color:#ff3300;font-weight:bold;">ENEMY UPLOADING SPIKE!</div>`;
        }
      } else if (s.spikeState === "uploaded" || s.spikeState === "decrypting") {
        const decryptProgress = s.isDecrypting ? s.spikeDecryptProgress : 0;
        // Ghosts see the terminal ID, Sentinels must find it
        if (isGhost) {
          spikeHtml = `<div style="color:#ff0000;font-weight:bold;">SPIKE ACTIVE - ${s.spikeTerminalId}</div>`;
        } else {
          // Sentinels don't see which terminal - they must search
          spikeHtml = `
            <div style="color:#ff0000;font-weight:bold;">SPIKE ACTIVE - FIND IT!</div>
            ${s.isDecrypting ? `
              <div style="color:#00ff00;">DECRYPTING...</div>
              <div style="background:#333;height:6px;width:100px;border-radius:3px;overflow:hidden;">
                <div style="background:#00ff00;height:100%;width:${decryptProgress}%;"></div>
              </div>
            ` : `<div style="color:#ffaa00;">Find and decrypt the spike!</div>`}
          `;
        }
      }

      // Show spike detonation timer when planted, otherwise show round timer
      const spikePlanted = s.spikeState === "uploaded" || s.spikeState === "decrypting";
      const timerLabel = spikePlanted ? "SPIKE" : "TIME";
      const timerValue = spikePlanted ? s.spikeDetonationTimer : s.roundTimeRemaining;
      const timerColor = spikePlanted ? "#ff0000" : "#fff";

      html = `
        <div style="display:flex;gap:24px;align-items:center;">
          <div>
            <div style="color:#888;font-size:10px;">TEAM</div>
            <div style="color:${teamColor};font-weight:600;">${teamName}</div>
          </div>
          <div>
            <div style="color:#888;font-size:10px;">SCORE</div>
            <div>
              <span style="color:#ff4444;">${s.ghostsRoundsWon}</span>
              <span style="color:#666;"> - </span>
              <span style="color:#4488ff;">${s.sentinelsRoundsWon}</span>
            </div>
          </div>
          <div>
            <div style="color:#888;font-size:10px;">ROUND</div>
            <div>${s.currentRound}</div>
          </div>
          <div>
            <div style="color:#888;font-size:10px;">${timerLabel}</div>
            <div style="color:${timerColor};${spikePlanted ? "font-weight:bold;" : ""}">${this.formatTime(timerValue)}</div>
          </div>
        </div>
        <div style="margin-top:8px;text-align:center;">${spikeHtml}</div>
      `;
    }
    
    this.gameModeElement.innerHTML = html;
  }

  private getWeaponDisplayName(weaponId: string): string {
    const def = WEAPON_DEFINITIONS[weaponId];
    return def ? def.name : weaponId;
  }

  private getWeaponFamily(weaponId: string): string {
    const def = WEAPON_DEFINITIONS[weaponId];
    if (!def) return "";
    const family = def.family;
    switch (family) {
      case "AssaultRifle": return "Assault Rifle";
      case "SMG": return "SMG";
      case "LMG": return "LMG";
      case "DMR": return "DMR";
      case "Sniper": return "Sniper Rifle";
      case "Shotgun": return "Shotgun";
      case "Pistol": return "Pistol";
      case "MachinePistol": return "Machine Pistol";
      case "RocketLauncher": return "Rocket Launcher";
      case "GrenadeLauncher": return "Grenade Launcher";
      case "Launcher": return "Launcher";
      case "Melee": return "Melee";
      case "Energy": return "Energy";
      case "Charge": return "Charge";
      case "Beam": return "Beam";
      case "Bow": return "Bow";
      default: return family;
    }
  }

  public update(
    ammoInMag?: number,
    ammoReserve?: number,
    health?: number,
    maxHealth?: number,
    isDead?: boolean,
    respawnTime?: number,
    isReloading?: boolean
  ): void {
    const weaponName = this.getWeaponDisplayName(this.currentWeaponId);
    const weaponType = this.getWeaponFamily(this.currentWeaponId);
    
    let html = `<div style="color:#00ffff;font-weight:500;margin-bottom:6px;">WEAPON</div>`;
    html += `<div style="margin-bottom:10px;">${weaponName} <span style="color:#888;">(${weaponType})</span></div>`;

    if (ammoInMag !== undefined && ammoReserve !== undefined) {
      html += `<div style="color:#00ffff;font-weight:500;margin-bottom:4px;">AMMO</div>`;
      if (isReloading) {
        html += `<div style="color:#ffcc00;margin-bottom:10px;">RELOADING...</div>`;
      } else {
        html += `<div style="margin-bottom:10px;">${ammoInMag} / ${ammoReserve}</div>`;
      }
    }

    if (health !== undefined && maxHealth !== undefined) {
      html += `<div style="color:#00ffff;font-weight:500;margin-bottom:4px;">HEALTH</div>`;
      const percent = Math.round((health / maxHealth) * 100);
      const healthBar = this.createHealthBar(percent);
      html += `<div>${health} / ${maxHealth} ${healthBar}</div>`;

      if (isDead && respawnTime !== undefined && respawnTime > 0) {
        html += `<div style="color:#ff4444;margin-top:8px;font-weight:500;">DEAD - Respawn: ${respawnTime.toFixed(1)}s</div>`;
      } else if (isDead) {
        html += `<div style="color:#ff4444;margin-top:8px;font-weight:500;">DEAD</div>`;
      }
    }

    this.element.innerHTML = html;
  }

  private createHealthBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    const color = percent > 60 ? '#0f0' : percent > 30 ? '#ff0' : '#f00';
    return `<span style="color:${color}">${'█'.repeat(filled)}${'░'.repeat(empty)}</span>`;
  }

  show(): void {
    this.element.style.display = "block";
    this.roomInfoElement.style.display = "block";
    this.gameModeElement.style.display = "block";
  }

  hide(): void {
    this.element.style.display = "none";
    this.roomInfoElement.style.display = "none";
    this.gameModeElement.style.display = "none";
  }

  destroy(): void {
    this.element.remove();
    this.roomInfoElement.remove();
    this.gameModeElement.remove();
  }
}
