import { describe, expect, it } from 'vitest';

import { summarizeBulkOutcomes } from './bulk-operation';

describe('bulk operation outcomes', () => {
  it('keeps partial results explicit instead of collapsing them to success', () => {
    expect(summarizeBulkOutcomes([
      { path: 'one', status: 'succeeded', version: 2 },
      { path: 'two', status: 'denied' },
      { path: 'three', status: 'failed', message: 'Safe failure' },
      { path: 'four', status: 'missing' },
    ])).toEqual({
      total: 4,
      succeeded: 1,
      denied: 1,
      missing: 1,
      failed: 1,
    });
  });
});
