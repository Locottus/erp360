import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './core/api';
import { AuthUser, SessionService } from './core/session.service';
import { UsersComponent } from './users.component';

describe('Users restored session lifecycle', () => {
  const admin: AuthUser = { id: 'user-1', companyId: 'company-1', email: 'admin@example.test', fullName: 'Demo admin', roles: ['admin'] };
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let http: HttpTestingController;

  beforeEach(() => {
    user = signal<AuthUser | null>(null);
    TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SessionService, useValue: { user } }],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads after asynchronous authentication restoration rather than only on component creation', async () => {
    const fixture = TestBed.createComponent(UsersComponent);
    fixture.detectChanges();
    http.expectNone(`${API_BASE_URL}/auth/users`);
    user.set(admin); fixture.detectChanges();
    http.expectOne(`${API_BASE_URL}/auth/users`).flush([{ id: 'user-1', full_name: 'Demo admin', email: admin.email, is_active: true, roles: ['admin'] }]);
    await fixture.whenStable();
    expect(fixture.componentInstance.users.length).toBe(1);
  });

  it('discards an old response and one-time secrets after session loss', async () => {
    const fixture = TestBed.createComponent(UsersComponent);
    user.set(admin); fixture.detectChanges();
    const pending = http.expectOne(`${API_BASE_URL}/auth/users`);
    fixture.componentInstance.secret = 'one-time-demo-value';
    user.set(null); fixture.detectChanges();
    pending.flush([{ id: 'old-user', full_name: 'Previous session', roles: [] }]);
    await fixture.whenStable();
    expect(fixture.componentInstance.users).toEqual([]);
    expect(fixture.componentInstance.secret).toBe('');
  });

  it('sends the revision originally edited and explains concurrent edit conflicts', async () => {
    user.set(admin);
    const fixture = TestBed.createComponent(UsersComponent); fixture.detectChanges();
    const row = { id: 'target', email: 'target@example.test', full_name: 'Target', is_active: true,
      roles: ['employee'], management_revision: 4 };
    http.expectOne(`${API_BASE_URL}/auth/users`).flush([row]); await fixture.whenStable();
    const component = fixture.componentInstance; component.edit(row);
    component.form.fullName = 'Reviewed target'; component.reason = 'Reviewed access assignment';
    const pending = component.save();
    const req = http.expectOne(`${API_BASE_URL}/auth/users/target`);
    expect(req.request.body.expectedRevision).toBe(4);
    expect(req.request.body.reason).toBe('Reviewed access assignment');
    req.flush({}, { status: 409, statusText: 'Conflict' }); await pending;
    expect(component.error).toContain('actualiza la lista'); expect(component.message).toBe('');
  });

  it('does not expose late activation keys to a different session', async () => {
    user.set(admin);
    const fixture = TestBed.createComponent(UsersComponent); fixture.detectChanges();
    http.expectOne(`${API_BASE_URL}/auth/users`).flush([]); await fixture.whenStable();
    const component = fixture.componentInstance;
    component.form = { email: 'new@example.test', fullName: 'New user', roles: ['employee'], isActive: true };
    const pending = component.save();
    const req = http.expectOne(`${API_BASE_URL}/auth/users`);
    user.set(null); fixture.detectChanges();
    req.flush({ activationToken: 'late-private-key' }); await pending;
    expect(component.secret).toBe(''); expect(component.users).toEqual([]); expect(component.message).toBe('');
  });
});
