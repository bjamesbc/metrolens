/**
 * How often a metric is published. Sources differ (FHFA house prices are
 * quarterly, BLS unemployment is monthly), so every metric declares its
 * frequency and nothing in the system assumes a default.
 */
export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'annual'] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export function isFrequency(value: unknown): value is Frequency {
  return typeof value === 'string' && (FREQUENCIES as readonly string[]).includes(value);
}
