import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { SessionService } from './session.service';
import { HelpService } from './help.service';

describe('API boundary and assistance privacy', () => {
  let http: HttpClient; let testing: HttpTestingController;
  const session = { getAccessToken: () => 'test-only-token', logout: jasmine.createSpy('logout') };
  beforeEach(() => {
    session.logout.calls.reset();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(), { provide: SessionService, useValue: session }] });
    http = TestBed.inject(HttpClient); testing = TestBed.inject(HttpTestingController);
  });
  afterEach(() => testing.verify());
  it('never sends bearer tokens to external or public endpoints', () => {
    for (const url of ['https://example.test/x', '/api/portal/public/private-token/summary', '/api/auth/login']) {
      http.get(url).subscribe();
      const req = testing.expectOne(url);
      expect(req.request.headers.has('Authorization')).toBeFalse();
      req.flush({});
    }
  });
  it('clears expired sessions and excludes URLs and error bodies from AI context', () => {
    http.get('/api/dashboard/overview').subscribe({ error: () => undefined });
    const req = testing.expectOne('/api/dashboard/overview');
    expect(req.request.headers.get('Authorization')).toContain('Bearer');
    req.flush({ secret: 'private-data' }, { status: 401, statusText: 'Unauthorized' });
    expect(session.logout).toHaveBeenCalled();
    const context = TestBed.inject(HelpService).context('/portal?token=private-data');
    expect(context.screen).toBe('/portal');
    expect(JSON.stringify(context)).not.toContain('private-data');
  });
});
