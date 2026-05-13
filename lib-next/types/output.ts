export interface SaveOptions {
  directory?: string;
  filename?: string;
  format?: "png" | "jpg" | "jpeg" | "webp" | "avif" | "gif";
  quality?: number;
  createDirectory?: boolean;
  naming?: "timestamp" | "counter" | "custom";
  counterStart?: number;
  prefix?: string;
  suffix?: string;
  overwrite?: boolean;
}

export interface SaveResult {
  path: string;
  filename: string;
  size: number;
  format: string;
}
