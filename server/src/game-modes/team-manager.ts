// Team Manager - handles team assignment and balance for team-based modes

export type TeamId = "ghosts" | "sentinels";

export interface TeamState {
  players: Set<string>;
  roundsWon: number;
  alivePlayers: number;
}

export class TeamManager {
  private teams: Map<TeamId, TeamState> = new Map();
  private playerTeams: Map<string, TeamId> = new Map();
  private maxPlayersPerTeam: number;
  private allowSoloStart = false;

  constructor(maxPlayersPerTeam: number = 4) {
    this.maxPlayersPerTeam = maxPlayersPerTeam;
    this.teams.set("ghosts", { players: new Set(), roundsWon: 0, alivePlayers: 0 });
    this.teams.set("sentinels", { players: new Set(), roundsWon: 0, alivePlayers: 0 });
  }

  getTeamState(teamId: TeamId): TeamState | undefined {
    return this.teams.get(teamId);
  }

  getPlayerTeam(sessionId: string): TeamId | undefined {
    return this.playerTeams.get(sessionId);
  }

  getTeamPlayers(teamId: TeamId): string[] {
    const team = this.teams.get(teamId);
    return team ? Array.from(team.players) : [];
  }

  getTeamCount(teamId: TeamId): number {
    const team = this.teams.get(teamId);
    return team ? team.players.size : 0;
  }

  getGhostsCount(): number {
    return this.getTeamCount("ghosts");
  }

  getSentinelsCount(): number {
    return this.getTeamCount("sentinels");
  }

  isTeamFull(teamId: TeamId): boolean {
    return this.getTeamCount(teamId) >= this.maxPlayersPerTeam;
  }

  // Assign player to a specific team
  assignToTeam(sessionId: string, teamId: TeamId): boolean {
    if (this.isTeamFull(teamId)) {
      return false;
    }

    // Remove from current team if any
    const currentTeam = this.playerTeams.get(sessionId);
    if (currentTeam) {
      const team = this.teams.get(currentTeam);
      if (team) {
        team.players.delete(sessionId);
      }
    }

    // Add to new team
    const team = this.teams.get(teamId);
    if (team) {
      team.players.add(sessionId);
      this.playerTeams.set(sessionId, teamId);
      return true;
    }
    return false;
  }

  // Auto-assign to balanced team
  autoAssignTeam(sessionId: string): TeamId {
    const ghostsCount = this.getGhostsCount();
    const sentinelsCount = this.getSentinelsCount();
    
    // Assign to smaller team, or ghosts if equal
    const teamId: TeamId = ghostsCount <= sentinelsCount ? "ghosts" : "sentinels";
    this.assignToTeam(sessionId, teamId);
    return teamId;
  }

  removePlayer(sessionId: string): void {
    const teamId = this.playerTeams.get(sessionId);
    if (teamId) {
      const team = this.teams.get(teamId);
      if (team) {
        team.players.delete(sessionId);
      }
      this.playerTeams.delete(sessionId);
    }
  }

  // Round management
  startRound(): void {
    for (const team of this.teams.values()) {
      team.alivePlayers = team.players.size;
    }
  }

  onPlayerDeath(sessionId: string): void {
    const teamId = this.playerTeams.get(sessionId);
    if (teamId) {
      const team = this.teams.get(teamId);
      if (team) {
        team.alivePlayers = Math.max(0, team.alivePlayers - 1);
      }
    }
  }

  onPlayerRespawn(sessionId: string): void {
    const teamId = this.playerTeams.get(sessionId);
    if (teamId) {
      const team = this.teams.get(teamId);
      if (team) {
        team.alivePlayers++;
      }
    }
  }

  getAlivePlayersOnTeam(teamId: TeamId): number {
    const team = this.teams.get(teamId);
    return team ? team.alivePlayers : 0;
  }

  // Check if team is eliminated (all players dead with no lives remaining)
  isTeamEliminated(teamId: TeamId, getPlayerLives: (sessionId: string) => number): boolean {
    const team = this.teams.get(teamId);
    if (!team || team.players.size === 0) return false;
    
    // Team is eliminated only if ALL players have 0 lives remaining
    for (const sessionId of team.players) {
      if (getPlayerLives(sessionId) > 0) {
        return false;
      }
    }
    return true;
  }

  // Check if a team has been eliminated
  getEliminatedTeam(getPlayerLives: (sessionId: string) => number): TeamId | null {
    if (this.isTeamEliminated("ghosts", getPlayerLives)) return "ghosts";
    if (this.isTeamEliminated("sentinels", getPlayerLives)) return "sentinels";
    return null;
  }

  awardRoundWin(teamId: TeamId): number {
    const team = this.teams.get(teamId);
    if (team) {
      const prev = team.roundsWon;
      team.roundsWon++;
      console.log(`[TEAM] awardRoundWin(${teamId}): ${prev} -> ${team.roundsWon}`);
      return team.roundsWon;
    }
    return 0;
  }

  getTeamRoundsWon(teamId: TeamId): number {
    const team = this.teams.get(teamId);
    return team ? team.roundsWon : 0;
  }

  // Reset for new game
  resetGame(): void {
    console.log(`[TEAM] resetGame called - resetting all team rounds to 0`);
    for (const team of this.teams.values()) {
      team.roundsWon = 0;
      team.alivePlayers = team.players.size;
    }
  }

  setAllowSoloStart(allowed: boolean): void {
    this.allowSoloStart = allowed;
  }

  canStartGame(): boolean {
    const ghostsCount = this.getGhostsCount();
    const sentinelsCount = this.getSentinelsCount();
    if (this.allowSoloStart) {
      return ghostsCount + sentinelsCount >= 1;
    }
    return ghostsCount >= 1 && sentinelsCount >= 1;
  }

  // Get all players
  getAllPlayers(): string[] {
    const players: string[] = [];
    for (const team of this.teams.values()) {
      for (const player of team.players) {
        players.push(player);
      }
    }
    return players;
  }
}
