/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AUTH_MODE?: "preview" | "api";
  readonly VITE_PREVIEW_USER_NAME?: string;
  readonly VITE_PREVIEW_USER_ROLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
