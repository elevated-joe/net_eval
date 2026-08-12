import { useState } from "react";
import type { PlanResult } from "../lib/pricing";
import {
  downloadBlob,
  generateSupportPlan,
  PLAN_COLUMNS,
  type ExportMeta,
} from "../lib/exportDocx";

interface Props {
  plans: PlanResult[];
  users: number;
  onClose: () => void;
  /** Prefill for the Client Name field (pulled from the Evaluation). */
  defaultClientName?: string;
}

const SALES_REPS = ["Tom Hogue", "Joe Timko"];

export function ExportPlan({ plans, users, onClose, defaultClientName = "" }: Props) {
  const [meta, setMeta] = useState<ExportMeta>({
    clientName: defaultClientName,
    clientContact: "",
    addressStreet: "",
    addressCityStateZip: "",
    contactTitle: "",
    dateOfMeeting: "",
    salesRep: SALES_REPS[0],
    selectedPlans: PLAN_COLUMNS.map((p) => p.key),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<ExportMeta>) => setMeta((m) => ({ ...m, ...patch }));

  const togglePlan = (key: string) =>
    setMeta((m) => {
      const next = m.selectedPlans.includes(key)
        ? m.selectedPlans.filter((k) => k !== key)
        : [...m.selectedPlans, key];
      // Keep canonical plan order regardless of click order.
      const ordered = PLAN_COLUMNS.map((p) => p.key).filter((k) => next.includes(k));
      return { ...m, selectedPlans: ordered };
    });

  const canExport = meta.clientName.trim().length > 0 && meta.selectedPlans.length > 0 && !busy;

  const doExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await generateSupportPlan(meta, plans, users);
      const safe = meta.clientName.trim().replace(/[^\w .-]+/g, "_") || "Client";
      downloadBlob(`Support Plan - ${safe}.docx`, blob);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Export Support Plan</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="modal-sub">
          Generates the Elevated MSP support-plan document, tailored to this client. Pricing comes
          from the current calculator ({users} users).
        </p>

        <div className="modal-grid">
          <label className="field">
            <span>Client Name *</span>
            <input value={meta.clientName} onChange={(e) => set({ clientName: e.target.value })} autoFocus />
          </label>
          <label className="field">
            <span>Client Contact</span>
            <input value={meta.clientContact} onChange={(e) => set({ clientContact: e.target.value })} />
          </label>
          <label className="field">
            <span>Contact Title</span>
            <input value={meta.contactTitle} onChange={(e) => set({ contactTitle: e.target.value })} />
          </label>
          <label className="field">
            <span>Date of Meeting</span>
            <input
              type="date"
              value={meta.dateOfMeeting}
              onChange={(e) => set({ dateOfMeeting: e.target.value })}
            />
          </label>
          <label className="field span2">
            <span>Street Address</span>
            <input
              value={meta.addressStreet}
              onChange={(e) => set({ addressStreet: e.target.value })}
              placeholder="100 Main St"
            />
          </label>
          <label className="field span2">
            <span>City, State ZIP</span>
            <input
              value={meta.addressCityStateZip}
              onChange={(e) => set({ addressCityStateZip: e.target.value })}
              placeholder="Harrisburg, PA 17101"
            />
          </label>
          <label className="field">
            <span>Sales Rep</span>
            <select value={meta.salesRep} onChange={(e) => set({ salesRep: e.target.value })}>
              {SALES_REPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="plan-select">
          <span className="plan-select-label">Plans to include (columns)</span>
          <div className="plan-chips">
            {PLAN_COLUMNS.map((p) => {
              const on = meta.selectedPlans.includes(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  className={`chip ${on ? "on" : ""}`}
                  aria-pressed={on}
                  onClick={() => togglePlan(p.key)}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={doExport} disabled={!canExport}>
            {busy ? "Generating…" : "Generate .docx"}
          </button>
        </div>
      </div>
    </div>
  );
}
