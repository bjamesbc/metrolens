import { describe, expect, it } from 'vitest';

import { FREQUENCIES, isFrequency } from './frequency.js';

describe('isFrequency', () => {
  it.each(FREQUENCIES)('accepts %s', (frequency) => {
    expect(isFrequency(frequency)).toBe(true);
  });

  it.each(['daily', 'Monthly', '', 12, null, undefined])('rejects %j', (value) => {
    expect(isFrequency(value)).toBe(false);
  });
});
