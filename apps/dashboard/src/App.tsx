import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkerApiClient } from "./api";
import { deriveSetupCenter, redactSensitiveJson } from "./setup";
import { buildChecklist, countErrors, countWarnings } from "./status";
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
import type { ApiResult, DashboardSettings, JsonObject, JsonValue, OperationName, OperationRecord, PilotInput, RuntimeChecklistItem, SetupCenterModel, SetupDetailItem, SetupStatus, StatusBundle } from "./types";

type MainTab = "overview" | "wizard" | "integrations" | "scheduler" | "pilot" | "technical";
type IntegrationTab = "telegram" | "wordpress" | "firecrawl";
type WizardStatus = "Not started" | "Needs action" | "Ready" | "Warning" | "Risky";

type WizardStep = {
  title: string;
  status: WizardStatus;
  summary: string;
  nextAction: string;
};

const tabs: { id: MainTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "wizard", label: "Setup Wizard" },
  { id: "integrations", label: "Integrations" },
  { id: "scheduler", label: "Scheduler Safety" },
  { id: "pilot", label: "Pilot Tests" },
  { id: "technical", label: "Technical Details" }
];

const integrationTabs: { id: IntegrationTab; label: string }[] = [
  { id: "telegram", label: "Telegram" },
  { id: "wordpress", label: "WordPress" },
  { id: "firecrawl", label: "Firecrawl" }
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
  const [activeTab, setActiveTab] = useState<MainTab>("overview");
  const [activeIntegration, setActiveIntegration] = useState<IntegrationTab>("telegram");
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
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
  const legacyChecklist = useMemo(() => buildChecklist(bundle), [bundle]);
  const setupCenter = useMemo(() => deriveSetupCenter(bundle, settings.hasInternalCredential), [bundle, settings.hasInternalCredential]);
  const wizardSteps = useMemo(() => buildWizardSteps(setupCenter, settings, bundle), [setupCenter, settings, bundle]);
  const completedSteps = wizardSteps.filter((step) => step.status === "Ready").length;
  const progressPercent = Math.round((completedSteps / wizardSteps.length) * 100);
  const internalReady = settings.hasInternalCredential;
  const workerReady = wizardSteps[0]?.status === "Ready";
  const activeWizardStepIndex = !workerReady && wizardStepIndex > 0 ? 0 : wizardStepIndex;
  const currentStep = wizardSteps[activeWizardStepIndex] ?? wizardSteps[0];

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

  useEffect(() => {
    if (!workerReady && wizardStepIndex > 0) {
      setWizardStepIndex(0);
      setNotice("Complete Worker connection before continuing.");
    }
  }, [workerReady, wizardStepIndex]);

  function saveSetup(): void {
    saveApiBaseUrl(apiBaseUrlInput);
    if (credentialInput.length > 0) {
      saveInternalCredential(credentialInput, rememberCredential);
    }
    setCredentialInput("");
    setSettings(loadSettings());
    setNotice("Saved locally. Secret values are never displayed after saving.");
  }

  async function saveAndCheckConnection(): Promise<void> {
    saveApiBaseUrl(apiBaseUrlInput);
    if (credentialInput.length > 0) {
      saveInternalCredential(credentialInput, rememberCredential);
    }
    setCredentialInput("");
    const nextSettings = loadSettings();
    setSettings(nextSettings);
    setBusy("refresh_status");
    const checkClient = new WorkerApiClient(nextSettings.apiBaseUrl, getInternalCredential());
    const next = await checkClient.getStatusBundle();
    setBundle(next);
    const ok = next.health?.ok === true && next.status?.ok === true && next.ready?.ok === true;
    recordOperation("refresh_status", ok, {
      health: resultToJson(next.health),
      status: resultToJson(next.status),
      ready: resultToJson(next.ready)
    });
    setNotice(ok ? "Connection saved and checked. Your Worker is reachable." : "We can’t reach your Worker yet. Check the URL and try again.");
    setBusy(undefined);
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
      <header className="hero compactHero">
        <div>
          <p className="eyebrow">Cloudflare Operator Dashboard</p>
          <h1>Guided setup</h1>
          <p>Start with the overview. Use the wizard for setup. Keep technical details hidden unless you need to debug.</p>
        </div>
        <div className="heroPanel">
          <strong>Safe by design</strong>
          <span>No secret editing</span>
          <span>Scheduler stays disabled</span>
          <span>Publishing stays disabled</span>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <nav className="topTabs" aria-label="Dashboard sections">
        {tabs.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? "active" : "secondary"} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </nav>

      {activeTab === "overview" && (
        <section className="tabPanel" aria-labelledby="overview-heading">
          <div className="sectionTitle">
            <div>
              <p className="eyebrow">Overview</p>
              <h2 id="overview-heading">What needs attention?</h2>
            </div>
            <button type="button" onClick={() => void refreshStatus()} disabled={busy === "refresh_status"}>Refresh status</button>
          </div>
          <div className={`launchStatus ${toneForOverall(setupCenter.launchSummary.overallStatus)}`}>
            <strong>{setupCenter.launchSummary.overallStatus}</strong>
            <span>{setupCenter.launchSummary.recommendedNextStep}</span>
          </div>
          <BeforeYouStart />
          {!workerReady && settings.apiBaseUrl.length > 0 && <StuckState onOpenTechnical={() => setActiveTab("technical")} />}
          <div className="overviewCards">
            <OverviewCard title="System status" value={bundle.health?.ok === true ? "Worker is online" : "We can’t reach your Worker yet"} tone={bundle.health?.ok === true ? "safe" : "warning"} />
            <OverviewCard title="Setup progress" value={`${completedSteps} of ${wizardSteps.length} steps complete`} tone={completedSteps === wizardSteps.length ? "safe" : "warning"} />
            <OverviewCard title="Internal security" value={setupCenter.launchSummary.internalSecurity === "Ready" ? "Internal security is configured" : "Connect your Worker to unlock this step"} tone={setupCenter.launchSummary.internalSecurity === "Ready" ? "safe" : "warning"} />
            <OverviewCard title="Scheduler safety" value={setupCenter.scheduler.riskLabel === "Safe" ? "Scheduler is disabled or safe" : "Scheduler needs review"} tone={toneForRisk(setupCenter.scheduler.riskLabel)} />
            <OverviewCard title="Publishing safety" value={setupCenter.launchSummary.publishingSafety === "Safe" ? "No public publishing is enabled" : "Publishing is risky"} tone={setupCenter.launchSummary.publishingSafety === "Safe" ? "safe" : "risky"} />
            <OverviewCard title="Next action" value={workerReady ? setupCenter.launchSummary.recommendedNextStep : "Paste your Cloudflare Worker URL and check the connection."} tone="plain" />
          </div>
          <HelpGuide />
          <div className="quickActions">
            <button type="button" onClick={() => setActiveTab("wizard")}>Continue setup wizard</button>
          </div>
        </section>
      )}

      {activeTab === "wizard" && currentStep !== undefined && (
        <section className="tabPanel" aria-labelledby="wizard-heading">
          <div className="sectionTitle">
            <div>
              <p className="eyebrow">Setup Wizard</p>
              <h2 id="wizard-heading">Step-by-step setup</h2>
            </div>
            <span className="progressText">{completedSteps} of {wizardSteps.length} steps complete</span>
          </div>
          <div className="progressBar" aria-label="Setup progress"><span style={{ width: `${progressPercent}%` }} /></div>
          <HelpGuide compact />
          <div className="wizardLayout">
            <aside className="stepRail" aria-label="Setup steps">
              {wizardSteps.map((step, index) => {
                const isLocked = !workerReady && index > 0;
                const isActive = index === activeWizardStepIndex && !isLocked;
                return (
                  <button
                    type="button"
                    key={step.title}
                    className={`stepButton${isActive ? " active" : ""}${isLocked ? " locked" : ""}`}
                    onClick={() => {
                      if (isLocked) {
                        setNotice("Complete Worker connection before continuing.");
                        return;
                      }
                      setWizardStepIndex(index);
                    }}
                    disabled={isLocked}
                    aria-disabled={isLocked ? "true" : "false"}
                    {...(isLocked ? { title: "Complete Worker connection first", style: { opacity: 0.46, cursor: "not-allowed" } } : {})}
                  >
                    <span>Step {index + 1}</span>
                    <strong>{step.title}</strong>
                    <em className={`statusPill ${isLocked ? "neutral" : statusClass(step.status)}`}>{isLocked ? "Locked" : step.status}</em>
                    {isLocked && <small className="muted">Complete Worker connection first</small>}
                  </button>
                );
              })}
            </aside>
            <div className="wizardCard">
              <div className="stepHeader"><span className={`statusPill ${statusClass(currentStep.status)}`}>{currentStep.status}</span><h3>Step {activeWizardStepIndex + 1}: {currentStep.title}</h3></div>
              <p className="helperText">{currentStep.summary}</p>
              <div className="nextAction"><strong>Next action</strong><span>{currentStep.nextAction}</span></div>
              {renderWizardStep(activeWizardStepIndex, {
                setupCenter,
                settings,
                apiBaseUrlInput,
                setApiBaseUrlInput,
                credentialInput,
                setCredentialInput,
                rememberCredential,
                setRememberCredential,
                saveSetup,
                saveAndCheckConnection,
                clearAllSettings,
                refreshStatus,
                runOperation,
                client,
                internalReady,
                busy,
                telegramText,
                setTelegramText,
                telegramSourceUrl,
                setTelegramSourceUrl,
                wordpressTitle,
                setWordpressTitle,
                wordpressContent,
                setWordpressContent,
                wordpressSourceUrl,
                setWordpressSourceUrl,
                firecrawlUrl,
                setFirecrawlUrl,
                confirmFirecrawl,
                setConfirmFirecrawl,
                pilotInput,
                setPilotInput,
                confirmTelegramPilot,
                setConfirmTelegramPilot,
                confirmWordPressPilot,
                setConfirmWordPressPilot,
                runPilotFromInput,
                workerReady
              })}
              {activeWizardStepIndex === 0 && !workerReady && <p className="warning">Connect your Worker to continue.</p>}
              <div className="wizardNav">
                <button type="button" className="secondary" onClick={() => setWizardStepIndex(Math.max(0, activeWizardStepIndex - 1))} disabled={activeWizardStepIndex === 0}>Previous step</button>
                <button type="button" onClick={() => setWizardStepIndex(Math.min(wizardSteps.length - 1, activeWizardStepIndex + 1))} disabled={activeWizardStepIndex === wizardSteps.length - 1 || (activeWizardStepIndex === 0 && !workerReady)}>Next step</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "integrations" && (
        <section className="tabPanel" aria-labelledby="integrations-heading">
          <div className="sectionTitle"><div><p className="eyebrow">Integrations</p><h2 id="integrations-heading">Optional setup</h2></div></div>
          <HelpGuide compact />
          <nav className="subTabs" aria-label="Integration tabs">{integrationTabs.map((tab) => <button type="button" key={tab.id} className={activeIntegration === tab.id ? "active" : "secondary"} onClick={() => setActiveIntegration(tab.id)}>{tab.label}</button>)}</nav>
          {activeIntegration === "telegram" && <IntegrationPanel title="Telegram review" status={integrationStatus(setupCenter.telegram, ["TELEGRAM_BOT_TOKEN", "TELEGRAM_REVIEW_CHAT_ID", "TELEGRAM_REAL_REVIEW_ENABLED"])} items={workerReady ? setupCenter.telegram : []} instructions={workerReady ? "Configure Telegram values manually in Cloudflare. Use review dry-run only when you intentionally enabled review mode." : "Connect your Worker to unlock setup details."} advanced={<DetailList items={setupCenter.telegram} />} action={<TelegramAction telegramText={telegramText} setTelegramText={setTelegramText} telegramSourceUrl={telegramSourceUrl} setTelegramSourceUrl={setTelegramSourceUrl} internalReady={internalReady && workerReady} busy={busy} runOperation={runOperation} client={client} />} />}
          {activeIntegration === "wordpress" && <IntegrationPanel title="WordPress draft" status={integrationStatus(setupCenter.wordpress, ["WORDPRESS_BASE_URL", "WORDPRESS_USERNAME", "WORDPRESS_APPLICATION_PASSWORD", "WORDPRESS_REAL_DRY_RUN_ENABLED"])} items={workerReady ? setupCenter.wordpress : []} instructions={workerReady ? "Keep WordPress output draft-only. Configure values manually in Cloudflare before running a draft dry-run." : "Connect your Worker to unlock setup details."} advanced={<DetailList items={setupCenter.wordpress} />} action={<WordPressAction wordpressTitle={wordpressTitle} setWordpressTitle={setWordpressTitle} wordpressContent={wordpressContent} setWordpressContent={setWordpressContent} wordpressSourceUrl={wordpressSourceUrl} setWordpressSourceUrl={setWordpressSourceUrl} internalReady={internalReady && workerReady} busy={busy} runOperation={runOperation} client={client} />} />}
          {activeIntegration === "firecrawl" && <IntegrationPanel title="Firecrawl sandbox" status={integrationStatus(setupCenter.firecrawl, ["PROVIDERS_MODE", "ENABLE_FIRECRAWL_PROVIDER", "FIRECRAWL_API_KEY"])} items={workerReady ? setupCenter.firecrawl : []} instructions={workerReady ? "Firecrawl is optional and may call an external service only if backend settings are manually enabled." : "Connect your Worker to unlock setup details."} advanced={<DetailList items={setupCenter.firecrawl} />} action={<FirecrawlAction firecrawlUrl={firecrawlUrl} setFirecrawlUrl={setFirecrawlUrl} confirmFirecrawl={confirmFirecrawl} setConfirmFirecrawl={setConfirmFirecrawl} internalReady={internalReady && workerReady} busy={busy} runOperation={runOperation} client={client} />} />}
        </section>
      )}

      {activeTab === "scheduler" && (
        <section className="tabPanel" aria-labelledby="scheduler-heading">
          <div className="sectionTitle"><div><p className="eyebrow">Scheduler Safety</p><h2 id="scheduler-heading">Automation risk check</h2></div><span className={`statusPill ${riskClass(setupCenter.scheduler.riskLabel)}`}>{setupCenter.scheduler.riskLabel}</span></div>
          {setupCenter.scheduler.riskLabel !== "Safe" && <p className="dangerBanner">Scheduler or publishing settings need review before launch. This dashboard cannot enable or disable them.</p>}
          <div className="overviewCards compact">
            <OverviewCard title="Scheduler" value={setupCenter.scheduler.enabled === true ? "Enabled" : setupCenter.scheduler.enabled === false ? "Disabled" : "Unknown"} tone={setupCenter.scheduler.enabled === true ? "warning" : "safe"} />
            <OverviewCard title="Dry-run" value={formatBoolean(setupCenter.scheduler.dryRun)} tone={setupCenter.scheduler.dryRun === false ? "risky" : "safe"} />
            <OverviewCard title="Real providers" value={formatBoolean(setupCenter.scheduler.realProvidersAllowed)} tone={setupCenter.scheduler.realProvidersAllowed === true ? "risky" : "safe"} />
            <OverviewCard title="Publishing" value={formatBoolean(setupCenter.scheduler.publishingAllowed)} tone={setupCenter.scheduler.publishingAllowed === true ? "risky" : "safe"} />
            <OverviewCard title="Max sources" value={formatNumber(setupCenter.scheduler.maxSourcesPerRun)} tone="plain" />
            <OverviewCard title="Max items" value={formatNumber(setupCenter.scheduler.maxItemsPerRun)} tone="plain" />
            <OverviewCard title="AI quota" value={formatNumber(setupCenter.scheduler.maxAiItemsPerRun)} tone="plain" />
            <OverviewCard title="Provider quota" value={formatNumber(setupCenter.scheduler.maxProviderItemsPerRun)} tone="plain" />
            <OverviewCard title="Publish quota" value={formatNumber(setupCenter.scheduler.maxPublishItemsPerRun)} tone={setupCenter.scheduler.maxPublishItemsPerRun === 0 ? "safe" : "warning"} />
          </div>
          {setupCenter.scheduler.warnings.length > 0 && <div className="helperBlock"><strong>What this means</strong><ul>{setupCenter.scheduler.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          <SchedulerHelp />
          <button type="button" onClick={() => void runOperation("scheduler_dry_run", () => client.runSchedulerDryRun())} disabled={!internalReady || !workerReady || busy !== undefined}>Run scheduler dry-run</button>
        </section>
      )}

      {activeTab === "pilot" && (
        <section className="tabPanel" aria-labelledby="pilot-heading">
          <div className="sectionTitle"><div><p className="eyebrow">Pilot Tests</p><h2 id="pilot-heading">Run safe checks one step at a time</h2></div></div>
          <p className="helperText">{workerReady ? "Readiness-only is the default safe action. Real-ish pilot steps require explicit confirmation and backend configuration." : "Connect your Worker to unlock pilot tests."}</p>
          <PilotHelp />
          <div className="buttonRow"><button type="button" onClick={() => void runOperation("pilot_readiness", () => client.runPilot({}))} disabled={!internalReady || !workerReady || busy !== undefined}>Run readiness-only pilot</button></div>
          <div className="pilotCards">
            <PilotStep title="Firecrawl" checked={pilotInput.runFirecrawl === true} confirmed={confirmFirecrawl} onChecked={(checked) => setPilotInput({ ...pilotInput, runFirecrawl: checked })} onConfirmed={setConfirmFirecrawl} warning="May call Firecrawl if backend is enabled/configured." />
            <PilotStep title="Telegram" checked={pilotInput.runTelegramReview === true} confirmed={confirmTelegramPilot} onChecked={(checked) => setPilotInput({ ...pilotInput, runTelegramReview: checked })} onConfirmed={setConfirmTelegramPilot} warning="Review-channel only; no final publish." />
            <PilotStep title="WordPress" checked={pilotInput.runWordPressDraft === true} confirmed={confirmWordPressPilot} onChecked={(checked) => setPilotInput({ ...pilotInput, runWordPressDraft: checked })} onConfirmed={setConfirmWordPressPilot} warning="Draft-only; no public publish." />
          </div>
          <details className="subcard"><summary>Inputs for selected pilot steps</summary><label>Firecrawl URL<input value={pilotInput.firecrawlUrl ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, firecrawlUrl: event.target.value })} /></label><label>Telegram text<textarea value={pilotInput.telegramText ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, telegramText: event.target.value })} /></label><label>WordPress title<input value={pilotInput.wordpressTitle ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, wordpressTitle: event.target.value })} /></label><label>WordPress content<textarea value={pilotInput.wordpressContent ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, wordpressContent: event.target.value })} /></label><label>Source URL<input value={pilotInput.sourceUrl ?? ""} onChange={(event) => setPilotInput({ ...pilotInput, sourceUrl: event.target.value })} /></label></details>
          <button type="button" onClick={runPilotFromInput} disabled={!internalReady || !workerReady || busy !== undefined}>Run selected confirmed pilot checks</button>
          <RecentResults history={history.filter((record) => record.name.startsWith("pilot_"))} emptyText="No pilot results yet." />
        </section>
      )}

      {activeTab === "technical" && (
        <section className="tabPanel" aria-labelledby="technical-heading">
          <div className="sectionTitle"><div><p className="eyebrow">Technical Details</p><h2 id="technical-heading">Debugging and full details</h2></div><button type="button" onClick={() => { clearOperationHistory(); setHistory([]); }} className="secondary">Clear history</button></div>
          <p className="helperText">For debugging. Normal setup should happen in Overview and Setup Wizard.</p>
          <details className="subcard"><summary>Full Cloudflare runtime checklist</summary><div className="runtimeGrid">{setupCenter.cloudflareRuntime.map((item) => <RuntimeItem key={item.name} item={item} />)}</div></details>
          <details className="subcard"><summary>Variables and secrets checklist</summary><div className="grid two">{Object.entries(legacyChecklist).map(([group, items]) => <div className="subcard flat" key={group}><h3>{group}</h3><table><thead><tr><th>Name</th><th>Where</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.name}><td><strong>{item.name}</strong><br /><span>{item.purpose}</span></td><td>{item.where}<br /><span>{item.sensitive ? "Sensitive" : "Not sensitive"}</span></td><td>{item.configured === undefined ? "Manual check" : item.configured ? "Configured" : "Missing"}</td></tr>)}</tbody></table></div>)}</div></details>
          <details className="subcard"><summary>Raw API JSON</summary><div className="grid three"><JsonPanel title="/health" result={bundle.health} /><JsonPanel title="/status" result={bundle.status} /><JsonPanel title="/ready" result={bundle.ready} /></div></details>
          <details className="subcard"><summary>Recent operation results</summary><RecentResults history={history} emptyText="No operation results stored locally yet." /></details>
          <details className="subcard"><summary>Route details</summary><RouteDetails /></details>
          <details className="subcard"><summary>Advanced environment mapping</summary><p className="muted">Secrets belong in Cloudflare Worker Secrets or GitHub Actions Secrets. Non-secret flags belong in Cloudflare Worker Variables. The dashboard only reads status and sends protected test requests.</p><DetailList items={[...setupCenter.telegram, ...setupCenter.wordpress, ...setupCenter.firecrawl]} /></details>
        </section>
      )}
    </main>
  );
}

