import { BadRequestException } from '@nestjs/common';
import { parseModulePrices } from './saas-inputs';

describe('SaaS commercial dependencies', () => {
  it('rejects store contracts missing either sales or inventory', () => {
    for (const extra of [[], ['sales'], ['inventory']]) {
      expect(() => parseModulePrices([
        { code: 'base', price: '29' },
        { code: 'store', price: '25' },
        ...extra.map(code => ({ code, price: '15' })),
      ])).toThrow(BadRequestException);
    }
  });

  it('accepts a complete store bundle without rounding contract prices', () => {
    const modules = parseModulePrices([
      { code: 'store', price: '25.0001' },
      { code: 'inventory', price: '15' },
      { code: 'base', price: '29' },
      { code: 'sales', price: '15' },
    ]);
    expect(modules.map(row => row.code)).toEqual(['base', 'sales', 'inventory', 'store']);
    expect(modules[3].price).toBe('25.0001');
  });
});
