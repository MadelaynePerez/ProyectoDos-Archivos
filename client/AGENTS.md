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

## Estructura (obligatoria)
src/app/
- core/
  - api/: URL base y utilidades HTTP genéricas
  - guards/: authGuard, adminGuard
  - interceptors/: token Bearer y manejo de 401
  - models/: interfaces TypeScript (User, Folder, FileItem, Share,
    TrashItem, ActivityEvent, etc.)
  - services/: un servicio por dominio que llama a la API (auth,
    folders, files, shares, trash, activity, reports, users)
- shared/: componentes reutilizables (data-table, prompt-dialog,
  confirm-dialog, filtros)
- pages/<pantalla>/list-<pantalla>/: componente principal de la
  pantalla, con .ts, .html y .css separados (sin plantillas ni
  estilos inline).
- pages/<pantalla>/components/: modales y piezas propias de esa
  pantalla, cada una en su carpeta con .ts, .html y .css. Los modales
  se llaman save-<cosa>-modal o <accion>-modal.
- Sin NgModules: componentes standalone, rutas con loadComponent.
- Crear componentes con la convención del CLI de Angular.

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
- URL base en environment.
- Mensajes claros para 400/404/409 (MatSnackBar).
- Comentarios en español en las partes clave: tengo que defender el
  código.
- Verificar siempre con `ng build`.
