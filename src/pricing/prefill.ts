// Map the assessment's captured counts onto the pricing deal inputs.
//
// Kept in its own tiny module (no heavy imports) so App can seed the pricing
// inputs eagerly while the rest of the pricing tab is lazy-loaded.

import { type EvalData } from '../schema'
import { type PricingInputs } from './lib/inputs'

/** Pull the numeric field, ignoring stray non-numeric characters. */
function numField(data: EvalData, key: string): number | undefined {
  const raw = (data.fields[key] ?? '').replace(/[^0-9.]/g, '')
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : undefined
}

export function prefillFromEvalData(data: EvalData): Partial<PricingInputs> {
  const users = numField(data, 'users')
  const locations = numField(data, 'locations')
  const devices = numField(data, 'devices')
  const patch: Partial<PricingInputs> = {}
  if (users && users > 0) patch.users = users
  if (locations && locations > 0) patch.locations = locations
  if (users && users > 0 && devices && devices > 0) {
    patch.deviceMultiplier = Math.round((devices / users) * 100) / 100
  }
  return patch
}
