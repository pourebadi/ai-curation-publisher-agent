import { useEffect, useMemo, useState } from "react";
import { describeConnectionBundle, validateWorkerBaseUrl, WorkerApiClient } from "./api";
import { getInternalCredential, loadSettings, saveApiBaseUrl, saveInternalCredential } from "./storage";
import type { ApiResult, DashboardSettings, JsonObject, JsonValue, StatusBundle } from "./types";
import { Alert, Badge, Button, Card, CardHeader, DataTable, Input, Progress, Select, StatCard, Textarea } from "./shared/ui";
import { BarChartCard, DonutChartCard, FunnelCard } from "./shared/charts";

type DashboardTab = "overview" | "routes" | "media" | "prompts" | "diagnostics" | "activity" | "technical";
type PromptProfileForm = { id: string; name: string; category: string; language: string; contentType: string; version: string; status: string; systemPrompt: string; userPromptTemplate: string; modelHint: string; temperature: string; maxTokens: string; riskPolicy: string; styleGuide: string };
type PromptBindingForm = { routeId: string; routeOutputId: string; category: string; language: string; promptProfileId: string; contentType: string };

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

export default function ModernDashboardApp(): JSX.Element {
  const [settings, setSettings] = useState<DashboardSettings>(() => loadSettings());
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(settings.apiBaseUrl);
  const [credentialInput, setCredentialInput] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [statusBundle, setStatusBundle] = useState<StatusBundle>({});
  const [summary, setSummary] = useState<JsonObject | undefined>(undefined);
  const [metrics, setMetrics] = useState<JsonObject | undefined>(undefined);
  const [validation, setValidation] = useState<JsonObject | undefined>(undefined);
  const [routes, setRoutes] = useState<JsonObject[]>([]);
  const [outputs, setOutputs] = useState<JsonObject[]>([]);
  const [mediaJobs, setMediaJobs] = useState<JsonObject[]>([]);
  const [publishQueue, setPublishQueue] = useState<JsonObject[]>([]);
  const [promptStudio, setPromptStudio] = useState<JsonObject | undefined>(undefined);
  const [adminExport, setAdminExport] = useState<JsonObject | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [promptForm, setPromptForm] = useState<PromptProfileForm>(emptyPromptForm);
  const [bindingForm, setBindingForm] = useState<PromptBindingForm>(emptyBindingForm);
  const [promptPreview, setPromptPreview] = useState<JsonObject | undefined>(undefined);

  const client = useMemo(() => new WorkerApiClient(settings.apiBaseUrl, getInternalCredential()), [settings]);
  const connectionState = describeConnectionBundle(statusBundle);
  const issues = readArray(validation ?? summary, "issues");
  const readiness = readObject(summary, "readiness") ?? readObject(validation, "readiness");
  const readinessScore = readNumber(readiness, "score") ?? 0;
  const metricCards = readObject(metrics, "cards") ?? {};
  const metricDistributions = readObject(metrics, "distributions") ?? {};
  const promptProfiles = readArray(promptStudio, "profiles");
  const promptBindings = readArray(promptStudio, "bindings");

  useEffect(() => {
    if (settings.apiBaseUrl.length > 0) void refreshAll();
  }, [settings.apiBaseUrl]);

  async function saveAndConnect(): Promise<void> {
    const valid = validateWorkerBaseUrl(apiBaseUrlInput);
    if (!valid.ok) { setNotice(valid.message); return; }
    saveApiBaseUrl(valid.value);
    if (credentialInput.trim().length > 0) saveInternalCredential(credentialInput.trim(), false);
    setCredentialInput("");
    setSettings(loadSettings());
    await refreshAll();
  }

  async function refreshAll(): Promise<void> {
    setBusy("refresh");
    const nextStatus = await client.getStatusBundle();
    setStatusBundle(nextStatus);
    const [nextSummary, nextValidation, nextMetrics, nextRoutes, nextJobs, nextQueue, nextPrompts] = await Promise.all([
      client.getAdminSummary(),
      client.getAdminValidation(),
      client.getAdminMetricsOverview(),
      client.getTelegramTopicRoutes(),
      client.getMediaJobs(25),
      client.getTelegramPublishQueue(25),
      client.getPromptStudio()
    ]);
    if (nextSummary.ok) setSummary(nextSummary.data);
    if (nextValidation.ok) setValidation(nextValidation.data);
    if (nextMetrics.ok) setMetrics(nextMetrics.data);
    if (nextRoutes.ok) {
      const routeItems = readArray(nextRoutes.data, "routes");
      setRoutes(routeItems);
      setOutputs(routeItems.flatMap((route) => readArray(route, "outputs").map((output) => ({ ...output, routeId: readString(output, "routeId") ?? readString(route, "id") ?? "unknown", category: readString(route, "category") ?? "uncategorized" }))));
    }
    if (nextJobs.ok) setMediaJobs(readArray(nextJobs.data, "jobs"));
    if (nextQueue.ok) setPublishQueue(readArray(nextQueue.data, "queue"));
    if (nextPrompts.ok) setPromptStudio(nextPrompts.data);
    setNotice(summaryNotice(nextSummary, nextValidation));
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
    const response = await client.previewPrompt({ systemPrompt: promptForm.systemPrompt, userPromptTemplate: promptForm.userPromptTemplate });
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
      <div className="sidebar-status"><Badge tone={connectionState === "connected" ? "success" : "warning"}>{connectionState}</Badge><small>{settings.apiBaseUrl || "No Worker URL saved"}</small></div>
    </aside>

    <section className="modern-main">
      <header className="modern-topbar">
        <div><p className="ui-eyebrow">Launch readiness</p><h2>{readString(readiness, "label") ?? "not checked"}</h2></div>
        <div className="connect-panel"><Input label="Worker URL" value={apiBaseUrlInput} onChange={setApiBaseUrlInput} placeholder="https://worker.example.workers.dev" /><Input label="Admin secret" value={credentialInput} onChange={setCredentialInput} type="password" placeholder="Paste only locally" /><Button onClick={() => void saveAndConnect()} disabled={busy !== undefined}>Connect</Button><Button variant="secondary" onClick={() => void refreshAll()} disabled={busy !== undefined}>Refresh</Button></div>
      </header>
      {notice && <Alert title="Status" tone="info">{notice}</Alert>}

      {activeTab === "overview" && <OverviewPage readinessScore={readinessScore} metricCards={metricCards} distributions={metricDistributions} routes={routes} issues={issues} />}
      {activeTab === "routes" && <RoutesPage routes={routes} outputs={outputs} />}
      {activeTab === "media" && <MediaPage summary={summary} mediaJobs={mediaJobs} />}
      {activeTab === "prompts" && <PromptsPage profiles={promptProfiles} bindings={promptBindings} promptForm={promptForm} setPromptForm={setPromptForm} bindingForm={bindingForm} setBindingForm={setBindingForm} promptPreview={promptPreview} onSavePrompt={savePromptProfile} onActivatePrompt={activatePrompt} onSaveBinding={savePromptBinding} onPreviewPrompt={previewPrompt} busy={busy} />}
      {activeTab === "diagnostics" && <DiagnosticsPage issues={issues} validation={validation} summary={summary} onExport={loadExport} adminExport={adminExport} />}
      {activeTab === "activity" && <ActivityPage mediaJobs={mediaJobs} publishQueue={publishQueue} />}
      {activeTab === "technical" && <TechnicalPage statusBundle={statusBundle} summary={summary} metrics={metrics} promptStudio={promptStudio} />}
    </section>
  </main>;
}

function OverviewPage({ readinessScore, metricCards, distributions, routes, issues }: { readinessScore: number; metricCards: JsonObject; distributions: JsonObject; routes: JsonObject[]; issues: JsonObject[] }): JSX.Element {
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
    <Card><CardHeader title="Route topology" description="Source category to language outputs." /><DataTable rows={routes} columns={[{ key: "id", label: "Route" }, { key: "category", label: "Category" }, { key: "sourceThreadId", label: "Source topic" }, { key: "outputs", label: "Outputs", render: (row) => readArray(row, "outputs").length }, { key: "enabled", label: "Status", render: (row) => <Badge tone={readBoolean(row, "enabled") === false ? "muted" : "success"}>{readBoolean(row, "enabled") === false ? "Disabled" : "Enabled"}</Badge> }]} /></Card>
  </div>;
}

function RoutesPage({ routes, outputs }: { routes: JsonObject[]; outputs: JsonObject[] }): JSX.Element {
  return <div className="page-grid"><Card><CardHeader eyebrow="Operational control" title="Routes" description="Route = category/source. Keep source topics unique and human-readable." /><DataTable rows={routes} columns={[{ key: "id", label: "ID" }, { key: "category", label: "Category" }, { key: "sourceChatId", label: "Group" }, { key: "sourceThreadId", label: "Source topic" }, { key: "promptProfile", label: "Fallback prompt" }, { key: "enabled", label: "Status", render: (row) => <Badge tone={readBoolean(row, "enabled") === false ? "muted" : "success"}>{readBoolean(row, "enabled") === false ? "Disabled" : "Enabled"}</Badge> }]} /></Card><Card><CardHeader title="Outputs" description="Output = language, review topic, final channel, signature, and publishing policy." /><DataTable rows={outputs} columns={[{ key: "id", label: "Output" }, { key: "category", label: "Category" }, { key: "language", label: "Language" }, { key: "reviewThreadId", label: "Review topic" }, { key: "finalChatId", label: "Final channel" }, { key: "publishMode", label: "Mode" }, { key: "signatureEnabled", label: "Signature", render: (row) => <Badge tone={readBoolean(row, "signatureEnabled") ? "success" : "muted"}>{readBoolean(row, "signatureEnabled") ? "Enabled" : "Off"}</Badge> }]} /></Card></div>;
}

function MediaPage({ summary, mediaJobs }: { summary: JsonObject | undefined; mediaJobs: JsonObject[] }): JSX.Element {
  const media = readObject(summary, "media");
  const github = readObject(media, "github");
  return <div className="page-grid"><Card className="hero-card"><CardHeader eyebrow="Internal Media Registry" title="Telegram cache stays as the default media registry" description="Media Cache remains the safest default for multi-language outputs: one upload creates reusable Telegram file IDs for every review and final channel." /><div className="stats-grid compact"><StatCard label="Mode" value={readString(media, "mode") ?? "unknown"} /><StatCard label="Cache topic" value={readString(media, "cacheThreadId") || readString(media, "stagingThreadId") || "missing"} tone={readString(media, "cacheThreadId") ? "success" : "warning"} /><StatCard label="GitHub workflow" value={readString(github, "workflowId") ?? "media-processor.yml"} helper={readString(github, "ref") ?? "main"} /></div><Alert title="Design decision" tone="info">The cache topic is intentionally internal. It prevents duplicate uploads when one source item creates several language/category outputs.</Alert></Card><Card><CardHeader title="Recent media jobs" description="Monitor processing, dispatch, and Telegram file ID readiness." /><DataTable rows={mediaJobs} columns={[{ key: "id", label: "Job" }, { key: "itemId", label: "Item" }, { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(readString(row, "status"))}>{readString(row, "status") ?? "unknown"}</Badge> }, { key: "sourceUrl", label: "Source" }, { key: "errorMessage", label: "Error" }]} /></Card></div>;
}

