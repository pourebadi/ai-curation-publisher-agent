import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkerApiClient } from "./api";
import { deriveSetupCenter, redactSensitiveJson } from "./setup";
import { buildChecklist, buildManagerSummary, countErrors, countWarnings } from "./status";
import {
  clearOperationHistory,
  clearSettings,
  getInternalCredential,
  loadOperationHistory,
  loadSettings,
  saveApiBaseUrl,
  saveInternalCredential,
  saveOperationRecord
} from "./storage";
import type { ApiResult, DashboardSettings, JsonObject, JsonValue, OperationName, OperationRecord, PilotInput, RuntimeChecklistItem, SetupDetailItem, SetupStatus, StatusBundle } from "./types";

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
  pilot_combined: "Combined controlled pilot"
};

function App(): JSX.Element {
  const [settings, setSettings] = useState<DashboardSettings>(() => loadSettings());
  const [apiBaseUrlInput, setApiBaseUrlInput] = useState(settings.apiBaseUrl);
  const [credentialInput, setCredentialInput] = useState("");
  const [rememberCredential, setRememberCredential] = useState(settings.rememberInternalCredential);
  const [bundle, setBundle] = useState<StatusBundle>({});
  const [history, setHistory] = useState<OperationRecord[]>(() => loadOperationHistory());
  const [busy, setBusy] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [pilotInput, setPilotInput] = useState<PilotInput>({});
  const [firecrawlUrl, setFirecrawlUrl] = useState("");
  const [telegramText, setTelegramText] = useState("Review dry-run from dashboard setup center.");
  const [telegramSourceUrl, setTelegramSourceUrl] = useState("");
  const [wordpressTitle, setWordpressTitle] = useState("Dashboard draft dry-run");
  const [wordpressContent, setWordpressContent] = useState("This is a draft-only setup check from the dashboard.");
  const [wordpressSourceUrl, setWordpressSourceUrl] = useState("");
  const [confirmFirecrawl, setConfirmFirecrawl] = useState(false);
  const [confirmTelegramPilot, setConfirmTelegramPilot] = useState(false);
  const [confirmWordPressPilot, setConfirmWordPressPilot] = useState(false);

  const client = useMemo(() => new WorkerApiClient(settings.apiBaseUrl, getInternalCredential()), [settings]);
  const legacyManagerSummary = useMemo(() => buildManagerSummary(bundle), [bundle]);
  const legacyChecklist = useMemo(() => buildChecklist(bundle), [bundle]);
  const setupCenter = useMemo(() => deriveSetupCenter(bundle, settings.hasInternalCredential), [bundle, settings.hasInternalCredential]);
  const internalReady = settings.hasInternalCredential;

  const recordOperation = useCallback((name: OperationName, ok: boolean, result: JsonValue): void => {
    const safeResult = redactSensitiveJson(result);
    const record: OperationRecord = {
      id: `${Date.now()}-${name}`,
      name,
      label: operationLabels[name],
      timestamp: new Date().toISOString(),
      ok,
      warningsCount: countWarnings(safeResult),
      errorsCount: countErrors(safeResult),
      result: safeResult
    };
    setHistory(saveOperationRecord(record));
  }, []);

  const refreshStatus = useCallback(async (): Promise<void> => {
    setBusy("refresh_status");
    const next = await client.getStatusBundle();
    setBundle(next);
    recordOperation("refresh_status", next.health?.ok === true && next.status?.ok === true && next.ready?.ok === true, {
      health: resultToJson(next.health),
      status: resultToJson(next.status),
      ready: resultToJson(next.ready)
    });
    setBusy(undefined);
  }, [client, recordOperation]);

  useEffect(() => {
    if (settings.apiBaseUrl.length > 0) {
      void refreshStatus();
    }
  }, [refreshStatus, settings.apiBaseUrl]);

  function saveSetup(): void {
    saveApiBaseUrl(apiBaseUrlInput);
    if (credentialInput.length > 0) {
      saveInternalCredential(credentialInput, rememberCredential);
    }
    setCredentialInput("");
    setSettings(loadSettings());
    setNotice("Settings saved locally. Secret values are not displayed after saving.");
  }

  function clearAllSettings(): void {
    clearSettings();
    setCredentialInput("");
    setApiBaseUrlInput("");
    setSettings(loadSettings());
    setNotice("Saved dashboard settings cleared from this browser.");
  }

  async function runOperation(name: OperationName, runner: () => Promise<ApiResult>, confirmText?: string): Promise<void> {
    const message = confirmText ?? `Run ${operationLabels[name]}?`;
    if (!window.confirm(message)) {
      return;
    }
    setBusy(name);
    const result = await runner();
    recordOperation(name, result.ok, resultToJson(result));
    setNotice(result.ok ? `${operationLabels[name]} completed.` : `${operationLabels[name]} returned an error.`);
    setBusy(undefined);
  }

  function runPilotFromInput(): void {
    const next = cleanPilotInput({
      ...pilotInput,
      runFirecrawl: confirmFirecrawl && pilotInput.runFirecrawl === true,
      runTelegramReview: confirmTelegramPilot && pilotInput.runTelegramReview === true,
      runWordPressDraft: confirmWordPressPilot && pilotInput.runWordPressDraft === true
    });
    const selected = [next.runFirecrawl, next.runTelegramReview, next.runWordPressDraft].filter(Boolean).length;
    const name: OperationName = selected > 1
      ? "pilot_combined"
      : next.runFirecrawl === true
        ? "pilot_firecrawl"
        : next.runTelegramReview === true
          ? "pilot_telegram_review"
          : next.runWordPressDraft === true
            ? "pilot_wordpress_draft"
            : "pilot_readiness";

    void runOperation(name, () => client.runPilot(next), "Run selected pilot checks? Only selected, confirmed steps will run. No final publishing or scheduler activation is available here.");
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Cloudflare Operator Dashboard</p>
          <h1>Setup Center & Guided Operations</h1>
          <p>A visual setup center for checking Worker connection, internal security, runtime config, optional integrations, scheduler safety, and controlled pilot readiness after deployment.</p>
        </div>
        <div className="heroPanel">
          <strong>Dashboard safety limits</strong>
          <span>No Cloudflare secret editing</span>
          <span>No Cloudflare API tokens</span>
          <span>No scheduler or publishing enablement</span>
          <span>No final Telegram or public WordPress publish</span>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <section className="card setupCenter" aria-labelledby="launch-summary-heading">
        <div className="sectionTitle">
          <div>
            <p className="eyebrow">Launch readiness</p>
            <h2 id="launch-summary-heading">Manager-friendly setup summary</h2>
          </div>
          <button type="button" onClick={() => void refreshStatus()} disabled={busy === "refresh_status"}>Refresh status</button>
        </div>
        <div className={`launchStatus ${toneForOverall(setupCenter.launchSummary.overallStatus)}`}>
          <strong>{setupCenter.launchSummary.overallStatus}</strong>
          <span>{setupCenter.launchSummary.recommendedNextStep}</span>
        </div>
        <div className="summaryGrid">
          <SummaryCard title="Worker reachable" value={setupCenter.launchSummary.workerReachable} ok={setupCenter.launchSummary.workerReachable === "Ready"} />
          <SummaryCard title="Internal security" value={setupCenter.launchSummary.internalSecurity} ok={setupCenter.launchSummary.internalSecurity === "Ready"} />
          <SummaryCard title="Telegram readiness" value={setupCenter.launchSummary.telegramReadiness} />
          <SummaryCard title="WordPress readiness" value={setupCenter.launchSummary.wordpressReadiness} />
          <SummaryCard title="Firecrawl readiness" value={setupCenter.launchSummary.firecrawlReadiness} />
          <SummaryCard title="Scheduler safety" value={setupCenter.launchSummary.schedulerSafety} ok={setupCenter.launchSummary.schedulerSafety === "Safe"} />
          <SummaryCard title="Publishing safety" value={setupCenter.launchSummary.publishingSafety} ok={setupCenter.launchSummary.publishingSafety === "Safe"} />
        </div>
      </section>

      <section className="grid two" aria-labelledby="local-setup-heading">
        <div className="card">
          <h2 id="local-setup-heading">1. Worker connection</h2>
          <StatusCallout status={setupCenter.workerConnection} />
          <label>Worker API base URL<input value={apiBaseUrlInput} onChange={(event) => setApiBaseUrlInput(event.target.value)} placeholder="https://your-worker.example.workers.dev" /></label>
          <div className="buttonRow"><button type="button" onClick={saveSetup}>Save locally</button><button type="button" onClick={() => void refreshStatus()} disabled={busy !== undefined}>Check connection</button></div>
          <dl className="compactList">
            <div><dt>Local Worker URL</dt><dd>{settings.apiBaseUrl ? "configured in this browser" : "missing"}</dd></div>
            <div><dt>/health</dt><dd>{bundle.health?.ok === true ? "reachable" : "not confirmed"}</dd></div>
            <div><dt>/status</dt><dd>{bundle.status?.ok === true ? "reachable" : "not confirmed"}</dd></div>
            <div><dt>/ready</dt><dd>{bundle.ready?.ok === true ? "reachable" : "warning or not confirmed"}</dd></div>
          </dl>
        </div>

        <div className="card">
          <h2>2. Internal security</h2>
          <StatusCallout status={setupCenter.internalSecurity} />
          <p className="muted">Configure <code>INTERNAL_API_SECRET</code> in Cloudflare Worker Secrets. Enter the same value locally here only to run protected setup checks. The dashboard never displays it after saving.</p>
          <label>Internal API credential<input value={credentialInput} onChange={(event) => setCredentialInput(event.target.value)} type="password" placeholder="Enter locally; never paste into docs or chat" /></label>
          <label className="checkRow"><input type="checkbox" checked={rememberCredential} onChange={(event) => setRememberCredential(event.target.checked)} />Remember internal credential in this browser</label>
          <div className="buttonRow"><button type="button" onClick={saveSetup}>Save credential locally</button><button type="button" className="secondary" onClick={clearAllSettings}>Clear saved settings</button></div>
          <button type="button" onClick={() => void runOperation("internal_auth_probe", () => client.runInternalAuthProbe(), "Check internal auth? This sends one request without a secret and one with the locally saved secret if available.")} disabled={!internalReady || busy !== undefined}>Check internal auth protection</button>
          <dl className="compactList">
            <div><dt>Dashboard local credential</dt><dd>{settings.hasInternalCredential ? "configured locally" : "missing"}</dd></div>
            <div><dt>Backend internal secret</dt><dd>{formatBoolean(readPath(bundle.ready, ["summary", "hasInternalSecret"]))}</dd></div>
            <div><dt>Storage mode</dt><dd>{settings.rememberInternalCredential ? "localStorage" : "sessionStorage"}</dd></div>
          </dl>
        </div>
      </section>

      <section className="card" aria-labelledby="runtime-heading">
        <h2 id="runtime-heading">3. Cloudflare runtime config checklist</h2>
        <p className="muted">This is read-only guidance. Configure values manually in Cloudflare Worker Variables or Secrets. The dashboard cannot mutate Cloudflare configuration.</p>
        <div className="runtimeGrid">
          {setupCenter.cloudflareRuntime.map((item) => <RuntimeItem key={item.name} item={item} />)}
        </div>
      </section>

      <section className="grid three" aria-labelledby="integration-heading">
        <div className="card">
          <h2 id="integration-heading">4. Telegram setup wizard</h2>
          <p className="warning">Review dry-run may contact Telegram only when the backend is explicitly enabled and configured. The dashboard cannot enable real review.</p>
          <DetailList items={setupCenter.telegram} />
          <label>Review dry-run text<textarea value={telegramText} onChange={(event) => setTelegramText(event.target.value)} /></label>
          <label>Optional source URL<input value={telegramSourceUrl} onChange={(event) => setTelegramSourceUrl(event.target.value)} /></label>
          <button type="button" onClick={() => void runOperation("telegram_review_dry_run", () => client.runTelegramReviewDryRun(cleanTelegramInput(telegramText, telegramSourceUrl)), "Run Telegram review dry-run? This is review-channel only and never final publishing.")} disabled={!internalReady || busy !== undefined || telegramText.trim().length === 0}>Run Telegram review dry-run</button>
        </div>

        <div className="card">
          <h2>5. WordPress setup wizard</h2>
          <p className="warning">WordPress checks must remain draft-only. The dashboard has no public publish action.</p>
          <DetailList items={setupCenter.wordpress} />
          <label>Draft title<input value={wordpressTitle} onChange={(event) => setWordpressTitle(event.target.value)} /></label>
          <label>Draft content<textarea value={wordpressContent} onChange={(event) => setWordpressContent(event.target.value)} /></label>
          <label>Optional source URL<input value={wordpressSourceUrl} onChange={(event) => setWordpressSourceUrl(event.target.value)} /></label>
          <button type="button" onClick={() => void runOperation("wordpress_draft_dry_run", () => client.runWordPressDraftDryRun(cleanWordPressInput(wordpressTitle, wordpressContent, wordpressSourceUrl)), "Run WordPress draft dry-run? This must create draft-only output when backend real dry-run is enabled.")} disabled={!internalReady || busy !== undefined || wordpressTitle.trim().length === 0 || wordpressContent.trim().length === 0}>Run WordPress draft dry-run</button>
        </div>

        <div className="card">
          <h2>6. Firecrawl setup wizard</h2>
          <p className="warning">Firecrawl sandbox may call an external service only when backend provider settings and credentials are enabled. The dashboard cannot enable Firecrawl.</p>
          <DetailList items={setupCenter.firecrawl} />
          <label>Sandbox URL<input value={firecrawlUrl} onChange={(event) => setFirecrawlUrl(event.target.value)} placeholder="https://example.com/article" /></label>
          <label className="checkRow"><input type="checkbox" checked={confirmFirecrawl} onChange={(event) => setConfirmFirecrawl(event.target.checked)} />I understand this may call Firecrawl if backend is enabled.</label>
          <button type="button" onClick={() => void runOperation("firecrawl_sandbox_fetch", () => client.runFirecrawlSandboxFetch({ url: firecrawlUrl.trim() }), "Run Firecrawl sandbox fetch? This may call an external service if backend Firecrawl is enabled/configured.")} disabled={!internalReady || busy !== undefined || !confirmFirecrawl || firecrawlUrl.trim().length === 0}>Run Firecrawl sandbox fetch</button>
        </div>
      </section>

      <section className="grid two" aria-labelledby="scheduler-heading">
        <div className="card">
          <h2 id="scheduler-heading">7. Scheduler safety</h2>
          <div className={`badge ${riskClass(setupCenter.scheduler.riskLabel)}`}>{setupCenter.scheduler.riskLabel}</div>
          {setupCenter.scheduler.riskLabel !== "Safe" && <p className="warning">Scheduler or publishing settings need review before launch. This dashboard cannot enable or disable them.</p>}
          <dl className="compactList">
            <div><dt>Scheduler enabled</dt><dd>{formatBoolean(setupCenter.scheduler.enabled)}</dd></div>
            <div><dt>Dry-run</dt><dd>{formatBoolean(setupCenter.scheduler.dryRun)}</dd></div>
            <div><dt>Real providers allowed</dt><dd>{formatBoolean(setupCenter.scheduler.realProvidersAllowed)}</dd></div>
            <div><dt>Publishing allowed</dt><dd>{formatBoolean(setupCenter.scheduler.publishingAllowed)}</dd></div>
            <div><dt>Max sources per run</dt><dd>{formatNumber(setupCenter.scheduler.maxSourcesPerRun)}</dd></div>
            <div><dt>Max items per run</dt><dd>{formatNumber(setupCenter.scheduler.maxItemsPerRun)}</dd></div>
            <div><dt>AI quota</dt><dd>{formatNumber(setupCenter.scheduler.maxAiItemsPerRun)}</dd></div>
            <div><dt>Provider quota</dt><dd>{formatNumber(setupCenter.scheduler.maxProviderItemsPerRun)}</dd></div>
            <div><dt>Publish quota</dt><dd>{formatNumber(setupCenter.scheduler.maxPublishItemsPerRun)}</dd></div>
          </dl>
          {setupCenter.scheduler.warnings.length > 0 && <ul>{setupCenter.scheduler.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          <button type="button" onClick={() => void runOperation("scheduler_dry_run", () => client.runSchedulerDryRun())} disabled={!internalReady || busy !== undefined}>Run scheduler dry-run</button>
        </div>

        <div className="card">
          <h2>8. Controlled pilot</h2>
          <p className="muted">Readiness-only is the default. Optional pilot steps require explicit checkboxes. No final publish, public WordPress publish, or scheduler activation is available.</p>
          <div className="buttonStack"><button type="button" onClick={() => void runOperation("pilot_readiness", () => client.runPilot({}))} disabled={!internalReady || busy !== undefined}>Run readiness-only pilot</button></div>
          <div className="pilotCards">
            <PilotStep title="Firecrawl" checked={pilotInput.runFirecrawl === true} confirmed={confirmFirecrawl} onChecked={(checked) => setPilotInput({ ...pilotInput, runFirecrawl: checked })} onConfirmed={setConfirmFirecrawl} warning="May call Firecrawl if enabled/configured." />
            <PilotStep title="Telegram" checked={pilotInput.runTelegramReview === true} confirmed={confirmTelegramPilot} onChecked={(checked) => setPilotInput({ ...pilotInput, runTelegramReview: checked })} onConfirmed={setConfirmTelegramPilot} warning="Review-channel only; no final publish." />
            <PilotStep title="WordPress" checked={pilotInput.runWordPressDraft === true} confirmed={confirmWordPressPilot} onChecked={(checked) => setPilotInput({ ...pilotInput, runWordPressDraft: checked })} onConfirmed={setConfirmWordPressPilot} warning="Draft-only; no public publish." />
          </div>
          <label>Firecrawl URL<input value={pilotInput.firecrawlUrl ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, firecrawlUrl: event.target.value })} /></label>
          <label>Telegram text<textarea value={pilotInput.telegramText ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, telegramText: event.target.value })} /></label>
          <label>WordPress title<input value={pilotInput.wordpressTitle ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, wordpressTitle: event.target.value })} /></label>
          <label>WordPress content<textarea value={pilotInput.wordpressContent ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, wordpressContent: event.target.value })} /></label>
          <label>Source URL<input value={pilotInput.sourceUrl ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, sourceUrl: event.target.value })} /></label>
          <button type="button" onClick={runPilotFromInput} disabled={!internalReady || busy !== undefined}>Run selected confirmed pilot checks</button>
        </div>
      </section>

      <section className="card" aria-labelledby="overview-heading">
        <h2 id="overview-heading">9. API status details</h2>
        <div className="summaryGrid">
          <SummaryCard title="System health" value={bundle.health?.ok === true ? "Healthy" : "Unknown / error"} ok={bundle.health?.ok === true} />
          <SummaryCard title="Readiness" value={bundle.ready?.ok === true ? "Ready" : "Warning / not ready"} ok={bundle.ready?.ok === true} />
          <SummaryCard title="Environment" value={formatValue(readPath(bundle.status, ["environment"]))} />
          <SummaryCard title="Mock mode" value={formatBoolean(readPath(bundle.status, ["mockMode"]))} />
          <SummaryCard title="Providers mode" value={formatValue(readPath(bundle.status, ["providers", "providersMode"]))} />
          <SummaryCard title="Firecrawl status" value={formatValue(readPath(bundle.status, ["providers", "firecrawl", "status"]))} />
        </div>
        <div className="grid three">
          <JsonPanel title="/health" result={bundle.health} />
          <JsonPanel title="/status" result={bundle.status} />
          <JsonPanel title="/ready" result={bundle.ready} />
        </div>
      </section>

      <section className="card" aria-labelledby="legacy-checklist-heading">
        <h2 id="legacy-checklist-heading">10. Compact secrets & variables checklist</h2>
        <p className="muted">This remains a compact reference. The setup center above is the recommended workflow.</p>
        <div className="grid two">
          {Object.entries(legacyChecklist).map(([group, items]) => (
            <div className="subcard" key={group}>
              <h3>{group}</h3>
              <table>
                <thead><tr><th>Name</th><th>Where</th><th>Status</th></tr></thead>
                <tbody>{items.map((item) => <tr key={item.name}><td><strong>{item.name}</strong><br /><span>{item.purpose}</span></td><td>{item.where}<br /><span>{item.sensitive ? "Sensitive" : "Not sensitive"}</span></td><td>{item.configured === undefined ? "Manual check" : item.configured ? "Configured" : "Missing"}</td></tr>)}</tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="grid two" aria-labelledby="activity-heading">
        <div className="card">
          <div className="sectionTitle"><h2 id="activity-heading">11. Activity / recent results</h2><button type="button" className="secondary" onClick={() => { clearOperationHistory(); setHistory([]); }}>Clear history</button></div>
          {history.length === 0 ? <p className="muted">No operation results stored locally yet.</p> : history.map((record) => <details key={record.id} className="historyItem"><summary>{record.label} · {record.ok ? "ok" : "error"} · {new Date(record.timestamp).toLocaleString()} · warnings {record.warningsCount} · errors {record.errorsCount}</summary><pre>{JSON.stringify(redactSensitiveJson(record.result), null, 2)}</pre></details>)}
        </div>

        <div className="card manager">
          <h2>12. Legacy manager summary</h2>
          <div className={`badge ${legacyManagerSummary.healthLabel === "Healthy" ? "good" : legacyManagerSummary.healthLabel === "Warning" ? "warn" : "bad"}`}>{legacyManagerSummary.healthLabel}</div>
          <p><strong>Operating mode:</strong> {legacyManagerSummary.operatingMode}</p>
          <h3>Safe right now</h3>
          <ul>{legacyManagerSummary.safeNow.map((item) => <li key={item}>{item}</li>)}</ul>
          <h3>Missing or not enabled</h3>
          <ul>{legacyManagerSummary.missing.map((item) => <li key={item}>{item}</li>)}</ul>
          <p><strong>Next action:</strong> {legacyManagerSummary.nextAction}</p>
        </div>
      </section>
    </main>
  );
}

function StatusCallout({ status }: { status: SetupStatus }): JSX.Element {
  return <div className={`statusCallout ${status.tone}`}><strong>{status.label}</strong><p>{status.detail}</p><p><strong>Next:</strong> {status.nextAction}</p></div>;
}

function RuntimeItem({ item }: { item: RuntimeChecklistItem }): JSX.Element {
  return <div className={`runtimeItem ${item.safe === true ? "safe" : item.safe === false ? "warning" : "unknown"}`}><strong>{item.name}</strong><span>{item.purpose}</span><dl><div><dt>Where</dt><dd>{item.where}</dd></div><div><dt>Safe default</dt><dd>{item.safeDefault}</dd></div><div><dt>Backend status</dt><dd>{item.backendStatus}</dd></div><div><dt>Data type</dt><dd>{item.sensitive ? "Sensitive" : "Not sensitive"}</dd></div></dl><p>{item.nextAction}</p></div>;
}

function DetailList({ items }: { items: SetupDetailItem[] }): JSX.Element {
  return <div className="detailList">{items.map((item) => <div className="detailItem" key={item.name}><strong>{item.name}</strong><p>{item.purpose}</p><dl><div><dt>Where</dt><dd>{item.where}</dd></div><div><dt>Current status</dt><dd>{item.currentStatus}</dd></div><div><dt>Type</dt><dd>{item.sensitive ? "Sensitive" : "Not sensitive"}</dd></div></dl><p><strong>Next:</strong> {item.nextAction}</p></div>)}</div>;
}

function PilotStep({ title, checked, confirmed, onChecked, onConfirmed, warning }: { title: string; checked: boolean; confirmed: boolean; onChecked: (checked: boolean) => void; onConfirmed: (checked: boolean) => void; warning: string }): JSX.Element {
  return <div className="pilotStep"><strong>{title}</strong><p>{warning}</p><label className="checkRow"><input type="checkbox" checked={checked} onChange={(event) => onChecked(event.target.checked)} />Include step</label><label className="checkRow"><input type="checkbox" checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} />I understand this step is optional and explicitly configured</label></div>;
}

