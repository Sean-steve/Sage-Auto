// ============================================================================
// CAR HIRE OS — SHARED AUTHENTICATION CLIENT & TOKEN MANAGEMENT
// ============================================================================

import type { User, AuthTokens, SanitizedSession } from "@carhire/types";

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  activeSession: SanitizedSession | null;
}

export class AuthClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private currentUser: User | null = null;
  private activeSession: SanitizedSession | null = null;
  private listeners: Array<(state: AuthState) => void> = [];

  constructor() {
    // Attempt to load non-sensitive user metadata and refresh token (if stored locally for browser sessions)
    try {
      const storedToken = localStorage.getItem("carhire_refresh_token");
      if (storedToken) {
        this.refreshToken = storedToken;
      }
    } catch {
      // Storage unavailable or disabled
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  getActiveSession(): SanitizedSession | null {
    return this.activeSession;
  }

  isAuthenticated(): boolean {
    return Boolean(this.accessToken && this.currentUser);
  }

  setSession(tokens: AuthTokens, user: User, session?: SanitizedSession): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.currentUser = user;
    if (session) {
      this.activeSession = session;
    }

    try {
      if (tokens.refreshToken) {
        localStorage.setItem("carhire_refresh_token", tokens.refreshToken);
      }
    } catch {
      // Storage unavailable
    }

    this.notify();
  }

  clearSession(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.currentUser = null;
    this.activeSession = null;

    try {
      localStorage.removeItem("carhire_refresh_token");
    } catch {
      // Storage unavailable
    }

    this.notify();
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getState(): AuthState {
    return {
      user: this.currentUser,
      isAuthenticated: this.isAuthenticated(),
      accessToken: this.accessToken,
      activeSession: this.activeSession,
    };
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error("Error in auth listener", err);
      }
    }
  }
}

export const globalAuthClient = new AuthClient();
