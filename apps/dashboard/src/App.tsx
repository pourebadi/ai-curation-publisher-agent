import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminSettings } from "./AdminSettings";
import { WorkerApiClient } from "./api";
import { deriveSetupCenter, redactSensitiveJson } from "./setup";
import { countErrors, countWarnings } from "./status";
import { clearOperationHistory, clearSettings, getInternalCredential, loadOperationHistory, loadSettings, saveApiBaseUrl, saveInternalCredential, saveOperationRecord } from "./storage";
import type { ApiResult, DashboardSettings, JsonObject, JsonValue, OperationName, OperationRecord, StatusBundle } from "./types";

type MainTab = "overview" | "setup" | "settings" | "integrations" | "safety" | "pilot" | "technical";
const tabs: { id: MainTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "setup", label: "Setup" },
  { id: "settings", label: "Settings" },
  { id: "integrations", label: "Integrations" },
  { id: "safety", label: "Safety" },
  { id: "pilot", label: "Pilot" },
  { id: "technical", label: "Technical" }
];

const operationLabels: Record<OperationName, string> = {
  refresh_status: "Refresh status",
  internal_auth_probe: "Check internal auth protection",
  telegram_review_dry_run: "Telegram review dry-run",
  wordpress_draft_dry_run: "WordPress draft dry-run",
  firecrawl_sandbox_fetch: "Firecrawl sandbox fetch",
  mock_e2e_smoke: "Run mock E2E smoke",
  scheduler_dry_run: "Run scheduler dry-run",
  pilot_readiness: "Controlled pilot readiness-only",
  pilot_firecrawl: "Firecrawl sandbox pilot",
  pilot_telegram_review: "Telegram review pilot",
  pilot_wordpress_draft: "WordPress draft pilot",
  pilot_combined: "Combined controlled pilot",
  admin_config_load: "Load admin settings",
  admin_config_save: "Save admin setting",
  admin_config_reset: "Reset admin setting",
  admin_config_audit: "Load admin audit"
};