function SummaryCard({ title, value, ok }: { title: string; value: string; ok?: boolean }): JSX.Element {
  return <div className={`summaryCard ${ok === true ? "goodBorder" : ok === false ? "badBorder" : ""}`}><span>{title}</span><strong>{value}</strong></div>;
}

function JsonPanel({ title, result }: { title: string; result: ApiResult | undefined }): JSX.Element {
  return <div className="subcard"><h3>{title}</h3><p className={result?.ok === true ? "okText" : "badText"}>{result === undefined ? "Not loaded" : result.ok ? "ok" : result.message}</p><details><summary>View raw JSON</summary><pre>{JSON.stringify(redactSensitiveJson(resultToJson(result)), null, 2)}</pre></details></div>;
}

function cleanPilotInput(input: PilotInput): PilotInput {
  const next: PilotInput = {};
  if (input.runFirecrawl === true) next.runFirecrawl = true;
  if (input.runTelegramReview === true) next.runTelegramReview = true;
  if (input.runWordPressDraft === true) next.runWordPressDraft = true;
  if (input.firecrawlUrl?.trim()) next.firecrawlUrl = input.firecrawlUrl.trim();
  if (input.telegramText?.trim()) next.telegramText = input.telegramText.trim();
  if (input.wordpressTitle?.trim()) next.wordpressTitle = input.wordpressTitle.trim();
  if (input.wordpressContent?.trim()) next.wordpressContent = input.wordpressContent.trim();
  if (input.sourceUrl?.trim()) next.sourceUrl = input.sourceUrl.trim();
  return next;
}