function OverviewCard({ title, value, tone }: { title: string; value: string; tone: "safe" | "warning" | "risky" | "plain" }): JSX.Element {
  return <div className={`overviewCard ${tone}`}><span>{title}</span><strong>{value}</strong></div>;
}

function StatusCallout({ status }: { status: SetupStatus }): JSX.Element {
  return <div className={`statusCallout ${status.tone}`}><strong>{status.label}</strong><p>{status.detail}</p><p><strong>Next:</strong> {status.nextAction}</p></div>;
}

function RuntimeItem({ item }: { item: RuntimeChecklistItem }): JSX.Element {
  return <div className={`runtimeItem ${item.safe === true ? "safe" : item.safe === false ? "warning" : "unknown"}`}><strong>{item.name}</strong><span>{item.purpose}</span><dl><div><dt>Where</dt><dd>{item.where}</dd></div><div><dt>Safe default</dt><dd>{item.safeDefault}</dd></div><div><dt>Backend status</dt><dd>{item.backendStatus}</dd></div></dl><p>{item.nextAction}</p></div>;
}

function DetailList({ items }: { items: SetupDetailItem[] }): JSX.Element {
  return <div className="detailList">{items.map((item) => <div className="detailItem" key={item.name}><strong>{item.name}</strong><span className="configLabel">{item.where}</span><p>{item.purpose}</p><dl><div><dt>Status</dt><dd>{item.currentStatus}</dd></div><div><dt>Type</dt><dd>{item.sensitive ? "Sensitive" : "Not sensitive"}</dd></div></dl><p><strong>Next:</strong> {item.nextAction}</p></div>)}</div>;
}

