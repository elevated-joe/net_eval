/**
 * Catalog persistence + serialization.
 *
 * The editable catalog is held in React state (see App). This module:
 *  - loads/saves a working copy to localStorage so edits survive a refresh,
 *  - deep-clones the built-in defaults,
 *  - mints stable keys for new items,
 *  - serializes a Catalog back into a committable `catalog.ts` source file.
 */
import {
  DEFAULT_CATALOG,
  type Catalog,
  type HardwareItem,
  type LaborItem,
  type ToolItem,
} from "./catalog";

const STORAGE_KEY = "pricing-cal.catalog.v1";

/** Deep clone via structured JSON — the catalog is plain data. */
export function cloneCatalog(c: Catalog): Catalog {
  return JSON.parse(JSON.stringify(c)) as Catalog;
}

export function loadCatalog(): Catalog {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneCatalog(DEFAULT_CATALOG);
    const parsed = JSON.parse(raw) as Catalog;
    // Minimal shape guard; fall back to defaults if anything is missing.
    if (!parsed.hardware || !parsed.tools || !parsed.labor) return cloneCatalog(DEFAULT_CATALOG);
    return parsed;
  } catch {
    return cloneCatalog(DEFAULT_CATALOG);
  }
}

export function saveCatalog(c: Catalog): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable (private mode / quota) — edits stay in memory */
  }
}

export function clearStoredCatalog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when the catalog differs from the built-in defaults. */
export function isModified(c: Catalog): boolean {
  return JSON.stringify(c) !== JSON.stringify(DEFAULT_CATALOG);
}

let keyCounter = 0;
/** Stable, unique key from a label slug (+ counter to avoid collisions). */
export function makeKey(label: string, existing: Set<string>): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 16) || "item";
  let key = slug;
  while (existing.has(key)) key = `${slug}${(keyCounter += 1)}`;
  return key;
}

export function blankHardware(existing: Set<string>): HardwareItem {
  return {
    key: makeKey("new", existing),
    label: "New hardware",
    cost: 0,
    unit: { base: "locations" },
    priceRule: "markup",
  };
}

export function blankTool(existing: Set<string>): ToolItem {
  return { key: makeKey("new", existing), label: "New tool", cost: 0, unit: { base: "users" } };
}

export function blankLabor(): LaborItem {
  return { label: "New role", hours: 0, rate: 0, alreadyMonthly: false };
}

// ---------------------------------------------------------------------------
// Serialization to a committable catalog.ts
// ---------------------------------------------------------------------------

const q = (s: string) => JSON.stringify(s);
const n = (x: number) => String(x);

function hardwareUnitLiteral(u: HardwareItem["unit"]): string {
  if (u.base === "fixed") return `{ base: "fixed", value: ${n(u.value)} }`;
  const factor = u.factor != null ? `, factor: ${n(u.factor)}` : "";
  return `{ base: ${q(u.base)}${factor} }`;
}

function toolUnitLiteral(u: ToolItem["unit"]): string {
  if (u.base === "fixed") return `{ base: "fixed", value: ${n(u.value)} }`;
  return `{ base: ${q(u.base)} }`;
}

function hoursLiteral(h: LaborItem["hours"]): string {
  return typeof h === "number" ? n(h) : `{ base: "devices", factor: ${n(h.factor)} }`;
}

function hardwareArray(items: HardwareItem[]): string {
  return items
    .map(
      (i) =>
        `  { key: ${q(i.key)}, label: ${q(i.label)}, cost: ${n(i.cost)}, unit: ${hardwareUnitLiteral(
          i.unit,
        )}, priceRule: ${q(i.priceRule)} },`,
    )
    .join("\n");
}

function toolArray(items: ToolItem[]): string {
  return items
    .map(
      (i) =>
        `  { key: ${q(i.key)}, label: ${q(i.label)}, cost: ${n(i.cost)}, unit: ${toolUnitLiteral(
          i.unit,
        )} },`,
    )
    .join("\n");
}

function laborItemLiteral(i: LaborItem): string {
  return `    { label: ${q(i.label)}, hours: ${hoursLiteral(i.hours)}, rate: ${n(
    i.rate,
  )}, alreadyMonthly: ${i.alreadyMonthly} },`;
}

