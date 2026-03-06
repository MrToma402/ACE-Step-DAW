/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACESTEP_API_BASE?: string;
  readonly VITE_ACESTEP_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
