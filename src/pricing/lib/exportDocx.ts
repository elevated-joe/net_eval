/**
 * Support-plan .docx export.
 *
 * Takes the bundled Elevated MSP template and produces a client-tailored copy:
 *  - fills {CLIENT NAME}/{SALES REP}/… placeholders (handling Word's habit of
 *    splitting a placeholder across several runs),
 *  - fills the pricing table by column position (robust to the template's
 *    duplicate {MRR PRICE COMANGE} tag),
 *  - removes the CO-MANAGED/REMOTE/STANDARD/ENTERPRISE columns for any plans
 *    the user didn't select, adjusting gridSpan + column widths.
 *
 * Pure DOM/zip work — no server, runs in the browser.
 */
import JSZip from "jszip";
import templateUrl from "../assets/support_plan_template.docx?url";
import { money } from "./format";
import type { PlanResult } from "./pricing";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** The four plan columns, in template order (col 1..4). */
export const PLAN_COLUMNS = [
  { key: "coManaged", header: "CO-MANAGED", label: "Co-Managed" },
  { key: "remote", header: "REMOTE", label: "Remote" },
  { key: "standard", header: "STANDARD", label: "Standard" },
  { key: "enterprise", header: "ENTERPRISE", label: "Enterprise" },
] as const;

export interface ExportMeta {
  clientName: string;
  clientContact: string;
  /** Street line of the address (line 1). */
  addressStreet: string;
  /** City, State ZIP (line 2). */
  addressCityStateZip: string;
  contactTitle: string;
  dateOfMeeting: string; // yyyy-mm-dd
  salesRep: string;
  /** Plan keys to include (others' columns are removed). */
  selectedPlans: string[];
}

const els = (parent: Element | Document, tag: string): Element[] =>
  Array.from(parent.getElementsByTagNameNS(W, tag));

/** Concatenated text of every w:t under a node. */
const textOf = (node: Element): string =>
  els(node, "t")
    .map((t) => t.textContent ?? "")
    .join("");

/**
 * Set a node's text to `value` by writing it into the first w:t and clearing
 * the rest — this collapses a run-split placeholder into one value while
 * keeping the first run's formatting.
 */
function setNodeText(node: Element, value: string): void {
  const ts = els(node, "t");
  if (ts.length === 0) return;
  ts[0].textContent = value;
  ts[0].setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  for (let i = 1; i < ts.length; i++) ts[i].textContent = "";
}

const XML_SPACE = "http://www.w3.org/XML/1998/namespace";

/** Set a run's textual content, turning "\n" into real line breaks (w:br),
 *  keeping the run's own formatting (rPr) — so an underlined/bold placeholder
 *  run stays underlined/bold. */
function setRunText(doc: Document, run: Element, text: string): void {
  for (const child of Array.from(run.childNodes)) {
    const name = (child as Element).localName;
    if (name === "t" || name === "br") run.removeChild(child);
  }
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) run.appendChild(doc.createElementNS(W, "w:br"));
    const t = doc.createElementNS(W, "w:t");
    t.setAttributeNS(XML_SPACE, "xml:space", "preserve");
    t.textContent = line;
    run.appendChild(t);
  });
}

/**
 * Replace {TAG} placeholders at the RUN level. A placeholder value is written
 * into the first run it spans (preserving that run's formatting) and the other
 * spanning runs are cleared. This keeps the template's per-run bold/underline
 * on the inserted value, and supports multi-line values via "\n".
 */
