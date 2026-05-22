import { Copy, ExternalLink, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { APP_CONSOLE_SCOPES } from "../constants";
import type { AuthStart, BusyState } from "../types";

type SetupPanelProps = {
  appKey: string;
  authCode: string;
  authSession: AuthStart | null;
  busy: BusyState;
  onAppKeyChange: (value: string) => void;
  onAuthCodeChange: (value: string) => void;
  onBeginAuth: () => void;
  onCompleteAuth: () => void;
  onCopyScopes: () => void;
};

export function SetupPanel({
  appKey,
  authCode,
  authSession,
  busy,
  onAppKeyChange,
  onAuthCodeChange,
  onBeginAuth,
  onCompleteAuth,
  onCopyScopes,
}: SetupPanelProps) {
  return (
    <aside className="setup-panel">
      <div className="panel-heading">
        <KeyRound size={20} />
        <div>
          <h2>Dropbox setup</h2>
          <p>One-time setup for the Dropbox account that owns the folders.</p>
        </div>
      </div>

      <ol className="setup-steps">
        <li>Create a Dropbox app with scoped access in the Dropbox App Console.</li>
        <li>Choose Full Dropbox access. Do not choose App Folder.</li>
        <li>Enable the permissions below.</li>
        <li>Paste the app key below, authorize, then paste the code.</li>
      </ol>

      <div className="scope-box">
        <code>{APP_CONSOLE_SCOPES}</code>
        <button type="button" className="icon-button" onClick={onCopyScopes} title="Copy scopes">
          <Copy size={16} />
        </button>
      </div>

      <p className="scope-note">
        Dropbox selects sharing.read automatically with sharing.write. If you already made an App
        Folder app, create a new Full Dropbox app and use its app key.
      </p>

      <label className="field">
        <span>Dropbox app key</span>
        <input
          value={appKey}
          onChange={(event) => onAppKeyChange(event.target.value)}
          placeholder="Paste app key"
          autoComplete="off"
        />
      </label>

      <button
        className="primary-button"
        type="button"
        onClick={onBeginAuth}
        disabled={busy === "auth"}
      >
        {busy === "auth" ? <Loader2 className="spin" size={18} /> : <ExternalLink size={18} />}
        Open Dropbox authorization
      </button>

      <label className="field">
        <span>Authorization code</span>
        <input
          value={authCode}
          onChange={(event) => onAuthCodeChange(event.target.value)}
          placeholder="Paste code from Dropbox"
          autoComplete="off"
        />
      </label>

      <button
        className="secondary-button"
        type="button"
        onClick={onCompleteAuth}
        disabled={!authSession || authCode.trim().length === 0 || busy === "auth"}
      >
        <ShieldCheck size={18} />
        Finish setup
      </button>
    </aside>
  );
}
