import { useEffect, useMemo, useState } from "react";
import type { WorkerApiClient } from "./api";
import type { AdminAuditEntry, AdminConfigGroup, AdminConfigItem, AdminConfigResponse } from "./types";

type AdminSettingsProps = {
  client: WorkerApiClient;
  enabled: boolean;
  onNotice: (message: string) => void;
  onRefreshStatus: () => Promise<void>;
};

const groupLabels: Record<AdminConfigGroup, string> = {
  telegram: "Telegram",
  wordpress: "WordPress",
  providers: "Providers",
  scheduler: "Scheduler",
  quotas: "Quotas",
  secrets: "Secrets"
};

const orderedGroups: AdminConfigGroup[] = ["telegram", "wordpress", "providers", "scheduler", "quotas", "secrets"];

export function AdminSettings({ client, enabled, onNotice, onRefreshStatus }: AdminSettingsProps): JSX.Element {
  const [config, setConfig] = useState<AdminConfigResponse | undefined>();
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | undefined>();

  const allItems = useMemo(() => config?.items ?? [], [config]);

  async function load(): Promise<void> {
    if (!enabled) return;
    setBusy("load");
    const response = await client.getAdminConfig();
    if (response.ok) {
      setConfig(response.data);
      setDrafts(Object.fromEntries(response.data.items.filter((item) => !item.isSecret).map((item) => [item.key, item.value ?? ""])));
      onNotice("Admin settings loaded.");
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
      onNotice("Admin audit loaded.");
    } else {
      onNotice(response.message);
    }
    setBusy(undefined);
  }

  useEffect(() => {
    if (enabled) void load();
  }, [enabled]);

  async function saveItem(item: AdminConfigItem): Promise<void> {
    const value = item.isSecret ? secretDrafts[item.key] ?? "" : drafts[item.key] ?? "";
    if (value.trim().length === 0) {
      onNotice(`${item.key} needs a value before saving.`);
      return;
    }
    setBusy(item.key);
    const response = await client.saveAdminConfig([{ key: item.key, value }]);
    if (response.ok) {
      setConfig(response.data);
      setDrafts(Object.fromEntries(response.data.items.filter((entry) => !entry.isSecret).map((entry) => [entry.key, entry.value ?? ""])));
      setSecretDrafts((current) => ({ ...current, [item.key]: "" }));
      onNotice(item.isSecret ? "Secret saved securely. The value will not be shown again." : "Setting saved.");
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

  if (!enabled) {
    return <div className="settingsPanel"><p className="warning">Admin secret required. Enter <code>INTERNAL_API_SECRET</code> locally before editing settings.</p></div>;
  }

  return (
    <section className="settingsPanel" aria-labelledby="settings-heading">
      <div className="sectionTitle">
        <div>
          <p className="eyebrow">Admin Settings</p>
          <h2 id="settings-heading">Editable runtime config</h2>
        </div>
        <div className="buttonRow"><button type="button" onClick={() => void load()} disabled={busy !== undefined}>Reload settings</button><button type="button" className="secondary" onClick={() => void loadAudit()} disabled={busy !== undefined}>Load audit</button></div>
      </div>
      <p className="muted">These settings are saved through the protected Worker Admin API into D1. Cloudflare API tokens are never used in the frontend.</p>
      {config?.encryption.secretEditingEnabled === false && <p className="warning">Secret editing is disabled. Configure encryption first: <code>pnpm wrangler secret put CONFIG_ENCRYPTION_KEY</code></p>}
      <div className="settingsGrid">
        {orderedGroups.map((group) => <details className="subcard" key={group} open={group !== "secrets"}><summary>{groupLabels[group]}</summary><div className="settingsList">{(config?.groups[group] ?? []).map((item) => <SettingRow key={item.key} item={item} value={item.isSecret ? secretDrafts[item.key] ?? "" : drafts[item.key] ?? ""} disabled={busy !== undefined || (item.isSecret && config?.encryption.secretEditingEnabled === false)} onChange={(value) => item.isSecret ? setSecretDrafts((current) => ({ ...current, [item.key]: value })) : setDrafts((current) => ({ ...current, [item.key]: value }))} onSave={() => void saveItem(item)} onReset={() => void resetItem(item)} />)}</div></details>)}
      </div>
      <details className="subcard"><summary>Protected settings not editable here</summary><ul><li>INTERNAL_API_SECRET</li><li>CONFIG_ENCRYPTION_KEY</li><li>CLOUDFLARE_API_TOKEN</li><li>CLOUDFLARE_ACCOUNT_ID</li><li>D1 database id or deployment credentials</li><li>Unknown keys</li></ul></details>
      <details className="subcard"><summary>Recent admin audit</summary>{audit.length === 0 ? <p className="muted">No audit entries loaded.</p> : <div className="historyList">{audit.map((entry) => <div className="historyItem" key={entry.id}><strong>{entry.key}</strong> · {entry.action} · {new Date(entry.changed_at).toLocaleString()}<br /><span className="muted">Previous: {entry.previous_value_redacted ?? "[missing]"} / New: {entry.new_value_redacted ?? "[missing]"}</span></div>)}</div>}</details>
      <details className="subcard"><summary>Raw safe config status</summary><pre>{JSON.stringify(config, null, 2)}</pre></details>
      <p className="muted">Loaded items: {allItems.length}</p>
    </section>
  );
}

function SettingRow({ item, value, disabled, onChange, onSave, onReset }: { item: AdminConfigItem; value: string; disabled: boolean; onChange: (value: string) => void; onSave: () => void; onReset: () => void }): JSX.Element {
  return <div className="settingRow"><div><span className="configLabel">{item.source === "d1" ? "Dashboard override" : item.source === "env" ? "Cloudflare env" : item.source === "default" ? "Default" : "Missing"}</span><strong>{item.label}</strong><p>{item.description}</p><small>{item.key} · {item.type} · {item.isSecret ? item.valueRedacted : item.value}</small>{item.updatedAt && <small>Updated: {new Date(item.updatedAt).toLocaleString()}</small>}</div><div>{item.isSecret ? <input type="password" value={value} disabled={disabled} placeholder="Enter new value" onChange={(event) => onChange(event.target.value)} /> : inputFor(item, value, disabled, onChange)}<div className="buttonRow"><button type="button" onClick={onSave} disabled={disabled}>Save</button><button type="button" className="secondary" onClick={onReset} disabled={disabled}>Reset</button></div>{item.isSecret && <p className="muted">Saved securely. The value will not be shown again.</p>}</div></div>;
}

function inputFor(item: AdminConfigItem, value: string, disabled: boolean, onChange: (value: string) => void): JSX.Element {
  if (item.validation.enumValues !== undefined) {
    return <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{item.validation.enumValues.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  }
  if (item.type === "boolean") {
    return <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="false">false</option><option value="true">true</option></select>;
  }
  return <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}