function PilotStep({ title, checked, confirmed, onChecked, onConfirmed, warning }: { title: string; checked: boolean; confirmed: boolean; onChecked: (checked: boolean) => void; onConfirmed: (checked: boolean) => void; warning: string }): JSX.Element {
  return <div className="pilotStep"><strong>{title}</strong><p>{warning}</p><label className="checkRow"><input type="checkbox" checked={checked} onChange={(event) => onChecked(event.target.checked)} />Include step</label><label className="checkRow"><input type="checkbox" checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} />I understand this optional step</label></div>;
}

function IntegrationPanel({ title, status, items, instructions, action, advanced }: { title: string; status: WizardStatus; items: SetupDetailItem[]; instructions: string; action: JSX.Element; advanced: JSX.Element }): JSX.Element {
  const missing = missingItems(items);
  return <div className="integrationPanel"><div className="sectionTitle"><div><h3>{title}</h3><p className="muted">{instructions}</p></div><span className={`statusPill ${statusClass(status)}`}>{status}</span></div>{missing.length > 0 && <div className="helperBlock"><strong>Missing or needs review</strong><ul>{missing.map((item) => <li key={item.name}><span className="configLabel">{item.where}</span> <strong>{item.name}</strong>: {item.nextAction}</li>)}</ul></div>}{action}<details className="subcard"><summary>View setup details</summary>{advanced}</details></div>;
}

