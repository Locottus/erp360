import { BadRequestException } from '@nestjs/common';
import { buildFiscalAdapter } from './fiscal.adapters';

describe('Fiscal sandbox boundary', () => {
  it('does not report simulated results as production certification', async () => {
    await expect(buildFiscalAdapter('GT').submit({ controlNumber: 'DEMO-123' }, {
      providerCode: 'test', environment: 'production', endpointUrl: 'https://example.test', credentials: {},
    })).rejects.toThrow(BadRequestException);
  });
  it('retains explicit sandbox behavior', async () => {
    const result = await buildFiscalAdapter('SV').submit({ controlNumber: 'DEMO-123' }, {
      providerCode: 'test', environment: 'sandbox', endpointUrl: 'https://example.test', credentials: {},
    });
    expect(result.status).toBe('accepted');
    expect(result.responsePayload.environment).toBe('sandbox');
  });
});