function cleanTelegramInput(text: string, sourceUrl: string): { text: string; sourceUrl?: string } {
  const trimmedSourceUrl = sourceUrl.trim();
  return trimmedSourceUrl ? { text: text.trim(), sourceUrl: trimmedSourceUrl } : { text: text.trim() };
}

function cleanWordPressInput(title: string, content: string, sourceUrl: string): { title: string; content: string; sourceUrl?: string } {
  const trimmedSourceUrl = sourceUrl.trim();
  return trimmedSourceUrl ? { title: title.trim(), content: content.trim(), sourceUrl: trimmedSourceUrl } : { title: title.trim(), content: content.trim() };
}

function formatBoolean(value: unknown): string {
  return typeof value === "boolean" ? (value ? "Yes" : "No") : "unknown";
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "unknown" : String(value);
}

function formatValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "unknown";
}

function readPath(bundleResult: ApiResult | undefined, path: string[]): string | boolean | number | undefined {
  if (bundleResult?.ok !== true || !isRecord(bundleResult.data)) {
    return undefined;
  }
  let current: unknown = bundleResult.data;
  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return typeof current === "string" || typeof current === "boolean" || typeof current === "number" ? current : undefined;
}

function resultToJson(result: ApiResult | undefined): JsonValue {
  if (result === undefined) {
    return null;
  }
  if (result.ok) {
    return result.data;
  }
  const data: JsonObject = {
    ok: false,
    error: result.error,
    message: result.message
  };
  if (result.status !== undefined) {
    data.status = result.status;
  }
  if (result.data !== undefined) {
    data.data = result.data;
  }
  return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function riskClass(value: "Safe" | "Warning" | "Risky"): string {
  return value === "Safe" ? "good" : value === "Warning" ? "warn" : "bad";
}

function toneForOverall(value: string): string {
  return value === "Pilot-ready" ? "safe" : value === "Risky config" ? "risky" : "warning";
}

export default App;
