# Frontend: Sistema de Gestión Documental

## Stack
Angular 21 (standalone components, signals, HttpClient, router con
guards y lazy routes) + Angular Material (tema Azure/Blue).
App independiente: solo consume la API REST en
http://localhost:3000/api. Nunca accede a MongoDB.

## Contrato con el backend
Leer ../docs/api.md antes de implementar cualquier pantalla. No
inventar endpoints; si falta uno, avisarme.

## Pantallas
- Login y sesión (JWT en interceptor, guard de rutas, logout).
- Explorador de carpetas/archivos: navegar niveles, subir (.txt/.md),
  descargar, renombrar, mover, eliminar, buscar y filtrar.
- Compartir (READ/COMMENT/EDIT), "compartido por mí" y "conmigo".
- Papelera: listar, restaurar, eliminar definitivo.
- Historial de actividad.
- Reportes (12, con filtros de fecha y usuario).
- Panel ADMIN: usuarios (activar/desactivar, rol). Solo ADMIN.

## UI y reutilización (obligatorio)
- Usar Angular Material para todo: tablas, diálogos, menús,
  formularios, botones, chips, paginador y selectores de fecha.
- UN solo componente de tabla reutilizable (app-data-table) usado en
  TODAS las pantallas (archivos, carpetas, compartidos, papelera,
  actividad, usuarios y los 12 reportes). Recibe columnas (clave,
  etiqueta, formato: texto, fecha, tamaño, badge), filas y acciones
  por fila. Emite eventos de acción al padre. Nunca crear una tabla
  nueva por pantalla.
- UN diálogo reutilizable para pedir un texto (renombrar, crear
  carpeta) y UNO para confirmar (eliminar, purgar).
- UN componente de filtros reutilizable (fechas, usuario, búsqueda).
- Estilos propios mínimos; la estética la da Material.

## Reglas
- Servicios por dominio (auth, folders, files, shares, trash,
  activity, reports, users). URL base en environment.
- Interceptor que agrega el token y maneja 401 (volver al login).
- Mensajes claros para 400/404/409.
- Comentarios en español en las partes clave: tengo que defender el
  código.
- Verificar siempre con `ng build`.
