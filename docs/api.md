# API — Sistema de Gestión Documental

> Contrato HTTP para el frontend Angular.
> Base URL: `http://localhost:3000/api`.

## Datos de prueba del seed

El script `npm run seed` (en `server/`) **elimina la base `gestion_documental`**
y la vuelve a crear con datos reproducibles: 3 usuarios, 24 carpetas, 50
archivos `.txt`/`.md` en GridFS, 33 comparticiones, recursos en papelera e
historial de actividad.

Credenciales conocidas:

| Rol | Email | Contraseña | Nombre |
|---|---|---|---|
| `ADMIN` | `admin@example.com` | `Admin123!` | María Fernández |
| `USER` | `ana.torres@example.com` | `Ana123!` | Ana Torres |
| `USER` | `luis@example.com` | `Luis123!` | Luis Gómez |

Las contraseñas se guardan únicamente como hash bcrypt en `users.passwordHash`.
En el entorno local se pueden usar directamente en `POST /api/auth/login`.

## Autenticación

Todos los endpoints de carpetas y archivos requieren un JWT válido:

```http
Authorization: Bearer <accessToken>
```

El dueño de la carpeta o archivo se obtiene **siempre** del token
(`request.user`). El cliente nunca envía `ownerId` en el body.

El token se firma con `JWT_SECRET` y su vigencia se configura con
`JWT_EXPIRES_IN` (`1h` por defecto en `.env`). En cada request el servidor
vuelve a consultar el usuario: si fue desactivado o eliminado, el token deja de
ser válido y la respuesta es `401`.

### POST `/api/auth/login`

Inicia sesión y devuelve el JWT junto con los datos públicos del usuario. El
email se normaliza a minúsculas y sin espacios antes de compararlo.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `email` | `string` | Sí | Email registrado. Debe ser una dirección válida. |
| `password` | `string` | Sí | Contraseña en texto plano. |

```json
{
  "email": "ana.torres@example.com",
  "password": "Ana123!"
}
```

