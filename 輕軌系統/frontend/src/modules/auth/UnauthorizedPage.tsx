import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export function UnauthorizedPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <ShieldAlert size={34} />
        <p className="page-kicker">權限限制</p>
        <h1>無法開啟此功能</h1>
        <p>目前角色沒有此模組的使用權限。</p>
        <Link className="primary-button" to="/">返回主儀表板</Link>
      </section>
    </main>
  );
}
