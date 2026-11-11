import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <article class="surface-card empty-state">
      <i class="bi {{ icon }}" aria-hidden="true"></i>
      <h3>{{ title }}</h3>
      <p>{{ description }}</p>
      <ng-content></ng-content>
    </article>
  `,
})
export class EmptyStateComponent {
  @Input({ required: true }) title = '';
  @Input({ required: true }) description = '';
  @Input() icon = 'bi-inboxes';
}