**Respuesta `200`**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "66f1a1c2e4b0a1b2c3d4e5f6",
    "email": "ana.torres@example.com",
    "name": "Ana Torres",
    "role": "USER",
    "isActive": true,
    "storageUsed": 48213,
    "lastLoginAt": "2026-10-21T12:00:00.000Z",
    "createdAt": "2026-10-01T08:00:00.000Z",
    "updatedAt": "2026-10-21T12:00:00.000Z"
  }
}
```

El login correcto registra `AUTH_LOGIN` en el historial de actividad y
actualiza `lastLoginAt` antes de responder.

**Errores**

| Código | Caso |
|---:|---|
| `400` | `email` o `password` ausentes o con formato inválido. |
| `401` | Credenciales inválidas (`Credenciales inválidas`) o cuenta desactivada (`La cuenta está desactivada`). |

### POST `/api/auth/register`

Registro público. Siempre crea un usuario con rol `USER`: cualquier `role`
enviado en el body se descarta. **No devuelve token**; después del registro hay
que llamar a `POST /api/auth/login`.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `email` | `string` | Sí | Email único. Se normaliza a minúsculas y sin espacios. |
| `name` | `string` | Sí | Nombre visible, máximo 120 caracteres. |
| `password` | `string` | Sí | Entre 8 y 72 caracteres. |

```json
{
  "email": "nuevo@example.com",
  "name": "Nuevo Usuario",
  "password": "Secreto123!"
}
```

**Respuesta `201`**

```json
{
  "_id": "6700000000000000000000c1",
  "email": "nuevo@example.com",
  "name": "Nuevo Usuario",
  "role": "USER",
  "isActive": true,
  "storageUsed": 0,
  "lastLoginAt": null,
  "createdAt": "2026-10-21T12:00:00.000Z",
  "updatedAt": "2026-10-21T12:00:00.000Z"
}
```

La contraseña se guarda solo como hash bcrypt en `passwordHash`; ese campo
nunca aparece en las respuestas.

**Errores**

| Código | Caso |
|---:|---|
| `400` | Email inválido, `name` vacío o contraseña fuera del rango 8–72. |
| `409` | El email ya está registrado. |

### Respuesta de autenticación

Solo `POST /api/auth/login` devuelve `accessToken`. El cliente debe:

1. Guardar `accessToken` y `user` (por ejemplo, en `localStorage`).
2. Enviar `Authorization: Bearer <accessToken>` en cada request protegido.
3. Tratar cualquier `401` como sesión inválida: borrar el token y volver al
   login.

El objeto `user` es el documento público de `users`: incluye `_id`, `email`,
`name`, `role` (`ADMIN` o `USER`), `isActive`, `storageUsed`, `lastLoginAt`,
`createdAt` y `updatedAt`. Nunca incluye `passwordHash`.

El JWT contiene `sub` (id del usuario), `email` y `role`; el rol se vuelve a
leer de la base de datos en cada request, por lo que un cambio de rol o una
desactivación surten efecto de inmediato.

### Política de visibilidad

- Una carpeta que no existe, está en papelera o pertenece a otro usuario
  devuelve **404**, nunca 403, para no revelar que existe.
- Todas las listas filtran `isDeleted: false`.
- Los nombres de carpetas deben ser únicos entre hermanas activas del mismo
  dueño. La comparación es exacta (sensible a mayúsculas y acentos).
- Un recurso compartido se accede según el permiso efectivo
  (`OWNER > EDIT > COMMENT > READ > NONE`). Sin permiso suficiente la respuesta
  también es **404**: el recurso "no existe" para ese usuario.
- La herencia de permisos y el detalle de cada nivel se describen en
  [Comparticiones](#comparticiones).

---

## Usuarios

Panel de administración. **Todos los endpoints de este módulo requieren JWT y
rol `ADMIN`**: sin token la respuesta es `401`; con un token de rol `USER`, `403`.

### GET `/api/users`

Lista todos los usuarios, ordenados del alta más reciente al más antiguo
(`createdAt` descendente). Incluye usuarios activos e inactivos.

```http
GET /api/users
Authorization: Bearer <accessToken>
```

**Respuesta `200`**

```json
[
  {
    "_id": "66f1a1c2e4b0a1b2c3d4e5f6",
    "email": "ana.torres@example.com",
    "name": "Ana Torres",
    "role": "USER",
    "isActive": true,
    "storageUsed": 48213,
    "lastLoginAt": "2026-10-21T12:00:00.000Z",
    "createdAt": "2026-10-01T08:00:00.000Z",
    "updatedAt": "2026-10-21T12:00:00.000Z"
  }
]
```

Nunca se devuelve `passwordHash`. Si no hay usuarios, devuelve `[]`.

**Errores**

| Código | Caso |
|---:|---|
| `401` | Falta el JWT o no es válido. |
| `403` | El usuario autenticado no es `ADMIN`. |

### PATCH `/api/users/:id`

Actualiza el rol y/o el estado de un usuario. Es la única vía para
activar/desactivar cuentas o promover/degradar roles. Deliberadamente **no**
permite cambiar `email`, contraseña ni `storageUsed`.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `role` | `string` | No | `ADMIN` o `USER`. |
| `isActive` | `boolean` | No | `true` activa la cuenta; `false` impide el login. |

```json
{
  "role": "ADMIN",
  "isActive": true
}
```

Se puede enviar solo uno de los dos campos. Desactivar un usuario no borra sus
recursos, sus comparticiones ni su historial; solo impide que inicie sesión y
invalida sus tokens en la siguiente petición.

**Respuesta `200`**: documento público actualizado del usuario.

```json
{
  "_id": "66f1a1c2e4b0a1b2c3d4e5f6",
  "email": "ana.torres@example.com",
  "name": "Ana Torres",
  "role": "ADMIN",
  "isActive": true,
  "storageUsed": 48213,
  "lastLoginAt": "2026-10-21T12:00:00.000Z",
  "createdAt": "2026-10-01T08:00:00.000Z",
  "updatedAt": "2026-10-21T12:05:00.000Z"
}
```

**Errores**

| Código | Caso |
|---:|---|
| `400` | `role` no es `ADMIN`/`USER` o `isActive` no es booleano. |
| `401` | Falta el JWT o no es válido. |
| `403` | El usuario autenticado no es `ADMIN`. |
| `404` | El `:id` no es un ObjectId válido o el usuario no existe. |

---

## Carpetas

Colección: `folders`.
Jerarquía: `parentId` + `ancestors` + `depth` (materialized path).

### POST `/api/folders`

Crea una carpeta en la raíz o dentro de otra carpeta.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `name` | `string` | Sí | Nombre visible. Se aplica `trim` y máximo 255 caracteres. |
| `parentId` | `string` | No | `_id` de la carpeta padre. Si se omite o es `null`, se crea en la raíz. |

```json
{
  "name": "Proyectos",
  "parentId": null
}
```

**Respuesta `201`**

```json
{
  "_id": "6700000000000000000000a1",
  "name": "Proyectos",
  "ownerId": "66f1a1c2e4b0a1b2c3d4e5f6",
  "parentId": null,
  "ancestors": [],
  "depth": 0,
  "isDeleted": false,
  "deletedAt": null,
  "deletedBy": null,
  "deletedRootId": null,
  "createdAt": "2026-10-19T10:00:00.000Z",
  "updatedAt": "2026-10-19T10:00:00.000Z"
}
```

Para una subcarpeta, `ancestors` es la cadena del padre más el `_id` del padre,
y `depth = padre.depth + 1`:

```json
{
  "_id": "6700000000000000000000a2",
  "name": "2026",
  "parentId": "6700000000000000000000a1",
  "ancestors": ["6700000000000000000000a1"],
  "depth": 1
}
```

**Errores**

| Código | Caso |
|---:|---|
| `400` | `parentId` inválido o profundidad máxima (`100`) superada. |
| `404` | El padre no existe, está en papelera o es de otro usuario. |
| `409` | Ya existe una hermana activa con ese nombre. |

---

### GET `/api/folders?parentId=<id>`

Lista las **subcarpetas activas** de un padre, ordenadas por nombre. Sin
`parentId` lista la raíz del usuario autenticado. En una carpeta compartida
basta `READ` para poder listar su contenido.

| Query | Obligatorio | Descripción |
|---|---:|---|
| `parentId` | No | `_id` del padre. Si se omite o va vacío, lista la raíz (`parentId: null`). |

**Ejemplo**

```http
GET /api/folders?parentId=6700000000000000000000a1
Authorization: Bearer <accessToken>
```

**Respuesta `200`**

```json
[
  {
    "_id": "6700000000000000000000a2",
    "name": "2026",
    "ownerId": "66f1a1c2e4b0a1b2c3d4e5f6",
    "parentId": "6700000000000000000000a1",
    "ancestors": ["6700000000000000000000a1"],
    "depth": 1,
    "isDeleted": false,
    "deletedAt": null,
    "deletedBy": null,
    "deletedRootId": null,
    "createdAt": "2026-10-19T10:05:00.000Z",
    "updatedAt": "2026-10-19T10:05:00.000Z"
  }
]
```

Si el padre no tiene hijas activas, devuelve `[]`.

**Errores**

| Código | Caso |
|---:|---|
| `400` | `parentId` no es un ObjectId válido. |
| `404` | El padre no existe, está en papelera o no hay acceso (`READ+`). |

---

### PATCH `/api/folders/:id/rename`

Renombra una carpeta activa. El propietario siempre puede; un invitado
necesita acceso efectivo `EDIT` sobre la carpeta (propio o heredado de un
ancestro). La unicidad del nombre se valida contra las hermanas del dueño real.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `name` | `string` | Sí | Nuevo nombre. `trim` y máximo 255 caracteres. |

```json
{
  "name": "Proyectos 2026"
}
```

**Respuesta `200`**: documento completo de la carpeta actualizado.

**Errores**

| Código | Caso |
|---:|---|
| `400` | `name` vacío o inválido. |
| `404` | La carpeta no existe, está en papelera o no hay acceso `EDIT`. |
| `409` | Ya existe una hermana activa con ese nombre. |

---

### PATCH `/api/folders/:id/move`

Mueve una carpeta y **todo su subárbol** a otro padre o a la raíz.
**Solo el propietario**: un invitado con `EDIT` recibe `404`.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `newParentId` | `string \| null` | Sí | Nuevo padre. `null` explícito mueve a la raíz. |

```json
{
  "newParentId": "6700000000000000000000b1"
}
```

Para mover a la raíz:

```json
{
  "newParentId": null
}
```

**Reglas**

- Se rechaza mover una carpeta dentro de sí misma.
- Se rechaza mover una carpeta dentro de uno de sus descendientes (ciclo): si
  el destino tiene el `_id` de la carpeta en su cadena `ancestors`.
- El destino debe pertenecer al mismo dueño y estar activo.
- Se respeta la profundidad máxima de `100`.
- El nombre no puede chocar con una hermana activa del nuevo padre.
- Se actualizan `ancestors` y `depth` de **todos** los descendientes mediante
  `updateMany` con una aggregation pipeline, sin recursión en JavaScript.

**Respuesta `200`**: documento actualizado de la carpeta movida.

**Errores**

| Código | Caso |
|---:|---|
| `400` | Se intenta mover sobre sí misma, dentro de un descendiente, o se supera la profundidad máxima. |
| `404` | La carpeta o el destino no existen, son de otro usuario o el llamador no es el propietario. |
| `409` | El destino está en papelera o hay conflicto de nombre. |

---

### DELETE `/api/folders/:id`

Envía a la papelera la carpeta, sus subcarpetas activas y los archivos activos
de ese subárbol. Es un **soft delete**: no se borra nada físicamente.
**Solo el propietario**: un invitado con `EDIT` recibe `404`.

- La carpeta raíz de la operación recibe `deletedRootId = _id`.
- Los descendientes activos reciben el mismo `deletedAt`, `deletedBy` y
  `deletedRootId`.
- Los descendientes que **ya estaban** en papelera no se tocan: conservan su
  fecha y su raíz original.
- La cascada se resuelve con `updateMany` usando `ancestors`, sin recursión en
  JavaScript.
- No se usan transacciones: el orden es primero la carpeta y luego los
  descendientes activos.

**Respuesta `200`**

```json
{
  "folderId": "6700000000000000000000a1",
  "name": "Proyectos",
  "affectedFolders": 3,
  "affectedFiles": 8
}
```

`affectedFolders` incluye la carpeta raíz y sus descendientes activos.
`affectedFiles` cuenta los archivos activos del subárbol.

**Errores**

| Código | Caso |
|---:|---|
| `404` | La carpeta no existe, ya está en papelera o el llamador no es el propietario. |

---

## Archivos

Colección: `files` (metadatos).
Contenido: GridFS (`fs.files` + `fs.chunks`), referenciado con `gridFsId`.
Solo se permiten archivos de texto `.txt` y `.md`.

### Reglas de validación

- Extensión permitida: `.txt` o `.md`.
- MIME declarado: `text/plain` o `text/markdown`. Se normaliza según la
  extensión: `.txt` → `text/plain`, `.md` → `text/markdown`.
- El contenido debe ser **UTF-8 válido** y no contener bytes NUL. Un binario
  renombrado a `.txt` se rechaza aunque declare un MIME textual.
- Tamaño máximo: **5 MB**.
- `folderId` opcional: si se omite, el archivo vive en la raíz del usuario.
- Nombre único entre archivos activos de la misma carpeta y dueño.
- Archivo, carpeta destino o contenido sin acceso suficiente: **404**.
- Subir siempre crea un recurso: es una operación estructural y queda
  reservada al propietario. Un invitado con `EDIT` puede actualizar el
  contenido o renombrar, pero no crear archivos nuevos en la carpeta.

### POST `/api/files`

Sube un archivo. `multipart/form-data`:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `file` | archivo | Sí | Contenido `.txt` o `.md`, máximo 5 MB. |
| `folderId` | `string` | No | Carpeta destino activa del mismo dueño. Si se omite, va a la raíz. |

```bash
curl -X POST http://localhost:3000/api/files \
  -H "Authorization: Bearer <accessToken>" \
  -F "file=@informe.txt;type=text/plain" \
  -F "folderId=6700000000000000000000a1"
