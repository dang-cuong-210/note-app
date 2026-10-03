import type { RealtimeDiagnostics } from '@/hooks/useAppData';

function display(value: string | number | null): string {
  return value === null || value === '' ? '—' : String(value);
}

function DiagnosticRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 py-0.5">
      <dt className="text-slate-400">{label}</dt>
      <dd className="min-w-0 break-all text-slate-100">{display(value)}</dd>
    </div>
  );
}

export function RealtimeDiagnosticsPanel({ diagnostics }: { diagnostics: RealtimeDiagnostics }) {
  if (!diagnostics.enabled) return null;

  return (
    <aside
      aria-label="Realtime diagnostics"
      aria-live="polite"
      className="fixed bottom-3 right-3 z-[200] max-h-[70vh] w-[min(24rem,calc(100vw-1.5rem))] overflow-auto rounded-lg border border-slate-600 bg-slate-950/95 p-3 font-mono text-[11px] leading-4 shadow-2xl"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong className="text-xs text-emerald-300">Realtime diagnostics</strong>
        <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-amber-200">rtdebug=1</span>
      </div>
      <dl>
        <DiagnosticRow label="User" value={diagnostics.maskedUserId} />
        <DiagnosticRow label="Session" value={diagnostics.sessionStatus} />
        <DiagnosticRow label="Session error" value={diagnostics.sessionError} />
        <DiagnosticRow label="Notes channel" value={diagnostics.notesChannelStatus} />
        <DiagnosticRow label="Notes error" value={diagnostics.notesChannelError} />
        <DiagnosticRow label="Folders channel" value={diagnostics.foldersChannelStatus} />
        <DiagnosticRow label="Folders error" value={diagnostics.foldersChannelError} />
        <DiagnosticRow label="Attachments channel" value={diagnostics.attachmentsChannelStatus} />
        <DiagnosticRow label="Attachments error" value={diagnostics.attachmentsChannelError} />
        <DiagnosticRow label="WebSocket" value={diagnostics.websocketState} />
        <DiagnosticRow label="Last notes event" value={diagnostics.lastNotesEventAt} />
        <DiagnosticRow label="Last folders event" value={diagnostics.lastFoldersEventAt} />
        <DiagnosticRow label="Last attachment event" value={diagnostics.lastAttachmentsEventAt} />
        <DiagnosticRow label="Attachment event type" value={diagnostics.lastAttachmentsEventType} />
        <DiagnosticRow label="Event type" value={diagnostics.lastEventType} />
        <DiagnosticRow label="Row ID" value={diagnostics.lastRowId} />
        <DiagnosticRow label="Received revision" value={diagnostics.receivedRevision} />
        <DiagnosticRow label="Known revision" value={diagnostics.knownLocalRevision} />
        <DiagnosticRow label="Decision" value={diagnostics.decision} />
        <DiagnosticRow label="Ignore reason" value={diagnostics.ignoreReason} />
        <DiagnosticRow label="Pending notes" value={diagnostics.pendingNotesSize} />
        <DiagnosticRow label="In-flight sync" value={diagnostics.inFlightSyncCount} />
      </dl>
    </aside>
  );
}