function App(): JSX.Element {
  const [settings, setSettings] = useState<DashboardSettings>(() => loadSettings());
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(settings.apiBaseUrl);
  const [credentialInput, setCredentialInput] = useState("");
  const [bundle, setBundle] = useState<StatusBundle>({});
  const [history, setHistory] = useState<OperationRecord[]>(() => loadOperationHistory());
  const [busy, setBusy] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<MainTab>("overview");
  const [telegramText, setTelegramText] = useState("Review dry-run from dashboard admin panel.");
  const [wordpressTitle, setWordpressTitle] = useState("Dashboard draft dry-run");
  const [wordpressContent, setWordpressContent] = useState("This is a draft-only setup check from the dashboard.");
  const [firecrawlUrl, setFirecrawlUrl] = useState("");
  const [confirmFirecrawl, setConfirmFirecrawl] = useState(false);
  const [confirmTelegram, setConfirmTelegram] = useState(false);
  const [confirmWordPress, setConfirmWordPress] = useState(false);

  const client = useMemo(() => new WorkerApiClient(settings.apiBaseUrl, getInternalCredential()), [settings]);
  const setupCenter = useMemo(() => deriveSetupCenter(bundle, settings.hasInternalCredential), [bundle, settings.hasInternalCredential]);
  const workerReachable = bundle.health?.ok === true && bundle.status?.ok === true;
  const internalReady = settings.hasInternalCredential;
  const encryptionEnabled = readBoolean(bundle.ready, ["adminConfig", "secretEditingEnabled"]);
  const operatingMode = readString(bundle.status, ["operatingMode"]) ?? "manual_only";
  const aiProvider = readString(bundle.status, ["ai", "provider"]) ?? "mock";

  const recordOperation = useCallback((name: OperationName, ok: boolean, result: JsonValue): void => {
    const safeResult = redactSensitiveJson(result);
    const record: OperationRecord = { id: `${Date.now()}-${name}`, name, label: operationLabels[name], timestamp: new Date().toISOString(), ok, warningsCount: countWarnings(safeResult), errorsCount: countErrors(safeResult), result: safeResult };
    setHistory(saveOperationRecord(record));
  }, []);

  const refreshStatus = useCallback(async (): Promise<void> => {
    setBusy("refresh_status");
    const next = await client.getStatusBundle();
    setBundle(next);
    recordOperation("refresh_status", next.health?.ok === true && next.status?.ok === true, { health: resultToJson(next.health), status: resultToJson(next.status), ready: resultToJson(next.ready) });
    setBusy(undefined);
  }, [client, recordOperation]);

  useEffect(() => { if (settings.apiBaseUrl.length > 0) void refreshStatus(); }, [refreshStatus, settings.apiBaseUrl]);

  function saveLocalConnection(): void {
    saveApiBaseUrl(apiBaseUrlInput);
    if (credentialInput.trim().length > 0) saveInternalCredential(credentialInput, false);
    setCredentialInput("");
    setSettings(loadSettings());
    setNotice("Saved for this page session. Secret values are not stored in browser storage.");
  }

  function clearLocalSettings(): void {
    clearSettings();
    setApiBaseUrlInput("");
    setCredentialInput("");
    setSettings(loadSettings());
    setNotice("Local dashboard settings cleared.");
  }

  async function runOperation(name: OperationName, runner: () => Promise<ApiResult>, confirmText?: string): Promise<void> {
    if (!window.confirm(confirmText ?? `Run ${operationLabels[name]}?`)) return;
    setBusy(name);
    const result = await runner();
    recordOperation(name, result.ok, resultToJson(result));
    setNotice(result.ok ? `${operationLabels[name]} completed.` : `${operationLabels[name]} returned an error.`);
    setBusy(undefined);
  }

  return (
    <main className="shell">
      <header className="hero compactHero"><div><p className="eyebrow">Cloudflare Operator Dashboard</p><h1>Admin control panel</h1><p>Update safe runtime settings through the protected Worker API. Secrets are encrypted into D1 and never shown again.</p></div><div className="heroPanel"><strong>Security model</strong><span>No Cloudflare API token in frontend</span><span>No direct Worker Secret mutation</span><span>No public publishing enablement</span></div></header>
      {notice && <div className="notice">{notice}</div>}
      <nav className="topTabs" aria-label="Dashboard sections">{tabs.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? "active" : "secondary"} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>

      {activeTab === "overview" && <section className="tabPanel"><div className="sectionTitle"><div><p className="eyebrow">Overview</p><h2>Safe admin status</h2></div><button type="button" onClick={() => void refreshStatus()} disabled={busy !== undefined}>Refresh</button></div><div className={`launchStatus ${toneForOverall(setupCenter.launchSummary.overallStatus)}`}><strong>{setupCenter.launchSummary.overallStatus}</strong><span>{setupCenter.launchSummary.recommendedNextStep}</span></div><div className="overviewCards"><OverviewCard title="Worker" value={workerReachable ? "Worker is online" : "Worker connection needed"} tone={workerReachable ? "safe" : "warning"} /><OverviewCard title="Mode" value={modeLabel(operatingMode)} tone="safe" /><OverviewCard title="AI" value={aiProvider === "mock" ? "Mock AI" : `${aiProvider} configured`} tone={aiProvider === "mock" ? "warning" : "safe"} /><OverviewCard title="Admin secret" value={internalReady ? "Entered for this page" : "Required for editing"} tone={internalReady ? "safe" : "warning"} /><OverviewCard title="Secret encryption" value={encryptionEnabled === true ? "CONFIG_ENCRYPTION_KEY ready" : "Secret editing blocked"} tone={encryptionEnabled === true ? "safe" : "warning"} /><OverviewCard title="Publishing" value={setupCenter.launchSummary.publishingSafety === "Safe" ? "Public publishing disabled" : "Risky config"} tone={setupCenter.launchSummary.publishingSafety === "Safe" ? "safe" : "risky"} /></div></section>}
      {activeTab === "setup" && <section className="tabPanel"><div className="sectionTitle"><div><p className="eyebrow">Setup</p><h2>Connect dashboard to Worker</h2></div></div><p className="muted">The Worker URL is saved locally. The admin secret is kept in memory only and disappears when this page reloads.</p><label>Worker API base URL<input value={apiBaseUrlInput} onChange={(event) => setApiBaseUrlInput(event.target.value)} placeholder="https://your-worker.example.workers.dev" /></label><label>INTERNAL_API_SECRET<input value={credentialInput} onChange={(event) => setCredentialInput(event.target.value)} type="password" placeholder="Enter for this page session" /></label><div className="buttonRow"><button type="button" onClick={saveLocalConnection}>Save locally</button><button type="button" onClick={() => void refreshStatus()} disabled={busy !== undefined}>Check connection</button><button type="button" className="secondary" onClick={clearLocalSettings}>Clear</button></div><details className="subcard" open><summary>Where secrets are configured</summary><p><code>INTERNAL_API_SECRET</code> and <code>CONFIG_ENCRYPTION_KEY</code> must be configured as Cloudflare Worker Secrets. Use:</p><pre>pnpm wrangler secret put CONFIG_ENCRYPTION_KEY</pre><p>Integration credentials can be added or rotated in Settings after encryption is configured.</p></details></section>}
      {activeTab === "settings" && <AdminSettings client={client} enabled={internalReady} onNotice={setNotice} onRefreshStatus={refreshStatus} />}
      {activeTab === "integrations" && <AdminSettings client={client} enabled={internalReady} initialTab="integrations" onNotice={setNotice} onRefreshStatus={refreshStatus} />}
      {activeTab === "safety" && <AdminSettings client={client} enabled={internalReady} initialTab="safety" onNotice={setNotice} onRefreshStatus={refreshStatus} />}
      {activeTab === "pilot" && <section className="tabPanel"><div className="sectionTitle"><div><p className="eyebrow">Pilot Tests</p><h2>Safe checks only</h2></div></div><div className="buttonRow"><button type="button" onClick={() => void runOperation("pilot_readiness", () => client.runPilot({}), "Run readiness-only pilot?")} disabled={!internalReady || busy !== undefined}>Run readiness-only pilot</button><button type="button" onClick={() => void runOperation("scheduler_dry_run", () => client.runSchedulerDryRun(), "Run scheduler dry-run? This does not enable scheduler publishing.")} disabled={!internalReady || busy !== undefined}>Run scheduler dry-run</button></div><div className="grid three"><div className="subcard"><h3>Telegram review</h3><label>Review text<textarea value={telegramText} onChange={(event) => setTelegramText(event.target.value)} /></label><label className="checkRow"><input type="checkbox" checked={confirmTelegram} onChange={(event) => setConfirmTelegram(event.target.checked)} />I understand this is review-only.</label><button type="button" onClick={() => void runOperation("telegram_review_dry_run", () => client.runTelegramReviewDryRun({ text: telegramText }), "Run Telegram review dry-run?")} disabled={!internalReady || !confirmTelegram || busy !== undefined}>Run review dry-run</button></div><div className="subcard"><h3>WordPress draft</h3><label>Title<input value={wordpressTitle} onChange={(event) => setWordpressTitle(event.target.value)} /></label><label>Content<textarea value={wordpressContent} onChange={(event) => setWordpressContent(event.target.value)} /></label><label className="checkRow"><input type="checkbox" checked={confirmWordPress} onChange={(event) => setConfirmWordPress(event.target.checked)} />I understand this must remain draft-only.</label><button type="button" onClick={() => void runOperation("wordpress_draft_dry_run", () => client.runWordPressDraftDryRun({ title: wordpressTitle, content: wordpressContent }), "Run WordPress draft dry-run?")} disabled={!internalReady || !confirmWordPress || busy !== undefined}>Run draft dry-run</button></div><div className="subcard"><h3>Firecrawl sandbox</h3><label>URL<input value={firecrawlUrl} onChange={(event) => setFirecrawlUrl(event.target.value)} placeholder="https://example.com/article" /></label><label className="checkRow"><input type="checkbox" checked={confirmFirecrawl} onChange={(event) => setConfirmFirecrawl(event.target.checked)} />I understand this may call Firecrawl if enabled.</label><button type="button" onClick={() => void runOperation("firecrawl_sandbox_fetch", () => client.runFirecrawlSandboxFetch({ url: firecrawlUrl }), "Run Firecrawl sandbox fetch?")} disabled={!internalReady || !confirmFirecrawl || firecrawlUrl.trim().length === 0 || busy !== undefined}>Run sandbox fetch</button></div></div></section>}
      {activeTab === "technical" && <section className="tabPanel"><div className="sectionTitle"><div><p className="eyebrow">Technical Details</p><h2>Debugging</h2></div><button type="button" className="secondary" onClick={() => { clearOperationHistory(); setHistory([]); }}>Clear history</button></div><details className="subcard"><summary>Raw API JSON</summary><div className="grid three"><JsonPanel title="/health" result={bundle.health} /><JsonPanel title="/status" result={bundle.status} /><JsonPanel title="/ready" result={bundle.ready} /></div></details><details className="subcard"><summary>Recent operation results</summary><RecentResults history={history} /></details><details className="subcard"><summary>Non-editable protected settings</summary><ul><li>INTERNAL_API_SECRET</li><li>CONFIG_ENCRYPTION_KEY</li><li>CLOUDFLARE_API_TOKEN</li><li>CLOUDFLARE_ACCOUNT_ID</li><li>D1 database id and deployment credentials</li></ul></details></section>}
    </main>
  );
}

