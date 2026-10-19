# API — Sistema de Gestión Documental

> Contrato HTTP para el frontend Angular.
> Base URL: `http://localhost:3000/api`.

## Autenticación

Todos los endpoints de carpetas y archivos requieren un JWT válido:

```http
Authorization: Bearer <accessToken>
```

El dueño de la carpeta o archivo se obtiene **siempre** del token
(`request.user`). El cliente nunca envía `ownerId` en el body.

### Política de visibilidad

- Una carpeta que no existe, está en papelera o pertenece a otro usuario
  devuelve **404**, nunca 403, para no revelar que existe.
- Todas las listas filtran `isDeleted: false`.
- Los nombres de carpetas deben ser únicos entre hermanas activas del mismo
  dueño. La comparación es exacta (sensible a mayúsculas y acentos).

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

Lista las **subcarpetas activas** de un padre, ordenadas por nombre. Solo
devuelve carpetas del usuario autenticado.

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
| `404` | El padre no existe, está en papelera o es de otro usuario. |

---

### PATCH `/api/folders/:id/rename`

Renombra una carpeta activa del usuario.

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
| `404` | La carpeta no existe, está en papelera o es de otro usuario. |
| `409` | Ya existe una hermana activa con ese nombre. |

---

### PATCH `/api/folders/:id/move`

Mueve una carpeta y **todo su subárbol** a otro padre o a la raíz.

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
| `404` | La carpeta o el destino no existen, o son de otro usuario. |
| `409` | El destino está en papelera o hay conflicto de nombre. |

---

### DELETE `/api/folders/:id`

Envía a la papelera la carpeta, sus subcarpetas activas y los archivos activos
de ese subárbol. Es un **soft delete**: no se borra nada físicamente.

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
| `404` | La carpeta no existe, ya está en papelera o es de otro usuario. |

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
- Archivo, carpeta destino o contenido de otro usuario: **404**.

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
| `404` | La carpeta no existe, está en papelera o es de otro usuario. |
| `409` | Ya existe un archivo activo con ese nombre en la carpeta. |
| `413` | El archivo supera los 5 MB. |

---

### GET `/api/files`

Lista metadatos de archivos activos de una carpeta o de la raíz.

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
| `404` | La carpeta no existe, está en papelera o es de otro usuario. |

---

### GET `/api/files/:id`

Devuelve los metadatos de un archivo activo del usuario.

**Respuesta `200`**: documento de `files`.

**Errores**

| Código | Caso |
|---:|---|
| `404` | El archivo no existe, está en papelera o es de otro usuario. |

---

### GET `/api/files/:id/download`

Descarga el contenido desde GridFS mediante streaming.

- `Content-Type`: `text/plain; charset=utf-8` o `text/markdown; charset=utf-8`.
- `Content-Disposition`: `attachment` con el nombre visible.
- `Content-Length`: tamaño del archivo.

**Errores**

| Código | Caso |
|---:|---|
| `404` | El archivo o su binario no existen, está en papelera o es de otro usuario. |

---

### PATCH `/api/files/:id/rename`

Renombra conservando la extensión original y actualiza también `filename` en
GridFS.

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
| `404` | El archivo no existe, está en papelera o es de otro usuario. |
| `409` | Ya existe un archivo activo con ese nombre en la carpeta. |

---

### PATCH `/api/files/:id/move`

Mueve un archivo a otra carpeta activa del mismo dueño o a la raíz.

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
| `404` | El archivo o la carpeta destino no existen, o son de otro usuario. |
| `409` | La carpeta destino está en papelera o hay conflicto de nombre. |

---

### PUT `/api/files/:id/content`

Reemplaza el contenido de un archivo existente. `multipart/form-data` con el
campo `file`. El nuevo archivo debe conservar la extensión actual y cumple las
mismas validaciones de tipo, UTF-8 y tamaño.

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
| `404` | El archivo no existe, está en papelera o es de otro usuario. |
| `413` | El archivo supera los 5 MB. |

---

## Notas de implementación

- **Sin transacciones** (MongoDB standalone). Las operaciones siguen un orden
  recuperable y usan compensaciones manuales para no dejar binarios huérfanos.
- **Auditoría pendiente**: el proyecto aún no tiene `ActivityModule` (solo el
  esquema `activity_log`). `FoldersService` y `FilesService` dejan TODOs
  explícitos para registrar `FOLDER_*` y `FILE_UPLOAD`, `FILE_DOWNLOAD`,
  `FILE_RENAME`, `FILE_MOVE`, `FILE_UPDATE` cuando ese módulo exista. No se
  inventó el módulo en esta entrega.
- **Archivos**: el contenido se guarda en GridFS; `users.storageUsed` se
  incrementa al subir y se ajusta al reemplazar contenido. Incluye archivos en
  papelera: solo disminuirá al purgarlos definitivamente.
- **Soft delete de archivos**: no está en esta entrega; se implementará junto
  con el `TrashModule`.
