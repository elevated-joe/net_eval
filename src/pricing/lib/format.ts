const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Currency. Whole amounts render without cents ($4,500) — prices are rounded to
 * whole dollars — while fractional amounts (costs) keep cents ($1,571.84).
 */
export const money = (n: number): string => (Number.isInteger(n) ? usd0.format(n) : usd.format(n));

/** Currency, whole dollars, e.g. $1,124 */
export const money0 = (n: number): string => usd0.format(n);

/** Percentage from a 0..1 ratio, e.g. 0.7 -> "70.0%" */
export const percent = (n: number | null): string =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;

/**
 * Unit counts, rounded to a whole number for display, e.g. 4.6875 -> "5".
 * The underlying value stays exact in the math (matching the spreadsheet,
 * which shows a rounded unit but multiplies by the precise quantity).
 */
export const qty = (n: number): string => String(Math.round(n));