function laborArray(tiers: Catalog["labor"]): string {
  return tiers
    .map((t) => {
      const noTravel = t.noTravel.map(laborItemLiteral).join("\n");
      const travel = t.travel.map(laborItemLiteral).join("\n");
      return [
        `  {`,
        `    key: ${q(t.key)},`,
        `    label: ${q(t.label)},`,
        `    noTravel: [`,
        noTravel,
        `    ],`,
        `    travel: [`,
        travel,
        `    ],`,
        `  },`,
      ].join("\n");
    })
    .join("\n");
}

/**
 * Emit a complete, valid catalog.ts. The types/constants/plans header is a
 * fixed template; only the three editable arrays are interpolated. Drop the
 * result into src/lib/catalog.ts and commit to make the edits permanent.
 */
export function serializeCatalogTs(c: Catalog): string {
  return `/**
 * Pricing catalog — all rates, costs and multipliers live here.
 *
 * Generated by the in-app catalog editor. Edit here or in the UI; commit this
 * file to make changes permanent. The pricing engine reads DEFAULT_CATALOG.
 */

export const CONSTANTS = {
  HARDWARE_PRICE_MULT: 1.42,
  LAB_UNIT_PRICE: 185,
  HAAS_MONTHS: 60,
  HAAS_MONTHLY_PRICE_MULT: 1.2,
  O365_PRICE_MULT: 1.2,
  DATTO_HW_PRICE_MULT: 1.25,
  DATTO_LIC_PRICE_MULT: 1.42,
  TARGET_GROSS_MARGIN: 0.7,
} as const;

export type HardwarePriceRule = "markup" | "lab";

export interface HardwareItem {
  key: string;
  label: string;
  cost: number;
  unit:
    | { base: "locations"; factor?: number }
    | { base: "devices"; factor?: number }
    | { base: "fixed"; value: number };
  priceRule: HardwarePriceRule;
}

export const HARDWARE: HardwareItem[] = [
${hardwareArray(c.hardware)}
];

export interface ToolItem {
  key: string;
  label: string;
  cost: number;
  unit: { base: "devices" } | { base: "users" } | { base: "fixed"; value: number };
}

export const TOOLS: ToolItem[] = [
${toolArray(c.tools)}
];

export interface LaborItem {
  label: string;
  hours: number | { base: "devices"; factor: number };
  rate: number;
  alreadyMonthly: boolean;
}

export interface LaborTier {
  key: "coManaged" | "remote" | "standardEnterprise";
  label: string;
  noTravel: LaborItem[];
  travel: LaborItem[];
}

export const LABOR: LaborTier[] = [
${laborArray(c.labor)}
];

export interface DattoOption {
  key: string;
  label: string;
  licCost: number;
}

export const DATTO_OPTIONS: DattoOption[] = [
  { key: "none", label: "None", licCost: 0 },
  { key: "4t", label: "Datto 4TB (ICR)", licCost: 581.9 },
  { key: "6t", label: "Datto 6TB (ICR)", licCost: 823.9 },
  { key: "8t", label: "Datto 8TB (ICR)", licCost: 955.9 },
];

export const O365_SEAT_COST = 18;

export interface PlanDef {
  key: string;
  label: string;
  laborTier: LaborTier["key"];
  includeHaaS: boolean;
}

export const PLANS: PlanDef[] = [
  { key: "coManaged", label: "Co-Managed", laborTier: "coManaged", includeHaaS: false },
  { key: "remote", label: "Remote", laborTier: "remote", includeHaaS: false },
  { key: "standard", label: "Standard", laborTier: "standardEnterprise", includeHaaS: false },
  { key: "enterprise", label: "Enterprise (HaaS)", laborTier: "standardEnterprise", includeHaaS: true },
];

export interface Catalog {
  hardware: HardwareItem[];
  tools: ToolItem[];
  labor: LaborTier[];
}

export const DEFAULT_CATALOG: Catalog = {
  hardware: HARDWARE,
  tools: TOOLS,
  labor: LABOR,
};
`;
}

/** Trigger a browser download of the given text as a file. */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
