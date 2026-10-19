# API — Sistema de Gestión Documental

> Contrato HTTP para el frontend Angular.
> Base URL: `http://localhost:3000/api`.

## Autenticación

Todos los endpoints de carpetas requieren un JWT válido:

```http
Authorization: Bearer <accessToken>
```

El dueño de la carpeta se obtiene **siempre** del token (`request.user`). El
cliente nunca envía `ownerId` en el body.

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

## Notas de implementación

- **Sin transacciones** (MongoDB standalone). Las operaciones siguen un orden
  recuperable y son idempotentes/reintentables.
- **Auditoría pendiente**: el proyecto aún no tiene `ActivityModule` (solo el
  esquema `activity_log`). El `FoldersService` deja TODOs explícitos para
  registrar `FOLDER_CREATE`, `FOLDER_RENAME`, `FOLDER_MOVE` y `FOLDER_DELETE`
  cuando ese módulo exista. No se inventó el módulo en esta entrega.
- **Archivos**: aunque `FilesModule` aún no está implementado, el soft delete de
  una carpeta propaga el estado a la colección `files` usando el esquema ya
  definido.