function TelegramAction({ telegramText, setTelegramText, telegramSourceUrl, setTelegramSourceUrl, internalReady, busy, runOperation, client }: { telegramText: string; setTelegramText: (value: string) => void; telegramSourceUrl: string; setTelegramSourceUrl: (value: string) => void; internalReady: boolean; busy: string | undefined; runOperation: (name: OperationName, runner: () => Promise<ApiResult>, confirmText?: string) => Promise<void>; client: WorkerApiClient }): JSX.Element {
  return <div className="actionBox"><label>Review text<textarea value={telegramText} onChange={(event) => setTelegramText(event.target.value)} /></label><label>Optional source URL<input value={telegramSourceUrl} onChange={(event) => setTelegramSourceUrl(event.target.value)} /></label><button type="button" onClick={() => void runOperation("telegram_review_dry_run", () => client.runTelegramReviewDryRun(cleanTelegramInput(telegramText, telegramSourceUrl)), "Run Telegram review dry-run? This is review-channel only and never final publishing.")} disabled={!internalReady || busy !== undefined || telegramText.trim().length === 0}>Run Telegram review dry-run</button></div>;
}

function WordPressAction({ wordpressTitle, setWordpressTitle, wordpressContent, setWordpressContent, wordpressSourceUrl, setWordpressSourceUrl, internalReady, busy, runOperation, client }: { wordpressTitle: string; setWordpressTitle: (value: string) => void; wordpressContent: string; setWordpressContent: (value: string) => void; wordpressSourceUrl: string; setWordpressSourceUrl: (value: string) => void; internalReady: boolean; busy: string | undefined; runOperation: (name: OperationName, runner: () => Promise<ApiResult>, confirmText?: string) => Promise<void>; client: WorkerApiClient }): JSX.Element {
  return <div className="actionBox"><label>Draft title<input value={wordpressTitle} onChange={(event) => setWordpressTitle(event.target.value)} /></label><label>Draft content<textarea value={wordpressContent} onChange={(event) => setWordpressContent(event.target.value)} /></label><label>Optional source URL<input value={wordpressSourceUrl} onChange={(event) => setWordpressSourceUrl(event.target.value)} /></label><button type="button" onClick={() => void runOperation("wordpress_draft_dry_run", () => client.runWordPressDraftDryRun(cleanWordPressInput(wordpressTitle, wordpressContent, wordpressSourceUrl)), "Run WordPress draft dry-run? This must remain draft-only.")} disabled={!internalReady || busy !== undefined || wordpressTitle.trim().length === 0 || wordpressContent.trim().length === 0}>Run WordPress draft dry-run</button></div>;
}

