import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ConnectionStatus } from "../types";

type ConnectionPillProps = {
  status: ConnectionStatus;
};

export function ConnectionPill({ status }: ConnectionPillProps) {
  return (
    <div className={`connection-pill ${status.connected ? "is-connected" : ""}`}>
      {status.connected ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      <span>{status.connected ? "Connected" : "Dropbox not connected"}</span>
    </div>
  );
}
