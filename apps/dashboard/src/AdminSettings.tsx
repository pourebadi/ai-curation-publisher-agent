import { useEffect, useMemo, useState } from "react";
import type { WorkerApiClient } from "./api";
import type { AdminAuditEntry, AdminConfigGroup, AdminConfigItem, AdminConfigResponse } from "./types";

type SettingsTab = "setup" | "mode" | "ai" | "integrations" | "safety" | "audit";
type AdminSettingsProps = { client: WorkerApiClient; enabled: boolean; initialTab?: SettingsTab; onNotice: (message: string) => void; onRefreshStatus: () => Promise<void> };

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "setup", label: "Setup path" },
  { id: "mode", label: "Operating Mode" },
  { id: "ai", label: "AI" },
  { id: "integrations", label: "Integrations" },
  { id: "safety", label: "Scheduler & Limits" },
  { id: "audit", label: "Audit" }
];

const groupLabels: Record<AdminConfigGroup, string> = {
  operating_mode: "Operating Mode",
  content_input: "Content Input",
  ai: "AI Processing",
  telegram: "Telegram Review",
  wordpress: "WordPress Drafts",
  providers: "Providers",
  scheduler: "Scheduler",
  quotas: "Quotas"
};

export function AdminSettings({ client, enabled, initialTab = "setup", onNotice, onRefreshStatus }: AdminSettingsProps): JSX.Element {
  const [config, setConfig] = useState<AdminConfigResponse | undefined>();
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  const items = useMemo(() => config?.items ?? [], [config]);
  const itemByKey = useMemo(() => new Map(items.map((item) => [item.key, item])), [items]);
  const activeMode = drafts.OPERATING_MODE ?? itemByKey.get("OPERATING_MODE")?.value ?? "manual_only";

  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

  async function load(): Promise<void> {
    if (!enabled) return;
    setBusy("load");
    const response = await client.getAdminConfig();
    if (response.ok) {
      setConfig(response.data);
      setDrafts(Object.fromEntries(response.data.items.filter((item) => !item.isSecret).map((item) => [item.key, item.value ?? ""])));
      onNotice("Admin Control Center loaded.");
    } else {
      onNotice(response.message);
    }
    setBusy(undefined);
  }

  async function loadAudit(): Promise<void> {
    if (!enabled) return;
    setBusy("audit");
    const response = await client.getAdminConfigAudit();
    if (response.ok) {
      setAudit(response.data.entries);
      onNotice("Recent changes loaded.");
    } else {
      onNotice(response.message);
    }
    setBusy(undefined);
  }

  useEffect(() => { if (enabled) void load(); }, [enabled]);

  async function saveItem(item: AdminConfigItem): Promise<void> {
    const value = item.isSecret ? secretDrafts[item.key] ?? "" : drafts[item.key] ?? "";
    if (value.trim().length === 0 && !(item.type === "string" && item.key === "AI_CUSTOM_SYSTEM_PROMPT")) {
      onNotice(`${item.key} needs a value before saving.`);
      return;
    }
    setBusy(item.key);
    const response = await client.saveAdminConfig([{ key: item.key, value }]);
    if (response.ok) {
      setConfig(response.data);
      setDrafts(Object.fromEntries(response.data.items.filter((entry) => !entry.isSecret).map((entry) => [entry.key, entry.value ?? ""])));
      setSecretDrafts((current) => ({ ...current, [item.key]: "" }));
      onNotice(item.isSecret ? "Secret saved securely. It will not be shown again." : "Setting saved. No redeploy required.");
      await onRefreshStatus();
    } else {
      onNotice(response.message);
    }
    setBusy(undefined);
  }

  async function resetItem(item: AdminConfigItem): Promise<void> {
    if (!window.confirm(`Reset ${item.key}? This removes the dashboard override and falls back to Cloudflare env or default.`)) return;
    setBusy(item.key);
    const response = await client.resetAdminConfig([item.key]);
    if (response.ok) {
      setConfig(response.data);
      setDrafts(Object.fromEntries(response.data.items.filter((entry) => !entry.isSecret).map((entry) => [entry.key, entry.value ?? ""])));
      setSecretDrafts((current) => ({ ...current, [item.key]: "" }));
      onNotice("Dashboard override reset.");
      await onRefreshStatus();
    } else {
      onNotice(response.message);
    }
    setBusy(undefined);
  }

  function renderItem(key: string): JSX.Element | null {
    const item = itemByKey.get(key);
    if (item === undefined) return null;
    return <SettingRow key={item.key} item={item} value={item.isSecret ? secretDrafts[item.key] ?? "" : drafts[item.key] ?? ""} disabled={busy !== undefined || (item.isSecret && config?.encryption.secretEditingEnabled === false)} presets={config?.presets} onChange={(value) => item.isSecret ? setSecretDrafts((current) => ({ ...current, [item.key]: value })) : setDrafts((current) => ({ ...current, [item.key]: value }))} onSave={() => void saveItem(item)} onReset={() => void resetItem(item)} />;
  }

  if (!enabled) return <div className="settingsPanel"><p className="warning">Admin secret required. Enter <code>INTERNAL_API_SECRET</code> locally before editing settings.</p></div>;

  return (
    <section className="settingsPanel" aria-labelledby="settings-heading">
      <div className="sectionTitle"><div><p className="eyebrow">Admin Control Center</p><h2 id="settings-heading">Settings, credentials, and launch safety</h2></div><div className="buttonRow"><button type="button" onClick={() => void load()} disabled={busy !== undefined}>Reload</button><button type="button" className="secondary" onClick={() => void loadAudit()} disabled={busy !== undefined}>Load audit</button></div></div>
      <p className="muted">Settings are saved through the protected Worker Admin API into D1. Secret values are encrypted before storage and are never shown after saving.</p>
      {config?.encryption.secretEditingEnabled === false && <p className="warning">Secret editing requires CONFIG_ENCRYPTION_KEY. Configure it with: <code>pnpm wrangler secret put CONFIG_ENCRYPTION_KEY</code></p>}
      <nav className="subTabs" aria-label="Admin settings sections">{tabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : "secondary"} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</nav>

      {activeTab === "setup" && <SetupPath config={config} activeMode={activeMode} onOpen={(tab) => setActiveTab(tab)} />}
      {activeTab === "mode" && <div className="settingsList"><ModeCards config={config} activeMode={activeMode} onSelect={(mode) => setDrafts((current) => ({ ...current, OPERATING_MODE: mode }))} />{renderItem("OPERATING_MODE")}{renderItem("DEFAULT_CONTENT_SOURCE_MODE")}</div>}
      {activeTab === "ai" && <div className="settingsList"><AiGuidance />{["AI_PROVIDER", "AI_MODEL", "AI_MODEL_FALLBACKS", "AI_OUTPUT_LANGUAGE", "AI_TRANSLATION_ENABLED", "AI_REWRITE_ENABLED", "AI_SUMMARY_ENABLED", "AI_TONE_PRESET", "AI_CUSTOM_SYSTEM_PROMPT", "AI_MAX_OUTPUT_TOKENS", "AI_TEMPERATURE", "AI_RETRY_ENABLED", "AI_MAX_RETRIES", "AI_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "CUSTOM_AI_API_KEY"].map(renderItem)}</div>}
      {activeTab === "integrations" && <div className="grid three"><GroupCard title="Providers" items={["PROVIDERS_MODE", "ENABLE_FIRECRAWL_PROVIDER", "ENABLE_APIFY_PROVIDER", "ENABLE_GETXAPI_PROVIDER", "FIRECRAWL_BASE_URL", "FIRECRAWL_TIMEOUT_MS", "FIRECRAWL_API_KEY", "APIFY_TOKEN", "GETXAPI_KEY"].map(renderItem)} /><GroupCard title="Telegram Review" items={["TELEGRAM_REVIEW_CHAT_ID", "TELEGRAM_FINAL_CHAT_ID", "TELEGRAM_REAL_REVIEW_ENABLED", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"].map(renderItem)} /><GroupCard title="WordPress Drafts" items={["WORDPRESS_BASE_URL", "WORDPRESS_USERNAME", "WORDPRESS_DEFAULT_STATUS", "WORDPRESS_REAL_DRY_RUN_ENABLED", "WORDPRESS_APPLICATION_PASSWORD"].map(renderItem)} /></div>}
      {activeTab === "safety" && <div className="settingsList"><p className="warning">No controls exist here for scheduler publishing, final Telegram publishing, or public WordPress publishing.</p>{["SCHEDULER_DRY_RUN", "SCHEDULER_MAX_SOURCES_PER_RUN", "SCHEDULER_MAX_ITEMS_PER_RUN", "MAX_AI_ITEMS_PER_RUN", "MAX_PROVIDER_ITEMS_PER_RUN", "MAX_PUBLISH_ITEMS_PER_RUN"].map(renderItem)}<details className="subcard"><summary>Protected settings not editable here</summary><ul><li>INTERNAL_API_SECRET</li><li>CONFIG_ENCRYPTION_KEY</li><li>CLOUDFLARE_API_TOKEN</li><li>CLOUDFLARE_ACCOUNT_ID</li><li>D1 database IDs and deployment credentials</li><li>Anything that enables public publishing</li></ul></details></div>}
      {activeTab === "audit" && <AuditView audit={audit} items={items} onLoad={() => void loadAudit()} />}
      <details className="subcard"><summary>Raw safe config status</summary><pre>{JSON.stringify(config, null, 2)}</pre></details>
    </section>
  );
}

function SetupPath({ config, activeMode, onOpen }: { config: AdminConfigResponse | undefined; activeMode: string; onOpen: (tab: SettingsTab) => void }): JSX.Element {
  const providerText = activeMode === "manual_only" ? "Optional. Provider credentials are not required in Manual-only mode." : activeMode === "mock_demo" ? "Optional. Mock/demo mode can run without real provider credentials." : "Recommended. Provider-assisted mode needs at least one configured provider.";
  const steps = [["1. Connect Worker", "Set the Worker URL and enter INTERNAL_API_SECRET for this page session.", "setup"], ["2. Secure Admin Actions", "Use Cloudflare Worker Secrets for INTERNAL_API_SECRET and CONFIG_ENCRYPTION_KEY.", "setup"], ["3. Choose Operating Mode", modeCopy(activeMode), "mode"], ["4. Configure AI", "Choose provider, model, output behavior, and API credentials.", "ai"], ["5. Configure Review Channel", "Set Telegram review chat and bot credential if review dry-run is needed.", "integrations"], ["6. Configure Publishing Drafts", "Set WordPress draft-only credentials if drafts are needed.", "integrations"], ["7. Optional Providers", providerText, "integrations"], ["8. Run Pilot Test", "Run readiness-only first, then selected safe dry-runs.", "setup"], ["9. Launch Readiness", "Scheduler and publishing controls must remain safe.", "safety"]] as const;
  return <div className="settingsList"><ModeSummary config={config} activeMode={activeMode} />{steps.map(([title, text, tab]) => <div className="settingRow" key={title}><div><strong>{title}</strong><p>{text}</p></div><div><button type="button" className="secondary" onClick={() => onOpen(tab as SettingsTab)}>Open</button></div></div>)}</div>;
}

function ModeCards({ config, activeMode, onSelect }: { config: AdminConfigResponse | undefined; activeMode: string; onSelect: (mode: string) => void }): JSX.Element { const modes = config?.modes ?? []; return <div className="grid three">{modes.map((mode) => <button type="button" key={mode.key} className={activeMode === mode.key ? "active modeCard" : "secondary modeCard"} onClick={() => onSelect(mode.key)}><strong>{mode.label}</strong><span>{mode.description}</span></button>)}</div>; }
function ModeSummary({ config, activeMode }: { config: AdminConfigResponse | undefined; activeMode: string }): JSX.Element { const label = config?.modes.find((mode) => mode.key === activeMode)?.label ?? activeMode; return <div className="launchStatus safe"><strong>{label}</strong><span>{modeCopy(activeMode)}</span></div>; }
function AiGuidance(): JSX.Element { return <div className="subcard"><h3>AI model guidance</h3><p>Choose larger models for quality and reasoning. Choose flash, mini, or nano models for cost and speed. Manual model IDs are allowed so new provider models do not require a code change.</p><p className="muted">If the first model fails, the configured fallback chain can be used by backend AI orchestration where implemented. This phase stores and exposes the chain; runtime fallback is marked partially implemented.</p></div>; }
function GroupCard({ title, items }: { title: string; items: Array<JSX.Element | null> }): JSX.Element { return <div className="subcard"><h3>{title}</h3><div className="settingsList">{items}</div></div>; }
function AuditView({ audit, items, onLoad }: { audit: AdminAuditEntry[]; items: AdminConfigItem[]; onLoad: () => void }): JSX.Element { const groupByKey = new Map(items.map((item) => [item.key, groupLabels[item.group]])); return <div className="settingsList"><div className="buttonRow"><p className="muted">Recent changes show redacted old/new values only.</p><button type="button" onClick={onLoad}>Refresh audit</button></div>{audit.length === 0 ? <p className="muted">No audit entries loaded.</p> : audit.map((entry) => <div className="historyItem" key={entry.id}><strong>{entry.key}</strong> <span className="configLabel">{groupByKey.get(entry.key) ?? "Unknown"}</span><p>{entry.action} · {new Date(entry.changed_at).toLocaleString()}</p><p className="muted">Previous: {entry.previous_value_redacted ?? "[missing]"} / New: {entry.new_value_redacted ?? "[missing]"}</p></div>)}</div>; }
function SettingRow({ item, value, disabled, presets, onChange, onSave, onReset }: { item: AdminConfigItem; value: string; disabled: boolean; presets?: AdminConfigResponse["presets"]; onChange: (value: string) => void; onSave: () => void; onReset: () => void }): JSX.Element { return <div className={`settingRow ${item.safetyLevel}`}><div><span className="configLabel">{sourceLabel(item.source)}</span><span className="configLabel">{item.safetyLevel}</span><strong>{item.label}</strong><p>{item.description}</p><p className="muted">Used in: {item.whereUsed}</p><small>{item.key} · {item.type} · {item.isSecret ? item.valueRedacted : item.value}</small>{item.updatedAt && <small>Updated: {new Date(item.updatedAt).toLocaleString()}</small>}<small>No redeploy required.</small></div><div>{inputFor(item, value, disabled, onChange, presets)}<div className="buttonRow"><button type="button" onClick={onSave} disabled={disabled}>Save</button><button type="button" className="secondary" onClick={onReset} disabled={disabled}>Reset</button></div>{item.isSecret && <p className="muted">Saved securely. It will not be shown again.</p>}</div></div>; }
function inputFor(item: AdminConfigItem, value: string, disabled: boolean, onChange: (value: string) => void, presets?: AdminConfigResponse["presets"]): JSX.Element { if (item.isSecret) return <input type="password" value={value} disabled={disabled} placeholder="Enter new value" onChange={(event) => onChange(event.target.value)} />; if (item.key === "AI_MODEL") return <ModelInput value={value} disabled={disabled} presets={presets} onChange={onChange} />; if (item.key === "AI_MODEL_FALLBACKS") return <textarea value={value} disabled={disabled} placeholder="gpt-5.4-mini, gemini-2.5-flash" onChange={(event) => onChange(event.target.value)} />; if (item.key === "AI_CUSTOM_SYSTEM_PROMPT") return <textarea value={value} disabled={disabled} placeholder="Optional non-secret prompt guidance" onChange={(event) => onChange(event.target.value)} />; if (item.validation.enumValues !== undefined) return <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{item.validation.enumValues.map((option) => <option key={option} value={option}>{option}</option>)}</select>; if (item.type === "boolean") return <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="false">false</option><option value="true">true</option></select>; return <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />; }
function ModelInput({ value, disabled, presets, onChange }: { value: string; disabled: boolean; presets?: AdminConfigResponse["presets"]; onChange: (value: string) => void }): JSX.Element { const options = [...(presets?.openai ?? []), ...(presets?.gemini ?? [])]; return <div><select value={options.includes(value) ? value : "custom"} disabled={disabled} onChange={(event) => event.target.value !== "custom" && onChange(event.target.value)}><option value="custom">Custom model ID</option><optgroup label="OpenAI">{(presets?.openai ?? []).map((model) => <option key={model} value={model}>{model}</option>)}</optgroup><optgroup label="Gemini">{(presets?.gemini ?? []).map((model) => <option key={model} value={model}>{model}</option>)}</optgroup></select><input value={value} disabled={disabled} placeholder="Custom model ID" onChange={(event) => onChange(event.target.value)} /></div>; }
export function providerSetupSkippedInManualOnly(mode: string): boolean { return mode === "manual_only"; }
export function settingsSourceLabel(source: AdminConfigItem["source"]): string { return sourceLabel(source); }
export function secretStatusLabel(item: Pick<AdminConfigItem, "isSecret" | "configured">): string { return item.isSecret ? item.configured ? "Configured" : "Missing" : "Not secret"; }
export function aiMissingNextAction(provider: string, configured: boolean): string { return configured || provider === "mock" ? "AI settings are usable." : "Configure an AI model and provider credential in Settings -> AI."; }
function sourceLabel(source: AdminConfigItem["source"]): string { return source === "d1" ? "Dashboard" : source === "env" ? "Cloudflare env" : source === "default" ? "Default" : "Missing"; }
function modeCopy(mode: string): string { return mode === "manual_only" ? "I will add content manually. Provider credentials are not required." : mode === "mock_demo" ? "Mock providers and demo checks are expected. Real credentials are optional." : "Provider-assisted mode expects at least one configured provider."; }
