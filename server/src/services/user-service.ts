import { query } from "../db/pool.js";

export interface User {
  id: string;
  googleSub: string;
  email: string | null;
  displayName: string | null;
  primaryWeaponId: string;
  secondaryWeaponId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserData {
  googleSub: string;
  email?: string;
}

export interface UpdateProfileData {
  displayName?: string;
  primaryWeaponId?: string;
  secondaryWeaponId?: string;
}

export class UserService {
  static async findById(id: string): Promise<User | null> {
    const result = await query(
      `SELECT id, google_sub, email, display_name, primary_weapon_id, secondary_weapon_id, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  static async findByGoogleSub(googleSub: string): Promise<User | null> {
    const result = await query(
      `SELECT id, google_sub, email, display_name, primary_weapon_id, secondary_weapon_id, created_at, updated_at
       FROM users WHERE google_sub = $1`,
      [googleSub]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  static async upsertByGoogleSub(data: CreateUserData): Promise<User> {
    const result = await query(
      `INSERT INTO users (google_sub, email)
       VALUES ($1, $2)
       ON CONFLICT (google_sub) DO UPDATE SET email = COALESCE($2, users.email)
       RETURNING id, google_sub, email, display_name, primary_weapon_id, secondary_weapon_id, created_at, updated_at`,
      [data.googleSub, data.email || null]
    );
    return this.mapRow(result.rows[0]);
  }

  static async updateProfile(userId: string, data: UpdateProfileData): Promise<User | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(data.displayName);
    }
    if (data.primaryWeaponId !== undefined) {
      updates.push(`primary_weapon_id = $${paramIndex++}`);
      values.push(data.primaryWeaponId);
    }
    if (data.secondaryWeaponId !== undefined) {
      updates.push(`secondary_weapon_id = $${paramIndex++}`);
      values.push(data.secondaryWeaponId);
    }

    if (updates.length === 0) {
      return this.findById(userId);
    }

    values.push(userId);
    const result = await query(
      `UPDATE users SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, google_sub, email, display_name, primary_weapon_id, secondary_weapon_id, created_at, updated_at`,
      values
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  static hasCompletedProfile(user: User): boolean {
    return !!user.displayName && user.displayName.trim().length > 0;
  }

  private static mapRow(row: any): User {
    return {
      id: row.id,
      googleSub: row.google_sub,
      email: row.email,
      displayName: row.display_name,
      primaryWeaponId: row.primary_weapon_id || "AR_1",
      secondaryWeaponId: row.secondary_weapon_id || "PISTOL_1",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