function PromptsPage(props: { profiles: JsonObject[]; bindings: JsonObject[]; promptForm: PromptProfileForm; setPromptForm: (value: PromptProfileForm) => void; bindingForm: PromptBindingForm; setBindingForm: (value: PromptBindingForm) => void; promptPreview: JsonObject | undefined; onSavePrompt: () => Promise<void>; onActivatePrompt: (profileId: string) => Promise<void>; onSaveBinding: () => Promise<void>; onPreviewPrompt: () => Promise<void>; busy: string | undefined }): JSX.Element {
  const updatePrompt = (patch: Partial<PromptProfileForm>): void => props.setPromptForm({ ...props.promptForm, ...patch });
  const updateBinding = (patch: Partial<PromptBindingForm>): void => props.setBindingForm({ ...props.bindingForm, ...patch });
  return <div className="page-grid"><Card className="hero-card"><CardHeader eyebrow="Prompt Studio" title="Managed prompts per category and language" description="Move prompt behavior out of code-only defaults. Draft, activate, bind, preview, and evolve prompts safely." /><div className="grid two"><Input label="Prompt ID" value={props.promptForm.id} onChange={(value) => updatePrompt({ id: value })} /><Input label="Name" value={props.promptForm.name} onChange={(value) => updatePrompt({ name: value })} /><Input label="Category" value={props.promptForm.category} onChange={(value) => updatePrompt({ category: value })} /><Input label="Language" value={props.promptForm.language} onChange={(value) => updatePrompt({ language: value })} /><Input label="Version" value={props.promptForm.version} onChange={(value) => updatePrompt({ version: value })} /><Select label="Status" value={props.promptForm.status} onChange={(value) => updatePrompt({ status: value })} options={[{ value: "draft", label: "Draft" }, { value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} /></div><Textarea label="System prompt" value={props.promptForm.systemPrompt} onChange={(value) => updatePrompt({ systemPrompt: value })} rows={7} /><Textarea label="User prompt template" value={props.promptForm.userPromptTemplate} onChange={(value) => updatePrompt({ userPromptTemplate: value })} rows={9} /><div className="grid two"><Input label="Model hint" value={props.promptForm.modelHint} onChange={(value) => updatePrompt({ modelHint: value })} /><Input label="Temperature" value={props.promptForm.temperature} onChange={(value) => updatePrompt({ temperature: value })} /><Input label="Max tokens" value={props.promptForm.maxTokens} onChange={(value) => updatePrompt({ maxTokens: value })} /><Input label="Content type" value={props.promptForm.contentType} onChange={(value) => updatePrompt({ contentType: value })} /></div><Textarea label="Risk policy" value={props.promptForm.riskPolicy} onChange={(value) => updatePrompt({ riskPolicy: value })} rows={3} /><Textarea label="Style guide" value={props.promptForm.styleGuide} onChange={(value) => updatePrompt({ styleGuide: value })} rows={3} /><div className="button-row"><Button onClick={() => void props.onSavePrompt()} disabled={props.busy !== undefined}>Save prompt</Button><Button variant="secondary" onClick={() => void props.onPreviewPrompt()} disabled={props.busy !== undefined}>Preview</Button></div>{props.promptPreview && <pre>{JSON.stringify(props.promptPreview, null, 2)}</pre>}</Card><Card><CardHeader title="Prompt library" description="Active prompts can be bound to route outputs. Code defaults remain fallback." /><DataTable rows={props.profiles} columns={[{ key: "id", label: "ID" }, { key: "name", label: "Name" }, { key: "category", label: "Category" }, { key: "language", label: "Language" }, { key: "status", label: "Status", render: (row) => <Badge tone={readString(row, "status") === "active" ? "success" : "warning"}>{readString(row, "status") ?? "draft"}</Badge> }, { key: "action", label: "Action", render: (row) => <Button size="sm" variant="secondary" onClick={() => void props.onActivatePrompt(readString(row, "id") ?? "")}>Activate</Button> }]} /></Card><Card><CardHeader title="Prompt bindings" description="Bind prompts to route outputs, category/language pairs, or global fallbacks." /><div className="grid two"><Input label="Route ID" value={props.bindingForm.routeId} onChange={(value) => updateBinding({ routeId: value })} /><Input label="Route output ID" value={props.bindingForm.routeOutputId} onChange={(value) => updateBinding({ routeOutputId: value })} /><Input label="Category" value={props.bindingForm.category} onChange={(value) => updateBinding({ category: value })} /><Input label="Language" value={props.bindingForm.language} onChange={(value) => updateBinding({ language: value })} /><Input label="Prompt profile ID" value={props.bindingForm.promptProfileId} onChange={(value) => updateBinding({ promptProfileId: value })} /><Input label="Content type" value={props.bindingForm.contentType} onChange={(value) => updateBinding({ contentType: value })} /></div><Button onClick={() => void props.onSaveBinding()} disabled={props.busy !== undefined}>Save binding</Button><DataTable rows={props.bindings} columns={[{ key: "routeOutputId", label: "Output" }, { key: "routeId", label: "Route" }, { key: "category", label: "Category" }, { key: "language", label: "Language" }, { key: "promptProfileId", label: "Prompt" }, { key: "enabled", label: "Status", render: (row) => <Badge tone={readBoolean(row, "enabled") === false ? "muted" : "success"}>{readBoolean(row, "enabled") === false ? "Disabled" : "Enabled"}</Badge> }]} /></Card></div>;
}

function DiagnosticsPage({ issues, validation, summary, onExport, adminExport }: { issues: JsonObject[]; validation: JsonObject | undefined; summary: JsonObject | undefined; onExport: () => Promise<void>; adminExport: JsonObject | undefined }): JSX.Element {
  const secrets = readObject(summary, "secrets");
  return <div className="page-grid"><Card><CardHeader eyebrow="Diagnostics" title="Actionable launch checks" description="Every blocker should explain what happened and what to do next." action={<Button variant="secondary" onClick={() => void onExport()}>Load safe export</Button>} /><DataTable rows={issues} columns={[{ key: "severity", label: "Severity", render: (row) => <Badge tone={issueTone(readString(row, "severity"))}>{readString(row, "severity") ?? "info"}</Badge> }, { key: "area", label: "Area" }, { key: "code", label: "Code" }, { key: "message", label: "Message" }, { key: "action", label: "Action" }]} /></Card><Card><CardHeader title="Configured secrets" description="Values are never shown; only configured/missing state is visible." /><div className="secret-grid">{Object.entries(secrets ?? {}).map(([key, value]) => <div key={key}><span>{key}</span><Badge tone={value === true ? "success" : "warning"}>{value === true ? "configured" : "missing"}</Badge></div>)}</div></Card>{adminExport && <Card><CardHeader title="Safe config export" description="Useful for backup, handoff, and clone planning." /><pre>{JSON.stringify(adminExport, null, 2)}</pre></Card>}<Card><CardHeader title="Raw validation" description="Technical payload for debugging." /><pre>{JSON.stringify(validation ?? {}, null, 2)}</pre></Card></div>;
}

function ActivityPage({ mediaJobs, publishQueue }: { mediaJobs: JsonObject[]; publishQueue: JsonObject[] }): JSX.Element {
  return <div className="page-grid"><Card><CardHeader title="Publish queue" description="Scheduled and due items by final channel." /><DataTable rows={publishQueue} columns={[{ key: "id", label: "Queue" }, { key: "language", label: "Lang" }, { key: "finalChatId", label: "Final" }, { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(readString(row, "status"))}>{readString(row, "status") ?? "unknown"}</Badge> }, { key: "scheduledFor", label: "Scheduled" }, { key: "lastError", label: "Error" }]} /></Card><Card><CardHeader title="Media jobs" description="Latest media processing jobs and errors." /><DataTable rows={mediaJobs} columns={[{ key: "id", label: "Job" }, { key: "itemId", label: "Item" }, { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(readString(row, "status"))}>{readString(row, "status") ?? "unknown"}</Badge> }, { key: "workflowRunId", label: "Workflow" }, { key: "errorMessage", label: "Error" }]} /></Card></div>;
}

