import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from './core/api';
import { AuthUser, SessionService } from './core/session.service';
import { WorkspaceComponent } from './workspace.component';

describe('Workspace dashboard', () => {
  const admin: AuthUser = {
    id: 'u1',
    email: 'a@example.test',
    fullName: 'Admin',
    companyId: 'c1',
    roles: ['admin'],
  };
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let http: HttpTestingController;
  const payload = {
    period: 'day',
    timezone: 'UTC',
    visibility: { admin: true, sales: true, purchases: true },
    summary: {
      customers: 2,
      products: 4,
      suppliers: 1,
      stockRows: 3,
      quotations: 0,
      purchaseRequests: 0,
      portalTokens: 0,
      ecommerceListings: 0,
      ecommerceSubscribers: 0,
    },
    series: [{ start: '2026-11-10', salesOrders: 2, purchaseOrders: 1 }],
  };

  beforeEach(() => {
    user = signal<AuthUser | null>(null);
    TestBed.configureTestingModule({
      imports: [WorkspaceComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: SessionService,
          useValue: { user, company: signal(null), isAuthenticated: () => user() !== null },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads after session restoration and changes periods without duplicate requests', async () => {
    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();
    http.expectNone(`${API_BASE_URL}/dashboard/overview?period=day`);
    user.set(admin);
    fixture.detectChanges();
    http.expectOne(`${API_BASE_URL}/dashboard/overview?period=day`).flush(payload);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Total histórico');
    expect(fixture.nativeElement.querySelectorAll('.chart-bar').length).toBe(2);
    fixture.componentInstance.changePeriod('week');
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE_URL}/dashboard/overview?period=week`)
      .flush({ ...payload, period: 'week' });
    await fixture.whenStable();
    expect(fixture.componentInstance.overview()?.period).toBe('week');
  });

  it('shows errors instead of false zero values and can retry', async () => {
    user.set(admin);
    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();
    http
      .expectOne(`${API_BASE_URL}/dashboard/overview?period=day`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.overview()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    const loading = fixture.componentInstance.loadMetrics();
    http.expectOne(`${API_BASE_URL}/dashboard/overview?period=day`).flush(payload);
    await loading;
    expect(fixture.componentInstance.error()).toBe('');
  });

  it('discards an old response when the user logs out', async () => {
    user.set(admin);
    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();
    const pending = http.expectOne(`${API_BASE_URL}/dashboard/overview?period=day`);
    user.set(null);
    fixture.detectChanges();
    pending.flush(payload);
    await fixture.whenStable();
    expect(fixture.componentInstance.overview()).toBeNull();
  });

  it('keeps the most recently selected period when responses arrive out of order', async () => {
    user.set(admin);
    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();
    const day = http.expectOne(`${API_BASE_URL}/dashboard/overview?period=day`);
    fixture.componentInstance.changePeriod('month');
    const month = http.expectOne(`${API_BASE_URL}/dashboard/overview?period=month`);
    month.flush({ ...payload, period: 'month' });
    await fixture.whenStable();
    day.flush(payload);
    await fixture.whenStable();
    expect(fixture.componentInstance.overview()?.period).toBe('month');
  });

  it('hides restricted widgets and shows an honest empty state', async () => {
    user.set({ ...admin, roles: ['sales'] });
    const fixture = TestBed.createComponent(WorkspaceComponent);
    fixture.detectChanges();
    http.expectOne(`${API_BASE_URL}/dashboard/overview?period=day`).flush({
      ...payload,
      visibility: { admin: false, sales: true, purchases: false },
      summary: {
        ...payload.summary,
        suppliers: null,
        purchaseRequests: null,
        portalTokens: null,
        ecommerceListings: null,
        ecommerceSubscribers: null,
      },
      series: [{ start: '2026-11-10', salesOrders: 0, purchaseOrders: null }],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin pedidos en este período');
    expect(
      fixture.componentInstance.widgets.some((widget) => widget.key === 'portalTokens'),
    ).toBeFalse();
  });
});
