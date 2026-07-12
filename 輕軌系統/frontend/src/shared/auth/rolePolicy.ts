import { userRoles, type UserRole } from "../types/auth";

export const rolePolicies = {
  read: userRoles,
  masterWrite: ["system_admin", "maintenance_supervisor"],
  scheduleWrite: ["system_admin", "maintenance_supervisor", "scheduler"],
  packageWrite: ["system_admin", "maintenance_supervisor", "scheduler"],
  backfillWrite: ["system_admin", "maintenance_supervisor", "technician"],
  workOrderWrite: ["system_admin", "maintenance_supervisor", "technician"],
  inventoryPost: ["system_admin", "maintenance_supervisor", "warehouse_staff"],
  inventoryConsume: ["system_admin", "maintenance_supervisor", "warehouse_staff", "technician"],
  turnaroundWrite: ["system_admin", "maintenance_supervisor", "technician", "warehouse_staff"],
  precheckRead: ["system_admin", "maintenance_supervisor", "scheduler", "technician", "viewer"],
  scheduleRead: ["system_admin", "maintenance_supervisor", "scheduler", "viewer"],
  packageRead: ["system_admin", "maintenance_supervisor", "scheduler", "viewer"],
  backfillRead: ["system_admin", "maintenance_supervisor", "technician", "viewer"],
  turnaroundRead: ["system_admin", "maintenance_supervisor", "technician", "warehouse_staff", "viewer"],
  inventoryRead: ["system_admin", "maintenance_supervisor", "technician", "warehouse_staff", "viewer"],
} as const satisfies Record<string, readonly UserRole[]>;