function OverviewCard({ title, value, tone }: { title: string; value: string; tone: "safe" | "warning" | "risky" | "plain" }): JSX.Element { return <div className={`overviewCard ${tone}`}><span>{title}</span><strong>{value}</strong></div>; }
function JsonPanel({ title, result }: { title: string; result: ApiResult | undefined }): JSX.Element { return <div className="subcard flat"><h3>{title}</h3><p className={result?.ok === true ? "okText" : "badText"}>{result === undefined ? "Not loaded" : result.ok ? "ok" : result.message}</p><details><summary>View JSON</summary><pre>{JSON.stringify(redactSensitiveJson(resultToJson(result)), null, 2)}</pre></details></div>; }
function RecentResults({ history }: { history: OperationRecord[] }): JSX.Element { return history.length === 0 ? <p className="muted">No operation results stored locally yet.</p> : <div className="historyList">{history.map((record) => <details key={record.id} className="historyItem"><summary>{record.label} · {record.ok ? "ok" : "error"} · {new Date(record.timestamp).toLocaleString()} · warnings {record.warningsCount} · errors {record.errorsCount}</summary><pre>{JSON.stringify(redactSensitiveJson(record.result), null, 2)}</pre></details>)}</div>; }
function resultToJson(result: ApiResult | undefined): JsonValue { if (result === undefined) return null; if (result.ok) return result.data as JsonValue; const data: JsonObject = { ok: false, error: result.error, message: result.message }; if (result.status !== undefined) data.status = result.status; if (result.data !== undefined) data.data = result.data; return data; }
function readBoolean(result: ApiResult | undefined, path: string[]): boolean | undefined { const value = readPath(result, path); return typeof value === "boolean" ? value : undefined; }
function readString(result: ApiResult | undefined, path: string[]): string | undefined { const value = readPath(result, path); return typeof value === "string" ? value : undefined; }
function readPath(result: ApiResult | undefined, path: string[]): unknown { if (result?.ok !== true || !isRecord(result.data)) return undefined; let current: unknown = result.data; for (const part of path) { if (!isRecord(current)) return undefined; current = current[part]; } return current; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function toneForRisk(value: "Safe" | "Warning" | "Risky"): "safe" | "warning" | "risky" { return value === "Safe" ? "safe" : value === "Warning" ? "warning" : "risky"; }
function toneForOverall(value: string): string { return value === "Pilot-ready" ? "safe" : value === "Risky config" ? "risky" : "warning"; }
function modeLabel(value: string): string { return value === "manual_only" ? "Manual only" : value === "mock_demo" ? "Mock/demo" : value === "provider_assisted" ? "Provider-assisted" : value; }
export default App;