function replacePlaceholders(doc: Document, map: Record<string, string>): void {
  for (const p of els(doc, "p")) {
    const runs = els(p, "r").filter((r) => els(r, "t").length > 0);
    if (runs.length === 0) continue;

    const texts = runs.map((r) => textOf(r));
    const combined = texts.join("");
    if (!combined.includes("{")) continue;

    // char ranges per run
    const ranges: Array<[number, number]> = [];
    let acc = 0;
    for (const t of texts) {
      ranges.push([acc, acc + t.length]);
      acc += t.length;
    }

    const matches: Array<{ start: number; end: number; value: string }> = [];
    const re = /\{([^{}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(combined))) {
      const key = m[1].trim().toUpperCase();
      if (key in map) matches.push({ start: m.index, end: m.index + m[0].length, value: map[key] });
    }
    if (matches.length === 0) continue;

    // Right-to-left so earlier ranges stay valid as we mutate.
    for (let mi = matches.length - 1; mi >= 0; mi--) {
      const { start, end, value } = matches[mi];
      const spanning: number[] = [];
      for (let i = 0; i < runs.length; i++) {
        if (ranges[i][1] > start && ranges[i][0] < end) spanning.push(i);
      }
      const first = spanning[0];
      const last = spanning[spanning.length - 1];
      const prefix = texts[first].slice(0, start - ranges[first][0]);
      const suffix = texts[last].slice(end - ranges[last][0]);
      if (first === last) {
        setRunText(doc, runs[first], prefix + value + suffix);
      } else {
        setRunText(doc, runs[first], prefix + value);
        for (let i = first + 1; i < last; i++) setRunText(doc, runs[i], "");
        setRunText(doc, runs[last], suffix);
      }
    }
  }
}

const isPlanTable = (table: Element): boolean => {
  const firstRow = els(table, "tr")[0];
  if (!firstRow) return false;
  return els(firstRow, "tc").some((tc) => textOf(tc).trim().toUpperCase() === "CO-MANAGED");
};

/** Cells that are direct columns of this row (span-1). Section headers span all. */
function rowCells(row: Element): Element[] {
  return els(row, "tc");
}

function gridSpan(tc: Element): number {
  const gs = els(tc, "gridSpan")[0];
  return gs ? parseInt(gs.getAttribute("w:val") || gs.getAttributeNS(W, "val") || "1", 10) || 1 : 1;
}

function setGridSpan(tc: Element, val: number): void {
  const gs = els(tc, "gridSpan")[0];
  if (gs) gs.setAttributeNS(W, "w:val", String(val));
}

/** Fill the pricing table's plan columns from computed results, by position. */
function fillPricingTable(table: Element, plansByKey: Map<string, PlanResult>): void {
  for (const row of els(table, "tr")) {
    const cells = rowCells(row);
    if (cells.length < 5) continue; // skip section headers
    const label = textOf(cells[0]).toLowerCase();
    let metric: keyof PlanResult | null = null;
    if (label.includes("pricing is based")) metric = "perUserPrice";
    else if (label.includes("monthly peace of mind")) metric = "mrrPrice";
    else if (label.includes("hardware as a service")) metric = "orrHaaS";
    else if (label.includes("monthly total")) metric = "totalMonthly";
    else if (label.includes("setup fees")) metric = "totalMonthly";
    if (!metric) continue;

    PLAN_COLUMNS.forEach((col, i) => {
      const cell = cells[i + 1];
      if (!cell || !textOf(cell).includes("{")) return; // leave literals like "N/A"
      const plan = plansByKey.get(col.key);
      const v = plan ? (plan[metric] as number) : 0;
      setNodeText(cell, money(v));
    });
  }
}

/** Remove the given column indices (1..4) from a 5-column plan table. */
function removeColumns(table: Element, removeIdx: number[]): void {
  if (removeIdx.length === 0) return;
  const removeSet = new Set(removeIdx);
  const desc = [...removeIdx].sort((a, b) => b - a); // high → low

  // Grid: rescale remaining widths to preserve total table width.
  const grid = els(table, "tblGrid")[0];
  const cols = grid ? els(grid, "gridCol") : [];
  const widths = cols.map((c) => parseInt(c.getAttribute("w:w") || c.getAttributeNS(W, "w") || "0", 10));
  const total = widths.reduce((a, b) => a + b, 0);
  const removedW = widths.filter((_, i) => removeSet.has(i)).reduce((a, b) => a + b, 0);
  const factor = total > removedW ? total / (total - removedW) : 1;

  for (const row of els(table, "tr")) {
    const cells = rowCells(row);
    if (cells.length === 1 && gridSpan(cells[0]) > 1) {
      // Full-width section header: shrink its span and keep full width.
      setGridSpan(cells[0], gridSpan(cells[0]) - removeIdx.length);
      const w = els(cells[0], "tcW")[0];
      if (w) w.setAttributeNS(W, "w:w", String(total));
      continue;
    }
    // Normal row: drop the removed cells, rescale the survivors' widths.
    desc.forEach((idx) => {
      if (cells[idx]) cells[idx].parentNode?.removeChild(cells[idx]);
    });
    for (const tc of rowCells(row)) {
      const w = els(tc, "tcW")[0];
      if (w) {
        const cur = parseInt(w.getAttribute("w:w") || w.getAttributeNS(W, "w") || "0", 10);
        w.setAttributeNS(W, "w:w", String(Math.round(cur * factor)));
      }
    }
  }

  desc.forEach((idx) => {
    if (cols[idx]) cols[idx].parentNode?.removeChild(cols[idx]);
  });
  for (const c of grid ? els(grid, "gridCol") : []) {
    const cur = parseInt(c.getAttribute("w:w") || c.getAttributeNS(W, "w") || "0", 10);
    c.setAttributeNS(W, "w:w", String(Math.round(cur * factor)));
  }
}

/** Prepend an empty ballot box (☐) to a cell's first text run, keeping the
 *  cell's own formatting so the box matches the header style. */
function prependCheckbox(tc: Element): void {
  const t = els(tc, "t")[0];
  if (t && !(t.textContent ?? "").startsWith("☐")) {
    t.textContent = `☐ ${t.textContent ?? ""}`;
  }
}

/**
 * Add the two top-level selection checkboxes for the PDF, so the recipient can
 * tick one: "☐ PEACE OF MIND" on the pricing table header and "☐ TIME AND
 * MATERIALS" on the T&M header. The pricing table is the plan table that has
 * an "Initial Plan selection" row.
 */
function addSelectionCheckboxes(doc: Document): void {
  for (const table of els(doc, "tbl")) {
    if (isPlanTable(table)) {
      const rows = els(table, "tr");
      const isPricing = rows.some((r) => {
        const c0 = rowCells(r)[0];
        return c0 && textOf(c0).toLowerCase().includes("initial plan selection");
      });
      if (isPricing) prependCheckbox(rowCells(rows[0])[0]); // "☐ PEACE OF MIND"
    } else {
      const first = els(table, "tc")[0];
      if (first && textOf(first).trim().toUpperCase().startsWith("TIME AND MATERIALS")) {
        prependCheckbox(first); // "☐ TIME AND MATERIALS"
      }
    }
  }
}

function formatDate(yyyyMmDd: string): string {
  if (!yyyyMmDd) return "";
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(d);
}

export async function generateSupportPlan(
  meta: ExportMeta,
  plans: PlanResult[],
  users: number,
): Promise<Blob> {
  const buf = await (await fetch(templateUrl)).arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  const plansByKey = new Map(plans.map((p) => [p.key, p]));

  // 1) Fill the pricing table by column position (before any column removal).
  for (const table of els(doc, "tbl")) {
    if (isPlanTable(table) && els(table, "tr").some((r) => textOf(r).includes("{PER USER PRICE"))) {
      fillPricingTable(table, plansByKey);
    }
  }

  // 2) Fill the remaining {TAG} placeholders (client info, users, date, rep).
  // Address on two lines: street, then City, State ZIP.
  const address = [meta.addressStreet, meta.addressCityStateZip].filter((s) => s.trim()).join("\n");
  replacePlaceholders(doc, {
    "CLIENT NAME": meta.clientName,
    "CLIENT CONTACT": meta.clientContact,
    "CLIENT ADDRESS": address,
    "CLIENT TITLE": meta.contactTitle,
    "DATE OF MEETING": formatDate(meta.dateOfMeeting),
    "SALES REP": meta.salesRep,
    "NUMBER OF USERS": String(users),
  });

  // 3) Add POM/T&M selection checkboxes (before column removal).
  addSelectionCheckboxes(doc);

  // 4) Remove unselected plan columns from every plan table.
  const removeIdx = PLAN_COLUMNS.map((c, i) => (meta.selectedPlans.includes(c.key) ? -1 : i + 1)).filter(
    (i) => i > 0,
  );
  if (removeIdx.length > 0 && removeIdx.length < 4) {
    for (const table of els(doc, "tbl")) {
      if (isPlanTable(table)) removeColumns(table, removeIdx);
    }
  }

  const out = new XMLSerializer().serializeToString(doc);
  zip.file("word/document.xml", out);

  // Drop directory entries so the archive matches a clean .docx (readers ignore
  // them, but this keeps the structure identical to the source file).
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) delete zip.files[name];
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
