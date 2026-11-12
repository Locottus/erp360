import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './core/api';
import { AuthUser, CurrentCompany, SessionService } from './core/session.service';
import { CompanyComponent } from './company.component';

describe('Company profile management', () => {
  const admin: AuthUser = { id: 'a', companyId: 'c', email: 'admin@example.test', fullName: 'Admin', roles: ['admin'] };
  const profile = { id: 'c', code: 'FIXED', name: 'Before', tax_id: 'OLD', is_active: true, profile_revision: 3,
    require_independent_purchase_approver: false };
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let company: ReturnType<typeof signal<CurrentCompany | null>>;
  let http: HttpTestingController;
  beforeEach(() => {
    user = signal<AuthUser | null>(admin); company = signal<CurrentCompany | null>(profile);
    TestBed.configureTestingModule({ imports: [CompanyComponent], providers: [
      provideHttpClient(), provideHttpClientTesting(), { provide: SessionService, useValue: { user, company } },
    ] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  async function setup() {
    const fixture = TestBed.createComponent(CompanyComponent); fixture.detectChanges();
    http.expectOne(`${API_BASE_URL}/companies/current`).flush(profile);
    await fixture.whenStable(); return fixture;
  }
  it('sends the loaded revision and explicit null and refreshes the header without moving tenant', async () => {
    const component = (await setup()).componentInstance;
    component.form = { name: 'After', taxId: '', reason: 'Reviewed tax profile', requireIndependentPurchaseApprover: true };
    const pending = component.save();
    const req = http.expectOne(`${API_BASE_URL}/companies/current`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'After', taxId: null, reason: 'Reviewed tax profile', expectedRevision: 3,
      requireIndependentPurchaseApprover: true });
    req.flush({ ...profile, name: 'After', tax_id: null, profile_revision: 4, require_independent_purchase_approver: true });
    await pending;
    expect(company()?.name).toBe('After');
    expect(component.profile?.profile_revision).toBe(4);
    expect(component.form.requireIndependentPurchaseApprover).toBeTrue();
    expect(component.message).toContain('No se reescribieron documentos');
  });
  it('reports stale edits without claiming success', async () => {
    const component = (await setup()).componentInstance;
    const pending = component.save();
    http.expectOne(`${API_BASE_URL}/companies/current`).flush({}, { status: 409, statusText: 'Conflict' });
    await pending;
    expect(component.error).toContain('Recarga');
    expect(component.message).toBe('');
    expect(company()?.name).toBe('Before');
  });
  it('discards profile and old responses after identity loss', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const pending = component.save();
    const req = http.expectOne(`${API_BASE_URL}/companies/current`);
    user.set(null); company.set(null); fixture.detectChanges();
    req.flush({ ...profile, name: 'Old response', profile_revision: 4 });
    await pending;
    expect(component.profile).toBeNull(); expect(company()).toBeNull(); expect(component.message).toBe('');
  });
});
