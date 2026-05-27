import { useEffect, useMemo, useState } from "react";
import { describeConnectionBundle, validateWorkerBaseUrl, WorkerApiClient } from "./api";
import { clearSettings, getInternalCredential, loadSettings, saveApiBaseUrl, saveInternalCredential } from "./storage";
import type { AdminConfigItem, AdminConfigResponse, ApiResult, DashboardSettings, JsonObject, JsonValue, StatusBundle } from "./types";
import { Alert, Badge, Button, Card, CardHeader, DataTable, Input, Progress, Select, StatCard, Switch, Textarea } from "./shared/ui";
import { BarChartCard, DonutChartCard, FunnelCard } from "./shared/charts";
import { RouteOutputBuilder } from "./features/admin-control/route-output-builder";
import { PublishQueueTable } from "./features/admin-control/publish-queue-table";
import { PromptStudioPanel } from "./features/admin-control/prompt-studio-panel";
import { SetupWizardPanel } from "./features/admin-control/setup-wizard-panel";
import { filterSettings, findSetting, groupLabel, groupedSettings, relatedSettingForIssue, removeDraft, SettingsEditor, settingValue, sourceTone } from "./features/admin-control/settings-editor";
import { PromptDiffPanel, PromptRunsTable } from "./features/admin-control/prompt-studio-panels";

type DashboardTab = "overview" | "setup" | "settings" | "ai" | "providers" | "telegram" | "routes" | "media" | "prompts" | "publishing" | "diagnostics" | "activity" | "technical";
type PromptProfileForm = { id: string; name: string; category: string; language: string; contentType: string; version: string; status: string; systemPrompt: string; userPromptTemplate: string; modelHint: string; temperature: string; maxTokens: string; riskPolicy: string; styleGuide: string };
type PromptBindingForm = { routeId: string; routeOutputId: string; category: string; language: string; promptProfileId: string; contentType: string };
type SettingFilter = { groups?: string[]; keys?: string[]; keyIncludes?: string[]; excludeSecrets?: boolean };

const emptyPromptForm: PromptProfileForm = {
  id: "telegram_crypto_fa_v1",
  name: "Crypto FA Telegram Editorial",
  category: "crypto",
  language: "fa",
  contentType: "social_post",
  version: "1.0.0",
  status: "draft",
  systemPrompt: [
    "You are an editorial automation assistant for Telegram publishing.",
    "Write in {{language}} for the {{category}} audience.",
    "Preserve facts from the source. Do not invent claims, prices, quotes, or financial advice.",
    "Return only valid JSON matching the Telegram output schema."
  ].join("\n"),
  userPromptTemplate: [
    "Category: {{category}}",
    "Language: {{language}}",
    "Source URL: {{sourceUrl}}",
    "Original text:",
    "{{sourceText}}",
    "Links:",
    "{{links}}",
    "Channel signature:",
    "{{channelSignature}}",
    "Task: rewrite the source into a Telegram-ready caption."
  ].join("\n"),
  modelHint: "",
  temperature: "0.4",
  maxTokens: "1200",
  riskPolicy: "Do not provide financial advice or unsupported claims.",
  styleGuide: "Concise, accurate, source-faithful, and ready for human review."
};

const emptyBindingForm: PromptBindingForm = { routeId: "", routeOutputId: "", category: "crypto", language: "fa", promptProfileId: "telegram_crypto_fa_v1", contentType: "social_post" };

const aiModelPresets = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  gemini: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite"]
};

