import { FileSpreadsheet, Link2, Loader2, LogOut, Save } from "lucide-react";
import type { BusyState, ProcessMode, ProcessResponse } from "../types";
import { Metric } from "./Metric";
import { ResultsTable } from "./ResultsTable";

type GeneratePanelProps = {
  folderUrl: string;
  mode: ProcessMode;
  busy: BusyState;
  canRun: boolean;
  result: ProcessResponse | null;
  linkColumns: string[];
  onFolderUrlChange: (value: string) => void;
  onModeChange: (value: ProcessMode) => void;
  onGenerateCsv: () => void;
  onSaveCsv: () => void;
  onDisconnect: () => void;
};

export function GeneratePanel({
  folderUrl,
  mode,
  busy,
  canRun,
  result,
  linkColumns,
  onFolderUrlChange,
  onModeChange,
  onGenerateCsv,
  onSaveCsv,
  onDisconnect,
}: GeneratePanelProps) {
  return (
    <section className="run-panel">
      <div className="panel-heading panel-heading-split">
        <div className="panel-title">
          <FileSpreadsheet size={22} />
          <div>
            <h2>Generate CSV</h2>
            <p>Paste a public folder link the connected account owns or can access.</p>
          </div>
        </div>
        <button
          className="ghost-button compact-button"
          type="button"
          onClick={onDisconnect}
          disabled={busy === "auth"}
        >
          <LogOut size={18} />
          Disconnect Dropbox
        </button>
      </div>

      <label className="field">
        <span>Dropbox folder link</span>
        <textarea
          value={folderUrl}
          onChange={(event) => onFolderUrlChange(event.target.value)}
          placeholder="https://www.dropbox.com/scl/fo/..."
          rows={4}
        />
      </label>

      <fieldset className="segmented">
        <legend>Processing mode</legend>
        <button
          type="button"
          className={mode === "single" ? "active" : ""}
          onClick={() => onModeChange("single")}
        >
          Single SKU
        </button>
        <button
          type="button"
          className={mode === "multi" ? "active" : ""}
          onClick={() => onModeChange("multi")}
        >
          Multi SKU
        </button>
      </fieldset>

      <div className="run-actions">
        <button className="primary-button" type="button" onClick={onGenerateCsv} disabled={!canRun}>
          {busy === "run" ? <Loader2 className="spin" size={18} /> : <Link2 size={18} />}
          Generate links
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onSaveCsv}
          disabled={!result || busy === "save"}
        >
          {busy === "save" ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
          Save CSV
        </button>
      </div>

      <div className="result-strip">
        <Metric label="SKUs" value={result?.rows.length ?? 0} />
        <Metric
          label="Links"
          value={result?.rows.reduce((total, row) => total + row.links.length, 0) ?? 0}
        />
        <Metric label="Needs review" value={result?.failures.length ?? 0} />
      </div>

      <ResultsTable result={result} linkColumns={linkColumns} />
    </section>
  );
}
