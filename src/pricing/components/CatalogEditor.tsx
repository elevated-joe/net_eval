import type { Catalog, HardwareItem, LaborItem, ToolItem } from "../lib/catalog";
import { blankHardware, blankLabor, blankTool, cloneCatalog } from "../lib/catalogStore";

interface Props {
  catalog: Catalog;
  onChange: (next: Catalog) => void;
  onExport: () => void;
  onReset: () => void;
  modified: boolean;
}

export function CatalogEditor({ catalog, onChange, onExport, onReset, modified }: Props) {
  /** Apply a mutation to a fresh clone and emit it. */
  const edit = (mutate: (draft: Catalog) => void) => {
    const draft = cloneCatalog(catalog);
    mutate(draft);
    onChange(draft);
  };

  const num = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.valueAsNumber;
    return Number.isNaN(v) ? 0 : v;
  };

  return (
    <div className="catalog-editor">
      <div className="editor-actions">
        <button type="button" className="btn primary" onClick={onExport}>
          Export catalog.ts
        </button>
        <button type="button" className="btn" onClick={onReset} disabled={!modified}>
          Reset to defaults
        </button>
        <span className="editor-note">
          {modified ? "Edited — export & commit catalog.ts to make it permanent." : "Matches built-in defaults."}
        </span>
      </div>

      {/* ---------------- Hardware ---------------- */}
      <h4 className="editor-h">Hardware (HaaS)</h4>
      <div className="table-scroll">
        <table className="edit-table">
          <thead>
            <tr>
              <th>Label</th>
              <th className="num">Cost</th>
              <th>Unit basis</th>
              <th className="num">×/Qty</th>
              <th>Price</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {catalog.hardware.map((h, i) => (
              <tr key={h.key}>
                <td>
                  <input
                    className="cell-text"
                    value={h.label}
                    onChange={(e) => edit((d) => void (d.hardware[i].label = e.target.value))}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    step="0.01"
                    className="cell-num"
                    value={h.cost}
                    onChange={(e) => edit((d) => void (d.hardware[i].cost = num(e)))}
                  />
                </td>
                <td>
                  <select
                    className="cell-select"
                    value={h.unit.base}
                    onChange={(e) =>
                      edit((d) => {
                        const base = e.target.value as HardwareItem["unit"]["base"];
                        d.hardware[i].unit =
                          base === "fixed" ? { base: "fixed", value: 1 } : { base, factor: undefined };
                      })
                    }
                  >
                    <option value="locations">per location</option>
                    <option value="devices">per device</option>
                    <option value="fixed">fixed qty</option>
                  </select>
                </td>
                <td className="num">
                  {h.unit.base === "fixed" ? (
                    <input
                      type="number"
                      className="cell-num"
                      value={h.unit.value}
                      onChange={(e) =>
                        edit((d) => {
                          const u = d.hardware[i].unit;
                          if (u.base === "fixed") u.value = num(e);
                        })
                      }
                    />
                  ) : (
                    <input
                      type="number"
                      step="0.05"
                      className="cell-num"
                      placeholder="1"
                      value={h.unit.factor ?? ""}
                      onChange={(e) =>
                        edit((d) => {
                          const u = d.hardware[i].unit;
                          if (u.base !== "fixed") u.factor = e.target.value === "" ? undefined : num(e);
                        })
                      }
                    />
                  )}
                </td>
                <td>
                  <select
                    className="cell-select"
                    value={h.priceRule}
                    onChange={(e) =>
                      edit((d) => void (d.hardware[i].priceRule = e.target.value as HardwareItem["priceRule"]))
                    }
                  >
                    <option value="markup">×1.42 markup</option>
                    <option value="lab">$185/unit (LAB)</option>
                  </select>
                </td>
                <td>
                  <button className="row-del" title="Remove" onClick={() => edit((d) => void d.hardware.splice(i, 1))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="btn add"
        onClick={() => edit((d) => d.hardware.push(blankHardware(new Set(d.hardware.map((x) => x.key)))))}
      >
        + Add hardware
      </button>

      {/* ---------------- Tools ---------------- */}
      <h4 className="editor-h">Managed Tools</h4>
      <div className="table-scroll">
        <table className="edit-table">
          <thead>
            <tr>
              <th>Label</th>
              <th className="num">Cost</th>
              <th>Unit basis</th>
              <th className="num">Qty</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {catalog.tools.map((t, i) => (
              <tr key={t.key}>
                <td>
                  <input
                    className="cell-text"
                    value={t.label}
                    onChange={(e) => edit((d) => void (d.tools[i].label = e.target.value))}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    step="0.01"
                    className="cell-num"
                    value={t.cost}
                    onChange={(e) => edit((d) => void (d.tools[i].cost = num(e)))}
                  />
                </td>
                <td>
                  <select
                    className="cell-select"
                    value={t.unit.base}
                    onChange={(e) =>
                      edit((d) => {
                        const base = e.target.value as ToolItem["unit"]["base"];
                        d.tools[i].unit = base === "fixed" ? { base: "fixed", value: 1 } : { base };
                      })
                    }
                  >
                    <option value="devices">per device</option>
                    <option value="users">per user</option>
                    <option value="fixed">fixed qty</option>
                  </select>
                </td>
                <td className="num">
                  {t.unit.base === "fixed" ? (
                    <input
                      type="number"
                      className="cell-num"
                      value={t.unit.value}
                      onChange={(e) =>
                        edit((d) => {
                          const u = d.tools[i].unit;
                          if (u.base === "fixed") u.value = num(e);
                        })
                      }
                    />
                  ) : (
                    <span className="cell-muted">auto</span>
                  )}
                </td>
                <td>
                  <button className="row-del" title="Remove" onClick={() => edit((d) => void d.tools.splice(i, 1))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="btn add"
        onClick={() => edit((d) => d.tools.push(blankTool(new Set(d.tools.map((x) => x.key)))))}
      >
        + Add tool
      </button>

      {/* ---------------- Labor ---------------- */}
      <h4 className="editor-h">Labor</h4>
      {catalog.labor.map((tier, ti) => (
        <div key={tier.key} className="labor-edit-tier">
          <h5>{tier.label}</h5>
          {(["noTravel", "travel"] as const).map((listKey) => (
            <div key={listKey} className="labor-edit-list">
              <div className="labor-edit-sub">{listKey === "noTravel" ? "No travel" : "Travel"}</div>
              <div className="table-scroll">
                <table className="edit-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th className="num">Rate</th>
                      <th>Hours basis</th>
                      <th className="num">Hours / factor</th>
                      <th>Monthly?</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {tier[listKey].map((item: LaborItem, ii) => {
                      const perDevice = typeof item.hours !== "number";
                      return (
                        <tr key={ii}>
                          <td>
                            <input
                              className="cell-text"
                              value={item.label}
                              onChange={(e) => edit((d) => void (d.labor[ti][listKey][ii].label = e.target.value))}
                            />
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              step="0.01"
                              className="cell-num"
                              value={item.rate}
                              onChange={(e) => edit((d) => void (d.labor[ti][listKey][ii].rate = num(e)))}
                            />
                          </td>
                          <td>
                            <select
                              className="cell-select"
                              value={perDevice ? "devices" : "fixed"}
                              onChange={(e) =>
                                edit((d) => {
                                  const it = d.labor[ti][listKey][ii];
                                  it.hours = e.target.value === "devices" ? { base: "devices", factor: 0.3 } : 0;
                                })
                              }
                            >
                              <option value="fixed">fixed hours</option>
                              <option value="devices">× devices</option>
                            </select>
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              step={perDevice ? "0.05" : "1"}
                              className="cell-num"
                              value={perDevice ? (item.hours as { factor: number }).factor : (item.hours as number)}
                              onChange={(e) =>
                                edit((d) => {
                                  const it = d.labor[ti][listKey][ii];
                                  if (typeof it.hours === "number") it.hours = num(e);
                                  else it.hours = { base: "devices", factor: num(e) };
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={item.alreadyMonthly}
                              title="Already a monthly figure (else annual ÷12)"
                              onChange={(e) =>
                                edit((d) => void (d.labor[ti][listKey][ii].alreadyMonthly = e.target.checked))
                              }
                            />
                          </td>
                          <td>
                            <button
                              className="row-del"
                              title="Remove"
                              onClick={() => edit((d) => void d.labor[ti][listKey].splice(ii, 1))}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button className="btn add" onClick={() => edit((d) => d.labor[ti][listKey].push(blankLabor()))}>
                + Add role
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
