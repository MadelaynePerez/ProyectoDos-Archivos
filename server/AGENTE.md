# Backend: Sistema de Gestión Documental (ProyectoDos-Archivos)

## Stack Tecnológico
- Framework: NestJS + TypeScript.
- Base de Datos: MongoDB mediante Mongoose.
- Almacenamiento: GridFS para el contenido de archivos (NO rutas locales).
- Autenticación: JWT + bcrypt (AuthGuard global/por ruta).
- Validación: DTOs con `class-validator` y `class-transformer`.
- Conexión: `mongodb://localhost:27017/gestion_documental` (configurable mediante `.env`).
- Habilitar CORS para cliente Angular en `http://localhost:4200`.

## Reglas de Dominio y Módulos

### 1. Usuarios y Roles (`UsersModule` / `AuthModule`)
- Roles: `ADMIN` (gestiona usuarios, info global) y `USER` (sus recursos y compartidos).
- Usuarios activos/inactivos: La desactivación (`isActive: false`) NO borra el historial del usuario.

### 2. Carpetas y Subcarpetas (`FoldersModule`)
- Soporte para estructura jerárquica (carpetas y subcarpetas).
- Validación estricta para evitar ciclos recursivos o referencias huérfanas.

### 3. Archivos `.txt` y `.md` (`FilesModule`)
- Operaciones: Subir (GridFS), descargar, consultar metadata, renombrar, mover, eliminar (soft-delete), buscar/filtrar/ordenar.

### 4. Permisos y Compartición (`ShareModule`)
- Nivel de acceso: Lectura (`READ`), Edición (`EDIT`) y Comentarios (`COMMENT`).
- Control: Solo el propietario puede otorgar o revocar permisos. Acceso estrictamente denegado sin autorización.

### 5. Papelera (`TrashModule`)
- Funcionalidad de Soft-Delete (`isDeleted: true`).
- Opciones: Restaurar recurso a su ubicación o Eliminación definitiva (limpieza en MongoDB y purga del binario en GridFS).
- Los recursos eliminados se excluyen automáticamente de las consultas estándar.

### 6. Historial de Actividad (`ActivityModule`)
- Audit Trail: Registro de usuario, acción realizada, recurso afectado y timestamp.

## Módulo de Reportes (`ReportsModule`)
Utilizar exclusivamente **Aggregation Pipelines** de MongoDB (sin procesamiento pesado en memoria JS) para:
- Archivos por tipo (`.txt` vs `.md`).
- Archivos creados/modificados en rango de fechas.
- Archivos con mayor número de operaciones.
- Top 10 usuarios con más archivos almacenados.
- Usuarios con más recursos compartidos.
- Archivos compartidos con más usuarios.
- Recursos compartidos por / recibidos por un usuario.
- Historial de un usuario en un rango de fechas.
- Operaciones agrupadas por tipo, período y principales acciones.

## Seed de Datos (`/seed`)
- Script automático para poblar: 3 usuarios, carpetas jerárquicas, 50 archivos (.txt y .md), 20+ comparticiones, papelera con recursos e historial suficiente.

## Documentación y Reglas de Código
- Documentar endpoints en `../docs/api.md` (Contrato con el frontend Angular).
- Justificar modelo e índices en `../docs/modelo.md`.
- **Comentarios en español** en las secciones complejas/clave para facilitar la defensa del código.
## Contexto del proyecto
- Este proyecto vive en gestion-documental/server. La documentación va en
  gestion-documental/docs (ruta relativa: ../docs/).
- El proyecto usa ESM con vitest (no CommonJS/Jest). Respetar esa
  configuración en imports (con extensión .js), tests y dependencias.
- Ya está limpio y arranca en el puerto 3000. No usar @nestjs/observe.

## Reglas adicionales
- Eliminar una carpeta manda a la papelera también su contenido
  (subcarpetas y archivos). Restaurar la devuelve con su contenido.
- Al mover una carpeta, validar que el destino no sea ella misma ni
  uno de sus descendientes (evitar ciclos).
- Mantener `storageUsed` en el usuario: sumar al subir, restar al
  eliminar definitivamente.
- El historial NUNCA se borra y guarda una copia del nombre del
  recurso, para que la auditoría siga teniendo sentido aunque el
  recurso ya no exista.
- El permiso de una carpeta compartida aplica a su contenido.
- Solo .txt y .md: validar extensión Y tipo de contenido al subir.
- Prefijo `/api` en las rutas; variables sensibles (JWT_SECRET,
  MONGODB_URI) en `.env`, con un `.env.example` en el repo.
- Hacer commit al terminar cada módulo.