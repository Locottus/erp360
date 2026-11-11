import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from './core/api';
import { AuthUser, SessionService } from './core/session.service';
import { PeopleComponent } from './people.component';

describe('Leave cancellation UI', () => {
  const admin: AuthUser = { id: 'user', companyId: 'company', email: 'admin@example.test', fullName: 'Admin', roles: ['admin'] };
  const leave = { id: 'leave', full_name: 'Employee', start_date: '2026-03-01', end_date: '2026-03-02', reason: 'Original request', status: 'approved', revision: 1, decision_note: 'Original decision', cancellation_reason: null };
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let http: HttpTestingController;
  beforeEach(() => {
    user = signal<AuthUser | null>(admin);
    TestBed.configureTestingModule({ imports: [PeopleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: SessionService, useValue: { user } }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function flushLists() {
    const pending = http.match(req => req.method === 'GET');
    expect(pending.length).toBe(3);
    for (const req of pending) req.flush(req.request.url.endsWith('leave-requests') ? [leave] : []);
  }
  it('requires confirmation and sends original revision and reason without changing dates', async () => {
    const fixture = TestBed.createComponent(PeopleComponent);
    fixture.detectChanges(); flushLists(); await fixture.whenStable();
    const component = fixture.componentInstance;
    component.leave = leave;
    await component.cancelLeave();
    http.expectNone(`${API_BASE_URL}/hr/leave-requests/leave/cancel`);
    component.leaveCancellation = { reason: 'Employee withdrew approved absence', confirmed: true };
    const cancellation = component.cancelLeave();
    const req = http.expectOne(`${API_BASE_URL}/hr/leave-requests/leave/cancel`);
    expect(req.request.body).toEqual({ expectedRevision: 1, reason: 'Employee withdrew approved absence' });
    req.flush({ status: 'cancelled', revision: 2 }); await Promise.resolve();
    flushLists(); await cancellation;
    expect(component.leaveCancellation.confirmed).toBe(false);
    expect(component.message).toContain('historial conservado');
  });
  it('discards an old write response after session loss and clears cancellation form', async () => {
    const fixture = TestBed.createComponent(PeopleComponent);
    fixture.detectChanges(); flushLists(); await fixture.whenStable();
    const component = fixture.componentInstance;
    component.leave = leave; component.leaveCancellation = { reason: 'Authorized administrative withdrawal', confirmed: true };
    const cancellation = component.cancelLeave();
    const req = http.expectOne(`${API_BASE_URL}/hr/leave-requests/leave/cancel`);
    user.set(null); fixture.detectChanges(); req.flush({ status: 'cancelled' }); await cancellation;
    expect(component.leaves).toEqual([]);
    expect(component.leave).toBeNull();
    expect(component.message).toBe('');
    expect(component.leaveCancellation.reason).toBe('');
    expect(component.busy).toBe(false);
  });
});
