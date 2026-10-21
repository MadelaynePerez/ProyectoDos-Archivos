/**
 * Configuración del entorno de desarrollo.
 * El cliente solo consume la API REST; nunca accede directamente a MongoDB.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
} as const;
