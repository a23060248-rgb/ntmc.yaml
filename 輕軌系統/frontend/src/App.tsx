import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { DashboardPage } from "./modules/dashboard/DashboardPage";
import { WorkOrdersPage } from "./modules/work-orders/WorkOrdersPage";
import { PrecheckPage } from "./modules/precheck/PrecheckPage";
import { TurnaroundPage } from "./modules/turnaround/TurnaroundPage";
import { InventoryPage } from "./modules/inventory/InventoryPage";
import { MasterDataPage } from "./modules/master-data/MasterDataPage";
import { LoginPage } from "./modules/auth/LoginPage";
import { UnauthorizedPage } from "./modules/auth/UnauthorizedPage";
import { ReportsPage } from "./modules/reports/ReportsPage";
import { RequireAuth } from "./shared/auth/RequireAuth";
import { rolePolicies } from "./shared/auth/rolePolicy";

export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="unauthorized" element={<UnauthorizedPage />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="work-orders" element={<WorkOrdersPage />} />
        <Route path="precheck/*" element={<PrecheckPage />} />
        <Route path="turnaround" element={<TurnaroundPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="master-data" element={<Navigate to="/master-data/users" replace />} />
        <Route
          path="master-data/:resource"
          element={<RequireAuth roles={rolePolicies.masterWrite}><MasterDataPage /></RequireAuth>}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
