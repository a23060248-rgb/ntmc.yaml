export const userRoles = [
  "system_admin",
  "maintenance_supervisor",
  "scheduler",
  "technician",
  "warehouse_staff",
  "viewer",
] as const;

export type UserRole = (typeof userRoles)[number];

export interface AppUser {
  id: string;
  displayName: string;
  role: UserRole;
  department?: string;
}

export interface AuthSession {
  user: AppUser;
  issuedAt: string;
  expiresAt?: string;
  adapter: "preview" | "api";
}

export const roleLabels: Record<UserRole, string> = {
  system_admin: "系統管理員",
  maintenance_supervisor: "維修主管",
  scheduler: "排程人員",
  technician: "維修人員",
  warehouse_staff: "倉管人員",
  viewer: "唯讀人員",
};

export function isUserRole(value: string): value is UserRole {
  return userRoles.includes(value as UserRole);
}