export default function ModernDashboardApp(): JSX.Element {
  const [settings, setSettings] = useState<DashboardSettings>(() => loadSettings());
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(settings.apiBaseUrl);
  const [credentialInput, setCredentialInput] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [statusBundle, setStatusBundle] = useState<StatusBundle>({});
  const [summary, setSummary] = useState<JsonObject | undefined>(undefined);
  const [metrics, setMetrics] = useState<JsonObject | undefined>(undefined);
  const [timeseries, setTimeseries] = useState<JsonObject | undefined>(undefined);
  const [validation, setValidation] = useState<JsonObject | undefined>(undefined);
  const [adminConfig, setAdminConfig] = useState<AdminConfigResponse | undefined>(undefined);
  const [routes, setRoutes] = useState<JsonObject[]>([]);
  const [outputs, setOutputs] = useState<JsonObject[]>([]);
  const [mediaJobs, setMediaJobs] = useState<JsonObject[]>([]);
  const [publishQueue, setPublishQueue] = useState<JsonObject[]>([]);
  const [promptStudio, setPromptStudio] = useState<JsonObject | undefined>(undefined);
  const [adminExport, setAdminExport] = useState<JsonObject | undefined>(undefined);
  const [configImportText, setConfigImportText] = useState("");
  const [configImportInput, setConfigImportInput] = useState("");
  const [configImportPreview, setConfigImportPreview] = useState<JsonObject | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [busyQueueId, setBusyQueueId] = useState<string | undefined>(undefined);
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});
  const [settingsSection, setSettingsSection] = useState("all");
  const [queueStatusFilter, setQueueStatusFilter] = useState("all");
  const [queueSearch, setQueueSearch] = useState("");
  const [promptForm, setPromptForm] = useState<PromptProfileForm>(emptyPromptForm);
  const [bindingForm, setBindingForm] = useState<PromptBindingForm>(emptyBindingForm);
  const [promptPreview, setPromptPreview] = useState<JsonObject | undefined>(undefined);
  const [testResult, setTestResult] = useState<JsonObject | undefined>(undefined);

  const client = useMemo(() => new WorkerApiClient(settings.apiBaseUrl, getInternalCredential()), [settings]);
  const connectionState = describeConnectionBundle(statusBundle);
  const issues = readArray(validation ?? summary, "issues");
  const readiness = readObject(summary, "readiness") ?? readObject(validation, "readiness");
  const readinessScore = readNumber(readiness, "score") ?? 0;
  const metricCards = readObject(metrics, "cards") ?? {};
  const metricDistributions = readObject(metrics, "distributions") ?? {};
  const metricTimeSeries = readObject(metrics, "timeSeries") ?? {};
  const promptProfiles = readArray(promptStudio, "profiles");
  const promptBindings = readArray(promptStudio, "bindings");
  const promptRuns = readArray(promptStudio, "runs");
  const allSettings = adminConfig?.items ?? [];

  useEffect(() => {
    if (settings.apiBaseUrl.length > 0) void refreshAll();
  }, [settings.apiBaseUrl]);

  async function saveAndConnect(): Promise<void> {
    const valid = validateWorkerBaseUrl(apiBaseUrlInput);
    if (!valid.ok) { setNotice(valid.message); return; }
    saveApiBaseUrl(valid.value);
    if (credentialInput.trim().length > 0) saveInternalCredential(credentialInput.trim(), false);
    setCredentialInput("");
    const nextSettings = loadSettings();
    setSettings(nextSettings);
    await refreshAll(new WorkerApiClient(nextSettings.apiBaseUrl, getInternalCredential()));
  }

  function clearConnection(): void {
    clearSettings();
    const nextSettings = loadSettings();
    setSettings(nextSettings);
    setApiBaseUrlInput("");
    setCredentialInput("");
    setStatusBundle({});
    setSummary(undefined);
    setMetrics(undefined);
    setTimeseries(undefined);
    setValidation(undefined);
    setAdminConfig(undefined);
    setRoutes([]);
    setOutputs([]);
    setMediaJobs([]);
    setPublishQueue([]);
    setPromptStudio(undefined);
    setNotice("Worker URL and Admin secret were cleared from this browser session.");
  }

  async function refreshAll(targetClient = client): Promise<void> {
    setBusy("refresh");
    const nextStatus = await targetClient.getStatusBundle();
    setStatusBundle(nextStatus);
    const [nextConfig, nextSummary, nextValidation, nextMetrics, nextTimeseries, nextRoutes, nextJobs, nextQueue, nextPrompts] = await Promise.all([
      targetClient.getAdminConfig(),
      targetClient.getAdminSummary(),
      targetClient.getAdminValidation(),
      targetClient.getAdminMetricsOverview(),
      targetClient.getAdminMetricsTimeseries(30),
      targetClient.getTelegramTopicRoutes(),
      targetClient.getMediaJobs(25),
      targetClient.getTelegramPublishQueue(50),
      targetClient.getPromptStudio()
    ]);
    if (nextConfig.ok) setAdminConfig(nextConfig.data);
    if (nextSummary.ok) setSummary(nextSummary.data);
    if (nextValidation.ok) setValidation(nextValidation.data);
    if (nextMetrics.ok) setMetrics(nextMetrics.data);
    if (nextTimeseries.ok) setTimeseries(nextTimeseries.data);
    if (nextRoutes.ok) {
      const routeItems = readArray(nextRoutes.data, "routes");
      setRoutes(routeItems);
      setOutputs(routeItems.flatMap((route) => readArray(route, "outputs").map((output) => ({ ...output, routeId: readString(output, "routeId") ?? readString(route, "id") ?? "unknown", category: readString(route, "category") ?? "uncategorized" }))));
    }
    if (nextJobs.ok) setMediaJobs(readArray(nextJobs.data, "jobs"));
    if (nextQueue.ok) setPublishQueue(readArray(nextQueue.data, "queue"));
    if (nextPrompts.ok) setPromptStudio(nextPrompts.data);
    setNotice(connectionNotice(nextStatus, nextSummary, nextValidation));
    setBusy(undefined);
  }

  async function saveSetting(item: AdminConfigItem): Promise<void> {
    const value = settingValue(item, settingDrafts);
    if (item.isSecret && value.trim().length === 0) { setNotice(`Enter a new value before saving ${item.key}. Existing secret values are never displayed.`); return; }
    setBusy(`save-${item.key}`);
    const response = await client.saveAdminConfig([{ key: item.key, value }]);
    setNotice(response.ok ? `Saved ${item.key}.` : response.message);
    if (response.ok) { setAdminConfig(response.data); setSettingDrafts((drafts) => removeDraft(drafts, item.key)); await refreshAll(); }
    setBusy(undefined);
  }

  async function resetSetting(item: AdminConfigItem): Promise<void> {
    setBusy(`reset-${item.key}`);
    const response = await client.resetAdminConfig([item.key]);
    setNotice(response.ok ? `Reset ${item.key} to environment/default.` : response.message);
    if (response.ok) { setAdminConfig(response.data); setSettingDrafts((drafts) => removeDraft(drafts, item.key)); await refreshAll(); }
    setBusy(undefined);
  }

  async function publishQueueItemNow(queueId: string): Promise<void> {
    const confirmed = globalThis.confirm?.(`Publish queue item ${queueId} now? This sends to the final Telegram channel.`) ?? true;
    if (!confirmed) return;
    setBusyQueueId(queueId);
    setNotice(`Publishing ${queueId} now...`);
    const response = await client.publishTelegramNow(queueId);
    setNotice(response.ok ? `Published ${queueId}.` : response.message);
    if (response.ok) await refreshAll();
    setBusyQueueId(undefined);
  }

  async function bulkPublishQueueNow(queueIds: string[]): Promise<void> {
    if (queueIds.length === 0) return;
    const confirmed = globalThis.confirm?.(`Publish ${queueIds.length} selected queue item(s) now? This sends to final Telegram channels.`) ?? true;
    if (!confirmed) return;
    setBusyQueueId("bulk");
    setNotice(`Publishing ${queueIds.length} selected item(s)...`);
    const response = await client.bulkPublishTelegramNow(queueIds);
    setNotice(response.ok ? `Bulk publish completed for ${queueIds.length} selected item(s).` : response.message);
    if (response.ok) await refreshAll();
    setBusyQueueId(undefined);
  }

  async function runDuePublishing(): Promise<void> {
    setBusy("publish-due");
    const response = await client.runTelegramPublishDue(5);
    setNotice(response.ok ? "Due publishing run completed." : response.message);
    await refreshAll();
    setBusy(undefined);
  }

  async function bulkPublishQueueItems(queueIds: string[]): Promise<void> {
    if (queueIds.length === 0) return;
    const confirmed = globalThis.confirm?.(`Publish ${queueIds.length} selected queue item(s) now?`) ?? true;
    if (!confirmed) return;
    setBusy("bulk-publish");
    const response = await client.bulkPublishTelegramNow(queueIds);
    setNotice(response.ok ? `Bulk publish completed for ${queueIds.length} item(s).` : response.message);
    await refreshAll();
    setBusy(undefined);
  }

  async function cancelQueueItem(queueId: string): Promise<void> {
    const confirmed = globalThis.confirm?.(`Cancel queue item ${queueId}?`) ?? true;
    if (!confirmed) return;
    setBusyQueueId(queueId);
    const response = await client.cancelTelegramPublishQueueItem(queueId);
    setNotice(response.ok ? `Cancelled ${queueId}.` : response.message);
    await refreshAll();
    setBusyQueueId(undefined);
  }

  async function rescheduleQueueItem(queueId: string): Promise<void> {
    const defaultDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const scheduledFor = globalThis.prompt?.("New scheduled time as ISO timestamp", defaultDate) ?? "";
    if (!scheduledFor.trim()) return;
    setBusyQueueId(queueId);
    const response = await client.rescheduleTelegramPublishQueueItem(queueId, scheduledFor.trim());
    setNotice(response.ok ? `Rescheduled ${queueId}.` : response.message);
    await refreshAll();
    setBusyQueueId(undefined);
  }

  async function saveRoute(route: JsonObject, existing: boolean): Promise<void> {
    setBusy("save-route");
    const routeId = readString(route, "id") ?? "";
    const response = existing ? await client.updateTelegramRoute(routeId, route) : await client.saveTelegramRoute(route);
    setNotice(response.ok ? `${existing ? "Updated" : "Created"} route ${routeId}.` : response.message);
    if (response.ok) await refreshAll();
    setBusy(undefined);
  }

  async function disableRoute(routeId: string): Promise<void> {
    if (!routeId) return;
    const confirmed = globalThis.confirm?.(`Disable route ${routeId}?`) ?? true;
    if (!confirmed) return;
    setBusy("disable-route");
    const response = await client.disableTelegramRoute(routeId);
    setNotice(response.ok ? `Disabled route ${routeId}.` : response.message);
    if (response.ok) await refreshAll();
    setBusy(undefined);
  }

  async function saveOutput(routeId: string, output: JsonObject, existing: boolean): Promise<void> {
    setBusy("save-output");
    const outputId = readString(output, "id") ?? "";
    const response = existing ? await client.updateTelegramRouteOutput(outputId, output) : await client.saveTelegramRouteOutput(routeId, output);
    setNotice(response.ok ? `${existing ? "Updated" : "Created"} output ${outputId}.` : response.message);
    if (response.ok) await refreshAll();
    setBusy(undefined);
  }

  async function disableOutput(outputId: string): Promise<void> {
    if (!outputId) return;
    const confirmed = globalThis.confirm?.(`Disable output ${outputId}?`) ?? true;
    if (!confirmed) return;
    setBusy("disable-output");
    const response = await client.disableTelegramRouteOutput(outputId);
    setNotice(response.ok ? `Disabled output ${outputId}.` : response.message);
    if (response.ok) await refreshAll();
    setBusy(undefined);
  }

  async function runAdminTest(kind: "ai" | "provider" | "telegram", input: JsonObject): Promise<void> {
    setBusy(`test-${kind}`);
    const response = kind === "ai" ? await client.testAI(input) : kind === "provider" ? await client.testProvider(input) : await client.testTelegram(input);
    setTestResult(response.ok ? response.data : { ok: false, error: response.error, message: response.message, ...(response.data === undefined ? {} : { data: response.data }) });
    setNotice(response.ok ? `${kind} test completed.` : response.message);
    setBusy(undefined);
  }

  function previewConfigImport(): void {
    try {
      const parsed = JSON.parse(configImportInput) as unknown;
      const root = readObject(parsed);
      if (!root) { setConfigImportPreview({ ok: false, message: "Import payload must be a JSON object." }); return; }
      setConfigImportPreview({
        ok: true,
        version: root.version ?? "unknown",
        routes: readArray(root, "routes").length,
        outputs: readArray(root, "routes").reduce((total, route) => total + readArray(route, "outputs").length, 0),
        hasMediaSettings: readObject(root, "mediaSettings") !== undefined,
        hasAiSettings: readObject(root, "aiSettings") !== undefined,
        hasPublishing: readObject(root, "publishing") !== undefined,
        note: "Preview only. This UI does not apply imports yet; use it to review handoff files safely before manual apply."
      });
    } catch (error) {
      setConfigImportPreview({ ok: false, message: error instanceof Error ? error.message : "Invalid JSON." });
    }
  }

  async function importSafeConfig(): Promise<void> {
    let parsed: unknown;
    try { parsed = JSON.parse(configImportText); }
    catch { setNotice("Config import JSON is invalid."); return; }
    const updates = readArray(parsed, "updates");
    if (updates.length === 0) { setNotice("Config import expects { updates: [{ key, value }] }."); return; }
    const editableByKey = new Map((adminConfig?.items ?? []).map((item) => [item.key, item]));
    const safeUpdates = updates.flatMap((entry): Array<{ key: string; value: string }> => {
      const key = readString(entry, "key");
      const value = readString(entry, "value");
      const item = key ? editableByKey.get(key) : undefined;
      if (!key || value === undefined || item === undefined || item.isSecret) return [];
      return [{ key, value }];
    });
    if (safeUpdates.length === 0) { setNotice("No non-secret editable settings were found in the import payload."); return; }
    setBusy("import-config");
    const response = await client.saveAdminConfig(safeUpdates);
    setNotice(response.ok ? `Imported ${safeUpdates.length} non-secret setting(s).` : response.message);
    if (response.ok) { setConfigImportText(""); await refreshAll(); }
    setBusy(undefined);
  }

  async function loadExport(): Promise<void> {
    setBusy("export");
    const response = await client.exportAdminConfig();
    if (response.ok) { setAdminExport(response.data); setNotice("Safe config export loaded. Secret values are excluded."); }
    else setNotice(response.message);
    setBusy(undefined);
  }

  async function savePromptProfile(): Promise<void> {
    setBusy("save-prompt");
    const payload: JsonObject = {
      id: promptForm.id,
      name: promptForm.name,
      category: promptForm.category,
      language: promptForm.language,
      contentType: promptForm.contentType,
      version: promptForm.version,
      status: promptForm.status,
      systemPrompt: promptForm.systemPrompt,
      userPromptTemplate: promptForm.userPromptTemplate,
      modelHint: promptForm.modelHint,
      temperature: Number(promptForm.temperature),
      maxTokens: Number(promptForm.maxTokens),
      riskPolicy: promptForm.riskPolicy,
      styleGuide: promptForm.styleGuide
    };
    const response = await client.savePromptProfile(payload);
    setNotice(response.ok ? "Prompt profile saved." : response.message);
    if (response.ok) await reloadPrompts();
    setBusy(undefined);
  }

  async function activatePrompt(profileId: string): Promise<void> {
    setBusy("activate-prompt");
    const response = await client.activatePromptProfile(profileId);
    setNotice(response.ok ? "Prompt activated." : response.message);
    if (response.ok) await reloadPrompts();
    setBusy(undefined);
  }

  async function archivePrompt(profileId: string): Promise<void> {
    const confirmed = globalThis.confirm?.(`Archive prompt ${profileId}?`) ?? true;
    if (!confirmed) return;
    setBusy("archive-prompt");
    const response = await client.archivePromptProfile(profileId);
    setNotice(response.ok ? "Prompt archived." : response.message);
    if (response.ok) await reloadPrompts();
    setBusy(undefined);
  }

  async function savePromptBinding(): Promise<void> {
    setBusy("bind-prompt");
    const payload: JsonObject = {
      routeId: bindingForm.routeId,
      routeOutputId: bindingForm.routeOutputId,
      category: bindingForm.category,
      language: bindingForm.language,
      contentType: bindingForm.contentType,
      promptProfileId: bindingForm.promptProfileId,
      enabled: true
    };
    const response = await client.savePromptBinding(payload);
    setNotice(response.ok ? "Prompt binding saved." : response.message);
    if (response.ok) await reloadPrompts();
    setBusy(undefined);
  }

  async function previewPrompt(): Promise<void> {
    setBusy("preview-prompt");
    const response = await client.previewPrompt({ systemPrompt: promptForm.systemPrompt, userPromptTemplate: promptForm.userPromptTemplate, promptProfileId: promptForm.id, promptVersion: promptForm.version, model: promptForm.modelHint });
    if (response.ok) { setPromptPreview(readObject(response.data, "preview")); setNotice("Prompt preview rendered."); }
    else setNotice(response.message);
    setBusy(undefined);
  }

  async function reloadPrompts(): Promise<void> {
    const response = await client.getPromptStudio();
    if (response.ok) setPromptStudio(response.data);
  }

  return <main className="modern-shell">
    <aside className="modern-sidebar">
      <div className="brand-mark">AI</div>
      <div><p className="ui-eyebrow">Curation Control</p><h1>Publisher Ops</h1><p>shadcn-style control center for setup, prompts, media, and publishing.</p></div>
      <nav>{tabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}><span>{tab.icon}</span>{tab.label}</button>)}</nav>
      <div className="sidebar-status"><Badge tone={connectionState === "connected" ? "success" : connectionState === "unreachable" || connectionState === "cors_blocked" ? "danger" : "warning"}>{connectionState}</Badge><small>{settings.apiBaseUrl || "No Worker URL saved"}</small>{settings.hasInternalCredential && <Badge tone="success">admin secret in session</Badge>}</div>
    </aside>
    <section className="modern-main">
      <header className="modern-topbar"><div><p className="ui-eyebrow">{activeTab}</p><h2>{activeTabLabel(activeTab)}</h2><p>{notice ?? "Connect to a Worker, review readiness, and manage operations safely."}</p></div><div className="connect-panel"><Input label="Worker URL" value={apiBaseUrlInput} onChange={setApiBaseUrlInput} placeholder="https://worker.example.workers.dev" /><Input label="Admin secret" value={credentialInput} onChange={setCredentialInput} type="password" placeholder="Paste only locally" /><Button onClick={() => void saveAndConnect()} disabled={busy !== undefined}>Save & Connect</Button><Button variant="secondary" onClick={() => void refreshAll()} disabled={busy !== undefined}>Refresh</Button><Button variant="ghost" onClick={clearConnection} disabled={busy !== undefined}>Clear connection</Button></div></header>
      {connectionGuidance(connectionState, settings.apiBaseUrl, summary, validation)}
      {activeTab === "overview" && <OverviewPage readinessScore={readinessScore} metricCards={metricCards} distributions={metricDistributions} timeseries={metricTimeSeries} routes={routes} issues={issues} />}
      {activeTab === "setup" && <SetupWizardPanel summary={summary} validation={validation} adminConfig={adminConfig} routes={routes} outputs={outputs} onOpenTab={(tab) => setActiveTab(tab as DashboardTab)} onTest={(input) => runAdminTest(input.provider ? "ai" : input.kind ? "telegram" : "provider", input)} testResult={testResult} busy={busy} />}
      {activeTab === "settings" && <SettingsCenterPage adminConfig={adminConfig} allSettings={allSettings} drafts={settingDrafts} setDrafts={setSettingDrafts} activeSection={settingsSection} setActiveSection={setSettingsSection} onSave={saveSetting} onReset={resetSetting} busy={busy} />}
      {activeTab === "ai" && <AISettingsPage adminConfig={adminConfig} items={filterSettings(allSettings, { groups: ["ai"] })} drafts={settingDrafts} setDrafts={setSettingDrafts} onSave={saveSetting} onReset={resetSetting} busy={busy} onTest={(input) => runAdminTest("ai", input)} testResult={testResult} />}
      {activeTab === "providers" && <ProvidersPage summary={summary} items={filterSettings(allSettings, { groups: ["providers", "content_input", "quotas"], keyIncludes: ["PROVIDER", "FIRECRAWL", "APIFY", "GETXAPI", "EXTERNAL_LINK", "MAX_PROVIDER"] })} drafts={settingDrafts} setDrafts={setSettingDrafts} onSave={saveSetting} onReset={resetSetting} busy={busy} onTest={(provider) => runAdminTest("provider", { provider })} testResult={testResult} />}
      {activeTab === "telegram" && <TelegramSettingsPage summary={summary} items={filterSettings(allSettings, { groups: ["telegram"], keyIncludes: ["TELEGRAM"] })} routes={routes} outputs={outputs} drafts={settingDrafts} setDrafts={setSettingDrafts} onSave={saveSetting} onReset={resetSetting} busy={busy} onTest={(input) => runAdminTest("telegram", input)} testResult={testResult} />}
      {activeTab === "routes" && <RoutesPage routes={routes} outputs={outputs} busy={busy} onSaveRoute={saveRoute} onDisableRoute={disableRoute} onSaveOutput={saveOutput} onDisableOutput={disableOutput} />}
      {activeTab === "media" && <MediaPage summary={summary} mediaJobs={mediaJobs} items={filterSettings(allSettings, { keyIncludes: ["MEDIA", "GITHUB_MEDIA", "TELEGRAM_MEDIA"] })} drafts={settingDrafts} setDrafts={setSettingDrafts} onSave={saveSetting} onReset={resetSetting} busy={busy} />}
      {activeTab === "prompts" && <PromptStudioPanel profiles={promptProfiles} bindings={promptBindings} runs={promptRuns} promptStudio={promptStudio} promptForm={promptForm} setPromptForm={setPromptForm} bindingForm={bindingForm} setBindingForm={setBindingForm} promptPreview={promptPreview} onSavePrompt={savePromptProfile} onActivatePrompt={activatePrompt} onArchivePrompt={archivePrompt} onSaveBinding={savePromptBinding} onPreviewPrompt={previewPrompt} busy={busy} />}
      {activeTab === "publishing" && <PublishingPage summary={summary} publishQueue={publishQueue} items={filterSettings(allSettings, { groups: ["scheduler", "quotas"], keyIncludes: ["PUBLISH", "SCHEDULER", "MAX_PUBLISH", "TELEGRAM_PUBLISH"] })} drafts={settingDrafts} setDrafts={setSettingDrafts} onSave={saveSetting} onReset={resetSetting} busy={busy} onPublishNow={publishQueueItemNow} onCancel={cancelQueueItem} onReschedule={rescheduleQueueItem} onRunDue={runDuePublishing} onBulkPublishNow={bulkPublishQueueItems} busyQueueId={busyQueueId} queueStatusFilter={queueStatusFilter} setQueueStatusFilter={setQueueStatusFilter} queueSearch={queueSearch} setQueueSearch={setQueueSearch} />}
      {activeTab === "diagnostics" && <DiagnosticsPage issues={issues} validation={validation} summary={summary} onExport={loadExport} adminExport={adminExport} importInput={configImportInput} setImportInput={setConfigImportInput} onPreviewImport={previewConfigImport} importPreview={configImportPreview} />}
      {activeTab === "activity" && <ActivityPage mediaJobs={mediaJobs} publishQueue={publishQueue} onPublishNow={publishQueueItemNow} onCancel={cancelQueueItem} onReschedule={rescheduleQueueItem} onBulkPublishNow={bulkPublishQueueItems} busyQueueId={busyQueueId} />}
      {activeTab === "technical" && <TechnicalPage statusBundle={statusBundle} summary={summary} metrics={metrics} timeseries={metricTimeSeries} adminConfig={adminConfig} promptStudio={promptStudio} />}
    </section>
  </main>;
}