```

**Respuesta `201`**

```json
{
  "_id": "6710000000000000000000f1",
  "name": "informe.txt",
  "ownerId": "66f1a1c2e4b0a1b2c3d4e5f6",
  "folderId": "6700000000000000000000a1",
  "extension": "txt",
  "mimeType": "text/plain",
  "size": 4821,
  "gridFsId": "67200000000000000000ab01",
  "contentHash": "9f2c1d7e5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d",
  "isDeleted": false,
  "deletedAt": null,
  "deletedBy": null,
  "deletedRootId": null,
  "createdAt": "2026-10-19T11:00:00.000Z",
  "updatedAt": "2026-10-19T11:00:00.000Z"
}
```

**Errores**

| Código | Caso |
|---:|---|
| `400` | Falta `file`, extensión no permitida, MIME no textual, contenido no UTF-8 o `folderId` inválido. |
| `404` | La carpeta no existe, está en papelera, es de otro usuario o el llamador no es el propietario. |
| `409` | Ya existe un archivo activo con ese nombre en la carpeta. |
| `413` | El archivo supera los 5 MB. |

---

### GET `/api/files`

Lista metadatos de archivos activos de una carpeta o de la raíz. La raíz solo
devuelve archivos propios; una carpeta compartida devuelve su contenido a los
invitados con `READ+`. Los archivos compartidos sueltos se consultan en
`GET /api/shares/shared-with-me`.

| Query | Obligatorio | Descripción |
|---|---:|---|
| `folderId` | No | Carpeta a listar. Si se omite, lista la raíz. |
| `search` | No | Búsqueda por subcadena en `name`, sin distinguir mayúsculas. |
| `extension` | No | `txt` o `md`. |
| `sortBy` | No | `name` (por defecto), `date` (= `createdAt`) o `size`. |
| `sortOrder` | No | `asc` (por defecto) o `desc`. |

```http
GET /api/files?folderId=6700000000000000000000a1&search=informe&extension=txt&sortBy=size&sortOrder=desc
Authorization: Bearer <accessToken>
```

**Respuesta `200`**: array de documentos de metadatos.

**Errores**

| Código | Caso |
|---:|---|
| `400` | Algún filtro u orden inválido. |
| `404` | La carpeta no existe, está en papelera o no hay acceso `READ`. |

---

### GET `/api/files/:id`

Devuelve los metadatos de un archivo activo propio o compartido con `READ+`.
El permiso puede ser directo sobre el archivo o heredado de su carpeta y de los
ancestros de esa carpeta.

**Respuesta `200`**: documento de `files`.

**Errores**

| Código | Caso |
|---:|---|
| `404` | El archivo no existe, está en papelera o no hay acceso `READ`. |

---

### GET `/api/files/:id/download`

Descarga el contenido desde GridFS mediante streaming. Requiere `READ+`
(directo o heredado). Cada descarga registra `FILE_DOWNLOAD` con el actor real.

- `Content-Type`: `text/plain; charset=utf-8` o `text/markdown; charset=utf-8`.
- `Content-Disposition`: `attachment` con el nombre visible.
- `Content-Length`: tamaño del archivo.

**Errores**

| Código | Caso |
|---:|---|
| `404` | El archivo o su binario no existen, está en papelera o no hay acceso `READ`. |

---

### PATCH `/api/files/:id/rename`

Renombra conservando la extensión original y actualiza también `filename` en
GridFS. Requiere `EDIT` (propio o heredado); el propietario siempre puede.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `name` | `string` | Sí | Nuevo nombre, con o sin extensión. |

```json
{
  "name": "informe-final"
}
```

El ejemplo anterior renombra `informe.txt` a `informe-final.txt`. Si se envía
una extensión distinta a la actual, se responde `400`.

**Respuesta `200`**: documento actualizado.

**Errores**

| Código | Caso |
|---:|---|
| `400` | Nombre vacío o intento de cambiar la extensión. |
| `404` | El archivo no existe, está en papelera o no hay acceso `EDIT`. |
| `409` | Ya existe un archivo activo con ese nombre en la carpeta. |

---

### PATCH `/api/files/:id/move`

Mueve un archivo a otra carpeta activa del mismo dueño o a la raíz.
**Solo el propietario**: un invitado con `EDIT` recibe `404`.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `newFolderId` | `string \| null` | Sí | Carpeta destino. `null` mueve a la raíz. |

```json
{
  "newFolderId": "6700000000000000000000b1"
}
```

**Respuesta `200`**: documento actualizado.

**Errores**

| Código | Caso |
|---:|---|
| `400` | Falta `newFolderId` o el id es inválido. |
| `404` | El archivo o la carpeta destino no existen, son de otro usuario o el llamador no es el propietario. |
| `409` | La carpeta destino está en papelera o hay conflicto de nombre. |

---

### PUT `/api/files/:id/content`

Reemplaza el contenido de un archivo existente. `multipart/form-data` con el
campo `file`. El nuevo archivo debe conservar la extensión actual y cumple las
mismas validaciones de tipo, UTF-8 y tamaño. Requiere `EDIT` (propio o
heredado). El espacio se sigue contabilizando en `storageUsed` del dueño real
del archivo, aunque quien edite sea un invitado.

**Orden sin transacciones**

1. Escribir el nuevo binario en GridFS.
2. Actualizar `gridFsId`, `size`, `contentHash` y `updatedAt` en `files`.
3. Ajustar `storageUsed` con la diferencia de tamaño (`nuevo - anterior`).
4. Borrar el binario anterior.

Si falla un paso intermedio se revierte la metadata y se elimina el binario
nuevo. La eliminación del binario anterior es best-effort: un fallo deja un
huérfano recuperable por reconciliación, nunca un archivo roto.

```bash
curl -X PUT http://localhost:3000/api/files/6710000000000000000000f1/content \
  -H "Authorization: Bearer <accessToken>" \
  -F "file=@informe-actualizado.txt;type=text/plain"
