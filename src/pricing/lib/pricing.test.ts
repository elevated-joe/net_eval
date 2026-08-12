import { describe, expect, it } from "vitest";
import { calculatePricing, DEFAULT_INPUTS, type PricingInputs } from "./pricing";
import { qty } from "./format";

/**
 * Rounding model (matches the source spreadsheet):
 *  - Quantities & costs stay EXACT in the math; units are only rounded for
 *    display (see `qty`). The sheet shows "5" support units but multiplies by
 *    the precise 4.6875.
 *  - Quoted PRICES round to whole dollars, built from rounded parts so totals
 *    stay consistent.
 *
 * Baseline scenario mirrors the spreadsheet inputs (25 users, 1 location, no
 * travel, 1.25 devices/user) with O365 = 0 seats and no Datto.
 */
const BASE: PricingInputs = {
  users: 25,
  locations: 1,
  travelRequired: false,
  deviceMultiplier: 1.25,
  o365Seats: 0,
  dattoOption: "none",
  hardwareUnitOverrides: {},
};

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 4);

const allLines = (r: ReturnType<typeof calculatePricing>) => [
  ...r.hardware.lines,
  ...r.tools.lines,
  ...r.labor.flatMap((t) => t.lines),
  r.orr.o365,
  r.orr.datto,
];

describe("pricing engine — rounding invariants", () => {
  const r = calculatePricing({ ...DEFAULT_INPUTS, deviceMultiplier: 1.25 });

  it("every unit renders as a whole number (display-only rounding)", () => {
    for (const line of allLines(r)) {
      expect(qty(line.unit), `${line.label}`).not.toContain(".");
    }
  });

  it("device driver stays exact (25 × 1.25 = 31.25)", () => {
    expect(r.deviceCount).toBe(31.25);
  });

  it("exact unit × cost equals ext cost on hardware and tool lines", () => {
    for (const line of [...r.hardware.lines, ...r.tools.lines]) {
      near(line.unit * line.unitCost, line.extCost);
    }
  });

  it("every quoted price is a whole dollar amount", () => {
    const prices = [
      r.hardware.extPrice,
      r.hardware.monthlyPrice,
      ...r.hardware.lines.map((l) => l.extPrice),
      r.orr.o365.extPrice,
      r.orr.datto.extPrice,
      ...r.plans.flatMap((p) => [
        p.perUserPrice,
        p.mrrPrice,
        p.orrO365,
        p.orrDatto,
        p.orrHaaS,
        p.setupFee,
        p.totalMonthly,
      ]),
    ];
    for (const price of prices) expect(Number.isInteger(price)).toBe(true);
  });
});

describe("pricing engine — spreadsheet parity (costs)", () => {
  const r = calculatePricing(BASE);

  it("Co-Managed Support uses the exact quantity, not the rounded display", () => {
    const support = r.labor
      .find((t) => t.key === "coManaged")!
      .lines.find((l) => l.label.includes("Support"))!;
    expect(qty(support.unit)).toBe("5"); // shown rounded
    near(support.unit, 4.6875); // computed exact
    near(support.extCost, 173.4375); // 4.6875 × $37
  });

  it("hardware and tool costs match the spreadsheet", () => {
    near(r.hardware.extCost, 67416.5875); // D15
    near(r.hardware.monthlyCost, 1123.6097916666665); // D16
    near(r.tools.extCost, 638.75); // D34
  });

  it("labor tier totals match the spreadsheet (no travel)", () => {
    const byKey = Object.fromEntries(r.labor.map((t) => [t.key, t.monthlyCost]));
    near(byKey.coManaged, 380.7708333333334); // E40
    near(byKey.remote, 478.2083333333334); // E44
    near(byKey.standardEnterprise, 728.875); // E48
  });
});

