import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo, useState } from "react";
import type { ConnectionStatus, DevLogEntry, ProcessResponse } from "../types";

type InvokeArgs = Record<string, unknown>;
type LogInput = Omit<DevLogEntry, "id" | "timestamp">;
const DEV_LOG_ENABLED = import.meta.env.DEV;

export function useDevLog() {
  const [entries, setEntries] = useState<DevLogEntry[]>([]);

  const addLog = useCallback((entry: LogInput) => {
    if (!DEV_LOG_ENABLED) return;

    setEntries((current) => [
      {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
      ...current,
    ]);
  }, []);

  const clearLogs = useCallback(() => {
    setEntries([]);
  }, []);

  const copyLogs = useCallback(async () => {
    await navigator.clipboard.writeText(formatLogs(entries));
  }, [entries]);

  const invokeWithLog = useCallback(
    async <T>(command: string, args?: InvokeArgs): Promise<T> => {
      addLog({
        level: "info",
        source: "tauri",
        message: `Starting ${command}`,
        details: sanitizeArgs(command, args),
      });

      try {
        const result = await invoke<T>(command, args);
        addLog({
          level: "success",
          source: "tauri",
          message: `Finished ${command}`,
          details: summarizeResult(command, result),
        });
        return result;
      } catch (error) {
        addLog({
          level: "error",
          source: "tauri",
          message: `Failed ${command}`,
          details: { error: String(error) },
        });
        throw error;
      }
    },
    [addLog],
  );

  return useMemo(
    () => ({
      enabled: DEV_LOG_ENABLED,
      entries,
      addLog,
      clearLogs,
      copyLogs,
      invokeWithLog,
    }),
    [entries, addLog, clearLogs, copyLogs, invokeWithLog],
  );
}

function sanitizeArgs(command: string, args?: InvokeArgs): unknown {
  if (!args) return undefined;

  switch (command) {
    case "start_auth":
      return { appKey: maskValue(String(args.appKey ?? "")) };
    case "complete_auth":
      return {
        appKey: maskValue(String(args.appKey ?? "")),
        code: "[redacted]",
        codeVerifier: "[redacted]",
      };
    case "process_dropbox_folder": {
      const request = args.request as { folderUrl?: string; mode?: string } | undefined;
      return {
        request: {
          mode: request?.mode,
          folderUrl: sanitizeDropboxUrl(request?.folderUrl),
        },
      };
    }
    case "save_csv_file": {
      const request = args.request as { path?: string; csv?: string } | undefined;
      return {
        request: {
          path: request?.path,
          csvBytes: request?.csv?.length ?? 0,
        },
      };
    }
    default:
      return args;
  }
}

function summarizeResult(command: string, result: unknown): unknown {
  if (command === "connection_status") {
    const status = result as ConnectionStatus;
    return { connected: status.connected, appKeyHint: status.appKeyHint };
  }

  if (command === "start_auth") {
    return { authUrl: "[generated]", codeVerifier: "[redacted]" };
  }

  if (command === "complete_auth" || command === "disconnect_dropbox") {
    const status = result as ConnectionStatus;
    return { connected: status.connected, appKeyHint: status.appKeyHint };
  }

  if (command === "process_dropbox_folder") {
    const response = result as ProcessResponse;
    return {
      rows: response.rows.length,
      links: response.rows.reduce((total, row) => total + row.links.length, 0),
      failures: response.failures.length,
      failureMessages: response.failures.slice(0, 5).map((failure) => ({
        sku: failure.sku,
        item: failure.item,
        message: failure.message,
      })),
    };
  }

  if (command === "save_csv_file") {
    return { saved: true };
  }

  return result;
}

function sanitizeDropboxUrl(value?: string): string {
  if (!value) return "";

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}?query=[redacted]`;
  } catch {
    return "[invalid-url]";
  }
}

function maskValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 6) return "[configured]";
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-3)}`;
}

function formatLogs(entries: DevLogEntry[]): string {
  return entries
    .slice()
    .reverse()
    .map((entry) => {
      const details =
        entry.details === undefined ? "" : `\n${JSON.stringify(entry.details, null, 2)}`;
      return `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.source}: ${
        entry.message
      }${details}`;
    })
    .join("\n\n");
}
