import type { GameOverMessage } from "../network/NetworkManager.js";
import { overlayOutcomeTitle } from "@shared/ui/mode-copy.js";

export class MatchOverlays {
  showGameOver(
    msg: GameOverMessage,
    sessionId: string,
    hostId: string,
    onRestart: () => void,
    onDisband: () => void,
    myTeam?: string,
  ): void {
    const overlay = document.createElement("div");
    overlay.id = "game-over-overlay";
    overlay.className = "cr-overlay-center";

    let titleHtml: string;
    let subtitleHtml: string;

    if (msg.gameMode === "deathmatch") {
      const localWon = msg.winnerId === sessionId;
      titleHtml = `<div class="cr-title">${overlayOutcomeTitle({ gameMode: "deathmatch", localWon })}</div>`;
      subtitleHtml = localWon
        ? `<div class="cr-copy">${msg.winnerName} · First to 5 kills</div>`
        : `<div class="cr-copy">${msg.winnerName} wins</div>`;
    } else {
      const localWon = myTeam !== undefined && myTeam === msg.winnerTeam;
      titleHtml = `<div class="cr-title">${overlayOutcomeTitle({
        gameMode: "search_destroy",
        localWon,
        winnerTeam: msg.winnerTeam,
        hasLocalTeam: myTeam !== undefined && myTeam.length > 0,
      })}</div>`;
      subtitleHtml = `<div class="cr-copy">Ghosts ${msg.ghostsRoundsWon} — ${msg.sentinelsRoundsWon} Sentinels</div>`;
    }

    overlay.innerHTML = `
      ${titleHtml}
      ${subtitleHtml}
      <div id="game-over-status" class="cr-status">Waiting for host...</div>
    `;

    document.body.appendChild(overlay);

    const isHost = hostId === sessionId;
    if (isHost) {
      const statusEl = overlay.querySelector("#game-over-status")!;
      statusEl.innerHTML = `
        <button id="restart-btn" type="button" class="cr-button cr-button--primary cr-button--inline">Play again</button>
        <button id="disband-btn" type="button" class="cr-button cr-button--inline">Leave</button>
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

    const teamName = msg.winnerTeam === "ghosts" ? "Ghosts" : "Sentinels";
    const teamColor = msg.winnerTeam === "ghosts" ? "var(--cr-ghost)" : "var(--cr-sentinel)";

    let reasonText = "";
    switch (msg.reason) {
      case "spike_detonated":
        reasonText = "Spike uploaded";
        break;
      case "spike_decrypted":
        reasonText = "Spike decrypted";
        break;
      case "elimination":
        reasonText = "Team eliminated";
        break;
      case "time":
        reasonText = "Time expired";
        break;
    }

    const announcement = document.createElement("div");
    announcement.id = "round-end-announcement";
    announcement.className = "cr-round-end";
    announcement.innerHTML = `
      <div class="cr-hud-label">Round won</div>
      <div class="cr-title" style="color:${teamColor};margin:0">${teamName}</div>
      <div class="cr-copy">${reasonText}</div>
    `;

    document.body.appendChild(announcement);

    setTimeout(() => {
      announcement.remove();
    }, 4000);
  }

  removeGameOver(): void {
    document.getElementById("game-over-overlay")?.remove();
  }
}
