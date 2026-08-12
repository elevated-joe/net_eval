/**
 * Temporary UI feature flags.
 *
 * Flip `orr` back to `true` to re-enable the O365 seats + Datto backup inputs
 * and the "O365 / Datto (ORR)" breakdown section. The pricing engine still
 * supports them fully — this only controls their visibility.
 */
export const FEATURES = {
  orr: false,
} as const;