function OverviewPage({ readinessScore, metricCards, distributions, timeseries, routes, issues }: { readinessScore: number; metricCards: JsonObject; distributions: JsonObject; timeseries: JsonObject | undefined; routes: JsonObject[]; issues: JsonObject[] }): JSX.Element {
  return <div className="page-grid">
    <Card className="hero-card"><CardHeader eyebrow="Executive overview" title="Operator-ready dashboard" description="A modern shadcn-style cockpit for launch readiness, media flow, prompts, and publishing KPIs." /><Progress value={readinessScore} label="Readiness score" /><div className="issue-strip">{issues.slice(0, 3).map((issue) => <Badge key={readString(issue, "code") ?? Math.random().toString()} tone={issueTone(readString(issue, "severity"))}>{readString(issue, "area")}: {readString(issue, "code")}</Badge>)}</div></Card>
    <div className="stats-grid">
      <StatCard label="Active routes" value={readNumber(metricCards, "activeRoutes") ?? 0} helper="Enabled source categories" tone="info" />
      <StatCard label="Enabled outputs" value={readNumber(metricCards, "enabledOutputs") ?? 0} helper="Language/channel outputs" tone="success" />
      <StatCard label="Ready reviews" value={readNumber(metricCards, "readyForReview") ?? 0} helper="Awaiting human approval" tone="warning" />
      <StatCard label="Scheduled" value={readNumber(metricCards, "scheduled") ?? 0} helper="Queued for final channel" tone="info" />
      <StatCard label="Media pending" value={readNumber(metricCards, "mediaPending") ?? 0} helper="Dispatching or processing" tone="warning" />
      <StatCard label="Failures" value={(readNumber(metricCards, "failedOutputs") ?? 0) + (readNumber(metricCards, "mediaFailed") ?? 0)} helper="Outputs and media jobs" tone="danger" />
    </div>
    <div className="chart-grid"><DonutChartCard title="Output status" description="Generated output lifecycle distribution." data={readDistribution(distributions, "outputsByStatus")} /><BarChartCard title="Languages" description="Generated output volume by language." data={readDistribution(distributions, "outputsByLanguage")} /><FunnelCard title="Media pipeline" description="Current media processor state." steps={funnelFromDistribution(readDistribution(distributions, "mediaJobsByStatus"))} /></div>
    <AnalyticsSummary timeseries={timeseries} />
    <Card><CardHeader title="Route topology" description="Source category to language outputs." /><DataTable rows={routes} columns={[{ key: "id", label: "Route" }, { key: "category", label: "Category" }, { key: "sourceThreadId", label: "Source topic" }, { key: "outputs", label: "Outputs", render: (row) => readArray(row, "outputs").length }, { key: "enabled", label: "Status", render: (row) => <Badge tone={readBoolean(row, "enabled") === false ? "muted" : "success"}>{readBoolean(row, "enabled") === false ? "Disabled" : "Enabled"}</Badge> }]} /></Card>
  </div>;
}

