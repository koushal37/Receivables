import { describe, it, expect } from 'vitest';
import { assertInvoiceInBusiness } from '../src/middleware/auth.js';

describe('Tenant Isolation Unit Verification', () => {
  it('throws 404 when querying an invoice outside caller business scope', async () => {
    const foreignInvoiceId = '11111111-1111-1111-1111-111111111111';
    const callerBusinessId = '99999999-9999-9999-9999-999999999999';

    await expect(assertInvoiceInBusiness(foreignInvoiceId, callerBusinessId)).rejects.toThrow(
      'Invoice not found in the authenticated business scope'
    );
  });
});

