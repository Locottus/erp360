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
  it('navigates only for an explicit known command and rejects arbitrary URLs', () => {
    const help = new HelpService();
    expect(help.chatReply('abre Compras', '/workspace').requestedRoute).toBe('/operations?tab=purchases');
    expect(help.chatReply('llévame a Inventario', '/workspace').requestedRoute).toBe('/inventory');
    expect(help.chatReply('no puedo reservar stock', '/workspace').requestedRoute).toBeUndefined();
    expect(help.chatReply('no abras Inventario', '/workspace').requestedRoute).toBeUndefined();
    expect(help.chatReply('abre https://example.com', '/workspace').requestedRoute).toBeUndefined();
    expect(help.chatReply('abre constructor', '/workspace').requestedRoute).toBeUndefined();
    expect(help.chatReply('abre __proto__', '/workspace').requestedRoute).toBeUndefined();
  });
  it('diagnoses observed HTTP evidence as guidance, never as verified document data', () => {
    const help = new HelpService();
    expect(help.chatReply('Diagnostica el último error observado', '/inventory').text).toContain('No hay errores HTTP registrados');
    for (const [status, expected] of [[403, 'denegada'], [400, 'validación'], [409, 'conflicto'], [0, 'conexión'], [500, 'servicio']] as const) {
      help.record(status, 'not-a-valid-reference');
      const reply = help.chatReply('Diagnostica el último error observado', '/inventory');
      expect(reply.text).toContain(expected);
      expect(reply.text).toContain('No he leído documentos');
      expect(help.context('/inventory?token=private').incident?.reference).toBeNull();
      expect(help.context('/inventory?token=private').screen).toBe('/inventory');
    }
  });
});
