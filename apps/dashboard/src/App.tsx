import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkerApiClient } from "./api";
import { buildChecklist, buildManagerSummary, countErrors, countWarnings } from "./status";
import {
  clearInternalCredential,
  clearOperationHistory,
  clearSettings,
  getInternalCredential,
  loadOperationHistory,
  loadSettings,
  saveApiBaseUrl,
  saveInternalCredential,
  saveOperationRecord
} from "./storage";
import type { ApiResult, DashboardSettings, JsonValue, OperationName, OperationRecord, PilotInput, StatusBundle } from "./types";

const operationLabels: Record<OperationName, string> = {
  refresh_status: "Refresh status",
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
  const [pilotInput, setPilotInput] = useState<PilotInput>({
    runFirecrawl: false,
    runTelegramReview: false,
    runWordPressDraft: false,
    firecrawlUrl: "",
    telegramText: "",
    wordpressTitle: "",
    wordpressContent: "",
    sourceUrl: ""
  });

  const client = useMemo(() => new WorkerApiClient(settings.apiBaseUrl, getInternalCredential()), [settings]);
  const managerSummary = useMemo(() => buildManagerSummary(bundle), [bundle]);
  const checklist = useMemo(() => buildChecklist(bundle), [bundle]);
  const internalReady = settings.hasInternalCredential;

  const recordOperation = useCallback((name: OperationName, result: ApiResult | JsonValue): void => {
    const payload = "ok" in Object(result) ? result as ApiResult : result;
    const data = isApiResult(payload) ? (payload.ok ? payload.data : payload.data ?? { error: payload.error, message: payload.message }) : payload;
    const ok = isApiResult(payload) ? payload.ok : isRecord(payload) && payload.ok === true;
    const record: OperationRecord = {
      id: `${Date.now()}-${name}`,
      name,
      label: operationLabels[name],
      timestamp: new Date().toISOString(),
      ok,
      warningsCount: countWarnings(data),
      errorsCount: countErrors(data),
      result: data
    };
    setHistory(saveOperationRecord(record));
  }, []);

  const refreshStatus = useCallback(async (): Promise<void> => {
    setBusy("refresh_status");
    const next = await client.getStatusBundle();
    setBundle(next);
    recordOperation("refresh_status", {
      ok: next.health?.ok === true && next.status?.ok === true && next.ready?.ok === true,
      health: next.health,
      status: next.status,
      ready: next.ready
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
    setNotice("Settings saved locally. The internal credential is not displayed after saving.");
  }

  function clearAllSettings(): void {
    clearSettings();
    setCredentialInput("");
    setApiBaseUrlInput("");
    setSettings(loadSettings());
    setNotice("Saved dashboard settings cleared from this browser.");
  }

  async function runOperation(name: OperationName, runner: () => Promise<ApiResult>): Promise<void> {
    if (!window.confirm(`Run ${operationLabels[name]}?`)) {
      return;
    }
    setBusy(name);
    const result = await runner();
    recordOperation(name, result);
    setNotice(result.ok ? `${operationLabels[name]} completed.` : `${operationLabels[name]} returned an error.`);
    setBusy(undefined);
  }

  function runPilotFromInput(): void {
    const selected = [pilotInput.runFirecrawl, pilotInput.runTelegramReview, pilotInput.runWordPressDraft].filter(Boolean).length;
    const name: OperationName = selected > 1
      ? "pilot_combined"
      : pilotInput.runFirecrawl === true
        ? "pilot_firecrawl"
        : pilotInput.runTelegramReview === true
          ? "pilot_telegram_review"
          : pilotInput.runWordPressDraft === true
            ? "pilot_wordpress_draft"
            : "pilot_readiness";

    void runOperation(name, () => client.runPilot(cleanPilotInput(pilotInput)));
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Cloudflare Operator Dashboard MVP</p>
          <h1>AI Curation Publisher Agent</h1>
          <p>
            A safe browser dashboard for checking health, readiness, scheduler safeguards, mock smoke flows,
            and explicit integration pilots without using curl for normal operations.
          </p>
        </div>
        <div className="heroPanel">
          <strong>Safety posture</strong>
          <span>No scheduler enablement</span>
          <span>No real provider enablement</span>
          <span>No final Telegram publish button</span>
          <span>No public WordPress publish button</span>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <section className="grid two" aria-labelledby="setup-heading">
        <div className="card">
          <h2 id="setup-heading">1. Setup</h2>
          <label>
            Worker API base URL
            <input value={apiBaseUrlInput} onChange={(event) => setApiBaseUrlInput(event.target.value)} placeholder="Worker API URL" />
          </label>
          <label>
            Internal API credential
            <input value={credentialInput} onChange={(event) => setCredentialInput(event.target.value)} type="password" placeholder="Enter locally" />
          </label>
          <label className="checkRow">
            <input type="checkbox" checked={rememberCredential} onChange={(event) => setRememberCredential(event.target.checked)} />
            Remember internal credential in this browser
          </label>
          <div className="buttonRow">
            <button type="button" onClick={saveSetup}>Save locally</button>
            <button type="button" className="secondary" onClick={clearAllSettings}>Clear saved settings</button>
          </div>
          <dl className="compactList">
            <div><dt>API URL</dt><dd>{settings.apiBaseUrl ? "configured locally" : "missing"}</dd></div>
            <div><dt>Internal credential</dt><dd>{settings.hasInternalCredential ? "configured locally" : "missing"}</dd></div>
            <div><dt>Storage mode</dt><dd>{settings.rememberInternalCredential ? "localStorage" : "sessionStorage"}</dd></div>
          </dl>
        </div>

        <div className="card manager">
          <h2>2. Manager summary</h2>
          <div className={`badge ${managerSummary.healthLabel === "Healthy" ? "good" : managerSummary.healthLabel === "Warning" ? "warn" : "bad"}`}>
            {managerSummary.healthLabel}
          </div>
          <p><strong>Operating mode:</strong> {managerSummary.operatingMode}</p>
          <h3>Safe right now</h3>
          <ul>{managerSummary.safeNow.map((item) => <li key={item}>{item}</li>)}</ul>
          <h3>Missing or not enabled</h3>
          <ul>{managerSummary.missing.map((item) => <li key={item}>{item}</li>)}</ul>
          <p><strong>Next action:</strong> {managerSummary.nextAction}</p>
        </div>
      </section>

      <section className="card" aria-labelledby="overview-heading">
        <div className="sectionTitle">
          <h2 id="overview-heading">3. Overview</h2>
          <button type="button" onClick={() => void refreshStatus()} disabled={busy === "refresh_status"}>Refresh status</button>
        </div>
        <div className="summaryGrid">
          <SummaryCard title="System health" value={bundle.health?.ok === true ? "Healthy" : "Unknown / error"} ok={bundle.health?.ok === true} />
          <SummaryCard title="Readiness" value={bundle.ready?.ok === true ? "Ready" : "Warning / not ready"} ok={bundle.ready?.ok === true} />
          <SummaryCard title="Environment" value={readPath(bundle.status, ["environment"]) ?? "unknown"} />
          <SummaryCard title="Mock mode" value={formatBoolean(readPath(bundle.status, ["mockMode"]))} />
          <SummaryCard title="Providers mode" value={readPath(bundle.status, ["providers", "mode"]) ?? "unknown"} />
          <SummaryCard title="Scheduler enabled" value={formatBoolean(readPath(bundle.status, ["scheduler", "enabled"]))} ok={readPath(bundle.status, ["scheduler", "enabled"]) !== true} />
          <SummaryCard title="Scheduler dry-run" value={formatBoolean(readPath(bundle.status, ["scheduler", "dryRun"]))} ok={readPath(bundle.status, ["scheduler", "dryRun"]) === true} />
          <SummaryCard title="Real providers allowed" value={formatBoolean(readPath(bundle.status, ["scheduler", "realProvidersAllowed"]))} ok={readPath(bundle.status, ["scheduler", "realProvidersAllowed"]) !== true} />
          <SummaryCard title="Publishing allowed" value={formatBoolean(readPath(bundle.status, ["scheduler", "publishingAllowed"]))} ok={readPath(bundle.status, ["scheduler", "publishingAllowed"]) !== true} />
          <SummaryCard title="Firecrawl configured" value={formatBoolean(readPath(bundle.status, ["pilot", "firecrawlConfigured"]))} />
          <SummaryCard title="Telegram review" value={formatBoolean(readPath(bundle.status, ["pilot", "telegramReviewConfigured"]))} />
          <SummaryCard title="WordPress configured" value={formatBoolean(readPath(bundle.status, ["pilot", "wordpressConfigured"]))} />
          <SummaryCard title="Pilot readiness" value={formatBoolean(readPath(bundle.status, ["pilot", "ready"]))} />
        </div>
      </section>

      <section className="card" aria-labelledby="status-heading">
        <h2 id="status-heading">4. System status</h2>
        <div className="grid three">
          <JsonPanel title="/health" result={bundle.health} />
          <JsonPanel title="/status" result={bundle.status} />
          <JsonPanel title="/ready" result={bundle.ready} />
        </div>
      </section>

      <section className="card" aria-labelledby="checklist-heading">
        <h2 id="checklist-heading">5. Secrets & variables checklist</h2>
        <p className="muted">This dashboard does not set Cloudflare or GitHub configuration. Configure values manually in the correct platform.</p>
        <div className="grid two">
          {Object.entries(checklist).map(([group, items]) => (
            <div className="subcard" key={group}>
              <h3>{group}</h3>
              <table>
                <thead><tr><th>Name</th><th>Where</th><th>Status</th></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.name}>
                      <td><strong>{item.name}</strong><br /><span>{item.purpose}</span></td>
                      <td>{item.where}<br /><span>{item.sensitive ? "Sensitive" : "Not sensitive"}</span></td>
                      <td>{item.configured === undefined ? "Manual check" : item.configured ? "Configured" : "Missing"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="grid two" aria-labelledby="operations-heading">
        <div className="card">
          <h2 id="operations-heading">6. Safe operations</h2>
          {!internalReady && <p className="warning">Internal operation buttons are disabled until an internal credential is configured locally.</p>}
          <div className="buttonStack">
            <button type="button" onClick={() => void refreshStatus()} disabled={busy !== undefined}>Refresh status</button>
            <button type="button" onClick={() => void runOperation("mock_e2e_smoke", () => client.runMockE2E())} disabled={!internalReady || busy !== undefined}>Run mock E2E smoke</button>
            <button type="button" onClick={() => void runOperation("scheduler_dry_run", () => client.runSchedulerDryRun())} disabled={!internalReady || busy !== undefined}>Run scheduler dry-run</button>
            <button type="button" onClick={() => void runOperation("pilot_readiness", () => client.runPilot({}))} disabled={!internalReady || busy !== undefined}>Run pilot readiness-only</button>
          </div>
        </div>

        <div className="card">
          <h2>7. Scheduler safety</h2>
          <dl className="compactList">
            <div><dt>Enabled</dt><dd>{formatBoolean(readPath(bundle.status, ["scheduler", "enabled"]))}</dd></div>
            <div><dt>Dry-run</dt><dd>{formatBoolean(readPath(bundle.status, ["scheduler", "dryRun"]))}</dd></div>
            <div><dt>Real providers allowed</dt><dd>{formatBoolean(readPath(bundle.status, ["scheduler", "realProvidersAllowed"]))}</dd></div>
            <div><dt>Publishing allowed</dt><dd>{formatBoolean(readPath(bundle.status, ["scheduler", "publishingAllowed"]))}</dd></div>
            <div><dt>Max sources</dt><dd>{readPath(bundle.status, ["scheduler", "maxSourcesPerRun"]) ?? "unknown"}</dd></div>
            <div><dt>Max items</dt><dd>{readPath(bundle.status, ["scheduler", "maxItemsPerRun"]) ?? "unknown"}</dd></div>
          </dl>
          <p className="muted">This dashboard can run a manual dry-run only. It cannot enable scheduler, real providers, or publishing.</p>
        </div>
      </section>

      <section className="card" aria-labelledby="pilot-heading">
        <h2 id="pilot-heading">8. Controlled pilot</h2>
        <p className="warning">Optional pilot steps may call external services if the backend is explicitly enabled and configured. They never activate scheduler, final Telegram publish, or public WordPress publish.</p>
        <div className="grid two">
          <div className="subcard">
            <label className="checkRow"><input type="checkbox" checked={pilotInput.runFirecrawl === true} onChange={(event) => setPilotInput({ ...pilotInput, runFirecrawl: event.target.checked })} /> Firecrawl sandbox pilot</label>
            <label>Firecrawl URL<input value={pilotInput.firecrawlUrl ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, firecrawlUrl: event.target.value })} /></label>
          </div>
          <div className="subcard">
            <label className="checkRow"><input type="checkbox" checked={pilotInput.runTelegramReview === true} onChange={(event) => setPilotInput({ ...pilotInput, runTelegramReview: event.target.checked })} /> Telegram review dry-run</label>
            <label>Telegram review text<textarea value={pilotInput.telegramText ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, telegramText: event.target.value })} /></label>
          </div>
          <div className="subcard">
            <label className="checkRow"><input type="checkbox" checked={pilotInput.runWordPressDraft === true} onChange={(event) => setPilotInput({ ...pilotInput, runWordPressDraft: event.target.checked })} /> WordPress draft dry-run</label>
            <label>WordPress title<input value={pilotInput.wordpressTitle ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, wordpressTitle: event.target.value })} /></label>
            <label>WordPress content<textarea value={pilotInput.wordpressContent ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, wordpressContent: event.target.value })} /></label>
          </div>
          <div className="subcard">
            <label>Source URL<input value={pilotInput.sourceUrl ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, sourceUrl: event.target.value })} /></label>
            <div className="buttonStack">
              <button type="button" onClick={() => void runOperation("pilot_readiness", () => client.runPilot({}))} disabled={!internalReady || busy !== undefined}>Readiness only</button>
              <button type="button" onClick={runPilotFromInput} disabled={!internalReady || busy !== undefined}>Run selected pilot checks</button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid two" aria-labelledby="activity-heading">
        <div className="card">
          <div className="sectionTitle">
            <h2 id="activity-heading">9. Activity / recent results</h2>
            <button type="button" className="secondary" onClick={() => { clearOperationHistory(); setHistory([]); }}>Clear history</button>
          </div>
          {history.length === 0 ? <p className="muted">No operation results stored locally yet.</p> : history.map((record) => (
            <details key={record.id} className="historyItem">
              <summary>{record.label} · {record.ok ? "ok" : "error"} · {new Date(record.timestamp).toLocaleString()} · warnings {record.warningsCount} · errors {record.errorsCount}</summary>
              <pre>{JSON.stringify(record.result, null, 2)}</pre>
            </details>
          ))}
        </div>

        <div className="card">
          <h2>10. Setup wizard</h2>
          <ol className="wizard">
            <li><strong>Set Worker API URL.</strong> This tells the dashboard which Worker to call. Success means /health can be reached.</li>
            <li><strong>Set internal credential locally.</strong> This unlocks protected operations from this browser. The value is not displayed after saving.</li>
            <li><strong>Verify /health.</strong> Confirms the Worker is reachable.</li>
            <li><strong>Verify /ready.</strong> Confirms runtime readiness and warnings.</li>
            <li><strong>Configure Worker values manually.</strong> Use Cloudflare Worker Variables and Secrets, not this dashboard.</li>
            <li><strong>Configure GitHub Actions values manually.</strong> Use GitHub repository settings.</li>
            <li><strong>Run mock E2E.</strong> Safe, no external services.</li>
            <li><strong>Run pilot readiness-only.</strong> Safe summary, no external service calls.</li>
            <li><strong>Optional Firecrawl pilot.</strong> May call external service only if backend is explicitly enabled and configured.</li>
            <li><strong>Optional Telegram review pilot.</strong> Review channel only, no final publish.</li>
            <li><strong>Optional WordPress draft pilot.</strong> Draft only, no public publish.</li>
          </ol>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({ title, value, ok }: { title: string; value: string; ok?: boolean }): JSX.Element {
  return <div className={`summaryCard ${ok === true ? "goodBorder" : ok === false ? "badBorder" : ""}`}><span>{title}</span><strong>{value}</strong></div>;
}

function JsonPanel({ title, result }: { title: string; result?: ApiResult }): JSX.Element {
  return (
    <div className="subcard">
      <h3>{title}</h3>
      <p className={result?.ok === true ? "okText" : "badText"}>{result === undefined ? "Not loaded" : result.ok ? "ok" : result.message}</p>
      <details>
        <summary>View raw JSON</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
  );
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

function formatBoolean(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
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

function isApiResult(value: unknown): value is ApiResult {
  return isRecord(value) && typeof value.ok === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default App;
