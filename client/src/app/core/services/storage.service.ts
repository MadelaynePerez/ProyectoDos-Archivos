import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { apiUrl } from '../api/api';
import type { StorageUsage } from '../models/storage.model';

/**
 * Servicio de cuota de almacenamiento del usuario autenticado.
 *
 * Mantiene un signal compartido con el último resumen recibido de
 * `GET /api/users/me/storage`. El layout lo pinta en el sidenav y las
 * pantallas que modifican el espacio (subir, crear, editar contenido, purgar
 * y vaciar la papelera) llaman a `refresh()` para actualizarlo sin recargar.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly http = inject(HttpClient);

  /** Signal privado: solo cambia con la respuesta de la API. */
  private readonly usageSignal = signal<StorageUsage | null>(null);

  /**
   * Identificador de la última consulta lanzada. Sirve para descartar
   * respuestas viejas (por ejemplo, de la sesión anterior) y evitar que
   * sobrescriban la cuota del usuario actual.
   */
  private requestId = 0;

  /** Resumen actual para leer desde las plantillas (solo lectura). */
  readonly usage = this.usageSignal.asReadonly();

  /** Consulta la cuota, lo usado y lo disponible del usuario del JWT. */
  get(): Observable<StorageUsage> {
    return this.http.get<StorageUsage>(apiUrl('/users/me/storage'));
  }

  /**
   * Refresca el signal compartido tras una operación que cambió el espacio.
   *
   * No devuelve el observable a propósito: las pantallas no deben bloquear su
   * flujo por una consulta informativa. Si falla, se conserva el último valor
   * conocido y la operación principal no se ve afectada.
   */
  refresh(): void {
    const requestId = ++this.requestId;

    this.get().subscribe({
      next: (usage) => {
        // Solo se aplica la respuesta de la consulta más reciente.
        if (requestId === this.requestId) {
          this.usageSignal.set(usage);
        }
      },
      error: () => undefined,
    });
  }

  /**
   * Limpia el resumen al entrar al layout privado.
   *
   * Evita mostrar durante un instante la cuota del usuario anterior cuando se
   * cierra sesión y otra persona inicia sesión en el mismo navegador.
   */
  reset(): void {
    this.requestId++;
    this.usageSignal.set(null);
  }
}