function AnalyticsSummary({ timeseries }: { timeseries: JsonObject | undefined }): JSX.Element {
  const series = readObject(timeseries, "series");
  const outputs = readArray(series, "outputs");
  const published = readArray(series, "published");
  const mediaJobs = readArray(series, "mediaJobs");
  const rows = mergeDailySeries(outputs, published, mediaJobs);
  return <Card><CardHeader title="Weekly / monthly analytics" description="Daily operational trend for generated outputs, published posts, and media jobs. Range comes from the backend metrics endpoint." /><DataTable rows={rows} emptyText="No timeseries data yet." columns={[{ key: "day", label: "Day" }, { key: "outputs", label: "Outputs" }, { key: "published", label: "Published" }, { key: "mediaJobs", label: "Media jobs" }]} /></Card>;
}

function SettingsCenterPage(props: { adminConfig: AdminConfigResponse | undefined; allSettings: AdminConfigItem[]; drafts: Record<string, string>; setDrafts: (updater: (drafts: Record<string, string>) => Record<string, string>) => void; activeSection: string; setActiveSection: (value: string) => void; onSave: (item: AdminConfigItem) => Promise<void>; onReset: (item: AdminConfigItem) => Promise<void>; busy: string | undefined }): JSX.Element {
  const groups = groupedSettings(props.allSettings);
  const sections = [{ id: "all", label: "All settings" }, ...Object.keys(groups).map((group) => ({ id: group, label: groupLabel(group) }))];
  const visibleItems = props.activeSection === "all" ? props.allSettings : groups[props.activeSection] ?? [];
  return <div className="page-grid"><Card className="hero-card"><CardHeader eyebrow="Settings Center" title="Editable runtime configuration" description="Change D1-backed overrides safely. Secrets are write-only; saved values are never displayed." /><div className="settings-section-tabs">{sections.map((section) => <Button key={section.id} variant={props.activeSection === section.id ? "default" : "secondary"} size="sm" onClick={() => props.setActiveSection(section.id)}>{section.label}</Button>)}</div>{props.adminConfig?.adminConfigStore?.warning && <Alert title="Config store warning" tone="warning">{props.adminConfig.adminConfigStore.warning}</Alert>}</Card><SettingsEditor items={visibleItems} drafts={props.drafts} setDrafts={props.setDrafts} onSave={props.onSave} onReset={props.onReset} busy={props.busy} /></div>;
}

