import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authAdapter, type SignInInput } from "./adapters";
import type { AuthSession, UserRole } from "../types/auth";
import { API_UNAUTHORIZED_EVENT } from "../api/client";

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  signIn(input: SignInInput): Promise<void>;
  signOut(): Promise<void>;
  hasRole(roles?: readonly UserRole[]): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authAdapter
      .getSession()
      .then((nextSession) => {
        if (active) setSession(nextSession);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const clearExpiredSession = () => setSession(null);
    window.addEventListener(API_UNAUTHORIZED_EVENT, clearExpiredSession);
    return () => window.removeEventListener(API_UNAUTHORIZED_EVENT, clearExpiredSession);
  }, []);

  const signIn = useCallback(async (input: SignInInput) => {
    setSession(await authAdapter.signIn(input));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authAdapter.signOut();
    } finally {
      setSession(null);
    }
  }, []);

  const hasRole = useCallback(
    (roles?: readonly UserRole[]) =>
      Boolean(session && (!roles?.length || roles.includes(session.user.role))),
    [session],
  );

  const value = useMemo(
    () => ({ session, loading, signIn, signOut, hasRole }),
    [hasRole, loading, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
