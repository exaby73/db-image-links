import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { Notice } from "../types";

type NoticeBannerProps = {
  notice: Notice | null;
};

export function NoticeBanner({ notice }: NoticeBannerProps) {
  if (!notice) return null;

  return (
    <div className={`notice notice-${notice.kind}`}>
      {notice.kind === "error" ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
      <span>{notice.text}</span>
    </div>
  );
}
