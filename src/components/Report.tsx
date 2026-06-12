import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/app";
import { Modal } from "./ui";

const REASONS = ["spam", "harassment or hate", "spoilers without tags", "impersonation", "illegal content", "something else"];

export function ReportButton({ targetKind, targetId, small }: { targetKind: string; targetId: string; small?: boolean }) {
  const { session, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");

  async function send() {
    if (!session?.user) return toast("Sign in to report.");
    const { error } = await supabase.from("reports").insert({
      reporter_id: session.user.id, target_kind: targetKind, target_id: targetId,
      reason, details: details.trim() || null,
    });
    toast(error ? error.message : "Reported. A human will look — thank you for flagging.");
    setOpen(false); setDetails("");
  }

  return (
    <>
      <button className={small ? "react" : "btn small"} title="Report" onClick={() => setOpen(true)}>🚩{small ? "" : " Report"}</button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <h3>Report this {targetKind.replace("_", " ")}</h3>
        <p className="sub">Reports go to moderation. False reports waste everyone's evening.</p>
        <div className="field"><label>Reason</label>
          <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></div>
        <div className="field"><label>Details (optional)</label>
          <textarea className="textarea" style={{ minHeight: 70 }} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn primary" onClick={send}>Send report</button>
        </div>
      </Modal>
    </>
  );
}
