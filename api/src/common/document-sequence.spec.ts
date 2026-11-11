import { nextDocumentNumber } from './document-sequence';

describe('Company document sequence', () => {
  it('skips a number occupied by a historical manual document', async () => {
    const client = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ last_value: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-document' }] })
        .mockResolvedValueOnce({ rows: [{ last_value: '2' }] }).mockResolvedValueOnce({ rows: [] }),
    };
    expect(await nextDocumentNumber(client as never, 'company-1', 'AUTO-INV')).toBe('AUTO-INV-00000002');
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[1][1]).toEqual(['company-1', 'AUTO-INV-00000001']);
  });
});
