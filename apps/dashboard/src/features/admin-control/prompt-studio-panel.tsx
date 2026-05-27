import { useMemo, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, DataTable, Input, Select, Textarea } from "../../shared/ui";
import type { JsonObject } from "../../types";
import { readBoolean, readString } from "./dashboard-utils";

export type PromptProfileForm = { id: string; name: string; category: string; language: string; contentType: string; version: string; status: string; systemPrompt: string; userPromptTemplate: string; modelHint: string; temperature: string; maxTokens: string; riskPolicy: string; styleGuide: string };
export type PromptBindingForm = { routeId: string; routeOutputId: string; category: string; language: string; promptProfileId: string; contentType: string };

type Props = {
  profiles: JsonObject[];
  bindings: JsonObject[];
  runs: JsonObject[];
  promptStudio: JsonObject | undefined;
  promptForm: PromptProfileForm;
  setPromptForm: (value: PromptProfileForm) => void;
  bindingForm: PromptBindingForm;
  setBindingForm: (value: PromptBindingForm) => void;
  promptPreview: JsonObject | undefined;
  onSavePrompt: () => Promise<void>;
  onActivatePrompt: (profileId: string) => Promise<void>;
  onArchivePrompt: (profileId: string) => Promise<void>;
  onSaveBinding: () => Promise<void>;
  onPreviewPrompt: () => Promise<void>;
  busy: string | undefined;
};