```

**Respuesta `200`**: documento actualizado.

**Errores**

| Código | Caso |
|---:|---|
| `400` | Falta `file`, extensión distinta, MIME no textual o contenido no UTF-8. |
| `404` | El archivo no existe, está en papelera o no hay acceso `EDIT`. |
| `413` | El archivo supera los 5 MB. |

---

### DELETE `/api/files/:id`

Envía un archivo a la papelera. Es un **soft delete**: no borra el binario de
GridFS ni resta `storageUsed`, porque el espacio se libera solo con la purga
definitiva. **Solo el propietario**: un invitado con `EDIT` recibe `404`.

- Marca `isDeleted: true`, `deletedAt`, `deletedBy` y
  `deletedRootId = archivo._id`.
- Registra `FILE_DELETE` con `parentId`, `extension` y `size`.
- El archivo deja de aparecer en todos los listados y descargas estándar.

**Respuesta `200`**: documento del archivo ya marcado como borrado.

```json
{
  "_id": "6710000000000000000000f1",
  "name": "informe.txt",
  "folderId": "6700000000000000000000a1",
  "isDeleted": true,
  "deletedAt": "2026-10-19T18:00:00.000Z",
  "deletedBy": "66f1a1c2e4b0a1b2c3d4e5f6",
  "deletedRootId": "6710000000000000000000f1"
}
```

**Errores**

| Código | Caso |
|---:|---|
| `404` | El archivo no existe, ya está en papelera o el llamador no es el propietario. |

---

## Papelera

La papelera no es una colección aparte: son los documentos de `files` y
`folders` con `isDeleted: true`. `deletedRootId` identifica la raíz de cada
borrado:

- Archivo borrado suelto: `deletedRootId = archivo._id`.
- Carpeta borrada: la carpeta y sus descendientes activos reciben
  `deletedRootId = carpeta._id`.
- Los descendientes que ya estaban en papelera antes conservan su propia raíz;
  al restaurar la carpeta no se "resucitan" borrados independientes anteriores.

En las rutas, `:type` acepta `file` o `folder` (sin distinguir mayúsculas).

### GET `/api/trash`

Lista las **raíces** de la papelera del usuario autenticado: solo documentos
con `isDeleted: true` y `deletedRootId == _id`. Los descendientes de una
carpeta no se listan por separado. Archivos y carpetas se devuelven en un único
array ordenado por `deletedAt` descendente.

**Respuesta `200`**

```json
[
  {
    "_id": "6700000000000000000000a1",
    "type": "folder",
    "name": "Proyectos",
    "ownerId": "66f1a1c2e4b0a1b2c3d4e5f6",
    "parentId": null,
    "ancestors": [],
    "depth": 0,
    "isDeleted": true,
    "deletedAt": "2026-10-19T18:10:00.000Z",
    "deletedBy": "66f1a1c2e4b0a1b2c3d4e5f6",
    "deletedRootId": "6700000000000000000000a1"
  },
  {
    "_id": "6710000000000000000000f1",
    "type": "file",
    "name": "informe.txt",
    "ownerId": "66f1a1c2e4b0a1b2c3d4e5f6",
    "folderId": null,
    "extension": "txt",
    "mimeType": "text/plain",
    "size": 4821,
    "gridFsId": "67200000000000000000ab01",
    "isDeleted": true,
    "deletedAt": "2026-10-19T18:00:00.000Z",
    "deletedBy": "66f1a1c2e4b0a1b2c3d4e5f6",
    "deletedRootId": "6710000000000000000000f1"
  }
]
```

Si la papelera está vacía, devuelve `[]`.

**Errores**

| Código | Caso |
|---:|---|
| `401` | Falta el JWT o no es válido. |

---

### POST `/api/trash/:type/:id/restore`

Restaura un archivo o una carpeta. Solo el propietario del recurso puede
restaurarlo.

**Reglas**

- El padre (`folderId` del archivo o `parentId` de la carpeta) debe estar
  activo. Si el padre sigue en papelera o no existe, responde `409`: primero
  debe restaurarse el ancestro.
- El nombre no puede chocar con un hermano activo del mismo dueño; si choca,
  responde `409` y el cliente decide renombrar.
- Restaurar una carpeta restaura también todos los documentos con
  `deletedRootId = carpeta._id` (subcarpetas y archivos de esa cascada).
- Los descendientes con otra raíz (borrados antes por separado) siguen en
  papelera.
- Restaurar no modifica `storageUsed`: el espacio ya se contaba desde la
  subida.
- Registra `FILE_RESTORE` o `FOLDER_RESTORE` cuando el estado ya quedó
  restaurado.

**Respuesta `200`**: documento del recurso restaurado (`isDeleted: false`,
`deletedAt`, `deletedBy` y `deletedRootId` en `null`).

**Errores**

| Código | Caso |
|---:|---|
| `400` | `:type` no es `file` ni `folder`. |
| `404` | El recurso no existe, no está en papelera o es de otro usuario. |
| `409` | El padre no está activo o el nombre choca con un hermano activo. |

---

### DELETE `/api/trash/:type/:id`

Purga definitivamente un recurso de la papelera. La operación **no usa
transacciones** y sigue un orden seguro:

1. **Primero** escribe el evento de auditoría (`FILE_PURGE` o `FOLDER_PURGE`)
   con `resourceName`, contadores y `batchId`. Es el último momento en que se
   conoce el nombre y el contexto.
2. Borra los binarios de GridFS: primero `fs.chunks` y después `fs.files`.
3. Borra las comparticiones (`shares`) de los recursos afectados.
4. Borra los documentos de `files` y `folders`.
5. Resta `storageUsed` al dueño con un `$inc` atómico por la suma de tamaños
   capturada antes de borrar.

Para un **archivo** se purga solo ese archivo. Para una **carpeta** se purga
todo el subárbol (`ancestors: carpeta._id`) y todos sus archivos, estén o no en
papelera, porque el subárbol desaparece físicamente.

**Respuesta `200`**

```json
{
  "type": "folder",
  "resourceId": "6700000000000000000000a1",
  "name": "Proyectos",
  "affectedFolders": 3,
  "affectedFiles": 8,
  "freedBytes": 48213,
  "batchId": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}
