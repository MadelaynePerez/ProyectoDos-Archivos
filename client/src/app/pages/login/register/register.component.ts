import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';

import { apiErrorMessage } from '../../../core/api/api-error';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Pantalla pública de registro.
 *
 * Crea una cuenta con rol USER mediante `POST /api/auth/register`. El endpoint
 * no devuelve token, así que al terminar se vuelve al login con un mensaje de
 * éxito y el correo precargado.
 */
@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);

  /** Evita dobles envíos mientras la petición está en curso. */
  readonly loading = signal(false);

  /** Permite mostrar u ocultar la contraseña. */
  readonly hidePassword = signal(true);

  // Límites alineados con el contrato: nombre de hasta 120 caracteres y
  // contraseña de 8 a 72.
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
  });

  constructor() {
    // Un usuario con sesión activa no necesita crear otra cuenta.
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl('/files');
    }
  }

  /** Envía el formulario y, si es correcto, vuelve al login. */
  submit(): void {
    this.form.markAllAsTouched();

    if (this.form.invalid || this.loading()) {
      return;
    }

    this.loading.set(true);
    const { name, email, password } = this.form.getRawValue();
    const normalizedEmail = email.trim().toLowerCase();

    this.auth
      .register({ name: name.trim(), email: normalizedEmail, password })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          // El registro no inicia sesión: se vuelve al login con el correo
          // precargado y una marca para mostrar el mensaje de éxito.
          void this.router.navigate(['/login'], {
            queryParams: { registered: '1', email: normalizedEmail },
          });
        },
        error: (error: unknown) => this.showError(error),
      });
  }

  /** Traduce 400/409 a mensajes claros mediante MatSnackBar. */
  private showError(error: unknown): void {
    const message = apiErrorMessage(error, 'No se pudo crear la cuenta. Inténtalo de nuevo.', {
      badRequest:
        'Revisa los datos: el nombre es obligatorio y la contraseña debe tener entre 8 y 72 caracteres.',
      conflict: 'Ya existe una cuenta con ese correo electrónico.',
    });

    this.snackBar.open(message, 'Cerrar', { duration: 6000 });
  }
}
