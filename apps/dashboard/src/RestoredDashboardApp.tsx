import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminConfigEditor, adminConfigGroupOrder, ADMIN_CONFIG_GROUP_LABELS } from "./admin-config-editor";
import { describeConnectionBundle, validateWorkerBaseUrl, WorkerApiClient } from "./api";
import { buildWizardSteps, DASHBOARD_TABS, deriveOverviewCards, nextRecommendedAction, type DashboardTab, type WizardStepId } from "./dashboard-ux";
import { buildTelegramRouteManagerSummary, telegramBotMissingText, telegramRouteManagerCopy, telegramRoutesEmptyStateText, telegramRoutesEmptyStateTitle, TELEGRAM_OUTPUT_FORM_FIELDS, TELEGRAM_ROUTE_FORM_FIELDS, type TelegramRouteManagerSummary } from "./telegram-route-manager";
import { redactSensitiveJson } from "./setup";
import { countErrors, countWarnings } from "./status";
import { clearOperationHistory, clearSettings, getInternalCredential, loadOperationHistory, loadSettings, saveApiBaseUrl, saveInternalCredential, saveOperationRecord } from "./storage";
import type { AdminAuditEntry, AdminConfigGroup, AdminConfigResponse, ApiResult, ConnectionFeedback, DashboardSettings, JsonObject, JsonValue, OperationName, OperationRecord, StatusBundle } from "./types";
import { buildWizardGuidance } from "./wizard-content";

const operationLabels: Record<OperationName, string> = {
  refresh_status: "Refresh status",
  internal_auth_probe: "Check admin access",
  telegram_review_dry_run: "Telegram review dry-run",
  wordpress_draft_dry_run: "WordPress draft dry-run",
  firecrawl_sandbox_fetch: "Firecrawl sandbox fetch",
  mock_e2e_smoke: "Mock E2E pipeline",
  scheduler_dry_run: "Scheduler dry-run",
  pilot_readiness: "Readiness check",
  pilot_firecrawl: "Firecrawl pilot",
  pilot_telegram_review: "Telegram pilot",
  pilot_wordpress_draft: "WordPress pilot",
  pilot_combined: "Combined pilot",
  admin_config_load: "Load settings",
  admin_config_save: "Save setting",
  admin_config_reset: "Reset setting",
  admin_config_audit: "Load activity"
};

type SettingsSection = AdminConfigGroup | "activity" | "technical";

const idleConnectionFeedback: ConnectionFeedback = {
  state: "idle",
  title: "Connection not checked",
  detail: "Enter the Worker URL, then save and check the connection.",
  guidance: ["Use the deployed workers.dev URL.", "The Worker URL is stored locally and is not sensitive."]
};