function AISettingsPage(props: { adminConfig: AdminConfigResponse | undefined; items: AdminConfigItem[]; drafts: Record<string, string>; setDrafts: (updater: (drafts: Record<string, string>) => Record<string, string>) => void; onSave: (item: AdminConfigItem) => Promise<void>; onReset: (item: AdminConfigItem) => Promise<void>; busy: string | undefined; onTest: (input: JsonObject) => Promise<void>; testResult: JsonObject | undefined }): JSX.Element {
  const providerSetting = findSetting(props.adminConfig, "AI_PROVIDER");
  const modelSetting = findSetting(props.adminConfig, "AI_MODEL");
  const provider = settingValue(providerSetting ?? ({ key: "AI_PROVIDER", isSecret: false, value: "mock" } as AdminConfigItem), props.drafts) || "mock";
  const model = settingValue(modelSetting ?? ({ key: "AI_MODEL", isSecret: false, value: "mock" } as AdminConfigItem), props.drafts) || "mock";
  return <div className="page-grid"><Card className="hero-card"><CardHeader eyebrow="AI Settings" title="Provider, models, keys, and output behavior" description="Use mock for safe demos, or configure OpenAI/Gemini/custom credentials for real AI output generation." /><div className="settings-hint-grid"><ProviderPreset title="OpenAI presets" values={props.adminConfig?.presets?.openai ?? aiModelPresets.openai} /><ProviderPreset title="Gemini presets" values={props.adminConfig?.presets?.gemini ?? aiModelPresets.gemini} /><Alert title="AI test" tone="info">Run a safe readiness test. Mock does not call external services; real providers require configured API keys.</Alert></div><div className="button-row"><Button variant="secondary" disabled={props.busy !== undefined} onClick={() => void props.onTest({ provider, model, prompt: "Return a compact JSON hello in Persian.", runReal: provider !== "mock" })}>Test selected AI provider</Button></div>{props.testResult && <pre>{JSON.stringify(props.testResult, null, 2)}</pre>}</Card><SettingsEditor items={props.items} drafts={props.drafts} setDrafts={props.setDrafts} onSave={props.onSave} onReset={props.onReset} busy={props.busy} /></div>;
}

function ProvidersPage(props: { summary: JsonObject | undefined; items: AdminConfigItem[]; drafts: Record<string, string>; setDrafts: (updater: (drafts: Record<string, string>) => Record<string, string>) => void; onSave: (item: AdminConfigItem) => Promise<void>; onReset: (item: AdminConfigItem) => Promise<void>; busy: string | undefined; onTest: (provider: string) => Promise<void>; testResult: JsonObject | undefined }): JSX.Element {
  const providers = readObject(props.summary, "providers");
  return <div className="page-grid"><Card className="hero-card"><CardHeader eyebrow="Provider Settings" title="Social source and scraping providers" description="Configure provider-assisted ingestion without enabling real providers accidentally." /><div className="stats-grid compact"><StatCard label="Mode" value={readString(providers, "providersMode") ?? "mock"} tone="info" /><StatCard label="Setup required" value={readBoolean(providers, "setupRequired") ? "Yes" : "No"} tone={readBoolean(providers, "setupRequired") ? "warning" : "success"} /><StatCard label="Setup satisfied" value={readBoolean(providers, "setupSatisfied") ? "Yes" : "No"} tone={readBoolean(providers, "setupSatisfied") ? "success" : "warning"} /></div><div className="button-row"><Button variant="secondary" onClick={() => void props.onTest("mock")} disabled={props.busy !== undefined}>Test mock</Button><Button variant="secondary" onClick={() => void props.onTest("firecrawl")} disabled={props.busy !== undefined}>Test Firecrawl</Button><Button variant="secondary" onClick={() => void props.onTest("apify")} disabled={props.busy !== undefined}>Test Apify</Button><Button variant="secondary" onClick={() => void props.onTest("getxapi")} disabled={props.busy !== undefined}>Test GetXAPI</Button></div>{props.testResult && <pre>{JSON.stringify(props.testResult, null, 2)}</pre>}<Alert title="Provider tests" tone="info">Provider tests check credential readiness. Firecrawl can run a live network test from the backend when explicitly requested in the API.</Alert></Card><SettingsEditor items={props.items} drafts={props.drafts} setDrafts={props.setDrafts} onSave={props.onSave} onReset={props.onReset} busy={props.busy} /></div>;
}

