import { validateMaster } from './master-input';

describe('Shared master input normalization', () => {
  it('normalizes text and email consistently and preserves explicit inactive state', () => {
    expect(validateMaster('customers', { code: ' C-1 ', name: ' Customer ', email: ' Demo@Example.Test ', isActive: false }))
      .toMatchObject({ code: 'C-1', name: 'Customer', email: 'demo@example.test', taxId: null, isActive: false });
  });
  it('rejects invalid numbers and unrecognized catalog identifiers', () => {
    expect(() => validateMaster('products', { sku: 'A', name: 'Product', unitPrice: Number.NaN })).toThrow();
    expect(() => validateMaster('products', { sku: 'A', name: 'Product', unitPrice: 1.00001 })).toThrow();
    expect(() => validateMaster('arbitrary_table', {})).toThrow();
  });
});