function FirecrawlAction({ firecrawlUrl, setFirecrawlUrl, confirmFirecrawl, setConfirmFirecrawl, internalReady, busy, runOperation, client }: { firecrawlUrl: string; setFirecrawlUrl: (value: string) => void; confirmFirecrawl: boolean; setConfirmFirecrawl: (value: boolean) => void; internalReady: boolean; busy: string | undefined; runOperation: (name: OperationName, runner: () => Promise<ApiResult>, confirmText?: string) => Promise<void>; client: WorkerApiClient }): JSX.Element {
  return <div className="actionBox"><label>Sandbox URL<input value={firecrawlUrl} onChange={(event) => setFirecrawlUrl(event.target.value)} placeholder="https://example.com/article" /></label><label className="checkRow"><input type="checkbox" checked={confirmFirecrawl} onChange={(event) => setConfirmFirecrawl(event.target.checked)} />I understand this may call Firecrawl if backend is enabled.</label><button type="button" onClick={() => void runOperation("firecrawl_sandbox_fetch", () => client.runFirecrawlSandboxFetch({ url: firecrawlUrl.trim() }), "Run Firecrawl sandbox fetch? This may call an external service if backend Firecrawl is enabled/configured.")} disabled={!internalReady || busy !== undefined || !confirmFirecrawl || firecrawlUrl.trim().length === 0}>Run Firecrawl sandbox fetch</button></div>;
}

function RecentResults({ history, emptyText }: { history: OperationRecord[]; emptyText: string }): JSX.Element {
  return history.length === 0 ? <p className="muted">{emptyText}</p> : <div className="historyList">{history.map((record) => <details key={record.id} className="historyItem"><summary>{record.label} · {record.ok ? "ok" : "error"} · {new Date(record.timestamp).toLocaleString()} · warnings {record.warningsCount} · errors {record.errorsCount}</summary><pre>{JSON.stringify(redactSensitiveJson(record.result), null, 2)}</pre></details>)}</div>;
}

function JsonPanel({ title, result }: { title: string; result: ApiResult | undefined }): JSX.Element {
  return <div className="subcard flat"><h3>{title}</h3><p className={result?.ok === true ? "okText" : "badText"}>{result === undefined ? "Not loaded" : result.ok ? "ok" : result.message}</p><details><summary>View JSON</summary><pre>{JSON.stringify(redactSensitiveJson(resultToJson(result)), null, 2)}</pre></details></div>;
}

function RouteDetails(): JSX.Element {
  const routes = ["GET /health", "GET /status", "GET /ready", "POST /internal/e2e/mock-pipeline", "POST /internal/providers/firecrawl/sandbox-fetch", "POST /internal/telegram/review-dry-run", "POST /internal/wordpress/dry-run", "POST /internal/scheduler/run", "POST /internal/pilot/real-integrations"];
  return <ul>{routes.map((route) => <li key={route}>{route}</li>)}</ul>;
}

function BeforeYouStart(): JSX.Element {
  return <section className="guidePanel" aria-labelledby="before-start-heading"><div><p className="eyebrow">Before you start</p><h3 id="before-start-heading">What must exist first</h3><p className="muted">The dashboard checks your deployed Worker. It does not edit Cloudflare secrets for you.</p></div><div className="guideGrid"><GuideItem title="Worker deployed" label="Cloudflare" text="Deploy the Worker and copy its workers.dev URL." /><GuideItem title="Dashboard open" label="Dashboard" text="Run locally or deploy to Cloudflare Pages." /><GuideItem title="Worker URL ready" label="Dashboard local setting" text="Example: https://your-worker-name.your-subdomain.workers.dev" /><GuideItem title="Internal secret set" label="Cloudflare Worker Secret" text="Set INTERNAL_API_SECRET in Cloudflare, then enter it locally here for protected actions." /></div><CommandList commands={["pnpm setup:cloudflare", "pnpm check:production", "pnpm worker:deploy", "pnpm dashboard:build"]} /></section>;
}

function GuideItem({ title, label, text }: { title: string; label: string; text: string }): JSX.Element {
  return <div className="guideItem"><span className="configLabel">{label}</span><strong>{title}</strong><p>{text}</p></div>;
}

function HelpGuide({ compact = false }: { compact?: boolean }): JSX.Element {
  return <details className={compact ? "guidePanel compact" : "guidePanel"}><summary>Need help?</summary><div className="helpGrid"><HelpTopic title="I do not have a Worker URL"><p>Deploy the Worker first, then copy the workers.dev URL from Cloudflare.</p><CommandList commands={["pnpm setup:cloudflare", "pnpm worker:deploy"]} /></HelpTopic><HelpTopic title="My connection check fails"><p>Likely causes: the Worker is not deployed, the URL is wrong, or the browser cannot reach the Worker. Open your Worker URL with <code>/health</code> at the end to check it manually.</p></HelpTopic><HelpTopic title="Internal actions are disabled"><p>Protected admin actions need <code>INTERNAL_API_SECRET</code>. Set it as a Cloudflare Worker Secret, then enter the same value locally in this dashboard. The dashboard never shows it again.</p><CommandList commands={["pnpm wrangler secret put INTERNAL_API_SECRET"]} /></HelpTopic><HelpTopic title="Ready check shows Telegram missing"><p>Create a Telegram bot with BotFather, then configure <code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_WEBHOOK_SECRET</code>, <code>TELEGRAM_REVIEW_CHAT_ID</code>, and <code>TELEGRAM_FINAL_CHAT_ID</code>. Refresh status after saving them in Cloudflare.</p></HelpTopic><HelpTopic title="WordPress is missing"><p>WordPress can stay as a warning until draft testing is needed. Configure it only when you are ready for draft-only checks. Public publishing is not enabled here.</p></HelpTopic><HelpTopic title="Scheduler looks scary"><p>At setup time, scheduler disabled is good. Dry-run is safe. <code>publishingAllowed</code> and <code>realProvidersAllowed</code> should stay false.</p></HelpTopic></div></details>;
}