```

`affectedFolders` incluye la carpeta raíz y todos sus descendientes.
`affectedFiles` cuenta todos los archivos del subárbol. `freedBytes` es la suma
de `size` restada de `storageUsed`.

**Errores**

| Código | Caso |
|---:|---|
| `400` | `:type` no es `file` ni `folder`. |
| `404` | El recurso no existe, no está en papelera o es de otro usuario. |

> Si falla un paso intermedio, el evento de auditoría ya quedó escrito y los
> pasos 2–4 son idempotentes, por lo que la operación puede reintentarse. Un
> binario huérfano o un `storageUsed` desajustado se corrigen con el job de
> reconciliación descrito en `modelo.md`.

---

### DELETE `/api/trash`

Vacía la papelera completa del usuario autenticado. Incluye todas las raíces
borradas y, para cada carpeta en papelera, todo su subárbol físico.

- Escribe **primero** `TRASH_EMPTY` con `batchId`, `affectedFolders`,
  `affectedFiles` y `freedBytes`.
- Después limpia GridFS, `shares` y documentos igual que una purga individual.
- Resta el total liberado de `storageUsed` con `$inc` atómico.

**Respuesta `200`**

```json
{
  "type": "trash",
  "resourceId": null,
  "name": "Papelera",
  "affectedFolders": 3,
  "affectedFiles": 8,
  "freedBytes": 48213,
  "batchId": "8d0f7780-8536-51ef-a55c-f18ad2c01bf8"
}
```

**Errores**

| Código | Caso |
|---:|---|
| `401` | Falta el JWT o no es válido. |

---

## Comparticiones

Colección: `shares`. Es la relación muchos-a-muchos entre usuarios y recursos
(`FILE` o `FOLDER`). Un recurso solo puede tener un share por destinatario; para
cambiar el nivel se actualiza el mismo documento.

### Modelo de permisos

Jerarquía creciente: `READ < COMMENT < EDIT`; el propietario se representa como
`OWNER`.

| Nivel | Permite |
|---|---|
| `READ` | Ver metadatos, listar el contenido de una carpeta y descargar archivos. |
| `COMMENT` | Todo lo de `READ`. Reservado para una futura funcionalidad de comentarios. |
| `EDIT` | Todo lo de `COMMENT`, renombrar y reemplazar el contenido de archivos. |
| `OWNER` | Control total. No se guarda en `shares`; se deriva de `ownerId`. |
| `NONE` | Sin acceso. Toda operación responde `404`. |

Reglas de herencia:

- El permiso de una carpeta aplica a todo su contenido **actual y futuro**:
  archivos, subcarpetas y los archivos de esas subcarpetas.
- Para un **archivo**, el acceso efectivo es el máximo entre:
  - el share directo del archivo, y
  - los shares de su carpeta contenedora y de todas las carpetas en
    `folder.ancestors`.
- Para una **carpeta**, el acceso efectivo es el máximo entre sus propios
  shares y los de sus ancestros.
- Revocar un share de carpeta elimina la herencia, pero no los shares directos
  que existan sobre archivos concretos. Revocar un archivo no afecta a la
  carpeta.
- Un recurso en papelera devuelve `NONE` para todos, aunque el share siga
  existiendo. Al restaurarlo, el permiso vuelve a aplicar.
- Operaciones estructurales (**crear, mover, eliminar y compartir**) son
  exclusivas del propietario. Un invitado no puede re-compartir.
- Un usuario desactivado no puede autenticarse; sus `shares` se conservan.

El cálculo centralizado vive en `AccessService#getEffectiveAccess`, que devuelve
`OWNER`, `EDIT`, `COMMENT`, `READ` o `NONE`. `FilesModule` y `FoldersModule` lo
usan en cada operación; un recurso sin acceso suficiente se responde como `404`.