function TechnicalPage({ statusBundle, summary, metrics, promptStudio }: { statusBundle: StatusBundle; summary: JsonObject | undefined; metrics: JsonObject | undefined; promptStudio: JsonObject | undefined }): JSX.Element {
  return <div className="page-grid"><Card><CardHeader title="Raw Worker status" description="Debug only." /><pre>{JSON.stringify(statusBundle, null, 2)}</pre></Card><Card><CardHeader title="Admin summary" description="Redacted admin payload." /><pre>{JSON.stringify(summary ?? {}, null, 2)}</pre></Card><Card><CardHeader title="Metrics" description="Data dashboard payload." /><pre>{JSON.stringify(metrics ?? {}, null, 2)}</pre></Card><Card><CardHeader title="Prompt Studio" description="Prompt profiles and bindings." /><pre>{JSON.stringify(promptStudio ?? {}, null, 2)}</pre></Card></div>;
}

const tabs: Array<{ id: DashboardTab; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "◌" },
  { id: "routes", label: "Routes", icon: "⌘" },
  { id: "media", label: "Media", icon: "▣" },
  { id: "prompts", label: "Prompts", icon: "✎" },
  { id: "diagnostics", label: "Diagnostics", icon: "!" },
  { id: "activity", label: "Activity", icon: "↻" },
  { id: "technical", label: "Technical", icon: "{}" }
];

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
