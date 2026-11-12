import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { computed, signal } from '@angular/core';
import { SessionService, AuthUser, CurrentCompany } from './core/session.service';
import { SaasService, OperatorRole } from './core/saas.service';
import { App } from './app';

describe('App', () => {
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let role: ReturnType<typeof signal<OperatorRole | null>>;
  beforeEach(async () => {
    localStorage.removeItem('erp360.auth.token');
    sessionStorage.removeItem('erp360.auth.token');
    user = signal<AuthUser | null>(null);
    role = signal<OperatorRole | null>(null);
    spyOn(window, 'matchMedia').and.callFake(media => ({
      matches: true, media, onchange: null, addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    }));
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: SessionService, useValue: {
          user, company: signal<CurrentCompany | null>(null),
          isAuthenticated: computed(() => Boolean(user())), error: signal(''),
        } },
        { provide: SaasService, useValue: { role } },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render primary navigation', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.nav-links')?.textContent).toContain('Inicio');
    expect(compiled.querySelector('.nav-links')?.textContent).toContain('Portal cliente');
    expect(compiled.querySelector('.nav-links')?.textContent).toContain('Acceso');
  });

  it('preserves existing route visibility for guests, company roles and SaaS operators', () => {
    const fixture = TestBed.createComponent(App);
    const routes = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('.nav-links a'))
      .map(link => link.getAttribute('href'));
    fixture.detectChanges();
    expect(routes()).toEqual(['/', '/workspace', '/login', '/operations', '/inventory', '/invoicing',
      '/store', '/portal', '/ecommerce/admin', '/processes']);
    user.set({ id: 'test', fullName: 'Test', email: 'test@example.test', companyId: 'c', roles: ['employee'] });
    fixture.detectChanges();
    expect(routes()).toContain('/subscription');
    expect(routes()).not.toContain('/users');
    expect(routes()).not.toContain('/platform/billing');
    user.update(value => value ? { ...value, roles: ['admin'] } : null);
    role.set('owner'); fixture.detectChanges();
    expect(routes()).toEqual(['/', '/workspace', '/login', '/operations', '/inventory', '/invoicing',
      '/receiving', '/controls', '/accounting', '/people', '/store', '/portal', '/ecommerce/admin',
      '/company', '/users', '/catalogs', '/subscription', '/platform/billing', '/processes']);
    user.set(null); role.set(null); fixture.detectChanges();
    expect(routes()).not.toContain('/users');
    expect(routes()).not.toContain('/subscription');
  });

  it('isolates an open drawer, cycles keyboard focus and closes with Escape', async () => {
    const fixture = TestBed.createComponent(App); fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const trigger = compiled.querySelector<HTMLButtonElement>('.menu-trigger')!;
    trigger.click(); fixture.detectChanges(); await fixture.whenStable();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const sidebar = compiled.querySelector<HTMLElement>('.sidebar')!;
    expect(sidebar.getAttribute('role')).toBe('dialog');
    expect(sidebar.getAttribute('aria-modal')).toBe('true');
    expect(compiled.querySelector('.content-area')?.hasAttribute('inert')).toBeTrue();
    const first = sidebar.querySelector<HTMLButtonElement>('.drawer-close')!;
    expect(document.activeElement).toBe(first);
    const links = sidebar.querySelectorAll<HTMLAnchorElement>('a');
    const last = links[links.length - 1];
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges(); await fixture.whenStable();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(fixture.componentInstance.menuOpen()).toBeFalse();
    expect(sidebar.hasAttribute('inert')).toBeTrue();
    expect(compiled.querySelector('.content-area')?.hasAttribute('inert')).toBeFalse();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes the drawer on link selection without altering the destination', () => {
    const fixture = TestBed.createComponent(App); fixture.detectChanges();
    fixture.componentInstance.openMenu(); fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.nav-links a[href="/"]')!;
    link.click(); fixture.detectChanges();
    expect(fixture.componentInstance.menuOpen()).toBeFalse();
    expect(link.getAttribute('href')).toBe('/');
  });
});
