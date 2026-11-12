import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { AssistantChatComponent } from './assistant-chat.component';
import { AuthUser, SessionService } from './core/session.service';
import { HelpService } from './core/help.service';
import { HttpErrorResponse } from '@angular/common/http';
import { AssistantApiService, type AiReply, type AiUsage, type DiagnosticReport } from './core/assistant-api.service';

describe('Local contextual assistant chat', () => {
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let router: Router;
  let help: HelpService;
  let api: { usage: jasmine.Spy; chat: jasmine.Spy; diagnose: jasmine.Spy };
  const report: DiagnosticReport = { target: { kind: 'screen', screen: '/inventory' }, capturedAt: '2026-11-11T00:00:00Z', readOnly: true,
    evidence: [{ id: 'E1', source: 'Stock verificado', facts: { invalidBalances: 1 } }],
    findings: [{ code: 'review', severity: 'warning', title: 'Revisa el saldo.', recommendation: 'Concilia el kardex.',
      evidenceIds: ['E1'], route: '/inventory' }], limitations: ['No se ejecutaron cambios.'] };
  const meter: AiUsage = { month: '2026-11-01', includedTokens: 10000, extraTokens: 0, limitTokens: 10000,
    promptTokens: 0, completionTokens: 0, usedTokens: 0, reservedTokens: 0, availableTokens: 10000,
    enabled: true, provider: 'deepseek', model: 'deepseek-flash',
    service: { code: 'test', name: 'Test AI service', maxOutputTokens: 128 }, blockReason: null };
  const targets = [
    { route: '/', label: 'Inicio' }, { route: '/login', label: 'Acceso' },
    { route: '/inventory', label: 'Inventario' }, { route: '/operations', label: 'Operaciones' },
    { route: '/processes', label: 'Procesos' },
  ];
  beforeEach(() => {
    user = signal<AuthUser | null>({ id: 'demo', fullName: 'Demo', email: 'demo@example.test', companyId: 'c', roles: ['admin'] });
    api = { usage: jasmine.createSpy('usage').and.resolveTo(meter), diagnose: jasmine.createSpy('diagnose').and.resolveTo(report),
      chat: jasmine.createSpy('chat').and.resolveTo({ text: 'Respuesta de IA sintética.', provider: 'deepseek', usage: meter, truncated: false }) };
    TestBed.configureTestingModule({ imports: [AssistantChatComponent], providers: [
      provideRouter([]),
      { provide: SessionService, useValue: { user, isAuthenticated: computed(() => Boolean(user())) } },
      { provide: AssistantApiService, useValue: api },
    ] });
    router = TestBed.inject(Router); help = TestBed.inject(HelpService);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
  });
  function setup() {
    const fixture = TestBed.createComponent(AssistantChatComponent);
    fixture.componentRef.setInput('destinations', targets); fixture.detectChanges();
    fixture.componentInstance.open(); fixture.detectChanges();
    return fixture;
  }

  it('keeps a conversation when minimized and suggests navigation without executing it', async () => {
    const fixture = setup(); const component = fixture.componentInstance;
    component.draft = 'No puedo reservar stock'; await component.send(); fixture.detectChanges();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(component.messages().at(-1)?.text).toContain('MOCK local');
    expect(component.messages().at(-1)?.links).toEqual([{ route: '/inventory', label: 'Inventario' }]);
    component.close(); fixture.detectChanges(); component.open(); fixture.detectChanges();
    expect(component.messages()).toHaveSize(3);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.chat-links button')!;
    button.click(); await fixture.whenStable();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/inventory');
  });

  it('opens a screen on an explicit command and does not follow a URL or negated command', async () => {
    const component = setup().componentInstance;
    component.draft = 'abre Compras'; await component.send();
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/operations?tab=purchases');
    component.draft = 'abre https://example.com'; await component.send();
    component.draft = 'no abras Inventario'; await component.send();
    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
  });

  it('filters unavailable actions and refuses navigation without a session or required destination', async () => {
    const fixture = setup(); const component = fixture.componentInstance;
    component.draft = 'abre Usuarios'; await component.send();
    expect(component.error()).toContain('no está disponible');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    user.set(null); fixture.detectChanges();
    component.draft = 'abre Inventario'; await component.send();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    component.draft = 'stock'; await component.send();
    expect(component.messages().at(-1)?.links).toEqual([]);
    component.draft = 'abre Acceso'; await component.send();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('clears conversation, draft and diagnostic context when changing tenant', async () => {
    const fixture = setup(); const component = fixture.componentInstance;
    help.record(409, null); component.diagnose();
    component.draft = 'old draft'; component.showContext.set(true);
    user.update(value => value ? { ...value, companyId: 'other' } : null); fixture.detectChanges();
    expect(component.messages()).toHaveSize(1);
    expect(component.draft).toBe('');
    expect(component.showContext()).toBeFalse();
    expect(help.incident()).toBeNull();
  });

  it('omits possible credentials from history and surfaces cancelled navigation', async () => {
    const component = setup().componentInstance;
    component.draft = 'mi token secret-do-not-retain falla'; await component.send();
    expect(JSON.stringify(component.messages())).not.toContain('secret-do-not-retain');
    (router.navigateByUrl as jasmine.Spy).and.resolveTo(false);
    component.draft = 'abre Inventario'; await component.send();
    expect(component.error()).toContain('No se pudo abrir');
    expect(component.navigating()).toBeFalse();
    expect(component.messages().at(-1)?.text).not.toContain('Pantalla abierta');
  });
  it('discards pending navigation feedback after logout and remains usable', async () => {
    const fixture = setup(); const component = fixture.componentInstance;
    let complete!: (success: boolean) => void;
    (router.navigateByUrl as jasmine.Spy).and.returnValue(new Promise<boolean>(resolve => { complete = resolve; }));
    component.draft = 'abre Inventario';
    const pending = component.send();
    user.set(null); fixture.detectChanges();
    complete(true); await pending;
    expect(component.messages()).toHaveSize(1);
    expect(component.navigating()).toBeFalse();
    expect(component.error()).toBe('');
    component.draft = 'Consulta de uso'; await component.send();
    expect(component.messages()).toHaveSize(3);
  });
  it('uses the selected provider only with consent; quota errors are visible without a mock fallback', async () => {
    const fixture = setup(); await fixture.whenStable();
    const component = fixture.componentInstance;
    component.useAI.set(true); component.draft = 'Cómo revisar una validación'; await component.send();
    expect(api.chat).toHaveBeenCalledWith('Cómo revisar una validación', help.context(component.route()), 'deepseek');
    expect(component.messages().at(-1)?.provider).toBe('deepseek');
    expect(component.messages().at(-1)?.text).toBe('Respuesta de IA sintética.');
    api.chat.and.rejectWith(new HttpErrorResponse({ status: 429, error: { message: 'Límite mensual de IA alcanzado.' } }));
    component.draft = 'Otra consulta'; await component.send();
    expect(component.error()).toContain('Límite mensual');
    expect(component.messages().at(-1)?.author).toBe('user');
    expect(component.loadingAI()).toBeFalse();
    const calls = api.chat.calls.count();
    component.draft = 'abre Inventario'; await component.send();
    expect(api.chat.calls.count()).toBe(calls);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/inventory');
  });
  it('never sends possible secrets and discards an old AI response after changing identity', async () => {
    const fixture = setup(); await fixture.whenStable();
    const component = fixture.componentInstance; component.useAI.set(true);
    component.shareDiagnostic.set(true);
    component.draft = 'password=secret-value'; await component.send();
    expect(api.chat).not.toHaveBeenCalled();
    expect(component.error()).toContain('no se envió');
    let complete!: (reply: Partial<AiReply>) => void;
    api.chat.and.returnValue(new Promise<Partial<AiReply>>(resolve => { complete = resolve; }));
    component.draft = 'Consulta general'; const pending = component.send();
    user.set(null); fixture.detectChanges();
    complete({ text: 'old-company-reply', provider: 'deepseek', usage: meter });
    await pending;
    expect(JSON.stringify(component.messages())).not.toContain('old-company-reply');
    expect(component.usage()).toBeNull();
    expect(component.useAI()).toBeFalse();
    expect(component.shareDiagnostic()).toBeFalse();
    expect(component.loadingAI()).toBeFalse();
  });
  it('revokes consent when the active provider changes and keeps subsequent guidance local', async () => {
    const fixture = setup(); await fixture.whenStable();
    const component = fixture.componentInstance; component.useAI.set(true);
    api.usage.and.resolveTo({ ...meter, provider: 'openai', model: 'gpt-5.4-mini' });
    await component.refreshUsage();
    expect(component.usage()?.provider).toBe('openai');
    expect(component.useAI()).toBeFalse();
    component.draft = 'No puedo reservar stock'; await component.send();
    expect(api.chat).not.toHaveBeenCalled();
    expect(component.messages().at(-1)?.text).toContain('MOCK local');
  });
  it('reads ERP evidence without AI and shares it only after additional explicit consent', async () => {
    const fixture = setup(); await fixture.whenStable();
    const component = fixture.componentInstance;
    await component.inspect(report.target); fixture.detectChanges();
    expect(api.diagnose).toHaveBeenCalledWith(report.target);
    expect(api.chat).not.toHaveBeenCalled();
    expect(component.messages().at(-1)?.report).toEqual(report);
    expect(component.shareDiagnostic()).toBeFalse();
    component.useAI.set(true); component.draft = 'Explica el problema'; await component.send();
    expect(api.chat.calls.mostRecent().args).toHaveSize(3);
    component.shareDiagnostic.set(true); component.draft = 'Propón pasos seguros'; await component.send();
    expect(api.chat.calls.mostRecent().args[3]).toEqual(report.target);
  });
  it('discards late diagnostic evidence on logout and reports authorization errors without fabricated findings', async () => {
    const fixture = setup(); await fixture.whenStable();
    const component = fixture.componentInstance;
    api.diagnose.and.rejectWith(new HttpErrorResponse({ status: 403, error: { message: 'Tu rol no permite esta consulta.' } }));
    await component.inspect(report.target);
    expect(component.error()).toContain('Tu rol');
    expect(component.diagnosticReport()).toBeNull();
    let finish!: (value: DiagnosticReport) => void;
    api.diagnose.and.returnValue(new Promise<DiagnosticReport>(resolve => { finish = resolve; }));
    const pending = component.inspect(report.target);
    user.set(null); fixture.detectChanges(); finish(report); await pending;
    expect(component.diagnosticReport()).toBeNull();
    expect(component.loadingDiagnostic()).toBeFalse();
    expect(component.messages()).toHaveSize(1);
  });
  it('discards late screen evidence after navigation without leaving navigation busy', async () => {
    const events = new Subject<NavigationEnd>();
    spyOnProperty(router, 'events', 'get').and.returnValue(events);
    const fixture = setup(); await fixture.whenStable();
    const component = fixture.componentInstance;
    let finish!: (value: DiagnosticReport) => void;
    api.diagnose.and.returnValue(new Promise<DiagnosticReport>(resolve => { finish = resolve; }));
    const pending = component.inspect(report.target);
    events.next(new NavigationEnd(1, '/people', '/people')); finish(report); await pending;
    expect(component.diagnosticReport()).toBeNull();
    expect(component.loadingDiagnostic()).toBeFalse();
    (router.navigateByUrl as jasmine.Spy).and.callFake(async (url: string) => {
      events.next(new NavigationEnd(2, url, url)); return true;
    });
    await component.navigate('/inventory');
    expect(component.navigating()).toBeFalse();
    expect(component.messages().at(-1)?.text).toContain('Pantalla abierta');
  });
});
