import { query } from "../db/pool.js";

export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

const SESSION_TTL_DAYS = 30;

export class SessionService {
  static async create(userId: string): Promise<Session> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

    const result = await query(
      `INSERT INTO sessions (user_id, expires_at)
       VALUES ($1, $2)
       RETURNING id, user_id, created_at, expires_at, revoked_at`,
      [userId, expiresAt]
    );
    return this.mapRow(result.rows[0]);
  }

  static async findById(sessionId: string): Promise<Session | null> {
    const result = await query(
      `SELECT id, user_id, created_at, expires_at, revoked_at
       FROM sessions
       WHERE id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [sessionId]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  static async revoke(sessionId: string): Promise<void> {
    await query(
      `UPDATE sessions SET revoked_at = NOW() WHERE id = $1`,
      [sessionId]
    );
  }

  static async revokeAllForUser(userId: string): Promise<void> {
    await query(
      `UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  }

  static async cleanupExpired(): Promise<number> {
    const result = await query(
      `DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL`
    );
    return result.rowCount || 0;
  }

  private static mapRow(row: any): Session {
    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }
}