function TelegramSettingsPage(props: { summary: JsonObject | undefined; items: AdminConfigItem[]; routes: JsonObject[]; outputs: JsonObject[]; drafts: Record<string, string>; setDrafts: (updater: (drafts: Record<string, string>) => Record<string, string>) => void; onSave: (item: AdminConfigItem) => Promise<void>; onReset: (item: AdminConfigItem) => Promise<void>; busy: string | undefined; onTest: (input: JsonObject) => Promise<void>; testResult: JsonObject | undefined }): JSX.Element {
  const telegram = readObject(props.summary, "telegram");
  const topicWorkflow = readObject(telegram, "topicWorkflow");
  const firstOutput = props.outputs[0];
  const reviewChatId = readString(firstOutput, "reviewChatId") ?? readString(telegram, "reviewChatId") ?? "";
  const reviewThreadId = readNumber(firstOutput, "reviewThreadId");
  const finalChatId = readString(firstOutput, "finalChatId") ?? "";
  return <div className="page-grid"><Card className="hero-card"><CardHeader eyebrow="Telegram Setup" title="Bot, topics, reviewers, and final channels" description="Source topics feed routes. Review topics are human control points. Media Registry is internal infrastructure. Final channels are public outputs." /><div className="stats-grid compact"><StatCard label="Bot token" value={readBoolean(topicWorkflow, "botTokenConfigured") ? "Configured" : "Missing"} tone={readBoolean(topicWorkflow, "botTokenConfigured") ? "success" : "warning"} /><StatCard label="Routes" value={readNumber(topicWorkflow, "routeCount") ?? props.routes.length} /><StatCard label="Final publishing" value={readBoolean(topicWorkflow, "finalPublishingEnabled") ? "Enabled" : "Disabled"} tone={readBoolean(topicWorkflow, "finalPublishingEnabled") ? "warning" : "muted"} /></div><div className="button-row"><Button variant="secondary" onClick={() => void props.onTest({ kind: "bot" })} disabled={props.busy !== undefined}>Test bot token</Button><Button variant="secondary" onClick={() => void props.onTest(telegramTestPayload(reviewChatId, reviewThreadId))} disabled={props.busy !== undefined || !reviewChatId}>Test review topic</Button><Button variant="secondary" onClick={() => void props.onTest(telegramTestPayload(finalChatId))} disabled={props.busy !== undefined || !finalChatId}>Test final channel reachability</Button></div>{props.testResult && <pre>{JSON.stringify(props.testResult, null, 2)}</pre>}<Alert title="Topic ID guidance" tone="info">Use numeric chat IDs and message_thread_id values. Topic names are only for humans; routing uses sourceChatId/sourceThreadId.</Alert></Card><SettingsEditor items={props.items} drafts={props.drafts} setDrafts={props.setDrafts} onSave={props.onSave} onReset={props.onReset} busy={props.busy} /><Card><CardHeader title="Routes and outputs" description="Use the Routes tab to create or edit route/output records." /><DataTable rows={props.outputs} columns={[{ key: "routeId", label: "Route" }, { key: "language", label: "Lang" }, { key: "reviewThreadId", label: "Review topic" }, { key: "finalChatId", label: "Final" }, { key: "publishMode", label: "Mode" }, { key: "permission", label: "Permission tests", render: (row) => <div className="inline-actions"><Button size="sm" variant="secondary" onClick={() => void props.onTest(telegramTestPayload(readString(row, "reviewChatId"), readNumber(row, "reviewThreadId")))} disabled={props.busy !== undefined || !readString(row, "reviewChatId")}>Review</Button><Button size="sm" variant="secondary" onClick={() => void props.onTest(telegramTestPayload(readString(row, "finalChatId")))} disabled={props.busy !== undefined || !readString(row, "finalChatId")}>Final</Button></div> }]} /></Card></div>;
}

function RoutesPage(props: { routes: JsonObject[]; outputs: JsonObject[]; busy: string | undefined; onSaveRoute: (route: JsonObject, existing: boolean) => Promise<void>; onDisableRoute: (routeId: string) => Promise<void>; onSaveOutput: (routeId: string, output: JsonObject, existing: boolean) => Promise<void>; onDisableOutput: (outputId: string) => Promise<void> }): JSX.Element {
  return <RouteOutputBuilder routes={props.routes} outputs={props.outputs} busy={props.busy} onSaveRoute={props.onSaveRoute} onDisableRoute={props.onDisableRoute} onSaveOutput={props.onSaveOutput} onDisableOutput={props.onDisableOutput} />;
}

function MediaPage(props: { summary: JsonObject | undefined; mediaJobs: JsonObject[]; items: AdminConfigItem[]; drafts: Record<string, string>; setDrafts: (updater: (drafts: Record<string, string>) => Record<string, string>) => void; onSave: (item: AdminConfigItem) => Promise<void>; onReset: (item: AdminConfigItem) => Promise<void>; busy: string | undefined }): JSX.Element {
  const media = readObject(props.summary, "media");
  const github = readObject(media, "github");
  return <div className="page-grid"><Card className="hero-card"><CardHeader eyebrow="Internal Media Registry" title="Telegram cache stays as the default media registry" description="Media Cache remains the safest default for multi-language outputs: one upload creates reusable Telegram file IDs for every review and final channel." /><div className="stats-grid compact"><StatCard label="Mode" value={readString(media, "mode") ?? "unknown"} /><StatCard label="Cache topic" value={readString(media, "cacheThreadId") || readString(media, "stagingThreadId") || "missing"} tone={readString(media, "cacheThreadId") ? "success" : "warning"} /><StatCard label="GitHub workflow" value={readString(github, "workflowId") ?? "media-processor.yml"} helper={readString(github, "ref") ?? "main"} /></div><Alert title="Design decision" tone="info">The cache topic is intentionally internal. It prevents duplicate uploads when one source item creates several language/category outputs.</Alert></Card><SettingsEditor items={props.items} drafts={props.drafts} setDrafts={props.setDrafts} onSave={props.onSave} onReset={props.onReset} busy={props.busy} /><Card><CardHeader title="Recent media jobs" description="Monitor processing, dispatch, and Telegram file ID readiness." /><DataTable rows={props.mediaJobs} columns={[{ key: "id", label: "Job" }, { key: "itemId", label: "Item" }, { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(readString(row, "status"))}>{readString(row, "status") ?? "unknown"}</Badge> }, { key: "sourceUrl", label: "Source" }, { key: "errorMessage", label: "Error" }]} /></Card></div>;
}

