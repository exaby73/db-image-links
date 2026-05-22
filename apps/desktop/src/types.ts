export type ProcessMode = "single" | "multi";

export type ConnectionStatus = {
  connected: boolean;
  appKeyHint?: string | null;
};

export type AuthStart = {
  authUrl: string;
  codeVerifier: string;
};

export type SkuResult = {
  sku: string;
  links: string[];
  imageCount: number;
};

export type ProcessFailure = {
  sku: string;
  item: string;
  message: string;
};

export type ProcessResponse = {
  rows: SkuResult[];
  failures: ProcessFailure[];
  csv: string;
};
