import type { LineItem } from "../lib/pricing";
import { money, percent, qty } from "../lib/format";

interface Props {
  lines: LineItem[];
  /** Show the ext-price and GM columns (hidden for cost-only sections like tools/labor). */
  showPrice?: boolean;
  footer?: { label: string; extCost: number; extPrice?: number };
  /**
   * When provided, the Unit column becomes editable for lines that carry a
   * `key`. Pass the new value to set an override, or `null` to revert to the
   * computed default.
   */
  onUnitOverride?: (key: string, value: number | null) => void;
}

export function LineItemTable({ lines, showPrice = true, footer, onUnitOverride }: Props) {
  const renderUnit = (l: LineItem) => {
    if (!onUnitOverride || !l.key) return qty(l.unit);
    return (
      <span className="unit-edit">
        <input
          type="number"
          min={0}
          className={l.isOverridden ? "overridden" : ""}
          value={Math.round(l.unit)}
          title={l.isOverridden ? `Default: ${qty(l.defaultUnit ?? l.unit)}` : "Default"}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            onUnitOverride(l.key!, Number.isNaN(v) ? null : v);
          }}
        />
        {l.isOverridden && (
          <button
            type="button"
            className="unit-reset"
            title="Reset to default"
            aria-label={`Reset ${l.label} to default`}
            onClick={() => onUnitOverride(l.key!, null)}
          >
            ↺
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="table-scroll">
      <table className="line-table">
        <thead>
          <tr>
            <th className="col-label">Item</th>
            <th className="num">Unit</th>
            <th className="num">Cost</th>
            <th className="num">Ext Cost</th>
            {showPrice && <th className="num">Ext Price</th>}
            {showPrice && <th className="num">GM%</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.key ?? i}>
              <td className="col-label">{l.label}</td>
              <td className="num">{renderUnit(l)}</td>
              <td className="num">{money(l.unitCost)}</td>
              <td className="num">{money(l.extCost)}</td>
              {showPrice && <td className="num">{money(l.extPrice)}</td>}
              {showPrice && <td className="num">{percent(l.gm)}</td>}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              <td className="col-label">{footer.label}</td>
              <td className="num" />
              <td className="num" />
              <td className="num">{money(footer.extCost)}</td>
              {showPrice && <td className="num">{footer.extPrice != null ? money(footer.extPrice) : ""}</td>}
              {showPrice && <td className="num" />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
