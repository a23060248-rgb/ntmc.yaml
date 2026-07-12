import { api } from "./client";
import type { HealthStatus } from "../types/api";

export function getApiHealth(signal?: AbortSignal) {
  return api.get<HealthStatus>("health", undefined, signal);
}

export function getDatabaseHealth(signal?: AbortSignal) {
  return api.get<HealthStatus>("health/db", undefined, signal);
}