### POST `/api/shares`

Concede un permiso. Si ya existe un share para el mismo recurso y destinatario,
**actualiza `access`** en el mismo documento (no duplica). Solo el propietario
del recurso puede compartirlo.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `resourceType` | `string` | Sí | `FILE` o `FOLDER`. |
| `resourceId` | `string` | Sí | `_id` del recurso, activo y del usuario autenticado. |
| `granteeEmail` | `string` | Condicional | Email del destinatario. Excluyente con `granteeId`. |
| `granteeId` | `string` | Condicional | `_id` del destinatario. Excluyente con `granteeEmail`. |
| `access` | `string` | Sí | `READ`, `COMMENT` o `EDIT`. |

Debe enviarse **exactamente uno** de `granteeEmail` o `granteeId`. El
destinatario debe existir, estar activo y ser distinto del propietario.

```json
{
  "resourceType": "FOLDER",
  "resourceId": "6700000000000000000000a2",
  "granteeEmail": "luis@example.com",
  "access": "READ"
}
```

**Respuesta `201`**: documento de `shares`. Si el permiso ya existía, la
respuesta es el mismo documento actualizado (`201`).

```json
{
  "_id": "67400000000000000000ee01",
  "resourceType": "FOLDER",
  "resourceId": "6700000000000000000000a2",
  "ownerId": "66f1a1c2e4b0a1b2c3d4e5f6",
  "granteeId": "66f1a1c2e4b0a1b2c3d4e5f7",
  "access": "READ",
  "createdAt": "2026-10-19T15:00:00.000Z",
  "updatedAt": "2026-10-19T15:00:00.000Z"
}
```

**Errores**

| Código | Caso |
|---:|---|
| `400` | `resourceType`/`access` inválidos, faltan o sobran identificadores del destinatario, o el destinatario es el propietario. |
| `404` | El recurso no existe, está en papelera o no es del usuario; el destinatario no existe o está inactivo. |

---

### PATCH `/api/shares/:id`

Cambia el nivel de acceso de un share. Solo el propietario que lo concedió.

**Body**

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `access` | `string` | Sí | `READ`, `COMMENT` o `EDIT`. |

```json
{
  "access": "EDIT"
}
```

**Respuesta `200`**: documento de `shares` actualizado.

**Errores**

| Código | Caso |
|---:|---|
| `400` | `access` inválido. |
| `404` | El share no existe o no pertenece al usuario autenticado. |

---

### DELETE `/api/shares/:id`

Retira un permiso. Solo el propietario que lo concedió. Los permisos heredados
de este share dejan de aplicar al contenido del recurso.

**Respuesta `200`**

```json
{
  "shareId": "67400000000000000000ee01",
  "revoked": true
}
```

**Errores**

| Código | Caso |
|---:|---|
| `404` | El share no existe o no pertenece al usuario autenticado. |

---

### GET `/api/shares/shared-by-me`

Permisos concedidos por el usuario autenticado, del más reciente al más antiguo.
Incluye el **nombre actual** del recurso (aunque se haya renombrado) y los datos
básicos del destinatario. Se omiten shares de recursos purgados o en papelera.

**Respuesta `200`**

```json
[
  {
    "_id": "67400000000000000000ee01",
    "resourceType": "FOLDER",
    "resourceId": "6700000000000000000000a2",
    "resourceName": "2026",
    "access": "EDIT",
    "owner": {
      "_id": "66f1a1c2e4b0a1b2c3d4e5f6",
      "name": "Ana Torres",
      "email": "ana.torres@example.com"
    },
    "grantee": {
      "_id": "66f1a1c2e4b0a1b2c3d4e5f7",
      "name": "Luis Gómez",
      "email": "luis@example.com"
    },
    "createdAt": "2026-10-05T15:00:00.000Z",
    "updatedAt": "2026-10-19T15:00:00.000Z"
  }
]
```

### GET `/api/shares/shared-with-me`

Permisos recibidos por el usuario autenticado, del más reciente al más antiguo.
Mismo formato que el listado anterior. Un archivo dentro de una carpeta
compartida no aparece aquí: se accede navegando la carpeta o con el share
directo del archivo.

**Respuesta `200`**: array con el mismo formato que `shared-by-me`.

---

## Historial de actividad

Colección: `activity_log`. Es un **audit trail append-only**: los eventos solo
se insertan, nunca se actualizan ni se eliminan. Cada evento guarda una copia de
`actorName`, `actorRole` y `resourceName` en el momento de la acción, por lo que
el historial sigue siendo legible aunque el usuario se desactive o el recurso se
purgue definitivamente.

Acciones registradas actualmente:

- `AUTH_LOGIN` al iniciar sesión correctamente.
- `FOLDER_CREATE`, `FOLDER_RENAME`, `FOLDER_MOVE`, `FOLDER_DELETE`,
  `FOLDER_RESTORE`, `FOLDER_PURGE`.
- `FILE_UPLOAD`, `FILE_DOWNLOAD`, `FILE_RENAME`, `FILE_MOVE`, `FILE_UPDATE`,
  `FILE_DELETE`, `FILE_RESTORE`, `FILE_PURGE`.
- `TRASH_EMPTY` al vaciar la papelera, con `resourceType: "SYSTEM"` y
  contadores de carpetas, archivos y bytes liberados.
- `SHARE_GRANT`, `SHARE_UPDATE` y `SHARE_REVOKE` con
  `resourceType: "SHARE"` y el `_id` del share en `resourceId`. El `metadata`
  conserva `resourceType`, `resourceId` y `granteeId` del recurso compartido,
  más `access` (y `previousAccess` en las actualizaciones). El `resourceName`
  es una copia del nombre del recurso en ese momento.

### GET `/api/activity`

Devuelve el historial del **usuario autenticado**, ordenado del evento más
reciente al más antiguo. No se puede consultar el historial de otro usuario: el
`actorId` sale siempre del JWT.

| Query | Obligatorio | Descripción |
|---|---|---|
| `from` | No | Fecha/hora ISO 8601 inicial, inclusive. |
| `to` | No | Fecha/hora ISO 8601 final, inclusive. |
| `page` | No | Página, desde `1`. Por defecto `1`. |
| `limit` | No | Eventos por página, de `1` a `100`. Por defecto `20`. |

