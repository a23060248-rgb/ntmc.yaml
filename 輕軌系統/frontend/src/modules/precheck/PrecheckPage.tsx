import { CalendarDays, ClipboardCheck, FileText, ListChecks, Table2, Upload } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { RequireAuth } from "../../shared/auth/RequireAuth";
import { useAuth } from "../../shared/auth/AuthContext";
import { rolePolicies } from "../../shared/auth/rolePolicy";
import type { UserRole } from "../../shared/types/auth";
import { PageHeader } from "../../shared/ui";
import { AnnualView } from "./AnnualView";
import { BackfillView } from "./BackfillView";
import { CalendarView } from "./CalendarView";
import { ImportView } from "./ImportView";
import { PackageView } from "./PackageView";
import { PlanningView } from "./PlanningView";

const tabs = [
  { path: "/precheck", label: "月曆總覽", icon: CalendarDays },
  { path: "/precheck/packages", label: "作業包", icon: FileText },
  { path: "/precheck/backfill", label: "待回填", icon: ListChecks },
  { path: "/precheck/planning", label: "排班規劃", icon: ClipboardCheck },
  { path: "/precheck/planning/annual", label: "簡易驗證", icon: Table2 },
  { path: "/precheck/imports", label: "預排匯入", icon: Upload },
];

const tabRoles: Record<string, readonly UserRole[]> = {
  "/precheck": rolePolicies.precheckRead,
  "/precheck/packages": rolePolicies.packageRead,
  "/precheck/backfill": rolePolicies.backfillRead,
  "/precheck/planning": rolePolicies.scheduleRead,
  "/precheck/planning/annual": rolePolicies.precheckRead,
  "/precheck/imports": rolePolicies.scheduleRead,
};

export function PrecheckPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasRole } = useAuth();
  const activePath = location.pathname;
  const allowedTabs = tabs.filter((tab) => hasRole(tabRoles[tab.path]));
  return <div className="page-stack">
    <PageHeader title="預檢管理" description="年度預排決定檢修級別，最新完工日與排班規則決定實際日期。" />
    <div className="segmented-nav precheck-tabs" role="tablist" aria-label="預檢功能">{allowedTabs.map((tab) => <button key={tab.path} type="button" role="tab" aria-selected={activePath === tab.path || (tab.path === "/precheck/backfill" && activePath.startsWith("/precheck/backfill/"))} onClick={() => navigate(tab.path)}><tab.icon size={16} />{tab.label}</button>)}</div>
    {activePath === "/precheck" ? <CalendarView /> : null}
    {activePath === "/precheck/planning" ? <RequireAuth roles={rolePolicies.scheduleRead}><PlanningView /></RequireAuth> : null}
    {activePath === "/precheck/planning/annual" ? <AnnualView /> : null}
    {activePath === "/precheck/imports" ? <RequireAuth roles={rolePolicies.scheduleRead}><ImportView /></RequireAuth> : null}
    {activePath === "/precheck/packages" ? <RequireAuth roles={rolePolicies.packageRead}><PackageView /></RequireAuth> : null}
    {activePath.startsWith("/precheck/backfill") ? <RequireAuth roles={rolePolicies.backfillRead}><BackfillView /></RequireAuth> : null}
  </div>;
}
