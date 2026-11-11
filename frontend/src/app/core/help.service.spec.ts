import { HelpService } from './help.service';

describe('Local assistance mock', () => {
  it('labels replies and never echoes submitted credentials or performs actions', () => {
    const help = new HelpService();
    const response = help.mockReply('mi token secreto-no-compartir no funciona', '/users');
    expect(response).toContain('MOCK local');
    expect(response).toContain('No compartas credenciales');
    expect(response).not.toContain('secreto-no-compartir');
    expect(help.incident()).toBeNull();
  });
  it('guides stock and permissions without bypassing business rules', () => {
    const help = new HelpService();
    expect(help.mockReply('stock', '/inventory')).toContain('MAIN');
    expect(help.mockReply('403 permisos', '/users')).toContain('no cambia roles');
    expect(help.mockReply('cómo uso esto', '/controls')).toContain('pagos y reembolsos realmente ejecutados');
  });
});