export function PromptStudioPanel(props: Props): JSX.Element {
  const [basePromptId, setBasePromptId] = useState("");
  const [comparePromptId, setComparePromptId] = useState("");
  const updatePrompt = (patch: Partial<PromptProfileForm>): void => props.setPromptForm({ ...props.promptForm, ...patch });
  const updateBinding = (patch: Partial<PromptBindingForm>): void => props.setBindingForm({ ...props.bindingForm, ...patch });
  const variables = readStringArray(props.promptStudio, "templateVariables");
  const promptOptions = props.profiles.map((profile) => ({ value: readString(profile, "id") ?? "", label: `${readString(profile, "id") ?? "unknown"} · ${readString(profile, "version") ?? "1.0.0"}` })).filter((option) => option.value.length > 0);
  const base = props.profiles.find((profile) => readString(profile, "id") === basePromptId) ?? props.profiles[0];
  const compare = props.profiles.find((profile) => readString(profile, "id") === comparePromptId) ?? props.profiles.find((profile) => readString(profile, "id") !== readString(base, "id"));
  const diff = useMemo(() => buildPromptDiff(base, compare), [base, compare]);

  return <div className="page-grid">
    <Card className="hero-card"><CardHeader eyebrow="Prompt Studio" title="Managed prompts per category and language" description="Move prompt behavior out of code-only defaults. Draft, activate, bind, preview, compare, and evolve prompts safely." /><div className="prompt-variable-grid">{variables.map((variable) => <Badge key={variable} tone="info">{`{{${variable}}}`}</Badge>)}</div><Alert title="Prompt testing" tone="info">Preview renders templates locally and records a prompt preview run. Use AI Settings for provider-level tests. Activate an older prompt version to roll back safely.</Alert></Card>
    <Card><CardHeader title="Prompt editor" description="Create or update a managed prompt profile." /><div className="grid two"><Input label="Prompt ID" value={props.promptForm.id} onChange={(value) => updatePrompt({ id: value })} /><Input label="Name" value={props.promptForm.name} onChange={(value) => updatePrompt({ name: value })} /><Input label="Category" value={props.promptForm.category} onChange={(value) => updatePrompt({ category: value })} /><Input label="Language" value={props.promptForm.language} onChange={(value) => updatePrompt({ language: value })} /><Input label="Version" value={props.promptForm.version} onChange={(value) => updatePrompt({ version: value })} /><Select label="Status" value={props.promptForm.status} onChange={(value) => updatePrompt({ status: value })} options={[{ value: "draft", label: "Draft" }, { value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} /></div><Textarea label="System prompt" value={props.promptForm.systemPrompt} onChange={(value) => updatePrompt({ systemPrompt: value })} rows={7} /><Textarea label="User prompt template" value={props.promptForm.userPromptTemplate} onChange={(value) => updatePrompt({ userPromptTemplate: value })} rows={9} /><div className="grid two"><Input label="Model hint" value={props.promptForm.modelHint} onChange={(value) => updatePrompt({ modelHint: value })} /><Input label="Temperature" value={props.promptForm.temperature} onChange={(value) => updatePrompt({ temperature: value })} /><Input label="Max tokens" value={props.promptForm.maxTokens} onChange={(value) => updatePrompt({ maxTokens: value })} /><Input label="Content type" value={props.promptForm.contentType} onChange={(value) => updatePrompt({ contentType: value })} /></div><Textarea label="Risk policy" value={props.promptForm.riskPolicy} onChange={(value) => updatePrompt({ riskPolicy: value })} rows={3} /><Textarea label="Style guide" value={props.promptForm.styleGuide} onChange={(value) => updatePrompt({ styleGuide: value })} rows={3} /><div className="button-row"><Button onClick={() => void props.onSavePrompt()} disabled={props.busy !== undefined}>Save prompt</Button><Button variant="secondary" onClick={() => void props.onPreviewPrompt()} disabled={props.busy !== undefined}>Preview</Button></div>{props.promptPreview && <pre>{JSON.stringify(props.promptPreview, null, 2)}</pre>}</Card>
    <Card><CardHeader title="Prompt library" description="Active prompts can be bound to route outputs. Code defaults remain fallback." /><DataTable rows={props.profiles} columns={[{ key: "id", label: "ID" }, { key: "name", label: "Name" }, { key: "category", label: "Category" }, { key: "language", label: "Language" }, { key: "version", label: "Version" }, { key: "status", label: "Status", render: (row) => <Badge tone={readString(row, "status") === "active" ? "success" : readString(row, "status") === "archived" ? "muted" : "warning"}>{readString(row, "status") ?? "draft"}</Badge> }, { key: "action", label: "Action", render: (row) => <div className="inline-actions"><Button size="sm" variant="secondary" onClick={() => void props.onActivatePrompt(readString(row, "id") ?? "")}>Activate / Roll back</Button><Button size="sm" variant="ghost" onClick={() => void props.onArchivePrompt(readString(row, "id") ?? "")}>Archive</Button></div> }]} /></Card>
    <Card><CardHeader title="Visual prompt diff" description="Compare two prompt versions before activation or rollback." /><div className="grid two"><Select label="Base prompt" value={readString(base, "id") ?? basePromptId} onChange={setBasePromptId} options={promptOptions.length > 0 ? promptOptions : [{ value: "", label: "No prompts" }]} /><Select label="Compare prompt" value={readString(compare, "id") ?? comparePromptId} onChange={setComparePromptId} options={promptOptions.length > 0 ? promptOptions : [{ value: "", label: "No prompts" }]} /></div><PromptDiffViewer rows={diff} /></Card>
    <Card><CardHeader title="Prompt bindings" description="Bind prompts to route outputs, category/language pairs, or global fallbacks." /><div className="grid two"><Input label="Route ID" value={props.bindingForm.routeId} onChange={(value) => updateBinding({ routeId: value })} /><Input label="Route output ID" value={props.bindingForm.routeOutputId} onChange={(value) => updateBinding({ routeOutputId: value })} /><Input label="Category" value={props.bindingForm.category} onChange={(value) => updateBinding({ category: value })} /><Input label="Language" value={props.bindingForm.language} onChange={(value) => updateBinding({ language: value })} /><Input label="Prompt profile ID" value={props.bindingForm.promptProfileId} onChange={(value) => updateBinding({ promptProfileId: value })} /><Input label="Content type" value={props.bindingForm.contentType} onChange={(value) => updateBinding({ contentType: value })} /></div><Button onClick={() => void props.onSaveBinding()} disabled={props.busy !== undefined}>Save binding</Button><DataTable rows={props.bindings} columns={[{ key: "routeOutputId", label: "Output" }, { key: "routeId", label: "Route" }, { key: "category", label: "Category" }, { key: "language", label: "Language" }, { key: "promptProfileId", label: "Prompt" }, { key: "enabled", label: "Status", render: (row) => <Badge tone={readBoolean(row, "enabled") === false ? "muted" : "success"}>{readBoolean(row, "enabled") === false ? "Disabled" : "Enabled"}</Badge> }]} /></Card>
    <Card><CardHeader title="Prompt run history" description="Recent previews and future real prompt executions. Empty history means no prompt preview/run has been recorded yet." /><DataTable rows={props.runs} columns={[{ key: "id", label: "Run" }, { key: "promptProfileId", label: "Prompt" }, { key: "promptVersion", label: "Version" }, { key: "provider", label: "Provider" }, { key: "model", label: "Model" }, { key: "status", label: "Status", render: (row) => <Badge tone={readString(row, "status") === "failed" ? "danger" : "info"}>{readString(row, "status") ?? "unknown"}</Badge> }, { key: "createdAt", label: "Created" }]} /></Card>
  </div>;
}

function PromptDiffViewer({ rows }: { rows: Array<{ kind: "same" | "added" | "removed"; text: string }> }): JSX.Element {
  if (rows.length === 0) return <div className="ui-empty">Select two prompt versions to compare.</div>;
  return <div className="prompt-diff">{rows.map((row, index) => <div key={`${row.kind}-${index}`} className={`prompt-diff-line prompt-diff-${row.kind}`}><Badge tone={row.kind === "added" ? "success" : row.kind === "removed" ? "danger" : "muted"}>{row.kind}</Badge><code>{row.text || " "}</code></div>)}</div>;
}

function buildPromptDiff(base: JsonObject | undefined, compare: JsonObject | undefined): Array<{ kind: "same" | "added" | "removed"; text: string }> {
  if (!base || !compare) return [];
  const baseLines = promptText(base).split("\n");
  const compareLines = promptText(compare).split("\n");
  const max = Math.max(baseLines.length, compareLines.length);
  const rows: Array<{ kind: "same" | "added" | "removed"; text: string }> = [];
  for (let index = 0; index < max; index += 1) {
    const left = baseLines[index];
    const right = compareLines[index];
    if (left === right && left !== undefined) rows.push({ kind: "same", text: left });
    else {
      if (left !== undefined) rows.push({ kind: "removed", text: left });
      if (right !== undefined) rows.push({ kind: "added", text: right });
    }
  }
  return rows;
}

function promptText(profile: JsonObject): string {
  return ["# System", readString(profile, "systemPrompt") ?? "", "", "# User", readString(profile, "userPromptTemplate") ?? ""].join("\n");
}

function readStringArray(value: unknown, key: string): string[] {
  const object = typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
  const raw = object?.[key];
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string") : [];
}
