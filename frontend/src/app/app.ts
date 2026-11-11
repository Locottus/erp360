import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from './core/session.service';
import { ThemeService } from './core/theme.service';
import { HelpService, helpPages } from './core/help.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly session = inject(SessionService);
  protected readonly theme = inject(ThemeService);
  protected readonly router = inject(Router);
  protected readonly help = inject(HelpService);
  readonly menuOpen = signal(false);
  readonly helpOpen = signal(false);
  readonly diagnostic = signal('');
  get currentHelp() {
    return helpPages.find((page) => page.route === this.router.url.split('?')[0]) ?? helpPages[0];
  }

  logout() {
    this.session.logout();
    this.help.incident.set(null);
    this.diagnostic.set('');
    void this.router.navigateByUrl('/login');
  }
  showDiagnostic() { this.diagnostic.set(JSON.stringify(this.help.context(this.router.url), null, 2)); }

  toggleTheme() {
    this.theme.toggle();
  }
}
