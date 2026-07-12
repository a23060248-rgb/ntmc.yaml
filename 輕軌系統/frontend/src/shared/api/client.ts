import { apiUrl } from "./config";
import { authMode } from "./config";
import type { ApiProblem } from "../types/api";

export const API_UNAUTHORIZED_EVENT = "ntmc:api-unauthorized";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(problem: ApiProblem) {
    super(problem.message);
    this.name = "ApiError";
    this.status = problem.status ?? 500;
    this.code = problem.code;
    this.details = problem.details;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
}

export function encodeHeaderValue(value: string) {
  return encodeURIComponent(value);
}

function buildUrl(path: string, query?: ApiRequestOptions["query"]) {
  const url = new URL(apiUrl(path));
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status === 204) return null;
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, headers, query, ...requestInit } = options;
  const response = await fetch(buildUrl(path, query), {
    ...requestInit,
    headers: {
      Accept: "application/json",
      ...(authMode === "preview"
        ? {
            "X-User-Role": import.meta.env.VITE_PREVIEW_USER_ROLE || "system_admin",
            "X-User-Name": encodeHeaderValue(
              import.meta.env.VITE_PREVIEW_USER_NAME || "預覽使用者",
            ),
          }
        : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: authMode === "api" ? "include" : "same-origin",
  });
  const payload = await readResponseBody(response);

  if (!response.ok) {
    if (
      response.status === 401 &&
      authMode === "api" &&
      !path.replace(/^\//, "").startsWith("session/login") &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new Event(API_UNAUTHORIZED_EVENT));
    }
    const candidate =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: ApiProblem | string }).error
        : payload;
    const problem =
      candidate && typeof candidate === "object"
        ? (candidate as ApiProblem)
        : { message: typeof candidate === "string" ? candidate : response.statusText };
    throw new ApiError({ ...problem, status: response.status });
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: ApiRequestOptions["query"], signal?: AbortSignal) =>
    apiRequest<T>(path, { method: "GET", query, signal }),
  post: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};
