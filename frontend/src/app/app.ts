import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from './core/session.service';
import { ThemeService } from './core/theme.service';
import { HelpService, helpPages } from './core/help.service';
import { SaasService } from './core/saas.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly session = inject(SessionService);
  protected readonly theme = inject(ThemeService);
  protected readonly router = inject(Router);
  protected readonly help = inject(HelpService);
  protected readonly saas = inject(SaasService);
  readonly menuOpen = signal(false);
  readonly helpOpen = signal(false);
  readonly diagnostic = signal('');
  mockQuestion = '';
  readonly mockReply = signal('');
  askMock() {
    this.mockReply.set(this.help.mockReply(this.mockQuestion, this.router.url));
    this.mockQuestion = '';
  }
  get currentHelp() {
    return helpPages.find((page) => page.route === this.router.url.split('?')[0]) ?? helpPages[0];
  }

  async logout() {
    await this.session.signOut();
    this.help.incident.set(null);
    this.diagnostic.set('');
    this.mockReply.set(''); this.mockQuestion = '';
    void this.router.navigateByUrl('/login');
  }
  showDiagnostic() { this.diagnostic.set(JSON.stringify(this.help.context(this.router.url), null, 2)); }

  toggleTheme() {
    this.theme.toggle();
  }
}
