import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectionPill } from "./components/ConnectionPill";
import { DevLogPanel } from "./components/DevLogPanel";
import { GeneratePanel } from "./components/GeneratePanel";
import { NoticeBanner } from "./components/NoticeBanner";
import { SetupPanel } from "./components/SetupPanel";
import { APP_CONSOLE_SCOPES } from "./constants";
import { useDevLog } from "./hooks/useDevLog";
import type {
  AuthStart,
  BusyState,
  ConnectionStatus,
  Notice,
  ProcessMode,
  ProcessResponse,
} from "./types";

function App() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [appKey, setAppKey] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authSession, setAuthSession] = useState<AuthStart | null>(null);
  const [folderUrl, setFolderUrl] = useState("");
  const [mode, setMode] = useState<ProcessMode>("single");
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const { enabled, entries, addLog, clearLogs, copyLogs, invokeWithLog } = useDevLog();

  const linkColumns = useMemo(() => {
    const maxLinks = Math.max(0, ...(result?.rows.map((row) => row.links.length) ?? [0]));
    return Array.from({ length: maxLinks }, (_, index) => `Link ${index + 1}`);
  }, [result]);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await invokeWithLog<ConnectionStatus>("connection_status"));
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    }
  }, [invokeWithLog]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function beginAuth() {
    setNotice(null);
    setBusy("auth");
    try {
      const session = await invokeWithLog<AuthStart>("start_auth", { appKey });
      setAuthSession(session);
      await openUrl(session.authUrl);
      addLog({
        level: "success",
        source: "ui",
        message: "Opened Dropbox authorization URL",
      });
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
      const nextStatus = await invokeWithLog<ConnectionStatus>("complete_auth", {
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
      const nextStatus = await invokeWithLog<ConnectionStatus>("disconnect_dropbox");
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
      const response = await invokeWithLog<ProcessResponse>("process_dropbox_folder", {
        request: { folderUrl, mode },
      });
      setResult(response);
      setNotice({
        kind: response.failures.length > 0 ? "info" : "success",
        text:
          response.failures.length > 0
            ? `CSV generated with ${response.failures.length} ${pluralize(
                response.failures.length,
                "item",
              )} needing review.`
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
        addLog({
          level: "info",
          source: "ui",
          message: "Save dialog cancelled",
        });
        setNotice({ kind: "info", text: "Save cancelled." });
        return;
      }

      await invokeWithLog("save_csv_file", { request: { path, csv: result.csv } });
      setNotice({ kind: "success", text: `Saved CSV to ${path}.` });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function copyScopes() {
    await navigator.clipboard.writeText(APP_CONSOLE_SCOPES);
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
        <ConnectionPill status={status} />
      </section>

      <NoticeBanner notice={notice} />

      <section className={`workspace-grid ${status.connected ? "is-connected" : "is-setup"}`}>
        {status.connected ? (
          <GeneratePanel
            folderUrl={folderUrl}
            mode={mode}
            busy={busy}
            canRun={canRun}
            result={result}
            linkColumns={linkColumns}
            onFolderUrlChange={setFolderUrl}
            onModeChange={setMode}
            onGenerateCsv={generateCsv}
            onSaveCsv={saveCsv}
            onDisconnect={disconnect}
          />
        ) : (
          <SetupPanel
            appKey={appKey}
            authCode={authCode}
            authSession={authSession}
            busy={busy}
            onAppKeyChange={setAppKey}
            onAuthCodeChange={setAuthCode}
            onBeginAuth={beginAuth}
            onCompleteAuth={completeAuth}
            onCopyScopes={copyScopes}
          />
        )}
      </section>

      <DevLogPanel enabled={enabled} entries={entries} onCopy={copyLogs} onClear={clearLogs} />
    </main>
  );
}

export default App;

function pluralize(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}
