import type { ReactNode } from "react";
import { CircleDashed } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="page-kicker">輕軌維修系統</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  return <span className={`status-badge is-${tone}`}>{children}</span>;
}

export function EmptyModule({ label }: { label: string }) {
  return (
    <div className="empty-module">
      <CircleDashed size={24} aria-hidden="true" />
      <strong>{label}</strong>
      <span>等待下一階段接入正式資料</span>
    </div>
  );
}

export function MetricStrip({
  items,
}: {
  items: Array<{ label: string; value: string; hint: string }>;
}) {
  return (
    <section className="metric-strip" aria-label="系統摘要">
      {items.map((item) => (
        <div className="metric-item" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.hint}</small>
        </div>
      ))}
    </section>
  );
}