function PublishingPage(props: { summary: JsonObject | undefined; publishQueue: JsonObject[]; items: AdminConfigItem[]; drafts: Record<string, string>; setDrafts: (updater: (drafts: Record<string, string>) => Record<string, string>) => void; onSave: (item: AdminConfigItem) => Promise<void>; onReset: (item: AdminConfigItem) => Promise<void>; busy: string | undefined; onPublishNow: (queueId: string) => Promise<void>; onBulkPublishNow: (queueIds: string[]) => Promise<void>; onCancel: (queueId: string) => Promise<void>; onReschedule: (queueId: string) => Promise<void>; onRunDue: () => Promise<void>; busyQueueId: string | undefined; queueStatusFilter: string; setQueueStatusFilter: (value: string) => void; queueSearch: string; setQueueSearch: (value: string) => void }): JSX.Element {
  const publishing = readObject(props.summary, "publishing");
  const filteredQueue = filterQueue(props.publishQueue, props.queueStatusFilter, props.queueSearch);
  return <div className="page-grid"><Card className="hero-card"><CardHeader eyebrow="Publishing Control" title="Queue, scheduler, and final channel controls" description="Use Publish now for selected items. Due publishing remains scheduler-oriented and processes older due items first." action={<Button variant="secondary" onClick={() => void props.onRunDue()} disabled={props.busy !== undefined}>Run due publishing</Button>} /><div className="stats-grid compact"><StatCard label="Final publishing" value={readBoolean(publishing, "finalPublishingEnabled") ? "Enabled" : "Disabled"} tone={readBoolean(publishing, "finalPublishingEnabled") ? "warning" : "muted"} /><StatCard label="Publish scheduler" value={readBoolean(publishing, "publishSchedulerEnabled") ? "Enabled" : "Disabled"} tone={readBoolean(publishing, "publishSchedulerEnabled") ? "success" : "warning"} /><StatCard label="Due limit" value={readNumber(publishing, "dueLimit") ?? "-"} /></div><Alert title="Manual publish safety" tone="warning">Publish now sends the selected queue item to the final Telegram channel after confirmation. Published and currently publishing rows are not actionable.</Alert></Card><Card><CardHeader title="Publish queue" description="Filter and publish selected pending, scheduled, or failed items." /><div className="grid two"><Select label="Status filter" value={props.queueStatusFilter} onChange={props.setQueueStatusFilter} options={["all", "pending", "scheduled", "failed", "published", "publishing"].map((value) => ({ value, label: value }))} /><Input label="Search queue/final/output" value={props.queueSearch} onChange={props.setQueueSearch} placeholder="queueId, generatedOutputId, @channel" /></div><PublishQueueTable rows={filteredQueue} onPublishNow={props.onPublishNow} onBulkPublishNow={props.onBulkPublishNow} onCancel={props.onCancel} onReschedule={props.onReschedule} busyQueueId={props.busyQueueId} /></Card><SettingsEditor items={props.items} drafts={props.drafts} setDrafts={props.setDrafts} onSave={props.onSave} onReset={props.onReset} busy={props.busy} /></div>;
}

function DiagnosticsPage({ issues, validation, summary, onExport, adminExport, importInput, setImportInput, onPreviewImport, importPreview }: { issues: JsonObject[]; validation: JsonObject | undefined; summary: JsonObject | undefined; onExport: () => Promise<void>; adminExport: JsonObject | undefined; importInput: string; setImportInput: (value: string) => void; onPreviewImport: () => void; importPreview: JsonObject | undefined }): JSX.Element {
  const secrets = readObject(summary, "secrets");
  return <div className="page-grid"><Card><CardHeader eyebrow="Diagnostics" title="Actionable launch checks" description="Every blocker should explain what happened and what to do next." action={<Button variant="secondary" onClick={() => void onExport()}>Load safe export</Button>} /><DataTable rows={issues.map((issue) => ({ ...issue, relatedSetting: relatedSettingForIssue(issue) }))} columns={[{ key: "severity", label: "Severity", render: (row) => <Badge tone={issueTone(readString(row, "severity"))}>{readString(row, "severity") ?? "info"}</Badge> }, { key: "area", label: "Area" }, { key: "code", label: "Code" }, { key: "message", label: "Message" }, { key: "action", label: "Action" }, { key: "relatedSetting", label: "Setting" }]} /></Card><Card><CardHeader title="Configured secrets" description="Values are never shown; only configured/missing state is visible." /><div className="secret-grid">{Object.entries(secrets ?? {}).map(([key, value]) => <div key={key}><span>{key}</span><Badge tone={value === true ? "success" : "warning"}>{value === true ? "configured" : "missing"}</Badge></div>)}</div></Card><Card><CardHeader title="Config import preview" description="Paste a safe export to inspect route/output/media/AI counts before applying anything. This preview does not mutate D1." /><Textarea label="Import JSON" value={importInput} onChange={setImportInput} rows={8} placeholder="Paste config export JSON here" /><Button variant="secondary" onClick={onPreviewImport}>Preview import</Button>{importPreview && <pre>{JSON.stringify(importPreview, null, 2)}</pre>}</Card>{adminExport && <Card><CardHeader title="Safe config export" description="Useful for backup, handoff, and clone planning." /><pre>{JSON.stringify(adminExport, null, 2)}</pre></Card>}<Card><CardHeader title="Raw validation" description="Technical payload for debugging." /><pre>{JSON.stringify(validation ?? {}, null, 2)}</pre></Card></div>;
}

function ActivityPage({ mediaJobs, publishQueue, onPublishNow, onBulkPublishNow, onCancel, onReschedule, busyQueueId }: { mediaJobs: JsonObject[]; publishQueue: JsonObject[]; onPublishNow: (queueId: string) => Promise<void>; onBulkPublishNow: (queueIds: string[]) => Promise<void>; onCancel: (queueId: string) => Promise<void>; onReschedule: (queueId: string) => Promise<void>; busyQueueId: string | undefined }): JSX.Element {
  return <div className="page-grid"><Card><CardHeader title="Publish queue" description="Scheduled and due items by final channel." /><PublishQueueTable rows={publishQueue} onPublishNow={onPublishNow} onBulkPublishNow={onBulkPublishNow} onCancel={onCancel} onReschedule={onReschedule} busyQueueId={busyQueueId} /></Card><Card><CardHeader title="Media jobs" description="Latest media processing jobs and errors." /><DataTable rows={mediaJobs} columns={[{ key: "id", label: "Job" }, { key: "itemId", label: "Item" }, { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(readString(row, "status"))}>{readString(row, "status") ?? "unknown"}</Badge> }, { key: "workflowRunId", label: "Workflow" }, { key: "errorMessage", label: "Error" }]} /></Card></div>;
}

function TechnicalPage({ statusBundle, summary, metrics, timeseries, adminConfig, promptStudio }: { statusBundle: StatusBundle; summary: JsonObject | undefined; metrics: JsonObject | undefined; timeseries: JsonObject | undefined; adminConfig: AdminConfigResponse | undefined; promptStudio: JsonObject | undefined }): JSX.Element {
  return <div className="page-grid"><Card><CardHeader title="Raw Worker status" description="Debug only." /><pre>{JSON.stringify(statusBundle, null, 2)}</pre></Card><Card><CardHeader title="Admin summary" description="Redacted admin payload." /><pre>{JSON.stringify(summary ?? {}, null, 2)}</pre></Card><Card><CardHeader title="Admin config" description="Settings metadata and sources." /><pre>{JSON.stringify(adminConfig ?? {}, null, 2)}</pre></Card><Card><CardHeader title="Metrics" description="Data dashboard payload." /><pre>{JSON.stringify(metrics ?? {}, null, 2)}</pre></Card><Card><CardHeader title="Timeseries" description="Daily trend payload." /><pre>{JSON.stringify(timeseries ?? {}, null, 2)}</pre></Card><Card><CardHeader title="Prompt Studio" description="Prompt profiles and bindings." /><pre>{JSON.stringify(promptStudio ?? {}, null, 2)}</pre></Card></div>;
}

