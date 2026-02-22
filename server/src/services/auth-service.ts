import { OAuth2Client } from "google-auth-library";
import { UserService, User } from "./user-service.js";
import { SessionService, Session } from "./session-service.js";

export interface AuthResult {
  user: User;
  session: Session;
}

export interface GoogleTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export class AuthService {
  private static client: OAuth2Client | null = null;

  private static getClient(): OAuth2Client {
    if (!this.client) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        throw new Error("GOOGLE_CLIENT_ID not configured");
      }
      this.client = new OAuth2Client(clientId);
    }
    return this.client;
  }

  static async verifyGoogleToken(idToken: string): Promise<GoogleTokenPayload> {
    const client = this.getClient();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      throw new Error("Invalid token payload");
    }
    return {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
    };
  }

  static async authenticateWithGoogle(idToken: string): Promise<AuthResult> {
    const googlePayload = await this.verifyGoogleToken(idToken);
    
    const user = await UserService.upsertByGoogleSub({
      googleSub: googlePayload.sub,
      email: googlePayload.email,
    });

    const session = await SessionService.create(user.id);

    return { user, session };
  }

  static async validateSession(sessionId: string): Promise<{ user: User; session: Session } | null> {
    const session = await SessionService.findById(sessionId);
    if (!session) {
      return null;
    }

    const user = await UserService.findById(session.userId);
    if (!user) {
      await SessionService.revoke(sessionId);
      return null;
    }

    return { user, session };
  }

  static async logout(sessionId: string): Promise<void> {
    await SessionService.revoke(sessionId);
  }
}
