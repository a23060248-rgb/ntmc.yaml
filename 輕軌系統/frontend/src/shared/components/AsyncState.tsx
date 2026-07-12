import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({
  label = "資料載入中",
  fullPage = false,
}: {
  label?: string;
  fullPage?: boolean;
}) {
  return (
    <div className={`async-state ${fullPage ? "is-full-page" : ""}`} role="status">
      <LoaderCircle className="spin" size={24} />
      <strong>{label}</strong>
    </div>
  );
}

export function ErrorState({
  title = "資料讀取失敗",
  error,
  onRetry,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  const message = error instanceof Error ? error.message : "請稍後再試。";
  return (
    <div className="async-state is-error" role="alert">
      <AlertTriangle size={24} />
      <strong>{title}</strong>
      <span>{message}</span>
      {onRetry ? (
        <button className="secondary-button" type="button" onClick={onRetry}>
          <RefreshCw size={16} />重試
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="async-state is-empty">
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  );
}