const tabs: Array<{ id: DashboardTab; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "◌" },
  { id: "setup", label: "Setup", icon: "✓" },
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "ai", label: "AI", icon: "✦" },
  { id: "providers", label: "Providers", icon: "⌁" },
  { id: "telegram", label: "Telegram", icon: "✉" },
  { id: "routes", label: "Routes", icon: "⌘" },
  { id: "media", label: "Media", icon: "▣" },
  { id: "prompts", label: "Prompts", icon: "✎" },
  { id: "publishing", label: "Publishing", icon: "↗" },
  { id: "diagnostics", label: "Diagnostics", icon: "!" },
  { id: "activity", label: "Activity", icon: "↻" },
  { id: "technical", label: "Technical", icon: "{}" }
];

function ProviderPreset({ title, values }: { title: string; values: string[] }): JSX.Element {
  return <div className="preset-card"><strong>{title}</strong><div>{values.map((value) => <Badge key={value} tone="info">{value}</Badge>)}</div></div>;
}

function connectionNotice(statusResult: StatusBundle, summaryResult: ApiResult, validationResult: ApiResult): string {
  const connection = describeConnectionBundle(statusResult);
  if (connection === "unreachable" || connection === "cors_blocked") return "Worker URL is not reachable. Check the URL or deployment target.";
  if (!summaryResult.ok && summaryResult.status === 401) return "Worker reachable, but admin secret failed. Check the Admin secret or paste it again.";
  if (!summaryResult.ok) return summaryResult.message;
  if (!validationResult.ok) return validationResult.message;
  const readiness = readObject(summaryResult.data, "readiness");
  return `Dashboard refreshed. Readiness: ${readString(readiness, "label") ?? "unknown"}.`;
}

function connectionGuidance(connectionState: string, savedUrl: string, summary: JsonObject | undefined, validation: JsonObject | undefined): JSX.Element | null {
  const issues = readArray(validation ?? summary, "issues");
  if (connectionState === "connected" && issues.length === 0) return null;
  const tone = connectionState === "connected" ? "info" : connectionState === "unreachable" || connectionState === "cors_blocked" ? "danger" : "warning";
  return <Alert title="Connection guidance" tone={tone}>Current Worker URL: <strong>{savedUrl || "not saved"}</strong>. If public status works but admin calls fail, paste the Admin secret again. If the URL is wrong, clear the connection and save the correct Worker URL.</Alert>;
}

function activeTabLabel(tab: DashboardTab): string {
  return tabs.find((entry) => entry.id === tab)?.label ?? tab;
}

function summaryNotice(summaryResult: ApiResult, validationResult: ApiResult): string {
  if (!summaryResult.ok) return summaryResult.message;
  if (!validationResult.ok) return validationResult.message;
  const readiness = readObject(summaryResult.data, "readiness");
  return `Dashboard refreshed. Readiness: ${readString(readiness, "label") ?? "unknown"}.`;
}

function readObject(value: unknown, key?: string): JsonObject | undefined {
  const source = key === undefined ? value : typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject)[key] : undefined;
  return typeof source === "object" && source !== null && !Array.isArray(source) ? source as JsonObject : undefined;
}

function readArray(value: unknown, key?: string): JsonObject[] {
  const source = key === undefined ? value : typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject)[key] : undefined;
  return Array.isArray(source) ? source.filter((entry): entry is JsonObject => typeof entry === "object" && entry !== null && !Array.isArray(entry)) : [];
}

function readArrayOfStrings(value: unknown, key: string): string[] {
  const object = readObject(value);
  const raw = object?.[key];
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string") : [];
}

function shortId(value: string | undefined): string {
  if (!value) return "-";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function readString(value: unknown, key: string): string | undefined {
  const object = readObject(value);
  const raw = object?.[key];
  return typeof raw === "string" ? raw : undefined;
}

function readNumber(value: unknown, key: string): number | undefined {
  const object = readObject(value);
  const raw = object?.[key];
  return typeof raw === "number" ? raw : undefined;
}

function readBoolean(value: unknown, key: string): boolean | undefined {
  const object = readObject(value);
  const raw = object?.[key];
  return typeof raw === "boolean" ? raw : undefined;
}

function readBooleanValue(value: unknown): boolean {
  return value === true;
}

function readDistribution(value: unknown, key: string): Record<string, number> {
  const object = readObject(value, key);
  if (!object) return {};
  return Object.fromEntries(Object.entries(object).filter(([, raw]) => typeof raw === "number")) as Record<string, number>;
}

function funnelFromDistribution(data: Record<string, number>): Array<{ label: string; value: number }> {
  return [
    { label: "Pending", value: data.pending ?? 0 },
    { label: "Dispatched", value: (data.dispatching ?? 0) + (data.dispatched ?? 0) },
    { label: "Processing", value: data.processing ?? 0 },
    { label: "Ready", value: data.ready ?? 0 },
    { label: "Failed", value: data.failed ?? 0 }
  ];
}

function telegramTestPayload(chatId: string | undefined, threadId?: number): JsonObject {
  const payload: JsonObject = { kind: "chat_action" };
  if (chatId !== undefined && chatId.length > 0) payload.chatId = chatId;
  if (threadId !== undefined) payload.threadId = threadId;
  return payload;
}

function mergeDailySeries(outputs: JsonObject[], published: JsonObject[], mediaJobs: JsonObject[]): Array<{ day: string; outputs: number; published: number; mediaJobs: number }> {
  const days = new Set<string>();
  for (const row of [...outputs, ...published, ...mediaJobs]) {
    const day = readString(row, "day");
    if (day) days.add(day);
  }
  return Array.from(days).sort().map((day) => ({ day, outputs: countForDay(outputs, day), published: countForDay(published, day), mediaJobs: countForDay(mediaJobs, day) })).slice(-30);
}

function countForDay(rows: JsonObject[], day: string): number {
  return readNumber(rows.find((row) => readString(row, "day") === day), "count") ?? 0;
}

function filterQueue(queue: JsonObject[], statusFilter: string, search: string): JsonObject[] {
  const normalizedSearch = search.trim().toLowerCase();
  return queue.filter((item) => {
    const status = readString(item, "status") ?? "unknown";
    const statusMatch = statusFilter === "all" || status === statusFilter;
    const searchText = ["queueId", "generatedOutputId", "itemId", "finalChatId", "language"].map((key) => readString(item, key) ?? "").join(" ").toLowerCase();
    return statusMatch && (normalizedSearch.length === 0 || searchText.includes(normalizedSearch));
  });
}

function issueTone(value: string | undefined): "success" | "warning" | "danger" | "info" | "muted" {
  if (value === "error") return "danger";
  if (value === "warning") return "warning";
  if (value === "success") return "success";
  return "info";
}

function statusTone(value: string | undefined): "success" | "warning" | "danger" | "info" | "muted" {
  if (value === "ready" || value === "published" || value === "ready_for_review" || value === "active") return "success";
  if (value === "failed" || value === "cancelled") return "danger";
  if (value === "pending" || value === "processing" || value === "scheduled") return "warning";
  return "info";
}
