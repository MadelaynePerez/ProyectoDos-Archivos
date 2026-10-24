/**
 * Resumen de almacenamiento del usuario autenticado.
 *
 * Corresponde a `GET /api/users/me/storage`. Todos los importes están en bytes
 * y `used` incluye los archivos que están en la papelera, porque el espacio
 * solo se libera al purgarlos definitivamente.
 */
export interface StorageUsage {
  /** Cuota total asignada al usuario (`storageQuota`). */
  quota: number;
  /** Bytes ocupados actualmente (`storageUsed`). */
  used: number;
  /** `max(quota - used, 0)`: nunca es negativo. */
  available: number;
}
