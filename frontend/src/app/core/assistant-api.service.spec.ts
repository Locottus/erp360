import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AssistantApiService } from './assistant-api.service';

describe('Assistant API connection check', () => {
  let api: AssistantApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AssistantApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('accepts only the expected liveness response from the ERP API', async () => {
    const check = api.checkApi();
    const request = http.expectOne('/api/health/live');
    expect(request.request.method).toBe('GET');
    request.flush({ status: 'ok', check: 'liveness', service: 'erp360-api' });
    await expectAsync(check).toBeResolved();
    const invalid = api.checkApi();
    http.expectOne('/api/health/live').flush({ status: 'ok', check: 'readiness', service: 'other' });
    await expectAsync(invalid).toBeRejected();
  });
});