function HelpTopic({ title, children }: { title: string; children: JSX.Element | JSX.Element[] }): JSX.Element {
  return <div className="helpTopic"><strong>{title}</strong>{children}</div>;
}

function CommandList({ commands }: { commands: string[] }): JSX.Element {
  return <div className="commandList">{commands.map((command) => <CopyCommand key={command} command={command} />)}</div>;
}

function CopyCommand({ command }: { command: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return <div className="copyCommand"><code>{command}</code><button type="button" className="secondary" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button></div>;
}

function StuckState({ onOpenTechnical }: { onOpenTechnical: () => void }): JSX.Element {
  return <div className="stuckState"><strong>Connection check failed</strong><p>We can’t reach your Worker yet. The most common causes are a wrong URL or a Worker that has not been deployed.</p><ul><li>Check that the URL ends in <code>.workers.dev</code> or your custom Worker domain.</li><li>Open <code>/health</code> manually in your browser.</li><li>Run <code>pnpm check:production</code> from your terminal.</li></ul><button type="button" className="secondary" onClick={onOpenTechnical}>Open Technical Details</button></div>;
}

function SchedulerHelp(): JSX.Element {
  return <div className="guidePanel compact"><strong>How to read this</strong><p>Scheduler disabled is safe. Dry-run enabled is safe. Real providers allowed or publishing allowed should stay false during setup.</p></div>;
}

function PilotHelp(): JSX.Element {
  return <div className="guidePanel compact"><strong>Recommended order</strong><p>Run readiness-only first. Then choose one optional pilot step, confirm it, and review the result. No final publishing happens here.</p></div>;
}

function StepHelp({ step }: { step: number }): JSX.Element {
  if (step === 1) return <div className="guidePanel compact"><strong>What do I need?</strong><p>The Worker URL is the public address Cloudflare gives your Worker after deploy. It usually looks like <code>https://your-worker.your-subdomain.workers.dev</code>.</p><p><span className="configLabel">Dashboard local setting</span> Paste it here, then choose Save and check connection. Later steps stay locked until this works.</p><CommandList commands={["pnpm setup:cloudflare", "pnpm check:production"]} /></div>;
  if (step === 2) return <div className="guidePanel compact"><strong>What do I need?</strong><p><code>INTERNAL_API_SECRET</code> protects admin actions. Set it in Cloudflare Dashboard → Workers & Pages → Worker → Settings → Variables and Secrets.</p><p><span className="configLabel">Cloudflare Worker Secret</span> Type: Secret. Never paste the value into chat, README, or screenshots.</p><CommandList commands={["pnpm wrangler secret put INTERNAL_API_SECRET"]} /></div>;
  if (step === 3) return <div className="guidePanel compact"><strong>What do I need?</strong><p>Telegram is used for human review. Configure <code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_WEBHOOK_SECRET</code>, <code>TELEGRAM_REVIEW_CHAT_ID</code>, and <code>TELEGRAM_FINAL_CHAT_ID</code> in Cloudflare.</p><p>To get a chat ID, send a message to the chat and use a trusted local/admin tool to inspect updates without exposing the bot token. Do not enable real review until ready.</p></div>;
  if (step === 4) return <div className="guidePanel compact"><strong>What do I need?</strong><p>Start with draft-only WordPress checks. Configure <code>WORDPRESS_BASE_URL</code>, <code>WORDPRESS_USERNAME</code>, and <code>WORDPRESS_APPLICATION_PASSWORD</code>. Keep <code>WORDPRESS_DEFAULT_STATUS</code> as <code>draft</code>.</p><p><span className="configLabel">Cloudflare Worker Secret / Variable</span> Public publishing is not enabled here.</p></div>;
  if (step === 5) return <div className="guidePanel compact"><strong>What do I need?</strong><p>Firecrawl is optional. It needs <code>FIRECRAWL_API_KEY</code> and must be manually enabled only when intentionally testing.</p><p>Sandbox fetch may call an external service if backend Firecrawl settings are enabled.</p></div>;
  if (step === 6) return <div className="guidePanel compact"><strong>What do I need?</strong><p>Readiness-only is safest. Optional pilot steps require explicit confirmation. No final Telegram publish, public WordPress publish, or scheduler activation happens here.</p></div>;
  return <div className="guidePanel compact"><strong>What does ready mean?</strong><p>The Worker is reachable, internal actions are protected, required setup is complete enough for the next pilot, and scheduler/publishing are not risky.</p><p>Warnings can be acceptable for optional integrations. Risky scheduler or publishing settings should be fixed before launch.</p></div>;
}

function buildWizardSteps(setupCenter: SetupCenterModel, settings: DashboardSettings, bundle: StatusBundle): WizardStep[] {
  const workerStatus = settings.apiBaseUrl.length === 0 ? "Not started" : setupCenter.workerConnection.tone === "safe" ? "Ready" : "Needs action";
  const lockedStep = { status: "Not started" as const, summary: "Connect your Worker to unlock this step.", nextAction: "Complete Worker connection first." };

  if (workerStatus !== "Ready") {
    return [
      { title: "Worker connection", status: workerStatus, summary: "We can’t reach your Worker yet.", nextAction: "Paste your Cloudflare Worker URL and check the connection." },
      { title: "Internal security", ...lockedStep },
      { title: "Telegram review setup", ...lockedStep },
      { title: "WordPress draft setup", ...lockedStep },
      { title: "Firecrawl setup", ...lockedStep },
      { title: "Controlled pilot", ...lockedStep },
      { title: "Launch readiness", ...lockedStep }
    ];
  }

  const internalStatus = setupCenter.internalSecurity.tone === "safe" ? "Ready" : readPath(bundle.ready, ["summary", "hasInternalSecret"]) === true ? "Needs action" : "Not started";
  const telegramStatus = integrationStatus(setupCenter.telegram, ["TELEGRAM_BOT_TOKEN", "TELEGRAM_REVIEW_CHAT_ID", "TELEGRAM_REAL_REVIEW_ENABLED"]);
  const wordpressStatus = integrationStatus(setupCenter.wordpress, ["WORDPRESS_BASE_URL", "WORDPRESS_USERNAME", "WORDPRESS_APPLICATION_PASSWORD", "WORDPRESS_REAL_DRY_RUN_ENABLED"]);
  const firecrawlStatus = integrationStatus(setupCenter.firecrawl, ["ENABLE_FIRECRAWL_PROVIDER", "FIRECRAWL_API_KEY"]);
  const pilotStatus: WizardStatus = setupCenter.launchSummary.overallStatus === "Pilot-ready" ? "Ready" : setupCenter.scheduler.riskLabel === "Risky" ? "Risky" : "Needs action";
  const launchStatus: WizardStatus = setupCenter.launchSummary.overallStatus === "Pilot-ready" ? "Ready" : setupCenter.launchSummary.overallStatus === "Risky config" ? "Risky" : "Warning";

  return [
    { title: "Worker connection", status: workerStatus, summary: "Your dashboard can reach the deployed Cloudflare Worker.", nextAction: "Continue to internal security." },
    { title: "Internal security", status: internalStatus, summary: "Protect internal actions with the Worker secret and local dashboard credential.", nextAction: setupCenter.internalSecurity.nextAction },
    { title: "Telegram review setup", status: telegramStatus, summary: "Prepare review-channel dry-run only. No final Telegram publish is available.", nextAction: nextMissingAction(setupCenter.telegram) },
    { title: "WordPress draft setup", status: wordpressStatus, summary: "Prepare draft-only WordPress checks. No public publishing is available.", nextAction: nextMissingAction(setupCenter.wordpress) },
    { title: "Firecrawl setup", status: firecrawlStatus, summary: "Prepare optional sandbox fetch with explicit confirmation.", nextAction: nextMissingAction(setupCenter.firecrawl) },
    { title: "Controlled pilot", status: pilotStatus, summary: "Run readiness-only first, then one confirmed pilot step at a time.", nextAction: "Start with readiness-only pilot." },
    { title: "Launch readiness", status: launchStatus, summary: "Confirm setup, scheduler safety, publishing safety, and next action.", nextAction: setupCenter.launchSummary.recommendedNextStep }
  ];
}

function renderWizardStep(index: number, props: WizardRenderProps): JSX.Element {
  if (index > 0 && !props.workerReady) return <WaitingForWorker />;
  if (index === 0) return <div className="stepContent"><StepHelp step={1} /><div className={`statusCallout ${props.workerReady ? "safe" : "warning"}`}><strong>{props.workerReady ? "Worker is online" : "We can’t reach your Worker yet."}</strong><p>{props.workerReady ? "This dashboard can talk to your deployed Cloudflare Worker." : "Paste your Cloudflare Worker URL and check the connection."}</p></div><label>Cloudflare Worker URL<input value={props.apiBaseUrlInput} onChange={(event) => props.setApiBaseUrlInput(event.target.value)} placeholder="https://ai-curation-publisher-agent.yourname.workers.dev" /></label><p className="muted">Example: https://your-worker-name.your-subdomain.workers.dev</p><div className="buttonRow"><button type="button" onClick={() => void props.saveAndCheckConnection()} disabled={props.busy !== undefined || props.apiBaseUrlInput.trim().length === 0}>Save and check connection</button></div></div>;
  if (index === 1) return <div className="stepContent"><StepHelp step={2} /><StatusCallout status={props.setupCenter.internalSecurity} /><p className="muted">Set <code>INTERNAL_API_SECRET</code> in Cloudflare Worker Secrets. Enter the same value locally here. The dashboard will not display it later.</p><label>Internal API credential<input value={props.credentialInput} onChange={(event) => props.setCredentialInput(event.target.value)} type="password" /></label><label className="checkRow"><input type="checkbox" checked={props.rememberCredential} onChange={(event) => props.setRememberCredential(event.target.checked)} />Remember in this browser</label><div className="buttonRow"><button type="button" onClick={props.saveSetup}>Save credential locally</button><button type="button" className="secondary" onClick={props.clearAllSettings}>Clear saved settings</button><button type="button" onClick={() => void props.runOperation("internal_auth_probe", () => props.client.runInternalAuthProbe())} disabled={!props.internalReady || props.busy !== undefined}>Check auth</button></div></div>;
  if (index === 2) return <div className="stepContent"><StepHelp step={3} /><IntegrationPanel title="Telegram review" status={integrationStatus(props.setupCenter.telegram, ["TELEGRAM_BOT_TOKEN", "TELEGRAM_REVIEW_CHAT_ID", "TELEGRAM_REAL_REVIEW_ENABLED"])} items={props.setupCenter.telegram} instructions="Configure bot and review chat manually in Cloudflare. Keep final publishing disabled." advanced={<DetailList items={props.setupCenter.telegram} />} action={<TelegramAction telegramText={props.telegramText} setTelegramText={props.setTelegramText} telegramSourceUrl={props.telegramSourceUrl} setTelegramSourceUrl={props.setTelegramSourceUrl} internalReady={props.internalReady} busy={props.busy} runOperation={props.runOperation} client={props.client} />} /></div>;
  if (index === 3) return <div className="stepContent"><StepHelp step={4} /><IntegrationPanel title="WordPress draft" status={integrationStatus(props.setupCenter.wordpress, ["WORDPRESS_BASE_URL", "WORDPRESS_USERNAME", "WORDPRESS_APPLICATION_PASSWORD", "WORDPRESS_REAL_DRY_RUN_ENABLED"])} items={props.setupCenter.wordpress} instructions="Configure WordPress manually. Keep output draft-only." advanced={<DetailList items={props.setupCenter.wordpress} />} action={<WordPressAction wordpressTitle={props.wordpressTitle} setWordpressTitle={props.setWordpressTitle} wordpressContent={props.wordpressContent} setWordpressContent={props.setWordpressContent} wordpressSourceUrl={props.wordpressSourceUrl} setWordpressSourceUrl={props.setWordpressSourceUrl} internalReady={props.internalReady} busy={props.busy} runOperation={props.runOperation} client={props.client} />} /></div>;
  if (index === 4) return <div className="stepContent"><StepHelp step={5} /><IntegrationPanel title="Firecrawl sandbox" status={integrationStatus(props.setupCenter.firecrawl, ["ENABLE_FIRECRAWL_PROVIDER", "FIRECRAWL_API_KEY"])} items={props.setupCenter.firecrawl} instructions="Configure Firecrawl manually only for a scoped sandbox pilot." advanced={<DetailList items={props.setupCenter.firecrawl} />} action={<FirecrawlAction firecrawlUrl={props.firecrawlUrl} setFirecrawlUrl={props.setFirecrawlUrl} confirmFirecrawl={props.confirmFirecrawl} setConfirmFirecrawl={props.setConfirmFirecrawl} internalReady={props.internalReady} busy={props.busy} runOperation={props.runOperation} client={props.client} />} /></div>;
  if (index === 5) return <div className="stepContent"><StepHelp step={6} /><button type="button" onClick={() => void props.runOperation("pilot_readiness", () => props.client.runPilot({}))} disabled={!props.internalReady || props.busy !== undefined}>Run readiness-only pilot</button><div className="pilotCards"><PilotStep title="Firecrawl" checked={props.pilotInput.runFirecrawl === true} confirmed={props.confirmFirecrawl} onChecked={(checked) => props.setPilotInput({ ...props.pilotInput, runFirecrawl: checked })} onConfirmed={props.setConfirmFirecrawl} warning="May call Firecrawl if configured." /><PilotStep title="Telegram" checked={props.pilotInput.runTelegramReview === true} confirmed={props.confirmTelegramPilot} onChecked={(checked) => props.setPilotInput({ ...props.pilotInput, runTelegramReview: checked })} onConfirmed={props.setConfirmTelegramPilot} warning="Review-channel only." /><PilotStep title="WordPress" checked={props.pilotInput.runWordPressDraft === true} confirmed={props.confirmWordPressPilot} onChecked={(checked) => props.setPilotInput({ ...props.pilotInput, runWordPressDraft: checked })} onConfirmed={props.setConfirmWordPressPilot} warning="Draft-only." /></div><button type="button" onClick={props.runPilotFromInput} disabled={!props.internalReady || props.busy !== undefined}>Run confirmed pilot checks</button></div>;
  return <div className="stepContent"><StepHelp step={7} /><div className={`launchStatus ${toneForOverall(props.setupCenter.launchSummary.overallStatus)}`}><strong>{props.setupCenter.launchSummary.overallStatus}</strong><span>{props.setupCenter.launchSummary.recommendedNextStep}</span></div><div className="overviewCards compact"><OverviewCard title="Worker" value={props.setupCenter.launchSummary.workerReachable} tone="plain" /><OverviewCard title="Security" value={props.setupCenter.launchSummary.internalSecurity} tone="plain" /><OverviewCard title="Scheduler" value={props.setupCenter.launchSummary.schedulerSafety} tone={toneForRisk(props.setupCenter.scheduler.riskLabel)} /><OverviewCard title="Publishing" value={props.setupCenter.launchSummary.publishingSafety} tone={props.setupCenter.launchSummary.publishingSafety === "Safe" ? "safe" : "risky"} /></div></div>;
}

function WaitingForWorker(): JSX.Element {
  return <div className="statusCallout warning"><strong>Complete Worker connection first</strong><p>Connect your Worker to unlock this step.</p></div>;
}

type WizardRenderProps = {
  setupCenter: SetupCenterModel;
  settings: DashboardSettings;
  apiBaseUrlInput: string;
  setApiBaseUrlInput: (value: string) => void;
  credentialInput: string;
  setCredentialInput: (value: string) => void;
  rememberCredential: boolean;
  setRememberCredential: (value: boolean) => void;
  saveSetup: () => void;
  saveAndCheckConnection: () => Promise<void>;
  clearAllSettings: () => void;
  refreshStatus: () => Promise<void>;
  runOperation: (name: OperationName, runner: () => Promise<ApiResult>, confirmText?: string) => Promise<void>;
  client: WorkerApiClient;
  internalReady: boolean;
  busy: string | undefined;
  telegramText: string;
  setTelegramText: (value: string) => void;
  telegramSourceUrl: string;
  setTelegramSourceUrl: (value: string) => void;
  wordpressTitle: string;
  setWordpressTitle: (value: string) => void;
  wordpressContent: string;
  setWordpressContent: (value: string) => void;
  wordpressSourceUrl: string;
  setWordpressSourceUrl: (value: string) => void;
  firecrawlUrl: string;
  setFirecrawlUrl: (value: string) => void;
  confirmFirecrawl: boolean;
  setConfirmFirecrawl: (value: boolean) => void;
  pilotInput: PilotInput;
  setPilotInput: (value: PilotInput) => void;
  confirmTelegramPilot: boolean;
  setConfirmTelegramPilot: (value: boolean) => void;
  confirmWordPressPilot: boolean;
  setConfirmWordPressPilot: (value: boolean) => void;
  runPilotFromInput: () => void;
  workerReady: boolean;
};

function integrationStatus(items: SetupDetailItem[], requiredNames: string[]): WizardStatus {
  const required = items.filter((item) => requiredNames.includes(item.name));
  if (required.length === 0) return "Not started";
  if (required.every((item) => item.currentStatus === "Configured" || item.currentStatus === "true" || item.currentStatus === "draft")) return "Ready";
  if (required.some((item) => item.currentStatus === "Configured" || item.currentStatus === "true" || item.currentStatus === "draft")) return "Needs action";
  return "Not started";
}

function missingItems(items: SetupDetailItem[]): SetupDetailItem[] {
  return items.filter((item) => item.currentStatus === "Missing" || item.currentStatus === "Manual check" || item.currentStatus === "false");
}

function nextMissingAction(items: SetupDetailItem[]): string {
  const missing = missingItems(items)[0];
  return missing === undefined ? "Run the safe test when ready." : `${missing.name}: ${missing.nextAction}`;
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

function readPath(bundleResult: ApiResult | undefined, path: string[]): string | boolean | number | undefined {
  if (bundleResult?.ok !== true || !isRecord(bundleResult.data)) return undefined;
  let current: unknown = bundleResult.data;
  for (const part of path) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return typeof current === "string" || typeof current === "boolean" || typeof current === "number" ? current : undefined;
}

function resultToJson(result: ApiResult | undefined): JsonValue {
  if (result === undefined) return null;
  if (result.ok) return result.data;
  const data: JsonObject = { ok: false, error: result.error, message: result.message };
  if (result.status !== undefined) data.status = result.status;
  if (result.data !== undefined) data.data = result.data;
  return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function statusClass(value: WizardStatus): string {
  return value === "Ready" ? "good" : value === "Warning" ? "warn" : value === "Risky" ? "bad" : value === "Needs action" ? "warn" : "neutral";
}

function riskClass(value: "Safe" | "Warning" | "Risky"): string {
  return value === "Safe" ? "good" : value === "Warning" ? "warn" : "bad";
}

function toneForRisk(value: "Safe" | "Warning" | "Risky"): "safe" | "warning" | "risky" {
  return value === "Safe" ? "safe" : value === "Warning" ? "warning" : "risky";
}

function toneForOverall(value: string): string {
  return value === "Pilot-ready" ? "safe" : value === "Risky config" ? "risky" : "warning";
}

export default App;
