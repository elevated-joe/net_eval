import type { PlanResult } from "../lib/pricing";
import { money, percent } from "../lib/format";

interface Props {
  plans: PlanResult[];
}

/** Line in a plan card's recurring breakdown; skips zero rows to reduce noise. */
function BreakdownRow({ label, value, always }: { label: string; value: number; always?: boolean }) {
  if (!always && value === 0) return null;
  return (
    <div className="breakdown-row">
      <span>{label}</span>
      <span className="num">{money(value)}</span>
    </div>
  );
}

export function PlanCards({ plans }: Props) {
  return (
    <div className="plan-grid">
      {plans.map((p) => (
        <article key={p.key} className="plan-card">
          <header className="plan-head">
            <h3>{p.label}</h3>
            <div className="plan-price">
              {money(p.totalMonthly)}
              <span className="per">/mo</span>
            </div>
          </header>

          <div className="breakdown">
            <BreakdownRow label="Managed services (MRR)" value={p.mrrPrice} always />
            <BreakdownRow label="O365" value={p.orrO365} />
            <BreakdownRow label="Datto backup" value={p.orrDatto} />
            <BreakdownRow label="Hardware (HaaS)" value={p.orrHaaS} />
          </div>

          <dl className="plan-meta">
            <div>
              <dt>Per user / mo</dt>
              <dd>{money(p.perUserPrice)}</dd>
            </div>
            <div>
              <dt>Gross margin</dt>
              <dd>{percent(p.grossMargin)}</dd>
            </div>
            <div>
              <dt>Setup fee</dt>
              <dd>{money(p.setupFee)}</dd>
            </div>
            <div>
              <dt>MRR cost</dt>
              <dd>{money(p.mrrCost)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}
