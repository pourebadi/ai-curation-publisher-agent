export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

export type JsonObject = {
  [key: string]: JsonValue;
};

export type ApiResult<T extends JsonValue = JsonObject> =
  | {
      ok: true;
      status: number;
      data: T;
    }
  | {
      ok: false;
      status?: number;
      error: string;
      message: string;
      data?: JsonValue;
    };

export type DashboardSettings = {
  apiBaseUrl: string;
  hasInternalCredential: boolean;
  rememberInternalCredential: boolean;
};

export type OperationName =
  | "refresh_status"
  | "mock_e2e_smoke"
  | "scheduler_dry_run"
  | "pilot_readiness"
  | "pilot_firecrawl"
  | "pilot_telegram_review"
  | "pilot_wordpress_draft"
  | "pilot_combined";

export type OperationRecord = {
  id: string;
  name: OperationName;
  label: string;
  timestamp: string;
  ok: boolean;
  warningsCount: number;
  errorsCount: number;
  result: JsonValue;
};

export type StatusBundle = {
  health?: ApiResult;
  status?: ApiResult;
  ready?: ApiResult;
};

export type PilotInput = {
  runFirecrawl?: boolean;
  runTelegramReview?: boolean;
  runWordPressDraft?: boolean;
  firecrawlUrl?: string;
  telegramText?: string;
  wordpressTitle?: string;
  wordpressContent?: string;
  sourceUrl?: string;
};

export type ChecklistItem = {
  name: string;
  purpose: string;
  where: string;
  sensitive: boolean;
  configured?: boolean;
};
