// Pricing deal inputs — the type and defaults.
//
// Split out from the engine (pricing.ts) so callers that only need the input
// shape/defaults (e.g. seeding state, the assessment prefill) don't pull in the
// engine and the full catalog. pricing.ts re-exports these for convenience.

export interface PricingInputs {
  /** Number of users / seats. */
  users: number
  /** Number of physical locations / sites. */
  locations: number
  /** Whether on-site travel labor applies. */
  travelRequired: boolean
  /** Devices per user (e.g. 1.25 => some users have a second machine). */
  deviceMultiplier: number
  /** O365 E3 + Teams seats to include (0 = none). */
  o365Seats: number
  /** Selected Datto backup option key (see DATTO_OPTIONS). */
  dattoOption: string
  /**
   * Manual unit overrides for HaaS hardware lines, keyed by hardware item key
   * (see HARDWARE in catalog.ts). When a key is present, its value replaces the
   * computed default unit count for that line. Absent keys use the default.
   */
  hardwareUnitOverrides: Record<string, number>
}

export const DEFAULT_INPUTS: PricingInputs = {
  users: 25,
  locations: 1,
  travelRequired: false,
  deviceMultiplier: 1.25,
  o365Seats: 0,
  dattoOption: 'none',
  hardwareUnitOverrides: {},
}
