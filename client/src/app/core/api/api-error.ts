import { HttpErrorResponse } from '@angular/common/http';

/** Mensajes alternativos por código cuando el backend no envía un detalle. */
export interface ApiErrorFallbacks {
  badRequest?: string;
  notFound?: string;
  conflict?: string;
}

/**
 * Traduce un error HTTP a un mensaje claro en español.
 *
 * NestJS envía los detalles en `error.message` (texto o array de validación).
 * Se prioriza ese mensaje y, si no existe, se usa el fallback del dominio
 * (400/404/409) o uno genérico según el código.
 */
export function apiErrorMessage(
  error: unknown,
  fallback: string,
  statusFallbacks: ApiErrorFallbacks = {},
): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  if (error.status === 0) {
    return 'No se pudo conectar con el servidor. Verifica que la API esté en ejecución.';
  }

  const rawMessage = (error.error as { message?: unknown } | null)?.message;
  const detail = Array.isArray(rawMessage)
    ? rawMessage.filter((item): item is string => typeof item === 'string').join(' ')
    : typeof rawMessage === 'string'
      ? rawMessage
      : '';

  switch (error.status) {
    case 400:
      return (
        detail ||
        statusFallbacks.badRequest ||
        'La solicitud tiene datos inválidos. Revisa la información.'
      );
    case 404:
      return detail || statusFallbacks.notFound || 'El recurso no existe o ya no está disponible.';
    case 409:
      return (
        detail ||
        statusFallbacks.conflict ||
        'Ya existe un elemento con ese nombre en esta carpeta.'
      );
    case 413:
      return detail || 'El archivo supera el tamaño máximo permitido (5 MB).';
    default:
      return detail || fallback;
  }
}
