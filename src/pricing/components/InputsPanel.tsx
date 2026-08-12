import type { PricingInputs } from "../lib/pricing";
import { DATTO_OPTIONS } from "../lib/catalog";
import { FEATURES } from "../lib/features";

interface Props {
  inputs: PricingInputs;
  onChange: (patch: Partial<PricingInputs>) => void;
  onReset: () => void;
}

export function InputsPanel({ inputs, onChange, onReset }: Props) {
  const num = (key: keyof PricingInputs) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.valueAsNumber;
    onChange({ [key]: Number.isNaN(v) ? 0 : v } as Partial<PricingInputs>);
  };

  return (
    <div className="inputs">
      <div className="inputs-head">
        <h2>Deal inputs</h2>
        <button type="button" className="reset" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="field">
        <label htmlFor="users"># of Users</label>
        <input id="users" type="number" min={0} value={inputs.users} onChange={num("users")} />
      </div>

      <div className="field">
        <label htmlFor="locations"># of Locations</label>
        <input id="locations" type="number" min={0} value={inputs.locations} onChange={num("locations")} />
      </div>

      <div className="field">
        <label htmlFor="devmult">Device Multiplier</label>
        <input
          id="devmult"
          type="number"
          min={0}
          step={0.05}
          value={inputs.deviceMultiplier}
          onChange={num("deviceMultiplier")}
        />
        <small>Devices = users × multiplier</small>
      </div>

      {FEATURES.orr && (
        <>
          <div className="field">
            <label htmlFor="o365">O365 E3 Seats</label>
            <input id="o365" type="number" min={0} value={inputs.o365Seats} onChange={num("o365Seats")} />
          </div>

          <div className="field">
            <label htmlFor="datto">Datto Backup</label>
            <select
              id="datto"
              value={inputs.dattoOption}
              onChange={(e) => onChange({ dattoOption: e.target.value })}
            >
              {DATTO_OPTIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="field checkbox">
        <label htmlFor="travel">
          <input
            id="travel"
            type="checkbox"
            checked={inputs.travelRequired}
            onChange={(e) => onChange({ travelRequired: e.target.checked })}
          />
          Travel required (on-site labor)
        </label>
      </div>
    </div>
  );
}
