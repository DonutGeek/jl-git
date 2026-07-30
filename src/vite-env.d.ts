/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME_ZH?: string;
  readonly VITE_APP_NAME_EN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
