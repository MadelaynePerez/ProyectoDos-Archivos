import { environment } from '../../../environments/environment';

/**
 * URL base única de la API REST.
 *
 * El valor real vive en `environment` (regla del proyecto); este módulo lo
 * centraliza para que ningún servicio dependa directamente del environment.
 */
export const API_URL = environment.apiUrl;

/** Construye una URL absoluta de la API a partir de un path relativo. */
export function apiUrl(path: string): string {
  return `${API_URL}/${path.replace(/^\/+/, '')}`;
}
