/**
 * Pricing engine.
 *
 * Pure functions: given the deal inputs, produce every line item, section
 * subtotal, and per-plan monthly price. No React, no side effects — this is
 * the piece you unit-test and reuse (API, CLI, exports, etc.).
 */
import {
  CONSTANTS,
  DATTO_OPTIONS,
  DEFAULT_CATALOG,
  O365_SEAT_COST,
  PLANS,
  type Catalog,
  type HardwareItem,
  type LaborItem,
  type LaborTier,
  type ToolItem,
} from "./catalog";

// Input shape + defaults live in a dependency-free module so they can be
// imported without pulling in the engine/catalog; re-exported here so existing
// `from "./pricing"` imports keep working.
export { DEFAULT_INPUTS, type PricingInputs } from "./inputs";
import { type PricingInputs } from "./inputs";

export interface LineItem {
  label: string;
  unit: number;
  unitCost: number;
  extCost: number;
  extPrice: number;
  /** Gross margin on this line (0..1), or null when price is 0. */
  gm: number | null;
  /** Stable id for editable lines (hardware); enables manual unit overrides. */
  key?: string;
  /** The computed default unit before any manual override. */
  defaultUnit?: number;
  /** True when `unit` came from a manual override rather than the default. */
  isOverridden?: boolean;
}

export interface Section {
  lines: LineItem[];
  extCost: number;
  extPrice: number;
}

export interface HaaSResult extends Section {
  /** Amortized monthly cost (extCost / 60). */
  monthlyCost: number;
  /** Amortized monthly price ((extPrice / 60) * 1.2). */
  monthlyPrice: number;
}

export interface LaborTierResult {
  key: LaborTier["key"];
  label: string;
  lines: LineItem[];
  /** Total monthly labor cost for the tier. */
  monthlyCost: number;
}

export interface PlanResult {
  key: string;
  label: string;
  perUserCost: number;
  perUserPrice: number;
  mrrCost: number;
  mrrPrice: number;
  grossMargin: number;
  orrO365: number;
  orrDatto: number;
  orrHaaS: number;
  /** One-time setup fee (mirrors spreadsheet: equals first Total Monthly). */
  setupFee: number;
  totalMonthly: number;
}

export interface PricingResult {
  inputs: PricingInputs;
  /** users * deviceMultiplier — the "device count" driver. */
  deviceCount: number;
  hardware: HaaSResult;
  tools: Section;
  labor: LaborTierResult[];
  orr: {
    o365: LineItem;
    datto: LineItem;
  };
  plans: PlanResult[];
}

const gm = (extCost: number, extPrice: number): number | null =>
  extPrice === 0 ? null : (extPrice - extCost) / extPrice;

/**
 * Quoted prices are rounded to the nearest whole dollar. Quantities and costs
 * stay exact — units are only rounded for display (see `qty` in format.ts),
 * matching the source spreadsheet, which shows e.g. "5" support units but
 * multiplies by the exact 4.6875.
 */
const roundPrice = (n: number): number => Math.round(n);

function hardwareUnitCount(item: HardwareItem, deviceCount: number, locations: number): number {
  switch (item.unit.base) {
    case "locations":
      return locations * (item.unit.factor ?? 1);
    case "devices":
      return deviceCount * (item.unit.factor ?? 1);
    case "fixed":
      return item.unit.value;
  }
}

function computeHardware(
  hardware: HardwareItem[],
  deviceCount: number,
  locations: number,
  overrides: Record<string, number>,
): HaaSResult {
  const lines: LineItem[] = hardware.map((item) => {
    const defaultUnit = hardwareUnitCount(item, deviceCount, locations);
    const override = overrides[item.key];
    const isOverridden = typeof override === "number" && Number.isFinite(override);
    const unit = isOverridden ? override : defaultUnit;
    const extCost = item.cost * unit;
    const extPrice = roundPrice(
      item.priceRule === "lab"
        ? unit * CONSTANTS.LAB_UNIT_PRICE
        : extCost * CONSTANTS.HARDWARE_PRICE_MULT,
    );
    return {
      label: item.label,
      unit,
      unitCost: item.cost,
      extCost,
      extPrice,
      gm: gm(extCost, extPrice),
      key: item.key,
      defaultUnit,
      isOverridden,
    };
  });
  const extCost = sum(lines.map((l) => l.extCost));
  const extPrice = sum(lines.map((l) => l.extPrice));
  return {
    lines,
    extCost,
    extPrice,
    monthlyCost: extCost / CONSTANTS.HAAS_MONTHS,
    monthlyPrice: roundPrice((extPrice / CONSTANTS.HAAS_MONTHS) * CONSTANTS.HAAS_MONTHLY_PRICE_MULT),
  };
}

