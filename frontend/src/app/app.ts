import { Component, DestroyRef, ElementRef, HostListener, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionService } from './core/session.service';
import { ThemeService } from './core/theme.service';
import { HelpService, helpPages } from './core/help.service';
import { SaasService } from './core/saas.service';
import { AssistantChatComponent } from './assistant-chat.component';

type NavigationLink = {
  route: string;
  label: string;
  icon: string;
  visibility?: 'admin' | 'authenticated' | 'saas';
};

const navigationGroups: { label: string; links: NavigationLink[] }[] = [
  { label: 'Tu espacio', links: [
    { route: '/', label: 'Inicio', icon: 'house-door' },
    { route: '/workspace', label: 'Dashboard', icon: 'speedometer2' },
    { route: '/login', label: 'Acceso', icon: 'person-lock' },
  ] },
  { label: 'Operación', links: [
    { route: '/operations', label: 'Operaciones', icon: 'kanban' },
    { route: '/inventory', label: 'Inventario', icon: 'box-seam' },
    { route: '/invoicing', label: 'Facturación', icon: 'receipt' },
    { route: '/receiving', label: 'Recepciones', icon: 'box-arrow-in-down', visibility: 'admin' },
    { route: '/controls', label: 'Control operativo', icon: 'arrow-left-right', visibility: 'admin' },
    { route: '/accounting', label: 'Contabilidad', icon: 'journal-text', visibility: 'admin' },
    { route: '/people', label: 'Personas', icon: 'person-badge', visibility: 'admin' },
  ] },
  { label: 'Canales digitales', links: [
    { route: '/store', label: 'Tienda', icon: 'bag' },
    { route: '/portal', label: 'Portal cliente', icon: 'person-vcard' },
    { route: '/ecommerce/admin', label: 'Diseñar tienda', icon: 'palette' },
  ] },
  { label: 'Administración', links: [
    { route: '/company', label: 'Mi empresa', icon: 'building', visibility: 'admin' },
    { route: '/users', label: 'Usuarios', icon: 'people', visibility: 'admin' },
    { route: '/catalogs', label: 'Catálogos', icon: 'collection', visibility: 'admin' },
    { route: '/subscription', label: 'Mi suscripción', icon: 'card-checklist', visibility: 'authenticated' },
    { route: '/platform/billing', label: 'Administración SaaS', icon: 'buildings', visibility: 'saas' },
    { route: '/processes', label: 'Procesos', icon: 'signpost-split' },
  ] },
];

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, AssistantChatComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly session = inject(SessionService);
  protected readonly theme = inject(ThemeService);
  protected readonly router = inject(Router);
  protected readonly help = inject(HelpService);
  protected readonly saas = inject(SaasService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly navigationPanel = viewChild<ElementRef<HTMLElement>>('navigationPanel');
  private readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');
  private readonly viewport = this.document.defaultView?.matchMedia('(max-width: 1279px)');
  readonly compactViewport = signal(this.viewport?.matches ?? false);
  readonly menuOpen = signal(false);
  readonly visibleNavigationGroups = computed(() => navigationGroups.map(group => ({
    ...group,
    links: group.links.filter(link => !link.visibility ||
      (link.visibility === 'admin' && this.session.user()?.roles.includes('admin')) ||
      (link.visibility === 'authenticated' && this.session.isAuthenticated()) ||
      (link.visibility === 'saas' && Boolean(this.saas.role()))),
  })).filter(group => group.links.length));
  readonly assistantDestinations = computed(() => this.visibleNavigationGroups().flatMap(group => group.links));
  readonly assistantOpenRequest = signal(0);
  readonly helpOpen = signal(false);
  readonly diagnostic = signal('');

  constructor() {
    const onViewportChange = (event: MediaQueryListEvent) => {
      const focusWasInMenu = this.navigationPanel()?.nativeElement.contains(this.document.activeElement);
      this.compactViewport.set(event.matches);
      this.menuOpen.set(false);
      if (event.matches && focusWasInMenu) this.menuTrigger()?.nativeElement.focus();
    };
    this.viewport?.addEventListener('change', onViewportChange);
    this.destroyRef.onDestroy(() => this.viewport?.removeEventListener('change', onViewportChange));
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) this.closeMenu(false);
    });
  }

  openMenu() {
    this.menuOpen.set(true);
    afterNextRender(() => {
      this.document.defaultView?.requestAnimationFrame(() => {
        if (!this.destroyRef.destroyed && this.menuOpen() && this.compactViewport()) {
          this.navigationPanel()?.nativeElement.querySelector<HTMLButtonElement>('.drawer-close')?.focus();
        }
      });
    }, { injector: this.injector });
  }

  closeMenu(restoreFocus = true) {
    const wasOpen = this.menuOpen();
    this.menuOpen.set(false);
    if (wasOpen && restoreFocus) {
      afterNextRender(() => {
        this.document.defaultView?.requestAnimationFrame(() => {
          if (!this.destroyRef.destroyed && !this.menuOpen() && this.compactViewport()) {
            this.menuTrigger()?.nativeElement.focus();
          }
        });
      }, { injector: this.injector });
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleNavigationKey(event: KeyboardEvent) {
    if (!this.compactViewport() || !this.menuOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMenu();
    } else if (event.key === 'Tab') {
      const items = this.navigationPanel()?.nativeElement.querySelectorAll<HTMLElement>('button, a[href]');
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && this.document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && this.document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  }

  get currentHelp() {
    return helpPages.find((page) => page.route === this.router.url.split('?')[0]) ?? helpPages[0];
  }

  async logout() {
    await this.session.signOut();
    this.help.incident.set(null);
    this.diagnostic.set('');
    void this.router.navigateByUrl('/login');
  }
  showDiagnostic() { this.diagnostic.set(JSON.stringify(this.help.context(this.router.url), null, 2)); }

  toggleTheme() {
    this.theme.toggle();
  }
}
