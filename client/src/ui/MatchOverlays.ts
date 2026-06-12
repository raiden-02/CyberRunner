import { THEME } from "../theme.js";
import type { GameOverMessage } from "../network/NetworkManager.js";

export class MatchOverlays {
  showGameOver(
    msg: GameOverMessage,
    sessionId: string,
    hostId: string,
    onRestart: () => void,
    onDisband: () => void,
  ): void {
    const overlay = document.createElement("div");
    overlay.id = "game-over-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${THEME.overlay};
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 2000;
      color: ${THEME.paper};
      font-family: ${THEME.font};
    `;

    let titleHtml: string;
    let subtitleHtml: string;

    if (msg.gameMode === "deathmatch") {
      const isLocalWinner = msg.winnerId === sessionId;
      if (isLocalWinner) {
        titleHtml = `<div style="font-size: 48px; font-weight: bold; color: ${THEME.accent}; margin-bottom: 16px;">YOU WIN</div>`;
        subtitleHtml = `<div style="font-size: 24px; color: ${THEME.muted}; margin-bottom: 32px;">First to ${msg.winnerName ? "the kill limit" : "5 kills"}!</div>`;
      } else {
        titleHtml = `<div style="font-size: 48px; font-weight: bold; color: ${THEME.danger}; margin-bottom: 16px;">YOU LOSE</div>`;
        subtitleHtml = `<div style="font-size: 24px; color: ${THEME.muted}; margin-bottom: 32px;">${msg.winnerName} wins!</div>`;
      }
    } else {
      const winnerTeamColor = msg.winnerTeam === "ghosts" ? THEME.ghosts : THEME.sentinels;
      const winnerTeamName = msg.winnerTeam === "ghosts" ? "GHOSTS" : "SENTINELS";
      titleHtml = `<div style="font-size: 48px; font-weight: bold; color: ${winnerTeamColor}; margin-bottom: 16px;">${winnerTeamName} WIN</div>`;
      subtitleHtml = `<div style="font-size: 24px; color: ${THEME.muted}; margin-bottom: 32px;">Ghosts ${msg.ghostsRoundsWon} - ${msg.sentinelsRoundsWon} Sentinels</div>`;
    }

    overlay.innerHTML = `
      ${titleHtml}
      ${subtitleHtml}
      <div id="game-over-status" style="font-size: 16px; color: ${THEME.muted};">
        Waiting for host...
      </div>
    `;

    document.body.appendChild(overlay);

    const isHost = hostId === sessionId;
    if (isHost) {
      const statusEl = overlay.querySelector("#game-over-status")!;
      statusEl.innerHTML = `
        <button id="restart-btn" style="
          padding: 12px 32px;
          margin: 8px;
          border: 1px solid ${THEME.accent};
          border-radius: 3px;
          background: ${THEME.accent};
          color: ${THEME.ink};
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        ">PLAY AGAIN</button>
        <button id="disband-btn" style="
          padding: 12px 32px;
          margin: 8px;
          border: 1px solid ${THEME.panelBorder};
          border-radius: 3px;
          background: transparent;
          color: ${THEME.muted};
          font-size: 16px;
          cursor: pointer;
        ">LEAVE</button>
      `;

      overlay.querySelector("#restart-btn")?.addEventListener("click", () => {
        overlay.remove();
        onRestart();
      });

      overlay.querySelector("#disband-btn")?.addEventListener("click", () => {
        overlay.remove();
        onDisband();
      });
    }
  }

  showRoundEnd(msg: { roundNumber: number; winnerTeam: string; reason: string }): void {
    const existing = document.getElementById("round-end-announcement");
    if (existing) existing.remove();

    const teamColor = msg.winnerTeam === "ghosts" ? THEME.ghosts : THEME.sentinels;
    const teamName = msg.winnerTeam === "ghosts" ? "GHOSTS" : "SENTINELS";

    let reasonText = "";
    switch (msg.reason) {
      case "spike_detonated":
        reasonText = "Spike uploaded successfully!";
        break;
      case "spike_decrypted":
        reasonText = "Spike decrypted!";
        break;
      case "elimination":
        reasonText = "Enemy team eliminated!";
        break;
      case "time":
        reasonText = "Time ran out!";
        break;
      default:
        reasonText = "";
    }

    const announcement = document.createElement("div");
    announcement.id = "round-end-announcement";
    announcement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      z-index: 1500;
      pointer-events: none;
      animation: fadeInOut 4s ease-in-out forwards;
    `;
    announcement.innerHTML = `
      <div style="
        font-size: 48px;
        font-weight: bold;
        color: ${teamColor};
        text-shadow: 0 0 20px ${teamColor}, 0 4px 8px rgba(0,0,0,0.5);
        margin-bottom: 12px;
      ">${teamName} WIN ROUND ${msg.roundNumber}</div>
      <div style="
        font-size: 20px;
        color: #ccc;
        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
      ">${reasonText}</div>
    `;

    if (!document.getElementById("round-announcement-style")) {
      const style = document.createElement("style");
      style.id = "round-announcement-style";
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          85% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(announcement);

    setTimeout(() => {
      announcement.remove();
    }, 4000);
  }

  removeGameOver(): void {
    document.getElementById("game-over-overlay")?.remove();
  }
}
