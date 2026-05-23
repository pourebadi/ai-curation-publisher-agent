import type { DashboardSettings, OperationRecord } from "./types";

const apiBaseUrlKey = "curator.dashboard.apiBaseUrl";
const internalCredentialSessionKey = "curator.dashboard.internalCredential.session";
const internalCredentialLocalKey = "curator.dashboard.internalCredential.local";
const rememberInternalCredentialKey = "curator.dashboard.rememberInternalCredential";
const operationHistoryKey = "curator.dashboard.operationHistory";

export function loadSettings(): DashboardSettings {
  const apiBaseUrl = globalThis.localStorage?.getItem(apiBaseUrlKey) ?? "";
  const rememberInternalCredential = globalThis.localStorage?.getItem(rememberInternalCredentialKey) === "true";
  const storedCredential = rememberInternalCredential
    ? globalThis.localStorage?.getItem(internalCredentialLocalKey)
    : globalThis.sessionStorage?.getItem(internalCredentialSessionKey);

  return {
    apiBaseUrl,
    hasInternalCredential: Boolean(storedCredential),
    rememberInternalCredential
  };
}

export function saveApiBaseUrl(value: string): void {
  globalThis.localStorage?.setItem(apiBaseUrlKey, value.trim());
}

export function saveInternalCredential(value: string, remember: boolean): void {
  clearInternalCredential();
  globalThis.localStorage?.setItem(rememberInternalCredentialKey, remember ? "true" : "false");

  if (value.trim().length === 0) {
    return;
  }

  if (remember) {
    globalThis.localStorage?.setItem(internalCredentialLocalKey, value);
    return;
  }

  globalThis.sessionStorage?.setItem(internalCredentialSessionKey, value);
}

export function getInternalCredential(): string | undefined {
  const rememberInternalCredential = globalThis.localStorage?.getItem(rememberInternalCredentialKey) === "true";
  const value = rememberInternalCredential
    ? globalThis.localStorage?.getItem(internalCredentialLocalKey)
    : globalThis.sessionStorage?.getItem(internalCredentialSessionKey);

  return value === null || value === undefined || value.length === 0 ? undefined : value;
}

export function clearInternalCredential(): void {
  globalThis.sessionStorage?.removeItem(internalCredentialSessionKey);
  globalThis.localStorage?.removeItem(internalCredentialLocalKey);
}

export function clearSettings(): void {
  globalThis.localStorage?.removeItem(apiBaseUrlKey);
  globalThis.localStorage?.removeItem(rememberInternalCredentialKey);
  clearInternalCredential();
}

export function loadOperationHistory(): OperationRecord[] {
  const raw = globalThis.localStorage?.getItem(operationHistoryKey);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as OperationRecord[];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function saveOperationRecord(record: OperationRecord): OperationRecord[] {
  const next = [record, ...loadOperationHistory()].slice(0, 10);
  globalThis.localStorage?.setItem(operationHistoryKey, JSON.stringify(next));
  return next;
}

export function clearOperationHistory(): void {
  globalThis.localStorage?.removeItem(operationHistoryKey);
}
