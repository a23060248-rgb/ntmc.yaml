import { api, ApiError } from "../api/client";
import { authMode } from "../api/config";
import type { AuthSession, UserRole } from "../types/auth";
import { isUserRole } from "../types/auth";

export interface PreviewSignInInput {
  displayName: string;
  role: UserRole;
}

export interface ApiSignInInput {
  account: string;
  password: string;
}

export type SignInInput = PreviewSignInInput | ApiSignInInput;

export interface AuthAdapter {
  getSession(): Promise<AuthSession | null>;
  signIn(input: SignInInput): Promise<AuthSession>;
  signOut(): Promise<void>;
}

class PreviewAuthAdapter implements AuthAdapter {
  private session: AuthSession | null;

  constructor() {
    const configuredRole = import.meta.env.VITE_PREVIEW_USER_ROLE || "system_admin";
    const role: UserRole = isUserRole(configuredRole) ? configuredRole : "viewer";
    this.session = {
      user: {
        id: "preview-user",
        displayName: import.meta.env.VITE_PREVIEW_USER_NAME || "預覽使用者",
        role,
      },
      issuedAt: new Date().toISOString(),
      adapter: "preview",
    };
  }

  async getSession() {
    return this.session;
  }

  async signIn(input: SignInInput) {
    if (!("displayName" in input)) throw new Error("Preview login requires a display name");
    this.session = {
      user: {
        id: "preview-user",
        displayName: input.displayName.trim() || "預覽使用者",
        role: input.role,
      },
      issuedAt: new Date().toISOString(),
      adapter: "preview",
    };
    return this.session;
  }

  async signOut() {
    this.session = null;
  }
}

class ApiAuthAdapter implements AuthAdapter {
  async getSession() {
    try {
      return await api.get<AuthSession | null>("session");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }

  signIn(input: SignInInput) {
    if (!("account" in input)) throw new Error("API login requires an account and password");
    return api.post<AuthSession>("session/login", input);
  }

  async signOut() {
    await api.post("session/logout");
  }
}

export const authAdapter: AuthAdapter =
  authMode === "api" ? new ApiAuthAdapter() : new PreviewAuthAdapter();
