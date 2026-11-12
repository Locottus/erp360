import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AssistantAdminComponent } from './assistant-admin.component';
import { AssistantApiService, type AiCompany, type ProviderConfig } from './core/assistant-api.service';
import { SaasService, type OperatorRole } from './core/saas.service';

describe('Assistant provider administration', () => {
  const company: AiCompany = { usage: { month: '2026-11-01', includedTokens: 10000, extraTokens: 0, limitTokens: 10000,
    promptTokens: 100, completionTokens: 20, usedTokens: 120, reservedTokens: 0, availableTokens: 9880 },
    users: [{ id: 'u1', full_name: 'Synthetic user', email: 'fixture@example.test', is_active: true, service_code: 'standard', enabled: true, revision: 1 }],
    requests: [], purchases: [] };
  const defaults: ProviderConfig = { provider: 'deepseek', model: 'deepseek-flash', enabled: true, revision: 1, keyConfigured: true };
  let role: ReturnType<typeof signal<OperatorRole | null>>;
  let api: { get: jasmine.Spy; post: jasmine.Spy };
  const response = (path: string) => {
    if (path === '/options') return { providers: [
      { code: 'deepseek', label: 'DeepSeek', models: ['deepseek-flash'] },
      { code: 'openai', label: 'OpenAI', models: ['gpt-5.4-mini'] },
      { code: 'claude', label: 'Claude', models: ['claude-haiku-5-5'] },
    ] };
    if (path === '/service-types') return [{ code: 'standard', name: 'Standard', monthly_tokens: 10000, max_output_tokens: 128, enabled: true, revision: 1 }];
    if (path.includes('/provider?provider=claude')) return { ...defaults, provider: 'claude', model: 'claude-haiku-5-5', enabled: false, revision: 0, keyConfigured: false };
    if (path.includes('/provider')) return { ...defaults };
    return company;
  };
  beforeEach(() => {
    role = signal<OperatorRole | null>('owner');
    api = { get: jasmine.createSpy('get').and.callFake((path: string) => Promise.resolve(response(path))),
      post: jasmine.createSpy('post').and.resolveTo({ ...defaults }) };
    TestBed.configureTestingModule({ imports: [AssistantAdminComponent], providers: [
      { provide: AssistantApiService, useValue: api },
      { provide: SaasService, useValue: { role, identity: signal('synthetic-identity'), writable: computed(() => role() === 'owner' || role() === 'billing') } },
    ] });
  });
  async function setup() {
    const fixture = TestBed.createComponent(AssistantAdminComponent);
    fixture.componentRef.setInput('companies', [{ id: 'c1', code: 'ONE', name: 'Synthetic one' }, { id: 'c2', code: 'TWO', name: 'Synthetic two' }]);
    fixture.detectChanges(); await fixture.whenStable();
    fixture.componentInstance.companyId = 'c1'; await fixture.componentInstance.loadCompany(); fixture.detectChanges();
    return fixture;
  }
  it('offers all providers and preserves a configured credential when saving without a new key', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const html = fixture.nativeElement as HTMLElement;
    expect([...html.querySelectorAll<HTMLSelectElement>('select[name="aiProvider"] option')].map(option => option.textContent)).toEqual(['DeepSeek', 'OpenAI', 'Claude']);
    component.providerReason = 'Confirmed provider configuration';
    await component.saveProvider();
    expect(api.post).toHaveBeenCalledWith('/companies/c1/provider', { provider: 'deepseek', model: 'deepseek-flash',
      enabled: true, expectedRevision: 1, reason: 'Confirmed provider configuration', apiKey: undefined });
    expect(component.apiKey).toBe('');
    expect(component.data?.usage.usedTokens).toBe(120);
  });
  it('discards stale provider metadata and clears credential drafts when switching company', async () => {
    const component = (await setup()).componentInstance;
    let complete!: (config: ProviderConfig) => void;
    api.get.and.callFake((path: string) => path.includes('provider=claude') ? new Promise<ProviderConfig>(resolve => { complete = resolve; }) : Promise.resolve(response(path)));
    component.selection = 'claude'; const pending = component.loadProvider();
    component.apiKey = 'not-a-real-credential'; component.companyId = 'c2';
    await component.loadCompany(); complete({ ...defaults, provider: 'claude', model: 'claude-haiku-5-5' }); await pending;
    expect(component.config?.provider).toBe('deepseek');
    expect(component.companyId).toBe('c2');
    expect(component.apiKey).toBe('');
  });
  it('limits credential controls to owner while billing can register only confirmed additional service', async () => {
    role.set('billing');
    const fixture = await setup(); const component = fixture.componentInstance;
    expect((fixture.nativeElement as HTMLElement).querySelector('input[name="aiApiKey"]')).toBeNull();
    component.purchase.paymentConfirmed = false; await component.purchaseTokens();
    expect(api.post).not.toHaveBeenCalled();
    component.purchase = { tokens: 1000, paidAmount: '1.00', reference: 'synthetic-paid-service', reason: 'Verified service purchase', paymentConfirmed: true };
    await component.purchaseTokens();
    expect(api.post).toHaveBeenCalledWith('/companies/c1/token-purchases', { tokens: 1000, paidAmount: '1.00',
      reference: 'synthetic-paid-service', reason: 'Verified service purchase', paymentConfirmed: true });
    expect(component.purchase.paymentConfirmed).toBeFalse();
  });
});