```http
GET /api/activity?from=2026-10-01T00:00:00.000Z&to=2026-10-31T23:59:59.999Z&page=1&limit=20
Authorization: Bearer <accessToken>
```

**Respuesta `200`**

```json
{
  "items": [
    {
      "_id": "67500000000000000000ff01",
      "actorId": "66f1a1c2e4b0a1b2c3d4e5f6",
      "actorName": "Ana Torres",
      "actorRole": "USER",
      "action": "FILE_UPLOAD",
      "resourceType": "FILE",
      "resourceId": "6710000000000000000000f1",
      "resourceName": "informe.txt",
      "metadata": {
        "parentId": "6700000000000000000000a1",
        "extension": "txt",
        "size": 4821
      },
      "createdAt": "2026-10-19T11:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

`items` contiene los documentos completos de `activity_log`. `total` es el
número de eventos que cumplen el rango (no solo los de la página actual). Si no
hay eventos, `items` es `[]` y `totalPages` es `0`.

**Errores**

| Código | Caso |
|---:|---|
| `400` | `from`/`to` no son fechas ISO 8601 válidas, `from > to`, o `page`/`limit` están fuera de rango. |
| `401` | Falta el JWT o no es válido. |

---

## Reportes

Base: `/api/reports`. Todos los endpoints requieren un JWT válido
(`Authorization: Bearer <accessToken>`).

Los reportes se calculan **exclusivamente con aggregation pipelines** de
MongoDB. El servidor no trae documentos para contarlos o agruparlos en
JavaScript.

### Alcance y reglas de acceso

| Rol | Alcance |
|---|---|
| `ADMIN` | Datos globales y de cualquier usuario. |
| `USER` | Solo sus propios datos. Los reportes de archivos se filtran por `ownerId` y los de actividad por `actorId`. |

Reglas comunes:

- En los reportes con `userId`, un `USER` que envíe el id de otro usuario
  recibe **403**. Si `userId` se omite, se usa el usuario autenticado.
- Un `ADMIN` puede enviar cualquier `userId`.
- Los reportes de **recursos vivos** (`files-by-type`, `files-by-date-range`,
  `top-users-by-files`, `users-most-shared`, `files-most-shared`,
  `shared-by-user`, `received-by-user`) excluyen `isDeleted: true`.
- Los reportes de **auditoría** (`files-most-operations`, `user-activity`,
  `operations-by-type`, `operations-by-period`, `top-actions`) no filtran
  recursos existentes: usan `resourceName` y `actorName` como snapshots para
  conservar el historial aunque el recurso o el usuario hayan sido purgados.
- `from` y `to` son fechas ISO 8601. El rango es inclusivo en ambos extremos y
  se aplica sobre `createdAt` en UTC. Si `from > to`, responde `400`.
- `granularity` solo acepta `day` o `month`; por defecto es `day`.
- Los importes de tamaño se expresan en bytes.

Errores comunes:

| Código | Caso |
|---:|---|
| `400` | Fecha inválida, rango invertido, `userId` inválido o `granularity` no permitida. |
| `401` | Falta el JWT o no es válido. |
| `403` | Un `USER` intenta consultar datos de otro usuario. |

---

### GET `/api/reports/files-by-type`

Cantidad y tamaño total de archivos vivos por extensión. `ADMIN` ve todo el
sistema; `USER` solo sus archivos.

**Respuesta `200`**

```json
[
  { "extension": "md", "count": 1, "totalSize": 7 },
  { "extension": "txt", "count": 2, "totalSize": 9 }
]
```

Ordenado por extensión ascendente.

---

### GET `/api/reports/files-by-date-range?from=&to=`

Archivos vivos creados dentro del rango. `from` y `to` son opcionales, pero si
se envían deben ser ISO 8601 válidos.

| Query | Obligatorio | Descripción |
|---|---:|---|
| `from` | No | Límite inferior inclusivo sobre `createdAt`. |
| `to` | No | Límite superior inclusivo sobre `createdAt`. |

**Respuesta `200`**: array de archivos ordenado por `createdAt` descendente.

```json
[
  {
    "_id": "6710000000000000000000f1",
    "name": "informe.txt",
    "extension": "txt",
    "size": 4821,
    "ownerId": "66f1a1c2e4b0a1b2c3d4e5f6",
    "folderId": "6700000000000000000000a1",
    "createdAt": "2026-10-19T11:00:00.000Z"
  }
]
```

---

### GET `/api/reports/files-most-operations`

Archivos con más eventos registrados en `activity_log`. Se agrupa por
`resourceId` y se usa `resourceName` como snapshot; por eso el reporte puede
incluir archivos que hoy están en papelera o fueron purgados.

Para un `USER`, solo se cuentan los eventos cuyo `actorId` es el usuario
autenticado. `ADMIN` ve la actividad global.

**Respuesta `200`**

```json
[
  {
    "resourceId": "6710000000000000000000f1",
    "resourceName": "informe.txt",
    "operations": 15
  }
]
```

Ordenado por `operations` descendente.

---

### GET `/api/reports/top-users-by-files`

Top 10 de usuarios por cantidad de archivos vivos. `ADMIN` ve el ranking
global; `USER` solo su propia fila.

**Respuesta `200`**

```json
[
  {
    "userId": "66f1a1c2e4b0a1b2c3d4e5f6",
    "name": "Ana Torres",
    "email": "ana.torres@example.com",
    "files": 3,
    "totalSize": 16
  }
]
```

Ordenado por `files` descendente y, en empate, por `totalSize` descendente.

---

### GET `/api/reports/users-most-shared`

Usuarios con más recursos compartidos. Solo cuenta permisos explícitos de
recursos vivos.

- `shares`: número de permisos concedidos.
- `sharedResources`: número de recursos distintos (un recurso compartido con
  varios usuarios cuenta una sola vez).

Para un `USER`, solo se consideran los shares cuyo `ownerId` es el usuario
autenticado.

**Respuesta `200`**

```json
[
  {
    "userId": "66f1a1c2e4b0a1b2c3d4e5f6",
    "name": "Ana Torres",
    "email": "ana.torres@example.com",
    "shares": 4,
    "sharedResources": 3
  }
]
```

Ordenado por `sharedResources` descendente y luego por `shares` descendente.

---

### GET `/api/reports/files-most-shared`

Archivos vivos compartidos con más usuarios distintos. Solo considera shares
con `resourceType: "FILE"` y recursos activos.

Para un `USER`, solo se consideran los shares concedidos por él mismo.

**Respuesta `200`**

```json
[
  {
    "fileId": "6710000000000000000000f1",
    "name": "informe.txt",
    "extension": "txt",
    "ownerId": "66f1a1c2e4b0a1b2c3d4e5f6",
    "ownerName": "Ana Torres",
    "sharedWith": 2
  }
]
```

`sharedWith` es el número de destinatarios distintos. Ordenado por
`sharedWith` descendente.

---

### GET `/api/reports/shared-by-user?userId=`

Recursos que un usuario ha compartido (shares con `ownerId = userId`).
Devuelve solo recursos vivos y resuelve el nombre actual del archivo o carpeta.

| Query | Obligatorio | Descripción |
|---|---:|---|
| `userId` | No | Usuario objetivo. Si se omite, se usa el autenticado. |

**Respuesta `200`**

```json
[
  {
    "shareId": "67400000000000000000ee01",
    "resourceType": "FOLDER",
    "resourceId": "6700000000000000000000a2",
    "resourceName": "2026",
    "access": "READ",
    "owner": {
      "_id": "66f1a1c2e4b0a1b2c3d4e5f6",
      "name": "Ana Torres",
      "email": "ana.torres@example.com"
    },
    "grantee": {
      "_id": "66f1a1c2e4b0a1b2c3d4e5f7",
      "name": "Luis Gómez",
      "email": "luis@example.com"
    },
    "createdAt": "2026-10-05T15:00:00.000Z",
    "updatedAt": "2026-10-05T15:00:00.000Z"
  }
]
```

Ordenado del más reciente al más antiguo. Un `USER` que envíe otro `userId`
recibe `403`.

---

### GET `/api/reports/received-by-user?userId=`

Recursos que un usuario ha recibido (shares con `granteeId = userId`). Mismo
formato y reglas de acceso que `shared-by-user`.

| Query | Obligatorio | Descripción |
|---|---:|---|
| `userId` | No | Usuario objetivo. Si se omite, se usa el autenticado. |

**Respuesta `200`**: array con el mismo formato que `shared-by-user`, filtrado
por `granteeId`. Solo incluye recursos vivos.

---

### GET `/api/reports/user-activity?userId=&from=&to=`

Historial de un usuario en un rango de fechas. Devuelve los documentos de
`activity_log` ordenados del evento más reciente al más antiguo.

| Query | Obligatorio | Descripción |
|---|---:|---|
| `userId` | No | Usuario objetivo. Si se omite, se usa el autenticado. |
| `from` | No | Límite inferior inclusivo sobre `createdAt`. |
| `to` | No | Límite superior inclusivo sobre `createdAt`. |

**Respuesta `200`**

```json
[
  {
    "_id": "67500000000000000000ff01",
    "actorId": "66f1a1c2e4b0a1b2c3d4e5f6",
    "actorName": "Ana Torres",
    "actorRole": "USER",
    "action": "FILE_UPLOAD",
    "resourceType": "FILE",
    "resourceId": "6710000000000000000000f1",
    "resourceName": "informe.txt",
    "metadata": {
      "parentId": "6700000000000000000000a1",
      "extension": "txt",
      "size": 4821
    },
    "createdAt": "2026-10-19T11:00:00.000Z"
  }
]
```

Un `USER` que envíe otro `userId` recibe `403`.

---

### GET `/api/reports/operations-by-type`

Operaciones agrupadas por acción. Para un `USER`, solo sus propios eventos
(`actorId`); `ADMIN` ve el total global.

**Respuesta `200`**

```json
[
  { "action": "FILE_UPLOAD", "count": 28 },
  { "action": "FILE_DOWNLOAD", "count": 10 }
]
```

Ordenado por `count` descendente.

---

### GET `/api/reports/operations-by-period?granularity=day|month`

Operaciones agrupadas por período con `$dateTrunc` sobre `createdAt`, en UTC.

| Query | Obligatorio | Descripción |
|---|---:|---|
| `granularity` | No | `day` (por defecto) o `month`. |

**Respuesta `200`**

```json
[
  { "period": "2026-10-01T00:00:00.000Z", "count": 35 },
  { "period": "2026-10-02T00:00:00.000Z", "count": 12 }
]
```

Con `granularity=month`, el período se normaliza al primer día del mes. Para un
`USER`, solo se cuentan sus propios eventos.

---

### GET `/api/reports/top-actions`

Top 10 de acciones, desglosadas por tipo de recurso. Para un `USER`, solo sus
propios eventos.

**Respuesta `200`**

```json
[
  { "action": "FILE_UPLOAD", "resourceType": "FILE", "count": 28 },
  { "action": "SHARE_GRANT", "resourceType": "SHARE", "count": 17 }
]
```

Ordenado por `count` descendente.

---

## Notas de implementación

- **Sin transacciones** (MongoDB standalone). Las operaciones siguen un orden
  recuperable y usan compensaciones manuales para no dejar binarios huérfanos.
- **Auditoría**: `ActivityModule` escribe `FOLDER_*` y `FILE_*` en
  `activity_log` después de que el estado del recurso ya es correcto. El login
  registra `AUTH_LOGIN`. `activity_log` no tiene endpoints de actualización ni
  de borrado. En las purgas, el evento se escribe **antes** de destruir el
  recurso; `TRASH_EMPTY` también se registra antes del vaciado.
- **Archivos**: el contenido se guarda en GridFS; `users.storageUsed` se
  incrementa al subir y se ajusta al reemplazar contenido. Incluye archivos en
  papelera: solo disminuirá al purgarlos definitivamente.
- **Papelera**: el soft delete de archivos y carpetas no toca GridFS ni
  `storageUsed`. `deletedRootId` agrupa cada cascada; las raíces se listan en
  `GET /api/trash`. La purga elimina la cascada completa, sus shares y sus
  binarios, y resta el espacio con `$inc`.
- **Permisos**: `AccessService` resuelve el acceso efectivo combinando el share
  directo con la herencia de la carpeta y sus `ancestors`, sin materializar
  permisos por archivo. `FilesModule` y `FoldersModule` exigen `READ` para
  ver/listar/descargar y `EDIT` para renombrar o cambiar contenido; mover,
  eliminar, crear y compartir siguen siendo exclusivos del propietario.
- **Shares**: el índice único `{ resourceType, resourceId, granteeId }` evita
  duplicados; conceder de nuevo actualiza `access`. No se usan transacciones:
  la escritura del share y su evento de auditoría son pasos independientes e
  idempotentes.
