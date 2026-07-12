import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  ClipboardCheck,
  Database,
  Gauge,
  PackageSearch,
  Wrench,
} from "lucide-react";
import type { UserRole } from "../shared/types/auth";
import { rolePolicies } from "../shared/auth/rolePolicy";

export interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles?: readonly UserRole[];
}

const allRoles: readonly UserRole[] = rolePolicies.read;

export const navigationItems: NavigationItem[] = [
  { label: "主儀表板", path: "/", icon: Gauge, roles: allRoles },
  { label: "工單管理", path: "/work-orders", icon: Wrench, roles: allRoles },
  {
    label: "預檢管理",
    path: "/precheck",
    icon: ClipboardCheck,
    roles: rolePolicies.precheckRead,
  },
  {
    label: "周轉件管理",
    path: "/turnaround",
    icon: Boxes,
    roles: rolePolicies.turnaroundRead,
  },
  {
    label: "物料庫存",
    path: "/inventory",
    icon: PackageSearch,
    roles: rolePolicies.inventoryRead,
  },
  {
    label: "主檔設定",
    path: "/master-data",
    icon: Database,
    roles: rolePolicies.masterWrite,
  },
];