function computeTools(tools: ToolItem[], inputs: PricingInputs, deviceCount: number): Section {
  const lines: LineItem[] = tools.map((item) => {
    let unit: number;
    switch (item.unit.base) {
      case "devices":
        unit = deviceCount;
        break;
      case "users":
        unit = inputs.users;
        break;
      case "fixed":
        unit = item.unit.value;
        break;
    }
    const extCost = item.cost * unit;
    // Tools are internal cost inputs; price is set later via target margin.
    return { label: item.label, unit, unitCost: item.cost, extCost, extPrice: extCost, gm: null };
  });
  const extCost = sum(lines.map((l) => l.extCost));
  return { lines, extCost, extPrice: extCost };
}

function laborLineMonthly(item: LaborItem, deviceCount: number): LineItem {
  const hours = typeof item.hours === "number" ? item.hours : deviceCount * item.hours.factor;
  const monthly = item.alreadyMonthly ? item.rate * hours : (item.rate * hours) / 12;
  return {
    label: item.label,
    unit: hours,
    unitCost: item.rate,
    extCost: monthly,
    extPrice: monthly,
    gm: null,
  };
}

function computeLabor(
  labor: LaborTier[],
  travelRequired: boolean,
  deviceCount: number,
): LaborTierResult[] {
  return labor.map((tier) => {
    const items = travelRequired ? tier.travel : tier.noTravel;
    const lines = items.map((i) => laborLineMonthly(i, deviceCount));
    return {
      key: tier.key,
      label: tier.label,
      lines,
      monthlyCost: sum(lines.map((l) => l.extCost)),
    };
  });
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function calculatePricing(
  inputs: PricingInputs,
  catalog: Catalog = DEFAULT_CATALOG,
): PricingResult {
  // Exact device count (users × multiplier). Rounded only for display.
  const deviceCount = inputs.users * inputs.deviceMultiplier;

  const hardware = computeHardware(
    catalog.hardware,
    deviceCount,
    inputs.locations,
    inputs.hardwareUnitOverrides,
  );
  const tools = computeTools(catalog.tools, inputs, deviceCount);
  const labor = computeLabor(catalog.labor, inputs.travelRequired, deviceCount);

  // --- ORR: O365 + Datto ---
  const o365Seats = inputs.o365Seats;
  const o365ExtCost = O365_SEAT_COST * o365Seats;
  const o365ExtPrice = roundPrice(o365ExtCost * CONSTANTS.O365_PRICE_MULT);
  const o365: LineItem = {
    label: "Office e3 Seat + Teams",
    unit: o365Seats,
    unitCost: O365_SEAT_COST,
    extCost: o365ExtCost,
    extPrice: o365ExtPrice,
    gm: gm(o365ExtCost, o365ExtPrice),
  };

  const dattoOpt = DATTO_OPTIONS.find((d) => d.key === inputs.dattoOption) ?? DATTO_OPTIONS[0];
  const dattoExtPrice = roundPrice(dattoOpt.licCost * CONSTANTS.DATTO_LIC_PRICE_MULT);
  const datto: LineItem = {
    label: `Datto LIC — ${dattoOpt.label}`,
    unit: dattoOpt.licCost === 0 ? 0 : 1,
    unitCost: dattoOpt.licCost,
    extCost: dattoOpt.licCost,
    extPrice: dattoExtPrice,
    gm: gm(dattoOpt.licCost, dattoExtPrice),
  };

  const laborByTier = new Map(labor.map((t) => [t.key, t]));
  const toolsMonthly = tools.extCost;

  const plans: PlanResult[] = PLANS.map((plan) => {
    const laborMonthly = laborByTier.get(plan.laborTier)!.monthlyCost;
    // Per-user cost = (managed tools + labor) spread across users.
    const perUserCost = inputs.users > 0 ? (toolsMonthly + laborMonthly) / inputs.users : 0;
    // Quoted prices round to whole dollars; MRR derives from the rounded
    // per-user price so the card's "per user × users" stays consistent.
    const perUserPrice = roundPrice(perUserCost / (1 - CONSTANTS.TARGET_GROSS_MARGIN));
    const mrrCost = perUserCost * inputs.users;
    const mrrPrice = roundPrice(perUserPrice * inputs.users);
    const orrHaaS = plan.includeHaaS ? hardware.monthlyPrice : 0;
    const totalMonthly = o365.extPrice + mrrPrice + orrHaaS + datto.extPrice;
    return {
      key: plan.key,
      label: plan.label,
      perUserCost,
      perUserPrice,
      mrrCost,
      mrrPrice,
      grossMargin: CONSTANTS.TARGET_GROSS_MARGIN,
      orrO365: o365.extPrice,
      orrDatto: datto.extPrice,
      orrHaaS,
      setupFee: totalMonthly,
      totalMonthly,
    };
  });

  return { inputs, deviceCount, hardware, tools, labor, orr: { o365, datto }, plans };
}
