import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingState } from "../components/AsyncState";
import type { UserRole } from "../types/auth";
import { useAuth } from "./AuthContext";

export function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: readonly UserRole[];
}) {
  const { loading, session, hasRole } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="讀取使用者身分" fullPage />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!hasRole(roles)) return <Navigate to="/unauthorized" replace />;
  return children;
}