export default function RestoredDashboardApp(): JSX.Element {
  const [settings, setSettings] = useState<DashboardSettings>(() => loadSettings());
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(settings.apiBaseUrl);
  const [credentialInput, setCredentialInput] = useState("");
  const [bundle, setBundle] = useState<StatusBundle>({});
  const [adminConfig, setAdminConfig] = useState<AdminConfigResponse | undefined>();
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [history, setHistory] = useState<OperationRecord[]>(() => loadOperationHistory());
  const [busy, setBusy] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [connectionFeedback, setConnectionFeedback] = useState<ConnectionFeedback>(idleConnectionFeedback);
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [activeStep, setActiveStep] = useState<WizardStepId>("connect");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("ai");
  const [routeManagerData, setRouteManagerData] = useState<JsonObject | undefined>();

  const client = useMemo(() => new WorkerApiClient(settings.apiBaseUrl, getInternalCredential()), [settings]);
  const workerReachable = bundle.health?.ok === true && bundle.status?.ok === true;
  const internalReady = settings.hasInternalCredential;
  const topicWorkflow = readObject(readObject(bundle.status?.ok === true ? bundle.status.data : undefined, "telegram"), "topicWorkflow") ?? readObject(readObject(bundle.ready?.ok === true ? bundle.ready.data : undefined, "summary"), "telegramTopicWorkflow");
  const routeManagerSummary = buildTelegramRouteManagerSummary(routeManagerData ?? topicWorkflow);
  const operatingMode = readString(bundle.status?.ok === true ? bundle.status.data : undefined, "operatingMode") ?? readAdminConfigValue(adminConfig, "OPERATING_MODE") ?? "manual_only";
  const aiProvider = readString(readObject(bundle.status?.ok === true ? bundle.status.data : undefined, "ai"), "provider") ?? readAdminConfigValue(adminConfig, "AI_PROVIDER") ?? "mock";
  const telegramReady = routeManagerSummary.routeCount > 0 || readBoolean(readObject(bundle.ready?.ok === true ? bundle.ready.data : undefined, "summary"), "hasTelegramConfig") === true;
  const wordpressReady = readBoolean(readObject(bundle.ready?.ok === true ? bundle.ready.data : undefined, "summary"), "hasWordPressConfig") === true;
  const providersOptional = operatingMode === "manual_only" || operatingMode === "mock_demo";
  const schedulerSafe = readBoolean(readObject(bundle.ready?.ok === true ? bundle.ready.data : undefined, "summary"), "setupSafe") !== false;
  const deliverySafe = routeManagerSummary.finalPublishing === "Disabled";
  const overviewCards = deriveOverviewCards({ workerReachable, hasAdminAccess: internalReady, operatingMode, aiProvider, telegramReady, wordpressReady, providersOptional, schedulerSafe, publishingSafe: deliverySafe });
  const wizardSteps = buildWizardSteps({ workerReachable, hasAdminAccess: internalReady, operatingMode, aiReady: aiProvider !== "mock", telegramReady, wordpressReady, providersReady: providersOptional, routeCount: routeManagerSummary.routeCount, outputCount: routeManagerSummary.enabledOutputCount, finalPublishingEnabled: routeManagerSummary.finalPublishing === "Enabled" });
  const activeWizardStep = wizardSteps.find((step) => step.id === activeStep) ?? wizardSteps[0]!;

  const recordOperation = useCallback((name: OperationName, ok: boolean, result: JsonValue): void => {
    const safeResult = redactSensitiveJson(result);
    setHistory(saveOperationRecord({ id: `${Date.now()}-${name}`, name, label: operationLabels[name], timestamp: new Date().toISOString(), ok, warningsCount: countWarnings(safeResult), errorsCount: countErrors(safeResult), result: safeResult }));
  }, []);

  const refreshStatus = useCallback(async (): Promise<void> => {
    setBusy("refresh_status");
    const next = await client.getStatusBundle();
    setBundle(next);
    const feedback = feedbackFromBundle(next);
    setConnectionFeedback(feedback);
    recordOperation("refresh_status", next.health?.ok === true && next.status?.ok === true, { health: resultToJson(next.health), status: resultToJson(next.status), ready: resultToJson(next.ready) });
    setNotice(feedback.title);
    setBusy(undefined);
  }, [client, recordOperation]);

  useEffect(() => { if (settings.apiBaseUrl.length > 0) void refreshStatus(); }, [refreshStatus, settings.apiBaseUrl]);
  useEffect(() => { if (internalReady) { void loadAdminConfig(); void loadRouteManager(); } }, [internalReady, settings.apiBaseUrl]);

  async function saveAndCheckConnection(): Promise<void> {
    const valid = validateWorkerBaseUrl(apiBaseUrlInput);
    if (!valid.ok) { setConnectionFeedback({ state: "invalid_url", title: "Invalid Worker URL", detail: valid.message, guidance: connectionGuidance() }); setNotice("Invalid Worker URL"); return; }
    saveApiBaseUrl(valid.value);
    if (credentialInput.trim().length > 0) saveInternalCredential(credentialInput, false);
    setCredentialInput("");
    setSettings(loadSettings());
    await refreshStatus();
  }

  async function loadAdminConfig(): Promise<void> {
    if (!internalReady) return;
    setBusy("admin_config_load");
    const response = await client.getAdminConfig();
    recordOperation("admin_config_load", response.ok, resultToJson(response));
    if (response.ok) { setAdminConfig(response.data); setNotice("Settings loaded."); } else { setNotice(response.message); }
    setBusy(undefined);
  }

  async function saveSetting(key: string, value: string): Promise<void> {
    if (!internalReady) return;
    setBusy("admin_config_save");
    const response = await client.saveAdminConfig([{ key, value }]);
    recordOperation("admin_config_save", response.ok, resultToJson(response));
    if (response.ok) { setAdminConfig(response.data); setNotice(`${key} saved.`); await refreshStatus(); } else { setNotice(response.message); }
    setBusy(undefined);
  }

  async function resetSetting(key: string): Promise<void> {
    if (!internalReady) return;
    setBusy("admin_config_reset");
    const response = await client.resetAdminConfig([key]);
    recordOperation("admin_config_reset", response.ok, resultToJson(response));
    if (response.ok) { setAdminConfig(response.data); setNotice(`${key} reset.`); await refreshStatus(); } else { setNotice(response.message); }
    setBusy(undefined);
  }

  async function loadRouteManager(): Promise<void> {
    if (!internalReady) return;
    setBusy("telegram_route_config");
    const response = await client.getTelegramTopicRoutes();
    recordOperation("refresh_status", response.ok, resultToJson(response));
    if (response.ok) { setRouteManagerData(response.data); setNotice("Telegram routes loaded."); } else { setNotice(response.message); }
    setBusy(undefined);
  }

  async function validateRoutes(): Promise<void> {
    if (!internalReady) return;
    setBusy("telegram_route_config");
    const response = await client.validateTelegramTopicRoutes();
    recordOperation("refresh_status", response.ok, resultToJson(response));
    setNotice(response.ok ? "Telegram route validation completed." : response.message);
    await loadRouteManager();
    setBusy(undefined);
  }

  async function loadActivity(): Promise<void> {
    if (!internalReady) { setNotice("Admin access is needed first."); return; }
    setBusy("admin_config_audit");
    const response = await client.getAdminConfigAudit();
    if (response.ok) { setAudit(response.data.entries); setNotice("Activity loaded."); } else { setNotice(response.message); }
    setBusy(undefined);
  }

  function clearLocalSettings(): void { clearSettings(); setApiBaseUrlInput(""); setCredentialInput(""); setSettings(loadSettings()); setConnectionFeedback(idleConnectionFeedback); setNotice("Local dashboard settings cleared."); }

  return <main className="shell"><header className="hero"><div><p className="eyebrow">Operator Dashboard</p><h1>Launch and manage safely.</h1><p>A guided admin console for setup, editable settings, Telegram routing, safe checks, and activity review.</p></div><div className="heroPanel"><span>Scheduler guarded</span><span>Live delivery guarded</span><span>Secrets hidden</span></div></header>{notice && <div className="notice">{notice}</div>}<nav className="topTabs" aria-label="Dashboard sections">{DASHBOARD_TABS.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? "active" : "secondary"} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>{activeTab === "overview" && <OverviewPage cards={overviewCards} onRefresh={() => void refreshStatus()} busy={busy !== undefined} />}{activeTab === "setup" && <SetupPage steps={wizardSteps} activeStep={activeWizardStep} setActiveStep={setActiveStep} body={<WizardBody id={activeWizardStep.id} connectionFeedback={connectionFeedback} apiBaseUrlInput={apiBaseUrlInput} setApiBaseUrlInput={setApiBaseUrlInput} credentialInput={credentialInput} setCredentialInput={setCredentialInput} saveAndCheckConnection={saveAndCheckConnection} clearLocalSettings={clearLocalSettings} routeManagerSummary={routeManagerSummary} workerReachable={workerReachable} internalReady={internalReady} operatingMode={operatingMode} aiProvider={aiProvider} wordpressReady={wordpressReady} />} />}{activeTab === "settings" && <SettingsPage internalReady={internalReady} section={settingsSection} setSection={setSettingsSection} adminConfig={adminConfig} routeManagerSummary={routeManagerSummary} onLoadSettings={() => void loadAdminConfig()} onSaveSetting={saveSetting} onResetSetting={resetSetting} onLoadRoutes={() => void loadRouteManager()} onValidateRoutes={() => void validateRoutes()} busy={busy !== undefined} />}{activeTab === "tests" && <TestsPage internalReady={internalReady} busy={busy} history={history} refreshStatus={() => void refreshStatus()} validateRoutes={() => void validateRoutes()} />}{activeTab === "activity" && <ActivityPage audit={audit} enabled={internalReady} busy={busy} loadActivity={loadActivity} />}{activeTab === "technical" && <TechnicalPage bundle={bundle} adminConfig={adminConfig} history={history} clearHistory={() => { clearOperationHistory(); setHistory([]); }} />}</main>;
}

