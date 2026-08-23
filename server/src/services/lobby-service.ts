export type RoomGameMode = "deathmatch" | "search_destroy";

export interface RoomInfo {
  roomId: string;
  joinCode: string;
  playerCount: number;
  maxPlayers: number;
  createdAt: Date;
  gameMode: RoomGameMode;
  mapId: string;
}

export type RoomMetadata = {
  gameMode: RoomGameMode;
  mapId: string;
};

const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 8;

function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class LobbyService {
  private static rooms = new Map<string, RoomInfo>();
  private static joinCodes = new Map<string, string>();

  static getMaxPlayers(): number {
    return MAX_PLAYERS;
  }

  /** Test helper. Clears in-memory rooms. */
  static reset(): void {
    this.rooms.clear();
    this.joinCodes.clear();
  }

  static registerRoom(roomId: string, meta: RoomMetadata): RoomInfo {
    let joinCode = generateJoinCode();
    while (this.joinCodes.has(joinCode)) {
      joinCode = generateJoinCode();
    }

    const info: RoomInfo = {
      roomId,
      joinCode,
      playerCount: 0,
      maxPlayers: MAX_PLAYERS,
      createdAt: new Date(),
      gameMode: meta.gameMode,
      mapId: meta.mapId,
    };

    this.rooms.set(roomId, info);
    this.joinCodes.set(joinCode, roomId);
    return info;
  }

  static unregisterRoom(roomId: string): void {
    const info = this.rooms.get(roomId);
    if (info) {
      this.joinCodes.delete(info.joinCode);
      this.rooms.delete(roomId);
    }
  }

  static updatePlayerCount(roomId: string, count: number): void {
    const info = this.rooms.get(roomId);
    if (info) {
      info.playerCount = count;
    }
  }

  static getRoomByCode(joinCode: string): RoomInfo | null {
    const code = joinCode.toUpperCase().trim();
    const roomId = this.joinCodes.get(code);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  static getRoomById(roomId: string): RoomInfo | null {
    return this.rooms.get(roomId) || null;
  }

  static findAvailableRoom(filter: { gameMode: RoomGameMode; mapId: string }): RoomInfo | null {
    for (const info of this.rooms.values()) {
      if (info.playerCount >= info.maxPlayers) continue;
      if (info.gameMode !== filter.gameMode) continue;
      if (info.mapId !== filter.mapId) continue;
      return info;
    }
    return null;
  }

  static isRoomFull(roomId: string): boolean {
    const info = this.rooms.get(roomId);
    return info ? info.playerCount >= info.maxPlayers : true;
  }

  static getAllRooms(): RoomInfo[] {
    return Array.from(this.rooms.values());
  }
}
