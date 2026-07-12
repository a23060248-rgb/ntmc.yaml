const DEFAULT_API_BASE_URL =
  typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)
    ? `${window.location.origin}/api`
    : "http://127.0.0.1:3001/api";

export const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

const configuredAuthMode = String(import.meta.env.VITE_AUTH_MODE || "").toLowerCase();
export const authMode = configuredAuthMode === "api"
  ? "api"
  : configuredAuthMode === "preview" || import.meta.env.MODE === "preview" || import.meta.env.DEV
    ? "preview"
    : "api";

export function apiUrl(path: string) {
  return `${apiBaseUrl}/${path.replace(/^\//, "")}`;
}
