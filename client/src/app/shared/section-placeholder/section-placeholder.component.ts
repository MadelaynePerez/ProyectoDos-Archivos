import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

/**
 * Contenedor temporal para las secciones que se implementarán en las
 * siguientes etapas. Mantiene el layout y la estética sin duplicar HTML.
 */
@Component({
  selector: 'app-section-placeholder',
  imports: [MatCardModule, MatIconModule],
  template: `
    <section class="page">
      <mat-card appearance="outlined" class="placeholder-card">
        <mat-icon class="placeholder-icon">{{ icon() }}</mat-icon>
        <h2>{{ title() }}</h2>
        <p>{{ description() }}</p>
        <span class="status-chip">En construcción</span>
      </mat-card>
    </section>
  `,
  styles: `
    .page {
      display: flex;
      justify-content: center;
      padding-top: 1rem;
    }

    .placeholder-card {
      width: 100%;
      max-width: 40rem;
      padding: 2rem;
      text-align: center;
    }

    .placeholder-icon {
      font-size: 2.5rem;
      width: 2.5rem;
      height: 2.5rem;
      color: var(--mat-sys-primary);
    }

    h2 {
      margin: 0.75rem 0 0.5rem;
      font: var(--mat-sys-headline-small);
    }

    p {
      margin: 0 auto 1.25rem;
      max-width: 32rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .status-chip {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 1rem;
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionPlaceholderComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input('folder_open');
}
