export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface PageMeta {
  limit: number;
  offset: number;
  total: number;
}

export interface PagedResult<T> {
  items: T[];
  page: PageMeta;
}

export interface ApiProblem {
  message: string;
  code?: string;
  details?: unknown;
  status?: number;
}

export interface HealthStatus {
  ok: boolean;
  service: string;
  timestamp: string;
  databaseTime?: string;
}
