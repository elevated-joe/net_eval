import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG } from "./catalog";
import { calculatePricing, DEFAULT_INPUTS } from "./pricing";
import { cloneCatalog, isModified, makeKey, serializeCatalogTs } from "./catalogStore";

describe("catalog store", () => {
  it("cloneCatalog is a deep, independent copy", () => {
    const c = cloneCatalog(DEFAULT_CATALOG);
    c.hardware[0].cost = 9999;
    expect(DEFAULT_CATALOG.hardware[0].cost).not.toBe(9999);
  });

  it("isModified detects edits", () => {
    expect(isModified(cloneCatalog(DEFAULT_CATALOG))).toBe(false);
    const edited = cloneCatalog(DEFAULT_CATALOG);
    edited.tools[0].cost += 1;
    expect(isModified(edited)).toBe(true);
  });

  it("makeKey avoids collisions", () => {
    const existing = new Set(["newhardware"]);
    const key = makeKey("New Hardware", existing);
    expect(existing.has(key)).toBe(false);
    expect(key.length).toBeGreaterThan(0);
  });

  it("serializeCatalogTs emits a valid-looking catalog.ts with edits", () => {
    const c = cloneCatalog(DEFAULT_CATALOG);
    c.hardware[0].cost = 1234.56;
    const ts = serializeCatalogTs(c);
    expect(ts).toContain("cost: 1234.56");
    for (const sym of [
      "export const CONSTANTS",
      "export const HARDWARE",
      "export const TOOLS",
      "export const LABOR",
      "export const DATTO_OPTIONS",
      "export const PLANS",
      "export const DEFAULT_CATALOG",
    ]) {
      expect(ts).toContain(sym);
    }
  });
});

describe("engine honors an edited catalog", () => {
  it("raising a hardware cost raises hardware ext cost", () => {
    const base = calculatePricing(DEFAULT_INPUTS);
    const edited = cloneCatalog(DEFAULT_CATALOG);
    const fw = edited.hardware.find((h) => h.key === "fw")!;
    const delta = 1000;
    fw.cost += delta;
    const after = calculatePricing(DEFAULT_INPUTS, edited);
    // fw unit = locations = 1, so ext cost rises by exactly the delta
    expect(after.hardware.extCost - base.hardware.extCost).toBeCloseTo(delta, 4);
  });

  it("adding a tool raises the tools total", () => {
    const base = calculatePricing(DEFAULT_INPUTS);
    const edited = cloneCatalog(DEFAULT_CATALOG);
    edited.tools.push({ key: "extra", label: "Extra", cost: 5, unit: { base: "fixed", value: 2 } });
    const after = calculatePricing(DEFAULT_INPUTS, edited);
    expect(after.tools.extCost - base.tools.extCost).toBeCloseTo(10, 4); // 5 × 2
  });

  it("removing all tools zeroes the tools total", () => {
    const edited = cloneCatalog(DEFAULT_CATALOG);
    edited.tools = [];
    const after = calculatePricing(DEFAULT_INPUTS, edited);
    expect(after.tools.extCost).toBe(0);
  });
});
