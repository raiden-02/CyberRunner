import * as THREE from "three";
import { SpikeObject, type SpikeState } from "./SpikeObject.js";
import { PlantSiteMarker, type PlantSiteState } from "./PlantSiteMarker.js";
import type { GameplayMapDefinition } from "@shared/world/map-types.js";
import type { Minimap, PlayerMarker, TerminalInfo } from "../ui/Minimap.js";
import type { ActionPrompt } from "../ui/ActionPrompt.js";
import type { SyncedGameState, SyncedPlayer, SyncedPlayerMap } from "../network/synced-state.js";

export class SearchDestroyView {
  private spikeObject: SpikeObject | null = null;
  private plantSiteMarkers: PlantSiteMarker[] = [];
  private map: GameplayMapDefinition | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly minimap: Minimap,
    private readonly actionPrompt: ActionPrompt,
  ) {}

  initIfNeeded(map: GameplayMapDefinition): void {
    this.map = map;
    if (this.spikeObject) return;

    this.spikeObject = new SpikeObject(this.scene);

    const terminals = map.uploadTerminals;
    if (terminals) {
      for (const t of terminals) {
        const marker = new PlantSiteMarker(this.scene, {
          id: t.id,
          x: t.x,
          z: t.z,
          radius: t.radius,
        });
        this.plantSiteMarkers.push(marker);
      }
    }
  }

  updateWorld(dt: number, state: SyncedGameState | undefined): void {
    if (this.spikeObject && state?.gameMode === "search_destroy") {
      this.spikeObject.update(dt, (state.spikeState as SpikeState) || "ground");
    }
    for (const marker of this.plantSiteMarkers) {
      marker.update(dt);
    }
  }

  updateMinimap(state: SyncedGameState | undefined, players: SyncedPlayerMap | undefined, myId: string): void {
    if (!state) {
      this.minimap.hide();
      return;
    }

    this.minimap.show();

    const isSD = state.gameMode === "search_destroy";
    const terminalsSrc = this.map?.uploadTerminals || [];

    let myTeam = "";
    if (players && typeof players.forEach === "function") {
      players.forEach((p, id) => {
        if (id === myId) {
          myTeam = p.teamId || "";
        }
      });
    }

    const isGhost = myTeam === "ghosts";
    const terminals: TerminalInfo[] = terminalsSrc.map((t) => {
      let termState: "inactive" | "uploading" | "uploaded" = "inactive";

      if (isSD && state.spikeTerminalId === t.id) {
        if (state.spikeState === "uploading" && isGhost) {
          termState = "uploading";
        } else if ((state.spikeState === "uploaded" || state.spikeState === "decrypting") && isGhost) {
          termState = "uploaded";
        }
      }

      return { id: t.id, x: t.x, z: t.z, state: termState };
    });
    this.minimap.setTerminals(terminals);

    const playerMarkers: PlayerMarker[] = [];
    if (players && typeof players.forEach === "function") {
      players.forEach((p, id) => {
        playerMarkers.push({
          id,
          x: p.x,
          z: p.z,
          rotationY: p.rotationY || 0,
          isLocal: id === myId,
          hasSpike: isSD && (p.hasSpike || false),
          isDead: p.isDead || false,
          teamId: p.teamId || "",
        });
      });
    }
    this.minimap.setPlayers(playerMarkers);

    if (isSD) {
      const spikeState = state.spikeState as SpikeState;
      const showSpikeToMyTeam =
        myTeam === "ghosts" ||
        spikeState === "uploaded" ||
        spikeState === "decrypting";

      if ((spikeState === "ground" || spikeState === "dropped") && showSpikeToMyTeam && state.spikeX !== undefined) {
        this.minimap.setDroppedSpike({ x: state.spikeX, z: state.spikeZ ?? 0 });
      } else {
        this.minimap.setDroppedSpike(null);
      }

      if (this.spikeObject) {
        const showSpike3D = spikeState === "ground" || spikeState === "dropped" ||
          spikeState === "uploading" || spikeState === "uploaded" ||
          spikeState === "decrypting";

        if (showSpike3D && state.spikeX !== undefined) {
          let spikeX = state.spikeX;
          let spikeZ = state.spikeZ ?? 0;

          if (spikeState === "uploading" || spikeState === "uploaded" || spikeState === "decrypting") {
            const terminal = terminalsSrc.find((t) => t.id === state.spikeTerminalId);
            if (terminal) {
              spikeX = terminal.x;
              spikeZ = terminal.z;
            }
          }

          this.spikeObject.setPosition(spikeX, spikeZ);
          this.spikeObject.setVisible(true);
        } else {
          this.spikeObject.setVisible(false);
        }
      }

      for (const marker of this.plantSiteMarkers) {
        const terminal = terminals.find((t) => t.id === marker.config.id);
        if (terminal) {
          marker.setState(terminal.state as PlantSiteState);
        }
      }
    } else {
      this.minimap.setDroppedSpike(null);
      this.minimap.setTerminals([]);
      if (this.spikeObject) {
        this.spikeObject.setVisible(false);
      }
      for (const marker of this.plantSiteMarkers) {
        marker.setVisible(false);
      }
    }

    this.minimap.update();
  }

  updateActionPrompt(state: SyncedGameState | undefined, myPlayer: SyncedPlayer | undefined): void {
    if (!state || state.gameMode !== "search_destroy" || !myPlayer || myPlayer.isDead) {
      this.actionPrompt.hide();
      return;
    }

    if (state.lobbyState !== "playing") {
      this.actionPrompt.hide();
      return;
    }

    const playerX = myPlayer.x || 0;
    const playerZ = myPlayer.z || 0;
    const myTeam = myPlayer.teamId || "";

    if (myPlayer.isUploading) {
      this.actionPrompt.update({
        action: "uploading",
        terminalId: state.spikeTerminalId as "A" | "B" | undefined,
        progress: state.spikeUploadProgress || 0,
      });
      return;
    }

    if (myPlayer.isDecrypting) {
      this.actionPrompt.update({
        action: "decrypting",
        terminalId: state.spikeTerminalId as "A" | "B" | undefined,
        progress: state.spikeDecryptProgress || 0,
      });
      return;
    }

    if ((state.spikeState === "ground" || state.spikeState === "dropped") && myTeam === "ghosts") {
      const dx = playerX - (state.spikeX ?? 0);
      const dz = playerZ - (state.spikeZ ?? 0);
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 2.5) {
        this.actionPrompt.update({ action: "pickup" });
        return;
      }
    }

    const terminals = this.map?.uploadTerminals || [];
    for (const terminal of terminals) {
      const dx = playerX - terminal.x;
      const dz = playerZ - terminal.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= terminal.radius) {
        if (myPlayer.hasSpike && state.spikeState === "carried" && myTeam === "ghosts") {
          this.actionPrompt.update({ action: "upload", terminalId: terminal.id });
          return;
        }

        if (state.spikeState === "uploaded" && state.spikeTerminalId === terminal.id && myTeam === "sentinels") {
          this.actionPrompt.update({ action: "decrypt", terminalId: terminal.id });
          return;
        }
      }
    }

    this.actionPrompt.hide();
  }

  dispose(): void {
    this.spikeObject?.dispose();
    this.spikeObject = null;
    for (const marker of this.plantSiteMarkers) {
      marker.dispose();
    }
    this.plantSiteMarkers = [];
    this.map = null;
  }
}