describe("pricing engine — whole-dollar prices", () => {
  const r = calculatePricing(BASE);

  it("hardware prices", () => {
    expect(r.hardware.extPrice).toBe(105615); // sum of whole-dollar line prices
    expect(r.hardware.monthlyPrice).toBe(2112);
  });

  it("plan totals", () => {
    const byKey = Object.fromEntries(r.plans.map((p) => [p.key, p]));
    expect(byKey.coManaged.totalMonthly).toBe(3400);
    expect(byKey.remote.totalMonthly).toBe(3725);
    expect(byKey.standard.totalMonthly).toBe(4550);
    expect(byKey.enterprise.totalMonthly).toBe(6662); // includes HaaS
  });

  it("per-user price rounds near the 70% target margin", () => {
    const std = r.plans.find((p) => p.key === "standard")!;
    expect(std.perUserPrice).toBe(182);
    expect((std.perUserPrice - std.perUserCost) / std.perUserPrice).toBeCloseTo(0.7, 2);
  });

  it("only Enterprise bundles HaaS into recurring", () => {
    const byKey = Object.fromEntries(r.plans.map((p) => [p.key, p]));
    expect(byKey.enterprise.orrHaaS).toBeGreaterThan(0);
    expect(byKey.standard.orrHaaS).toBe(0);
    expect(byKey.remote.orrHaaS).toBe(0);
    expect(byKey.coManaged.orrHaaS).toBe(0);
  });
});

describe("pricing engine — interactive behaviour", () => {
  it("travel toggle raises labor cost", () => {
    const noTravel = calculatePricing({ ...DEFAULT_INPUTS, travelRequired: false });
    const travel = calculatePricing({ ...DEFAULT_INPUTS, travelRequired: true });
    const stdNo = noTravel.labor.find((t) => t.key === "standardEnterprise")!.monthlyCost;
    const stdYes = travel.labor.find((t) => t.key === "standardEnterprise")!.monthlyCost;
    expect(stdYes).toBeGreaterThan(stdNo);
  });

  it("O365 seats flow into every plan's recurring price", () => {
    const withSeats = calculatePricing({ ...BASE, o365Seats: 25 });
    expect(withSeats.orr.o365.extPrice).toBe(540); // 18 × 25 × 1.2
    for (const p of withSeats.plans) expect(p.orrO365).toBe(540);
  });

  it("Datto selection prices at the licensing multiplier (rounded)", () => {
    const withDatto = calculatePricing({ ...BASE, dattoOption: "4t" });
    expect(withDatto.orr.datto.extPrice).toBe(Math.round(581.9 * 1.42)); // 826
  });

  it("scales with users (more users => higher MRR)", () => {
    const small = calculatePricing({ ...DEFAULT_INPUTS, users: 10 });
    const big = calculatePricing({ ...DEFAULT_INPUTS, users: 100 });
    const s = small.plans.find((p) => p.key === "standard")!.mrrPrice;
    const b = big.plans.find((p) => p.key === "standard")!.mrrPrice;
    expect(b).toBeGreaterThan(s);
  });

  it("units still render whole with an odd device multiplier", () => {
    const r = calculatePricing({ ...DEFAULT_INPUTS, deviceMultiplier: 1.33, o365Seats: 7 });
    for (const line of allLines(r)) expect(qty(line.unit)).not.toContain(".");
  });

  it("handles zero users without dividing by zero", () => {
    const r = calculatePricing({ ...DEFAULT_INPUTS, users: 0 });
    for (const p of r.plans) expect(Number.isFinite(p.totalMonthly)).toBe(true);
  });
});

describe("pricing engine — HaaS unit overrides", () => {
  it("lines expose their computed default and are not overridden by default", () => {
    const r = calculatePricing(BASE);
    const pc = r.hardware.lines.find((l) => l.key === "pc")!;
    expect(pc.isOverridden).toBe(false);
    near(pc.defaultUnit!, 31.25);
    near(pc.unit, 31.25);
  });

  it("an override replaces the unit and recomputes cost/price", () => {
    const base = calculatePricing(BASE);
    const overridden = calculatePricing({ ...BASE, hardwareUnitOverrides: { pc: 40 } });
    const pc = overridden.hardware.lines.find((l) => l.key === "pc")!;
    expect(pc.isOverridden).toBe(true);
    expect(pc.unit).toBe(40);
    near(pc.extCost, 40 * 1571.84);
    // total shifts by the delta in that line's ext cost
    near(overridden.hardware.extCost - base.hardware.extCost, (40 - 31.25) * 1571.84);
  });

  it("an override of 0 zeroes the line", () => {
    const r = calculatePricing({ ...BASE, hardwareUnitOverrides: { fw: 0 } });
    const fw = r.hardware.lines.find((l) => l.key === "fw")!;
    expect(fw.isOverridden).toBe(true);
    expect(fw.unit).toBe(0);
    expect(fw.extCost).toBe(0);
  });
});
