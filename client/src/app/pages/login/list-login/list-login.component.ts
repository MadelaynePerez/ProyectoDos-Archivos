import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../../core/services/auth.service';

/**
 * Pantalla de inicio de sesión.
 *
 * Valida el formulario en cliente, llama a AuthService y, si todo va bien,
 * vuelve a la URL protegida que el guard guardó en `returnUrl`.
 */
@Component({
  selector: 'app-list-login',
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
  templateUrl: './list-login.component.html',
  styleUrl: './list-login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListLoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);

  /** Mensaje de error visible para el usuario. */
  readonly errorMessage = signal<string | null>(null);

  /** Confirmación mostrada al volver desde la pantalla de registro. */
  readonly successMessage = signal<string | null>(null);

  /** Evita dobles envíos mientras la petición está en curso. */
  readonly loading = signal(false);

  /** Permite mostrar u ocultar la contraseña. */
  readonly hidePassword = signal(true);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {
    // Si ya hay sesión, no tiene sentido mostrar el login.
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl(this.returnUrl());
      return;
    }

    // El registro vuelve aquí con `registered=1` y el correo usado.
    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) {
      this.form.controls.email.setValue(email);
    }

    if (this.route.snapshot.queryParamMap.get('registered') === '1') {
      this.successMessage.set('Tu cuenta se creó correctamente. Ya puedes iniciar sesión.');
    }
  }

  /** Envía las credenciales y gestiona los errores de la API. */
  submit(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid || this.loading()) {
      return;
    }

    this.loading.set(true);
    const { email, password } = this.form.getRawValue();

    this.auth.login({ email: email.trim(), password }).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigateByUrl(this.returnUrl());
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.toUserMessage(error));
      },
    });
  }

  /** Limpia el error al escribir para no dejar mensajes obsoletos. */
  clearError(): void {
    if (this.errorMessage()) {
      this.errorMessage.set(null);
    }
  }

  /** URL solicitada antes del login; por defecto, Mis archivos. */
  private returnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')
      ? returnUrl
      : '/files';
  }

  /**
   * Traduce el error HTTP a un mensaje claro en español.
   * 401 puede significar credenciales incorrectas o cuenta desactivada; se
   * respeta el detalle del backend cuando lo envía.
   */
  private toUserMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
    }

    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verifica que la API esté en ejecución.';
    }

    const rawMessage = (error.error as { message?: unknown } | null)?.message;
    const detail = Array.isArray(rawMessage)
      ? rawMessage.join(' ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : '';

    switch (error.status) {
      case 401:
        return detail || 'Correo o contraseña incorrectos. Verifica tus datos.';
      case 400:
        return detail || 'Revisa el correo y la contraseña ingresados.';
      case 409:
        return detail || 'Ya existe una cuenta con ese correo.';
      default:
        return detail || 'No se pudo iniciar sesión. Inténtalo de nuevo.';
    }
  }
}
