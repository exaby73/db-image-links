import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Save,
  ShieldCheck,
  Table2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthStart, ConnectionStatus, ProcessMode, ProcessResponse } from "./types";

const REQUIRED_SCOPES = "files.metadata.read sharing.read sharing.write";

type Notice = {
  kind: "info" | "success" | "error";
  text: string;
};

function App() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [appKey, setAppKey] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authSession, setAuthSession] = useState<AuthStart | null>(null);
  const [folderUrl, setFolderUrl] = useState("");
  const [mode, setMode] = useState<ProcessMode>("single");
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<"auth" | "run" | "save" | null>(null);

  const linkColumns = useMemo(() => {
    const maxLinks = Math.max(0, ...(result?.rows.map((row) => row.links.length) ?? [0]));
    return Array.from({ length: maxLinks }, (_, index) => `Link ${index + 1}`);
  }, [result]);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await invoke<ConnectionStatus>("connection_status"));
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function beginAuth() {
    setNotice(null);
    setBusy("auth");
    try {
      const session = await invoke<AuthStart>("start_auth", { appKey });
      setAuthSession(session);
      await openUrl(session.authUrl);
      setNotice({
        kind: "info",
        text: "Dropbox opened in your browser. Approve access, copy the code Dropbox shows, then paste it here.",
      });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function completeAuth() {
    if (!authSession) {
      setNotice({
        kind: "error",
        text: "Start Dropbox setup before pasting an authorization code.",
      });
      return;
    }

    setBusy("auth");
    try {
      const nextStatus = await invoke<ConnectionStatus>("complete_auth", {
        appKey,
        code: authCode,
        codeVerifier: authSession.codeVerifier,
      });
      setStatus(nextStatus);
      setAuthCode("");
      setAuthSession(null);
      setNotice({
        kind: "success",
        text: "Dropbox is connected. You can generate CSV files now.",
      });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("auth");
    try {
      const nextStatus = await invoke<ConnectionStatus>("disconnect_dropbox");
      setStatus(nextStatus);
      setResult(null);
      setNotice({
        kind: "success",
        text: "Dropbox credentials were removed from this computer.",
      });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function generateCsv() {
    setNotice(null);
    setResult(null);
    setBusy("run");
    try {
      const response = await invoke<ProcessResponse>("process_dropbox_folder", {
        request: { folderUrl, mode },
      });
      setResult(response);
      setNotice({
        kind: response.failures.length > 0 ? "info" : "success",
        text:
          response.failures.length > 0
            ? `CSV generated with ${response.failures.length} item needing review.`
            : "CSV generated successfully.",
      });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
      await refreshStatus();
    } finally {
      setBusy(null);
    }
  }

  async function saveCsv() {
    if (!result) return;

    setBusy("save");
    try {
      const path = await save({
        title: "Save Dropbox image link CSV",
        defaultPath: "dropbox-image-links.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });

      if (!path) {
        setNotice({ kind: "info", text: "Save cancelled." });
        return;
      }

      await invoke("save_csv_file", { request: { path, csv: result.csv } });
      setNotice({ kind: "success", text: `Saved CSV to ${path}.` });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function copyScopes() {
    await navigator.clipboard.writeText(REQUIRED_SCOPES);
    setNotice({ kind: "success", text: "Required Dropbox scopes copied." });
  }

  const canRun = status.connected && folderUrl.trim().length > 0 && busy !== "run";

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Dropbox CSV generator</p>
          <h1>Image links by SKU</h1>
        </div>
        <div className={`connection-pill ${status.connected ? "is-connected" : ""}`}>
          {status.connected ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>
            {status.connected ? `Connected ${status.appKeyHint ?? ""}` : "Dropbox not connected"}
          </span>
        </div>
      </section>

      {notice && (
        <div className={`notice notice-${notice.kind}`}>
          {notice.kind === "error" ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
          <span>{notice.text}</span>
        </div>
      )}

      <section className="workspace-grid">
        <aside className="setup-panel">
          <div className="panel-heading">
            <KeyRound size={20} />
            <div>
              <h2>Dropbox setup</h2>
              <p>One-time setup for the Dropbox account that owns the folders.</p>
            </div>
          </div>

          <ol className="setup-steps">
            <li>Create a Dropbox app in the Dropbox App Console.</li>
            <li>Choose scoped access and enable these permissions.</li>
            <li>Paste the app key below, authorize, then paste the code.</li>
          </ol>

          <div className="scope-box">
            <code>{REQUIRED_SCOPES}</code>
            <button type="button" className="icon-button" onClick={copyScopes} title="Copy scopes">
              <Copy size={16} />
            </button>
          </div>

          <label className="field">
            <span>Dropbox app key</span>
            <input
              value={appKey}
              onChange={(event) => setAppKey(event.target.value)}
              placeholder="Paste app key"
              autoComplete="off"
            />
          </label>

          <button
            className="primary-button"
            type="button"
            onClick={beginAuth}
            disabled={busy === "auth"}
          >
            {busy === "auth" ? <Loader2 className="spin" size={18} /> : <ExternalLink size={18} />}
            Open Dropbox authorization
          </button>

          <label className="field">
            <span>Authorization code</span>
            <input
              value={authCode}
              onChange={(event) => setAuthCode(event.target.value)}
              placeholder="Paste code from Dropbox"
              autoComplete="off"
            />
          </label>

          <button
            className="secondary-button"
            type="button"
            onClick={completeAuth}
            disabled={!authSession || authCode.trim().length === 0 || busy === "auth"}
          >
            <ShieldCheck size={18} />
            Finish setup
          </button>

          <button
            className="ghost-button"
            type="button"
            onClick={disconnect}
            disabled={busy === "auth"}
          >
            <LogOut size={18} />
            Disconnect Dropbox
          </button>
        </aside>

        <section className="run-panel">
          <div className="panel-heading">
            <FileSpreadsheet size={22} />
            <div>
              <h2>Generate CSV</h2>
              <p>Paste a public folder link from the same Dropbox account.</p>
            </div>
          </div>

          <label className="field">
            <span>Dropbox folder link</span>
            <textarea
              value={folderUrl}
              onChange={(event) => setFolderUrl(event.target.value)}
              placeholder="https://www.dropbox.com/scl/fo/..."
              rows={4}
            />
          </label>

          <fieldset className="segmented">
            <legend>Processing mode</legend>
            <button
              type="button"
              className={mode === "single" ? "active" : ""}
              onClick={() => setMode("single")}
            >
              Single SKU
            </button>
            <button
              type="button"
              className={mode === "multi" ? "active" : ""}
              onClick={() => setMode("multi")}
            >
              Multi SKU
            </button>
          </fieldset>

          <div className="run-actions">
            <button
              className="primary-button"
              type="button"
              onClick={generateCsv}
              disabled={!canRun}
            >
              {busy === "run" ? <Loader2 className="spin" size={18} /> : <Link2 size={18} />}
              Generate links
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={saveCsv}
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
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ResultsTable({
  result,
  linkColumns,
}: {
  result: ProcessResponse | null;
  linkColumns: string[];
}) {
  if (!result) {
    return (
      <div className="empty-state">
        <Table2 size={36} />
        <p>Generated rows will appear here before saving.</p>
      </div>
    );
  }

  return (
    <div className="results-area">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              {linkColumns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.sku}>
                <td>{row.sku}</td>
                {linkColumns.map((_, index) => (
                  <td key={`${row.sku}-${index}`}>
                    {row.links[index] ? (
                      <a href={row.links[index]} target="_blank" rel="noreferrer">
                        {row.links[index]}
                      </a>
                    ) : (
                      <span className="muted">Blank</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.failures.length > 0 && (
        <section className="failure-list">
          <h3>Review these items</h3>
          {result.failures.map((failure, index) => (
            <div key={`${failure.sku}-${failure.item}-${index}`}>
              <strong>{failure.sku}</strong>
              <span>{failure.item}</span>
              <p>{failure.message}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default App;
