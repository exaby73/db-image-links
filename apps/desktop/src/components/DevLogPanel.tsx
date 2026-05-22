import { ClipboardCopy, Trash2 } from "lucide-react";
import type { DevLogEntry } from "../types";

type DevLogPanelProps = {
  enabled: boolean;
  entries: DevLogEntry[];
  onCopy: () => void;
  onClear: () => void;
};

export function DevLogPanel({ enabled, entries, onCopy, onClear }: DevLogPanelProps) {
  if (!enabled) return null;

  return (
    <section className="dev-log-panel">
      <div className="dev-log-header">
        <div>
          <h2>Developer log</h2>
          <p>Copy this when Dropbox returns an unexpected error.</p>
        </div>
        <div className="dev-log-actions">
          <button type="button" className="secondary-button compact-button" onClick={onCopy}>
            <ClipboardCopy size={16} />
            Copy logs
          </button>
          <button type="button" className="ghost-button compact-button" onClick={onClear}>
            <Trash2 size={16} />
            Clear
          </button>
        </div>
      </div>

      <div className="dev-log-list">
        {entries.length === 0 ? (
          <p className="dev-log-empty">No log entries yet.</p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id} className={`dev-log-entry dev-log-${entry.level}`}>
              <header>
                <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <strong>{entry.message}</strong>
              </header>
              {entry.details !== undefined && <pre>{JSON.stringify(entry.details, null, 2)}</pre>}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
