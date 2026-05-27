import { useMemo, useState } from "react";
import { Badge, Button, DataTable } from "../../shared/ui";
import type { JsonObject } from "../../types";
import { readString, shortId, statusTone } from "./dashboard-utils";

type PublishQueueTableProps = {
  rows: JsonObject[];
  onPublishNow: (queueId: string) => Promise<void>;
  onCancel: (queueId: string) => Promise<void>;
  onReschedule: (queueId: string) => Promise<void>;
  onBulkPublishNow?: (queueIds: string[]) => Promise<void>;
  busyQueueId: string | undefined;
};

export function PublishQueueTable({ rows, onPublishNow, onCancel, onReschedule, onBulkPublishNow, busyQueueId }: PublishQueueTableProps): JSX.Element {
  const [selected, setSelected] = useState<string[]>([]);
  const actionableIds = useMemo(() => rows.flatMap((row) => {
    const queueId = readString(row, "queueId");
    return queueId && isActionable(readString(row, "status")) ? [queueId] : [];
  }), [rows]);
  const selectedActionable = selected.filter((queueId) => actionableIds.includes(queueId));

  function toggle(queueId: string): void {
    setSelected((current) => current.includes(queueId) ? current.filter((entry) => entry !== queueId) : [...current, queueId]);
  }

  function toggleAll(): void {
    setSelected((current) => current.filter((queueId) => actionableIds.includes(queueId)).length === actionableIds.length ? [] : actionableIds);
  }

  return <div className="queue-table-stack">
    {onBulkPublishNow !== undefined && <div className="queue-bulk-toolbar"><Button size="sm" variant="secondary" onClick={toggleAll} disabled={actionableIds.length === 0}>{selectedActionable.length === actionableIds.length && actionableIds.length > 0 ? "Clear selection" : "Select actionable"}</Button><Button size="sm" disabled={selectedActionable.length === 0} onClick={() => void onBulkPublishNow(selectedActionable)}>Bulk publish selected ({selectedActionable.length})</Button><span className="muted-text">Bulk publish is capped by the backend and skips non-actionable rows.</span></div>}
    <DataTable rows={rows} columns={[{ key: "select", label: "Select", render: (row) => { const queueId = readString(row, "queueId"); const actionable = isActionable(readString(row, "status")); return queueId && actionable ? <input aria-label={`Select ${queueId}`} type="checkbox" checked={selected.includes(queueId)} onChange={() => toggle(queueId)} /> : <span className="muted-text">-</span>; } }, { key: "queueId", label: "Queue", render: (row) => shortId(readString(row, "queueId")) }, { key: "generatedOutputId", label: "Output", render: (row) => shortId(readString(row, "generatedOutputId")) }, { key: "language", label: "Lang" }, { key: "finalChatId", label: "Final" }, { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(readString(row, "status"))}>{readString(row, "status") ?? "unknown"}</Badge> }, { key: "scheduledFor", label: "Scheduled" }, { key: "attemptCount", label: "Attempts" }, { key: "finalMessageId", label: "Final msg" }, { key: "lastError", label: "Error" }, { key: "action", label: "Action", render: (row) => <QueueActions row={row} busyQueueId={busyQueueId} onPublishNow={onPublishNow} onCancel={onCancel} onReschedule={onReschedule} /> }]} />
  </div>;
}

function QueueActions({ row, busyQueueId, onPublishNow, onCancel, onReschedule }: { row: JsonObject; busyQueueId: string | undefined; onPublishNow: (queueId: string) => Promise<void>; onCancel: (queueId: string) => Promise<void>; onReschedule: (queueId: string) => Promise<void> }): JSX.Element {
  const queueId = readString(row, "queueId");
  const status = readString(row, "status");
  if (!queueId || !isActionable(status)) return <span className="muted-text">-</span>;
  const busy = busyQueueId === queueId;
  return <div className="inline-actions"><Button size="sm" variant="secondary" disabled={busy} onClick={() => void onPublishNow(queueId)}>{busy ? "Publishing..." : "Publish now"}</Button><Button size="sm" variant="ghost" disabled={busy || status === "failed"} onClick={() => void onReschedule(queueId)}>Reschedule</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => void onCancel(queueId)}>Cancel</Button></div>;
}

function isActionable(status: string | undefined): boolean {
  return status === "pending" || status === "scheduled" || status === "failed";
}
