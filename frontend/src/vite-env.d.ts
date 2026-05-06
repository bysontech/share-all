/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API オリジン（例: https://api.example.com）。未設定時はフロントと同一オリジンの /api を利用 */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