function OverviewPage({ cards, onRefresh, busy }: { cards: ReturnType<typeof deriveOverviewCards>; onRefresh: () => void; busy: boolean }): JSX.Element { return <section className="pageStack"><PageHeader eyebrow="Overview" title="System status at a glance" text="Everything important, without the technical noise." action={<button type="button" onClick={onRefresh} disabled={busy}>Refresh</button>} /><div className="nextBanner"><strong>{nextRecommendedAction(cards)}</strong></div><div className="overviewCards">{cards.map((card) => <StatusCard key={card.title} {...card} />)}</div></section>; }
function StatusCard({ title, label, explanation, nextAction }: ReturnType<typeof deriveOverviewCards>[number]): JSX.Element { return <article className="statusCard"><span className={`badge ${badgeTone(label)}`}>{label}</span><h3>{title}</h3><p>{explanation}</p><small>{nextAction}</small></article>; }
function SetupPage(props: { steps: ReturnType<typeof buildWizardSteps>; activeStep: ReturnType<typeof buildWizardSteps>[number]; setActiveStep: (step: WizardStepId) => void; body: JSX.Element }): JSX.Element { const completeCount = props.steps.filter((step) => step.state === "complete" || step.state === "optional").length; return <section className="pageStack"><PageHeader eyebrow="Setup Wizard" title="One guided launch path" text="Complete one useful step at a time. Optional steps are clearly marked." /><div className="progress"><span>{completeCount} of {props.steps.length} steps complete or optional</span><div><i style={{ width: `${Math.round((completeCount / props.steps.length) * 100)}%` }} /></div></div><div className="wizardLayout"><aside className="stepRail">{props.steps.map((step) => <button type="button" key={step.id} className={step.id === props.activeStep.id ? "active" : "ghost"} onClick={() => props.setActiveStep(step.id)} disabled={step.state === "locked"}><span>{step.title}</span><small>{step.state}</small></button>)}</aside><div className="wizardCard"><h2>{props.activeStep.title}</h2>{props.activeStep.detail && <p className="muted">{props.activeStep.detail}</p>}{props.body}</div></div></section>; }
function WizardBody(props: { id: WizardStepId; connectionFeedback: ConnectionFeedback; apiBaseUrlInput: string; setApiBaseUrlInput: (value: string) => void; credentialInput: string; setCredentialInput: (value: string) => void; saveAndCheckConnection: () => Promise<void>; clearLocalSettings: () => void; routeManagerSummary: TelegramRouteManagerSummary; workerReachable: boolean; internalReady: boolean; operatingMode: string; aiProvider: string; wordpressReady: boolean }): JSX.Element { const guidance = buildWizardGuidance({ id: props.id, workerReachable: props.workerReachable, hasAdminAccess: props.internalReady, operatingMode: props.operatingMode, aiProvider: props.aiProvider, wordpressReady: props.wordpressReady, routeManagerSummary: props.routeManagerSummary }); return <div className="wizardContent"><GuidancePanel guidance={guidance} />{(props.id === "connect" || props.id === "admin") && <div className="panel"><label>Worker URL<input value={props.apiBaseUrlInput} onChange={(event) => props.setApiBaseUrlInput(event.target.value)} placeholder="https://your-worker.workers.dev" /></label><label>Admin access <span className="muted">INTERNAL_API_SECRET</span><input type="password" value={props.credentialInput} onChange={(event) => props.setCredentialInput(event.target.value)} placeholder="Enter for this page session" /></label><div className="buttonRow"><button type="button" onClick={() => void props.saveAndCheckConnection()}>Check connection</button><button type="button" className="secondary" onClick={props.clearLocalSettings}>Clear</button></div><ConnectionPanel feedback={props.connectionFeedback} /></div>}{props.id === "telegram" && <TelegramRouteManager summary={props.routeManagerSummary} compact />}</div>; }
function GuidancePanel({ guidance }: { guidance: ReturnType<typeof buildWizardGuidance> }): JSX.Element { return <div className="panel"><h3>{guidance.title}</h3>{guidance.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{guidance.bullets.length > 0 && <ul>{guidance.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}{guidance.status.length > 0 && <div className="overviewCards">{guidance.status.map((item) => <StatusMini key={item.label} label={item.label} value={item.value} />)}</div>}</div>; }
function SettingsPage(props: { internalReady: boolean; section: SettingsSection; setSection: (section: SettingsSection) => void; adminConfig: AdminConfigResponse | undefined; routeManagerSummary: TelegramRouteManagerSummary; onLoadSettings: () => void; onSaveSetting: (key: string, value: string) => Promise<void>; onResetSetting: (key: string) => Promise<void>; onLoadRoutes: () => void; onValidateRoutes: () => void; busy: boolean }): JSX.Element { const sections: SettingsSection[] = [...adminConfigGroupOrder(), "activity", "technical"]; return <section className="pageStack"><PageHeader eyebrow="Settings" title="Configuration editor" text="Edit runtime settings here. Telegram routes stay inside Telegram settings instead of replacing the editor." action={<button type="button" onClick={props.onLoadSettings} disabled={!props.internalReady || props.busy}>Load settings</button>} />{!props.internalReady && <EmptyState title="Admin access needed" text="Enter admin access in Setup Wizard before editing settings." />}{props.internalReady && <div className="settingsLayout"><aside className="settingsSide">{sections.map((section) => <button type="button" key={section} className={props.section === section ? "active" : "ghost"} onClick={() => props.setSection(section)}>{isAdminGroup(section) ? ADMIN_CONFIG_GROUP_LABELS[section] : section === "activity" ? "Activity" : "Technical"}</button>)}</aside><div className="settingsForm">{isAdminGroup(props.section) && <AdminConfigEditor config={props.adminConfig} activeGroup={props.section} busy={props.busy} onSave={props.onSaveSetting} onReset={props.onResetSetting} />}{props.section === "telegram" && <><div className="buttonRow"><button type="button" onClick={props.onLoadRoutes} disabled={props.busy}>Load routes</button><button type="button" className="secondary" onClick={props.onValidateRoutes} disabled={props.busy}>Check route config</button></div><TelegramRouteManager summary={props.routeManagerSummary} /></>}{props.section === "activity" && <p className="muted">Use the Activity tab for audit entries.</p>}{props.section === "technical" && <p className="muted">Raw payloads are available only in Technical.</p>}</div></div>}</section>; }
function TelegramRouteManager({ summary, compact = false }: { summary: TelegramRouteManagerSummary; compact?: boolean }): JSX.Element { const botMissing = telegramBotMissingText(summary); return <div className="wizardContent"><div className="callout neutralSoft"><strong>{telegramRouteManagerCopy()}</strong><span>Use chat IDs and numeric topic IDs, not visible topic names.</span></div>{botMissing && <div className="callout warningSoft"><strong>Bot missing</strong><span>{botMissing}</span></div>}<div className="overviewCards"><StatusMini label="Bot" value={summary.botStatus} /><StatusMini label="Delivery state" value={summary.finalPublishing} /><StatusMini label="Routes" value={String(summary.routeCount)} /><StatusMini label="Enabled outputs" value={String(summary.enabledOutputCount)} /><StatusMini label="Media mode" value={summary.mediaMode} /><StatusMini label="WordPress" value={summary.wordpress} /></div>{!compact && <FormFieldSummary />}{summary.routeCards.length === 0 && <EmptyState title={telegramRoutesEmptyStateTitle()} text={telegramRoutesEmptyStateText(summary)} />}</div>; }
function FormFieldSummary(): JSX.Element { return <details className="panel"><summary>Route form guide</summary><div className="grid two"><div>{TELEGRAM_ROUTE_FORM_FIELDS.map((field) => <p key={field.label}><strong>{field.label}</strong><br /><span className="muted">{field.helper}</span></p>)}</div><div>{TELEGRAM_OUTPUT_FORM_FIELDS.map((field) => <p key={field.label}><strong>{field.label}</strong><br /><span className="muted">{field.helper}</span></p>)}</div></div></details>; }
function StatusMini({ label, value }: { label: string; value: string }): JSX.Element { return <article className="statusCard"><small>{label}</small><h3>{value}</h3></article>; }
function TestsPage(props: { internalReady: boolean; busy: string | undefined; history: OperationRecord[]; refreshStatus: () => void; validateRoutes: () => void }): JSX.Element { return <section className="pageStack"><PageHeader eyebrow="Tests" title="Safe checks" text="Run guarded checks only." /><div className="testGrid"><article className="testCard"><h3>Readiness check</h3><button type="button" onClick={props.refreshStatus} disabled={props.busy !== undefined}>Run readiness check</button></article><article className="testCard"><h3>Telegram route config</h3><button type="button" onClick={props.validateRoutes} disabled={!props.internalReady || props.busy !== undefined}>Check route config</button></article></div><RecentResults history={props.history} /></section>; }
function ActivityPage({ audit, enabled, busy, loadActivity }: { audit: AdminAuditEntry[]; enabled: boolean; busy: string | undefined; loadActivity: () => Promise<void> }): JSX.Element { return <section className="pageStack"><PageHeader eyebrow="Activity" title="Recent changes" text="Audit information for protected settings." action={<button type="button" onClick={() => void loadActivity()} disabled={!enabled || busy !== undefined}>Load audit</button>} />{!enabled && <EmptyState title="Admin access needed" text="Save admin access in Setup Wizard to load activity." />}{audit.map((entry) => <article className="activityItem" key={entry.id}><div><span className="badge neutral">{entry.action}</span><h3>{entry.key}</h3><p>{new Date(entry.changed_at).toLocaleString()}</p></div><div className="auditValues"><span>Previous: {entry.previous_value_redacted ?? "[missing]"}</span><span>New: {entry.new_value_redacted ?? "[missing]"}</span></div></article>)}</section>; }
function TechnicalPage({ bundle, adminConfig, history, clearHistory }: { bundle: StatusBundle; adminConfig: AdminConfigResponse | undefined; history: OperationRecord[]; clearHistory: () => void }): JSX.Element { return <section className="pageStack"><PageHeader eyebrow="Technical" title="Debugging details" text="Raw payloads and troubleshooting information live here only." action={<button type="button" className="secondary" onClick={clearHistory}>Clear history</button>} /><details className="panel" open><summary>Raw /status and /ready</summary><div className="grid two"><JsonPanel title="/health" result={bundle.health} /><JsonPanel title="/status" result={bundle.status} /><JsonPanel title="/ready" result={bundle.ready} /></div></details><details className="panel"><summary>Raw admin config</summary><pre>{JSON.stringify(redactSensitiveJson((adminConfig ?? null) as JsonValue), null, 2)}</pre></details><details className="panel"><summary>Raw test output</summary><RecentResults history={history} /></details></section>; }
function PageHeader({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: JSX.Element }): JSX.Element { return <div className="pageHeader"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{text}</p></div>{action}</div>; }
function EmptyState({ title, text }: { title: string; text: string }): JSX.Element { return <div className="emptyState"><h3>{title}</h3><p>{text}</p></div>; }
function ConnectionPanel({ feedback }: { feedback: ConnectionFeedback }): JSX.Element { return <div className={`callout ${feedback.state === "connected" ? "safeSoft" : "warningSoft"}`}><strong>{feedback.title}</strong><span>{feedback.detail}</span>{feedback.guidance.map((item) => <small key={item}>{item}</small>)}</div>; }
function RecentResults({ history }: { history: OperationRecord[] }): JSX.Element { return <div>{history.map((record) => <details key={record.id}><summary>{record.label} · {record.ok ? "OK" : "Error"}</summary><pre>{JSON.stringify(record.result, null, 2)}</pre></details>)}</div>; }
function JsonPanel({ title, result }: { title: string; result: ApiResult | undefined }): JSX.Element { return <div><h3>{title}</h3><pre>{JSON.stringify(result ?? null, null, 2)}</pre></div>; }
function badgeTone(value: string): string { return value === "Connected" || value === "Safe" ? "safe" : value === "Optional" ? "neutral" : "warning"; }
function feedbackFromBundle(bundle: StatusBundle): ConnectionFeedback { const state = describeConnectionBundle(bundle); if (state === "connected") return { state, title: "Worker connected", detail: "Worker health, status, and readiness are reachable.", guidance: [] }; if (state === "reachable_not_ready") return { state, title: "Worker reachable, setup incomplete", detail: "The Worker responded, but readiness has warnings.", guidance: ["Open Setup Wizard.", "Check Technical for raw readiness details."] }; if (state === "cors_blocked") return { state, title: "Browser blocked the request", detail: "Likely CORS or network configuration.", guidance: connectionGuidance() }; return { state, title: "Worker unreachable", detail: "The dashboard could not reach the Worker.", guidance: connectionGuidance() }; }
function connectionGuidance(): string[] { return ["Use the deployed Worker URL, including https://.", "For local development, use http://localhost:8787.", "Check CORS settings if the Worker opens but dashboard calls fail."]; }
function resultToJson(result: ApiResult | undefined): JsonValue { if (result === undefined) return null; if (result.ok) return result.data; const payload: JsonObject = { error: result.error, message: result.message }; if (typeof result.status === "number") payload.status = result.status; if (result.data !== undefined) payload.data = result.data; return payload; }
function isAdminGroup(value: SettingsSection): value is AdminConfigGroup { return value !== "activity" && value !== "technical"; }
function readAdminConfigValue(config: AdminConfigResponse | undefined, key: string): string | undefined { return config?.items.find((item) => item.key === key)?.value; }
function readObject(value: unknown, key: string): JsonObject | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as JsonObject)[key] === "object" && (value as JsonObject)[key] !== null && !Array.isArray((value as JsonObject)[key]) ? (value as JsonObject)[key] as JsonObject : undefined; }
function readString(value: unknown, key: string): string | undefined { const record = typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : undefined; const raw = record?.[key]; return typeof raw === "string" ? raw : undefined; }
function readBoolean(value: unknown, key: string): boolean | undefined { const record = typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : undefined; const raw = record?.[key]; return typeof raw === "boolean" ? raw : undefined; }
