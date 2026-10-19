# Modelo documental de MongoDB

> Sistema de Gestión Documental — backend NestJS.
> Este documento define el modelo **antes** de escribir código. Los ejemplos usan
> notación de `mongosh` (`ObjectId(...)`, `ISODate(...)`), no JSON estricto.

## 1. Alcance y convenciones

- Base de datos: `gestion_documental`.
- Colecciones: `users`, `folders`, `files`, `shares`, `activity_log`.
- GridFS: cubos `fs.files` y `fs.chunks` (nombre por defecto del driver).
- Todos los `_id` son `ObjectId`.
- Fechas en UTC, tipo `Date`.
- `createdAt` / `updatedAt` los aporta Mongoose (`timestamps: true`).
- `activity_log` es **append-only**: solo tiene `createdAt`, nunca se actualiza ni se borra.
- Los nombres de colección se fijan explícitamente para evitar el pluralizado
  automático de Mongoose (`activity_log`, no `activity_logs`).

### Principios aplicados

1. **Referenciar lo que crece sin límite o tiene vida propia** (usuarios, carpetas,
   archivos, permisos, historial).
2. **Embeber lo pequeño, acotado y que se lee junto** (rol, credenciales,
   `storageUsed`, cadena de ancestros de una carpeta, snapshot de nombres en el log).
3. **No duplicar la jerarquía en los archivos**: la carpeta ya guarda su cadena de
   ancestros; el archivo solo referencia su carpeta.
4. **Soft delete como estado**, no como colección aparte: así se conservan `_id`,
   referencias y ubicación original.
5. **El historial sobrevive a todo**: guarda `resourceName` y `actorName` como
   copias, aunque el recurso o el usuario ya no estén activos.

### Diagrama de relaciones

```text
users 1 ────< folders            (ownerId)
users 1 ────< files              (ownerId)
folders 1 ──< folders            (parentId, jerarquía)
folders 1 ──< files              (folderId)
files   1 ──1 fs.files           (gridFsId)
users   1 ──< shares             (ownerId / granteeId)
files|folders 1 ──< shares       (resourceType + resourceId)
users   1 ──< activity_log       (actorId)
files|folders 1 ──< activity_log (resourceType + resourceId, referencia lógica)
```

---

## 2. Colección `users`

### Responsabilidad

Identidad, credenciales, rol, estado y contabilidad de almacenamiento. No contiene
arrays de archivos ni carpetas.

### Campos

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `_id` | `ObjectId` | Sí | Identificador. |
| `email` | `string` | Sí | Único, en minúsculas y sin espacios. Login. |
| `passwordHash` | `string` | Sí | Hash bcrypt. `select: false` en Mongoose. Nunca se devuelve por API. |
| `name` | `string` | Sí | Nombre visible. |
| `role` | `string` | Sí | `ADMIN` o `USER`. Por defecto `USER`. |
| `isActive` | `boolean` | Sí | Por defecto `true`. Desactivar **no** borra historial ni recursos. |
| `storageUsed` | `number` | Sí | Bytes ocupados. Incluye archivos en papelera; solo baja al purgar. |
| `lastLoginAt` | `Date \| null` | No | Último login correcto. |
| `createdAt` | `Date` | Sí | Alta. |
| `updatedAt` | `Date` | Sí | Última modificación. |

### Documento de ejemplo

```js
{
  _id: ObjectId("66f1a1c2e4b0a1b2c3d4e5f6"),
  email: "ana.torres@example.com",
  passwordHash: "$2b$12$Q9m8V0kY...",       // bcrypt, nunca texto plano
  name: "Ana Torres",
  role: "USER",
  isActive: true,
  storageUsed: 184320,                       // 180 KiB, incluye papelera
  lastLoginAt: ISODate("2026-10-18T09:12:00Z"),
  createdAt: ISODate("2026-09-01T10:00:00Z"),
  updatedAt: ISODate("2026-10-18T09:12:00Z")
}
```

### Embebido vs. referenciado

| Decisión | Por qué |
|---|---|
| Credenciales, rol y `storageUsed` **embebidos** | Son 1:1 con el usuario, pequeños y se leen en cada login/perfil. Evita un `$lookup` en la ruta crítica. |
| Sin arrays `fileIds` / `folderIds` | Crecen sin límite, obligarían a reescribir el usuario en cada subida y superarían el límite de 16 MB. |
| `ownerId` en carpetas/archivos **referenciado** | El propietario es una entidad independiente y consultable; se evita duplicar nombre/email. |
| Usuario desactivado, no borrado | `isActive: false` conserva `_id`, historial y referencias. El login se deniega en autenticación, no por borrado. |

### Índices

| Índice | Tipo | Por qué |
|---|---|---|
| `{ email: 1 }` | Único | Login y prevención de cuentas duplicadas. |
| `{ role: 1, isActive: 1, createdAt: -1 }` | Compuesto | Listado administrativo de usuarios por rol/estado, ordenado por alta. |

> No se indexa `storageUsed`: el ranking de almacenamiento se calcula con
> agregación sobre `files`, que es la fuente de verdad y permite auditar el saldo.

---

## 3. Colección `folders`

### Responsabilidad

Estructura jerárquica de carpetas y subcarpetas. La jerarquía se representa con
**`parentId` + `ancestors` + `depth`** (patrón *materialized path* con ObjectIds).

### Campos

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `_id` | `ObjectId` | Sí | Identificador. |
| `name` | `string` | Sí | Nombre visible. Único entre hermanas activas. |
| `ownerId` | `ObjectId` | Sí | Referencia a `users._id`. |
| `parentId` | `ObjectId \| null` | Sí | Carpeta padre. `null` = raíz. |
| `ancestors` | `ObjectId[]` | Sí | Cadena **de raíz a padre**, sin incluir la propia carpeta. `[]` en raíz. |
| `depth` | `number` | Sí | `ancestors.length`. Raíz = 0. Sirve para límites y validaciones. |
| `isDeleted` | `boolean` | Sí | Soft delete. Por defecto `false`. |
| `deletedAt` | `Date \| null` | No | Momento del borrado. |
| `deletedBy` | `ObjectId \| null` | No | Usuario que borró. |
| `deletedRootId` | `ObjectId \| null` | No | Raíz del borrado en cascada. Ver sección 6. |
| `createdAt` | `Date` | Sí | Alta. |
| `updatedAt` | `Date` | Sí | Última modificación. |

### Ejemplo de jerarquía

```js
// Raíz
{
  _id: ObjectId("6700000000000000000000a1"),
  name: "Proyectos",
  ownerId: ObjectId("66f1a1c2e4b0a1b2c3d4e5f6"),
  parentId: null,
  ancestors: [],
  depth: 0,
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  deletedRootId: null,
  createdAt: ISODate("2026-09-02T08:00:00Z"),
  updatedAt: ISODate("2026-09-02T08:00:00Z")
}

// Subcarpeta de "Proyectos"
{
  _id: ObjectId("6700000000000000000000a2"),
  name: "2026",
  ownerId: ObjectId("66f1a1c2e4b0a1b2c3d4e5f6"),
  parentId: ObjectId("6700000000000000000000a1"),
  ancestors: [ObjectId("6700000000000000000000a1")],
  depth: 1,
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  deletedRootId: null,
  createdAt: ISODate("2026-09-02T08:05:00Z"),
  updatedAt: ISODate("2026-09-02T08:05:00Z")
}

// Subcarpeta de "2026"
{
  _id: ObjectId("6700000000000000000000a3"),
  name: "Informes",
  ownerId: ObjectId("66f1a1c2e4b0a1b2c3d4e5f6"),
  parentId: ObjectId("6700000000000000000000a2"),
  ancestors: [
    ObjectId("6700000000000000000000a1"),
    ObjectId("6700000000000000000000a2")
  ],
  depth: 2,
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  deletedRootId: null,
  createdAt: ISODate("2026-09-02T08:10:00Z"),
  updatedAt: ISODate("2026-09-02T08:10:00Z")
}
```

### Reglas de la jerarquía

1. **Invariante de `ancestors`**
   - Raíz: `parentId = null`, `ancestors = []`, `depth = 0`.
   - Hija: `ancestors = [...padre.ancestors, padre._id]`, `depth = padre.depth + 1`.
   - La cadena nunca contiene a la propia carpeta.
2. **Propiedad**
   - Una subcarpeta siempre pertenece al mismo `ownerId` que su padre.
   - No se mueve una carpeta a un árbol de otro usuario.
3. **Sin ciclos al mover**
   - Sea `F` la carpeta a mover y `P` el nuevo padre. Se rechaza si:
     - `P._id == F._id` (mover sobre sí misma), o
     - `P.ancestors` contiene `F._id` (mover dentro de un descendiente).
   - Además `P` debe estar activa, pertenecer al mismo dueño y respetar el
     `MAX_DEPTH` (por ejemplo 100).
   - Si se mantiene la invariante de `ancestors`, un ciclo es imposible: para que
     `P` fuera descendiente de `F`, su cadena contendría `F._id`.
4. **Mover un subárbol**
   - Al mover `F`, todos sus descendientes deben actualizar `ancestors` y `depth`.
   - Se resuelven con `{ ancestors: F._id }` y una actualización con *aggregation
     pipeline* que reemplaza el prefijo viejo por el nuevo, o con `bulkWrite` si
     se prefiere. Es una operación poco frecuente; la consistencia es más
     importante que la micro-optimización.
5. **Borrado en cascada**
   - Los descendientes se localizan con `{ ancestors: F._id }`, sin recursión en
     JavaScript.
6. **Restauración**
   - Solo se restaura si el padre está activo. Si el padre sigue en papelera, se
     devuelve conflicto y se pide restaurar primero el ancestro.
   - Si el nombre choca con una hermana activa, se devuelve `409` (o se renombra
     explícitamente desde el cliente).

### Embebido vs. referenciado

| Decisión | Por qué |
|---|---|
| `parentId` **referenciado** | Es la relación básica y permite integridad referencial y validación de padre. |
| `ancestors` **embebido** | Cadena acotada por `MAX_DEPTH` (≤ 100). Permite consultar un subárbol completo con un solo índice multikey (`{ ancestors: 1 }`) y detectar ciclos sin recorrer la base. |
| `depth` **embebido** | Se deriva de `ancestors`; evita calcularlo en cada consulta y permite limitar profundidad. |
| Hijos **no embebidos** | Un array de hijos crece sin límite, se reescribe en cada alta/movimiento y complica el borrado/restauración. |
| `ownerId` **referenciado** | El dueño es una entidad independiente; se consulta "mis carpetas" sin duplicar datos. |

### Índices

| Índice | Tipo | Por qué |
|---|---|---|
| `{ ownerId: 1, parentId: 1, name: 1 }` con `partialFilterExpression: { isDeleted: false }` | Único parcial | Nombres únicos entre hermanas activas, sin impedir reutilizar el nombre de una carpeta en papelera. La comparación es exacta (sensible a mayúsculas/acentos): la unicidad se valida en la capa de aplicación con `trim` y normalización si se desea. |
| `{ ancestors: 1, isDeleted: 1 }` | Multikey | Subárboles (`ancestors: F._id`), cascadas, validación de ciclos y listados de descendientes. |
| `{ ownerId: 1, isDeleted: 1, updatedAt: -1 }` | Compuesto | "Mis carpetas recientes" y listados por propietario. |
| `{ ownerId: 1, isDeleted: 1, deletedAt: -1 }` | Compuesto | Papelera del usuario, ordenada por fecha de borrado. |
| `{ deletedRootId: 1 }` con `partialFilterExpression: { isDeleted: true }` | Parcial | Restaurar/purgar una cascada completa agrupada por raíz. |
| `{ ownerId: 1, name: 1 }` | Compuesto | Búsqueda por nombre dentro de las carpetas del usuario. |

> Los nombres se comparan de forma exacta (sensible a mayúsculas y acentos).
> Si se requiere unicidad insensible, se normaliza el nombre en la capa de
> aplicación antes de guardar (por ejemplo `trim` y `toLowerCase` para la
> comparación). No se usan collations en los índices.

---

## 4. Colección `files`

### Responsabilidad

Metadatos de archivos `.txt` y `.md`. El **contenido binario no vive aquí**: vive
en GridFS y se referencia con `gridFsId`.

### Campos

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `_id` | `ObjectId` | Sí | Identificador. |
| `name` | `string` | Sí | Nombre completo con extensión, por ejemplo `informe.md`. Único en su carpeta activa. |
| `ownerId` | `ObjectId` | Sí | Referencia a `users._id`. Debe coincidir con el dueño de la carpeta. |
| `folderId` | `ObjectId \| null` | Sí | Carpeta contenedora. `null` = raíz del usuario. |
| `extension` | `string` | Sí | `"txt"` o `"md"`. Se valida contra `name`. |
| `mimeType` | `string` | Sí | `text/plain` o `text/markdown`. |
| `size` | `number` | Sí | Tamaño en bytes del contenido. |
| `gridFsId` | `ObjectId` | Sí | `_id` del documento en `fs.files`. Relación 1:1. |
| `contentHash` | `string` | No | SHA-256 del contenido. Integridad y posible deduplicación futura. |
| `isDeleted` | `boolean` | Sí | Soft delete. Por defecto `false`. |
| `deletedAt` | `Date \| null` | No | Momento del borrado. |
| `deletedBy` | `ObjectId \| null` | No | Usuario que borró. |
| `deletedRootId` | `ObjectId \| null` | No | Raíz de la cascada. Ver sección 6. |
| `createdAt` | `Date` | Sí | Alta. |
| `updatedAt` | `Date` | Sí | Última modificación (incluye edición de contenido). |

### Documento de ejemplo

```js
{
  _id: ObjectId("6710000000000000000000f1"),
  name: "informe-final.md",
  ownerId: ObjectId("66f1a1c2e4b0a1b2c3d4e5f6"),
  folderId: ObjectId("6700000000000000000000a3"),
  extension: "md",
  mimeType: "text/markdown",
  size: 48213,
  gridFsId: ObjectId("67200000000000000000ab01"),
  contentHash: "9f2c1d7e5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d",
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  deletedRootId: null,
  createdAt: ISODate("2026-10-01T12:00:00Z"),
  updatedAt: ISODate("2026-10-01T12:00:00Z")
}
```

### Relación con GridFS

`files` es la **fuente de verdad** de los metadatos. GridFS guarda el contenido y
un espejo mínimo para herramientas operativas.

```js
// fs.files
{
  _id: ObjectId("67200000000000000000ab01"),
  length: 48213,
  chunkSize: 261120,
  uploadDate: ISODate("2026-10-01T12:00:00Z"),
  filename: "informe-final.md",
  metadata: {
    fileId: ObjectId("6710000000000000000000f1"),
    ownerId: ObjectId("66f1a1c2e4b0a1b2c3d4e5f6"),
    contentType: "text/markdown"
  }
}

// fs.chunks (conceptual)
{
  _id: ObjectId("67300000000000000000cc01"),
  files_id: ObjectId("67200000000000000000ab01"),
  n: 0,
  data: BinData(0, "...")
}
```

Reglas:

- `files.gridFsId` es único: un documento de metadatos no puede apuntar a dos
  binarios.
- Al subir: primero se valida extensión **y** tipo de contenido; luego se escribe
  el binario en GridFS; por último se crea el documento en `files`.
- Al editar contenido: se escribe un nuevo `fs.files`, se actualiza `gridFsId`,
  `size`, `contentHash` y `updatedAt`, y se purga el binario anterior.
- Al eliminar definitivamente: se borran `fs.files` y sus `fs.chunks`, el
  documento de `files` y las comparticiones asociadas.
- `filename` en GridFS se guarda con el nombre visible para facilitar
  inspecciones; si se renombra el archivo, se actualiza también.
- La extensión y el `mimeType` se validan en la capa de aplicación; el modelo no
  acepta otros valores.

### Embebido vs. referenciado

| Decisión | Por qué |
|---|---|
| Metadatos **embebidos** en `files` | Son pequeños, se consultan juntos (nombre, tipo, tamaño, fechas) y permiten listar/filtrar sin tocar GridFS. |
| Contenido **referenciado** por `gridFsId` | GridFS está pensado para binarios, permite streaming y evita el límite de 16 MB por documento. Es un requisito explícito. |
| `ownerId` y `folderId` **referenciados** | Permiten consultas por propietario/carpeta y mantienen la integridad con la jerarquía. |
| Sin array de archivos dentro de `folders` | Crecimiento ilimitado, reescrituras y problemas de concurrencia. |
| Sin contenido de texto duplicado en `files` | Duplicaría almacenamiento y podría desincronizarse del binario. La búsqueda full-text sobre contenido queda como mejora futura. |

### Índices

| Índice | Tipo | Por qué |
|---|---|---|
| `{ ownerId: 1, folderId: 1, name: 1 }` con `partialFilterExpression: { isDeleted: false }` | Único parcial | Nombre único por carpeta activa; permite reutilizar nombres de archivos en papelera. La comparación es exacta (sensible a mayúsculas/acentos). |
| `{ folderId: 1, isDeleted: 1, name: 1 }` | Compuesto | Listar el contenido de una carpeta (propia o compartida) ordenado por nombre. |
| `{ ownerId: 1, isDeleted: 1, updatedAt: -1 }` | Compuesto | "Mis archivos recientes" y listados por propietario. |
| `{ ownerId: 1, isDeleted: 1, deletedAt: -1 }` | Compuesto | Papelera del usuario, ordenada por fecha de borrado. |
| `{ deletedRootId: 1 }` con `partialFilterExpression: { isDeleted: true }` | Parcial | Restaurar/purgar cascadas. |
| `{ gridFsId: 1 }` | Único | Garantiza la relación 1:1 con GridFS y detecta referencias duplicadas. |
| `{ isDeleted: 1, extension: 1, createdAt: -1 }` | Compuesto | Reporte 1 (archivos por tipo) y filtros combinados por tipo. |
| `{ isDeleted: 1, createdAt: -1 }` | Compuesto | Reporte 2 (rango de fechas por `createdAt`) sin filtro de tipo. |
| `{ ownerId: 1, isDeleted: 1, extension: 1, createdAt: -1 }` | Compuesto | Filtros por propietario, tipo y fecha (soporte de consultas del listado, no un reporte adicional). |
| `{ ownerId: 1, name: 1 }` | Compuesto | Búsqueda por nombre dentro de los archivos del usuario (prefijo/regex anclada). |

> Para búsquedas por nombre se recomienda prefijo anclado (`^texto`) o un índice
> de texto sobre `name`. No se indexa el contenido porque vive en GridFS.

---

## 5. Colección `shares`

### Responsabilidad

Permisos explícitos de un recurso (archivo o carpeta) hacia un usuario. Es una
relación **muchos-a-muchos** entre usuarios y recursos.

### Campos

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `_id` | `ObjectId` | Sí | Identificador. |
| `resourceType` | `string` | Sí | `FILE` o `FOLDER`. |
| `resourceId` | `ObjectId` | Sí | `_id` del archivo o carpeta. Referencia lógica polimórfica. |
| `ownerId` | `ObjectId` | Sí | Dueño del recurso al conceder. Debe coincidir con el recurso. |
| `granteeId` | `ObjectId` | Sí | Usuario que recibe el permiso. No puede ser el dueño. |
| `access` | `string` | Sí | `READ`, `COMMENT` o `EDIT`. |
| `createdAt` | `Date` | Sí | Alta del permiso. |
| `updatedAt` | `Date` | Sí | Cambio de nivel de acceso. |

### Documento de ejemplo

```js
{
  _id: ObjectId("67400000000000000000ee01"),
  resourceType: "FOLDER",
  resourceId: ObjectId("6700000000000000000000a2"),
  ownerId: ObjectId("66f1a1c2e4b0a1b2c3d4e5f6"),
  granteeId: ObjectId("66f1a1c2e4b0a1b2c3d4e5f7"),
  access: "READ",
  createdAt: ISODate("2026-10-05T15:00:00Z"),
  updatedAt: ISODate("2026-10-05T15:00:00Z")
}
```

### Semántica de permisos

Jerarquía: `READ < COMMENT < EDIT`.

- `READ`: ver metadata y descargar.
- `COMMENT`: todo lo de `READ` y, cuando se implementen comentarios, comentar.
- `EDIT`: todo lo de `COMMENT` y modificar contenido/metadata (incluido renombrar).
- **Operaciones estructurales** (crear, mover, eliminar, compartir) quedan
  reservadas al propietario. Así se evita que un invitado se apropie de recursos
  o los saque de la carpeta compartida.
- El propietario siempre tiene control total, sin necesidad de un `share`.
- Un permiso de carpeta **aplica a todo su contenido actual y futuro**. No se
  copia a cada archivo: se resuelve por herencia.
- Para un archivo, el permiso efectivo es el máximo entre:
  - el permiso directo del archivo, y
  - los permisos de su carpeta y de todas las carpetas en `folder.ancestors`.
- Para una carpeta, se consideran sus propios permisos y los de sus ancestros.
- Si el recurso está en papelera (`isDeleted: true`), se deniega el acceso aunque
  exista un `share`. Al restaurarlo, el permiso vuelve a aplicar.
- Revocar un permiso de carpeta elimina la herencia para todo su contenido, pero
  no elimina permisos directos que existan sobre archivos concretos.
- El `grantee` no puede re-compartir (no hay compartición transitiva) salvo que
  sea el propietario.
- Un usuario desactivado no puede autenticarse; sus `shares` se conservan para no
  perder el historial y por si se reactiva la cuenta.
- `ADMIN` gestiona usuarios y ve reportes globales, pero **no** obtiene acceso
  implícito al contenido de los archivos. El acceso al contenido sigue la regla
  de propietario/permiso.

### Por qué una colección separada y no un array embebido

| Alternativa | Problema |
|---|---|
| Array `sharedWith` dentro de `files`/`folders` | Crecimiento sin límite, reescritura del documento en cada cambio, difícil consultar "compartido conmigo" y mezcla responsabilidades. |
| Documento `share` por permiso (elegida) | Permite consultas en ambas direcciones, actualización independiente, revocación simple y un índice único que evita duplicados. |
| Copiar permisos de carpeta a cada archivo | Duplicación masiva, desincronización al mover/añadir contenido y revocación incompleta. |

### Índices

| Índice | Tipo | Por qué |
|---|---|---|
| `{ resourceType: 1, resourceId: 1, granteeId: 1 }` | Único | Un solo permiso por recurso y usuario; actualizar `access` en lugar de duplicar. |
| `{ granteeId: 1, resourceType: 1, createdAt: -1 }` | Compuesto | "Compartido conmigo", separado por tipo. |
| `{ ownerId: 1, resourceType: 1, createdAt: -1 }` | Compuesto | "Compartido por mí" y reportes de usuarios que más comparten. |

> El índice único también sirve para localizar todas las comparticiones de un
> recurso (`resourceType + resourceId`), necesario al purgarlo.

---

## 6. Papelera y soft delete

### Decisión: estado en el recurso, no colección aparte

La papelera **no** es una colección `trash`. Se representa con cuatro campos en
`folders` y `files`:

| Campo | Tipo | Descripción |
|---|---|---|
| `isDeleted` | `boolean` | `false` activo, `true` en papelera. |
| `deletedAt` | `Date \| null` | Fecha del borrado. |
| `deletedBy` | `ObjectId \| null` | Usuario que ejecutó el borrado. |
| `deletedRootId` | `ObjectId \| null` | `_id` del recurso raíz de la cascada. |

Ventajas:

- El `_id` y las referencias (`parentId`, `folderId`, `shares.resourceId`) siguen
  siendo válidos; restaurar no requiere recrear documentos ni remapear ids.
- La ubicación original se conserva: no se mueve nada a una carpeta "Papelera".
- El listado de papelera es una consulta `{ isDeleted: true }`, no una copia.
- `deletedRootId` agrupa una cascada sin necesidad de una tabla de auditoría
  adicional.

### Semántica de `deletedRootId`

- Al borrar un **archivo**: `deletedRootId = archivo._id`.
- Al borrar una **carpeta** `F`:
  - `F.deletedRootId = F._id`.
  - Cada descendiente que **no** estaba ya en papelera recibe
    `deletedRootId = F._id`, `deletedAt` y `deletedBy` de la operación.
  - Los descendientes que ya estaban en papelera **no se tocan**: conservan su
    propia raíz y su fecha original. Así, al restaurar `F`, no se resucitan
    recursos que el usuario había borrado antes por separado.
- Restaurar `F`: se restauran `F` y todos los documentos con
  `deletedRootId = F._id`. Los que tenían otra raíz siguen en papelera.
- Purgar `F`: se eliminan `F` y **todos** sus descendientes, estén o no en
  papelera, porque el subárbol desaparece físicamente.
- Purgar un archivo: se elimina su metadata, su binario GridFS y sus `shares`.

### Ejemplo de archivo en papelera

```js
{
  _id: ObjectId("6710000000000000000000f1"),
  name: "informe-final.md",
  ownerId: ObjectId("66f1a1c2e4b0a1b2c3d4e5f6"),
  folderId: ObjectId("6700000000000000000000a3"),
  extension: "md",
  mimeType: "text/markdown",
  size: 48213,
  gridFsId: ObjectId("67200000000000000000ab01"),
  contentHash: "9f2c1d7e...",
  isDeleted: true,
  deletedAt: ISODate("2026-10-18T10:30:00Z"),
  deletedBy: ObjectId("66f1a1c2e4b0a1b2c3d4e5f6"),
  deletedRootId: ObjectId("6700000000000000000000a3"), // raíz de la cascada
  createdAt: ISODate("2026-10-01T12:00:00Z"),
  updatedAt: ISODate("2026-10-18T10:30:00Z")
}
```

### Reglas de la papelera

1. **Exclusión de consultas estándar**: todo listado/búsqueda/descarga filtra
   `isDeleted: false`.
2. **Restauración**
   - El padre (`parentId`/`folderId`) debe estar activo. Si no, `409`.
   - Si el nombre choca con un hermano activo, `409` (el cliente decide renombrar).
   - Restaurar una carpeta restaura su cascada (`deletedRootId = F._id`).
   - Restaurar un archivo no modifica `storageUsed`: el espacio ya se contaba.
3. **Purga definitiva**
   - Archivo: borrar `fs.files` + `fs.chunks`, `files`, `shares` y registrar
     `FILE_PURGE` en `activity_log` antes de perder el nombre.
   - Carpeta: recolectar descendientes (`ancestors: F._id`), recolectar archivos
     (`folderId` en los ids de carpetas), borrar todos los binarios GridFS, todos
     los documentos y todas las comparticiones; registrar un evento raíz con
     contadores y `batchId`.
   - Solo aquí se resta `storageUsed` al dueño, porque es cuando se libera el
     espacio real.
4. **Visibilidad**
   - Cada usuario ve su propia papelera (`ownerId` + `isDeleted`). Un recurso
     borrado por el dueño deja de estar disponible para los invitados, aunque su
     `share` siga existiendo.
   - `ADMIN` puede ver información global agregada, pero no acceder al contenido
     sin permiso.
5. **Sin TTL automático**
   - El requisito no pide expiración. La purga es explícita. Un trabajo futuro
     podría aplicar retención, pero nunca debe borrar `activity_log`.

### Índices de papelera

Ya incluidos en `folders` y `files`:

- `{ ownerId: 1, isDeleted: 1, deletedAt: -1 }` — listar la papelera.
- `{ deletedRootId: 1 }` parcial `{ isDeleted: true }` — restaurar/purgar cascadas.

---

## 7. Colección `activity_log`

### Responsabilidad

Audit trail inmutable. Registra **quién** hizo **qué**, sobre **qué recurso** y
**cuándo**. Nunca se actualiza ni se borra, ni siquiera al purgar el recurso.

### Campos

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---:|---|
| `_id` | `ObjectId` | Sí | Identificador del evento. |
| `actorId` | `ObjectId \| null` | Sí | Usuario que ejecutó la acción. `null` para procesos del sistema/seed. |
| `actorName` | `string` | Sí | Snapshot del nombre del actor. |
| `actorRole` | `string \| null` | No | Snapshot del rol en el momento del evento. |
| `action` | `string` | Sí | Acción del catálogo (ver abajo). |
| `resourceType` | `string` | Sí | `USER`, `FOLDER`, `FILE`, `SHARE`, `AUTH` o `SYSTEM`. |
| `resourceId` | `ObjectId \| null` | No | Id del recurso afectado. Puede ser `null` en acciones globales. |
| `resourceName` | `string` | Sí | **Copia** del nombre del recurso en ese momento. Es la clave para que la auditoría siga teniendo sentido después de un purgado. |
| `metadata` | `object` | No | Datos variables y acotados del evento. |
| `createdAt` | `Date` | Sí | Timestamp UTC. No hay `updatedAt`. |

### Catálogo de acciones

```text
AUTH_LOGIN
USER_CREATE, USER_UPDATE, USER_DEACTIVATE, USER_ACTIVATE
FOLDER_CREATE, FOLDER_RENAME, FOLDER_MOVE
FILE_UPLOAD, FILE_DOWNLOAD, FILE_RENAME, FILE_MOVE, FILE_UPDATE
FILE_DELETE, FOLDER_DELETE
FILE_RESTORE, FOLDER_RESTORE
FILE_PURGE, FOLDER_PURGE, TRASH_EMPTY
SHARE_GRANT, SHARE_UPDATE, SHARE_REVOKE
```

`metadata` puede contener, según la acción:

- `parentId`, `fromParentId`, `toParentId`
- `extension`, `size`
- `access`, `granteeId`
- `affectedFolders`, `affectedFiles` (contadores, no arrays ilimitados)
- `batchId` (UUID que correlaciona los eventos de una misma cascada)
- `ip`, `userAgent` (opcionales)

### Ejemplo: subida de archivo

```js
{
  _id: ObjectId("67500000000000000000ff01"),
  actorId: ObjectId("66f1a1c2e4b0a1b2c3d4e5f6"),
  actorName: "Ana Torres",
  actorRole: "USER",
  action: "FILE_UPLOAD",
  resourceType: "FILE",
  resourceId: ObjectId("6710000000000000000000f1"),
  resourceName: "informe-final.md",
  metadata: {
    parentId: ObjectId("6700000000000000000000a3"),
    extension: "md",
    size: 48213
  },
  createdAt: ISODate("2026-10-01T12:00:00Z")
}
```

### Ejemplo: borrado en cascada de una carpeta

```js
{
  _id: ObjectId("67500000000000000000ff02"),
  actorId: ObjectId("66f1a1c2e4b0a1b2c3d4e5f6"),
  actorName: "Ana Torres",
  actorRole: "USER",
  action: "FOLDER_DELETE",
  resourceType: "FOLDER",
  resourceId: ObjectId("6700000000000000000000a3"),
  resourceName: "Informes",
  metadata: {
    batchId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    affectedFolders: 2,
    affectedFiles: 8
  },
  createdAt: ISODate("2026-10-18T10:30:00Z")
}
```

### Reglas de escritura

- **Append-only**: no se exponen endpoints de actualización ni borrado.
- `resourceName` y `actorName` se copian en el momento del evento. No se hace
  `$lookup` para reconstruir la historia: el recurso puede haber sido purgado.
- Para cascadas se registra un evento raíz con contadores y `batchId`; si se
  necesita detalle por archivo, se pueden emitir eventos hijos con el mismo
  `batchId`, pero nunca se embebe un array sin límite.
- En purgas, el evento se escribe **antes** de borrar el recurso, para no perder
  el nombre ni el contexto.
- El despliegue es un MongoDB **standalone**: no hay transacciones. Por eso el log
  de purga se escribe primero y las operaciones posteriores son idempotentes y
  reintentables (ver sección 10). Un fallo puede dejar como máximo un evento
  huérfano (aceptable en auditoría) o un binario huérfano en GridFS, nunca un
  recurso purgado sin rastro.

### Embebido vs. referenciado

| Decisión | Por qué |
|---|---|
| `metadata` **embebido** | Cada acción tiene un esquema distinto y pequeño; embeberlo evita colecciones auxiliares y permite evolucionar sin migraciones. |
| `actorId` / `resourceId` **referenciados** | Permiten correlacionar con usuarios y recursos vivos, y hacer reportes por id. |
| `actorName` / `resourceName` **copiados** | Garantizan auditoría histórica aunque el usuario se desactive o el recurso se purgue. |
| Log **no embebido** en usuarios/recursos | Crecería sin límite, reescribiría documentos en cada operación y desaparecería al purgar el recurso. |
| Sin TTL | El requisito dice que el historial nunca se borra. |

### Índices

| Índice | Tipo | Por qué |
|---|---|---|
| `{ actorId: 1, createdAt: -1 }` | Compuesto | Historial de un usuario en un rango, ordenado por fecha. |
| `{ resourceType: 1, resourceId: 1, createdAt: -1 }` | Compuesto | Línea de tiempo de un recurso; base del reporte de archivos con más operaciones. |
| `{ action: 1, createdAt: -1 }` | Compuesto | Operaciones agrupadas por tipo y período. |
| `{ createdAt: -1 }` | Simple | Últimos eventos globales y reportes por rango sin filtro de actor. |
| `{ "metadata.batchId": 1 }` con `sparse: true` | Parcial/disperso | Reconstruir una cascada concreta. |

> No se indexa `resourceName`: el reporte de nombres usa la copia del log, pero la
> búsqueda principal es por `actorId`, `resourceId` o `action`.

---

## 8. GridFS: `fs.files` y `fs.chunks`

GridFS es parte del modelo, aunque el driver lo gestione.

| Colección | Contenido | Relación |
|---|---|---|
| `fs.files` | Un documento por binario: `_id`, `length`, `chunkSize`, `uploadDate`, `filename`, `metadata`. | `files.gridFsId` → `fs.files._id` (1:1). |
| `fs.chunks` | Trozos binarios: `files_id`, `n`, `data`. | `fs.chunks.files_id` → `fs.files._id` (1:N). |

Índices:

| Índice | Tipo | Por qué |
|---|---|---|
| `fs.files: { filename: 1, uploadDate: 1 }` | Compuesto | Índice por defecto del driver; búsqueda operativa por nombre/fecha. |
| `fs.files: { "metadata.fileId": 1 }` con `sparse: true` | Único/disperso | Garantiza un solo binario por documento de `files` y permite auditar la relación. |
| `fs.chunks: { files_id: 1, n: 1 }` | Único | Índice por defecto de GridFS; lectura ordenada de chunks y unicidad de secuencia. |

> No se duplica el contenido en `files`. Cualquier reporte de tamaño usa
> `files.size` (metadato), no `fs.chunks`.

---

## 9. Resumen: embebido vs. referenciado

| Información | Dónde vive | Decisión | Justificación |
|---|---|---|---|
| Credenciales, rol, `storageUsed` | `users` | Embebido | 1:1, pequeño, ruta crítica de login/perfil. |
| Jerarquía de carpetas | `folders.parentId` + `folders.ancestors` | Referencia + cadena embebida | Subárboles y ciclos con una sola consulta; cadena acotada por profundidad. |
| Metadatos de archivo | `files` | Embebido | Se listan/filtran juntos; no requieren tocar GridFS. |
| Contenido del archivo | `fs.files` + `fs.chunks` | Referenciado (`gridFsId`) | Binarios, streaming, límite de 16 MB y requisito GridFS. |
| Permisos | `shares` | Colección separada | Muchos-a-muchos, consultas en ambas direcciones, revocación independiente. |
| Papelera | `folders` / `files` (`isDeleted`, `deletedRootId`) | Embebido como estado | Conserva ids y ubicación; restaurar es un cambio de estado. |
| Historial | `activity_log` | Colección separada, append-only | Crecimiento ilimitado, inmutabilidad y supervivencia al purgado. |
| Nombres históricos | `activity_log.actorName` / `resourceName` | Copia embebida | Auditoría válida aunque el recurso/usuario ya no exista. |
| Hijos de una carpeta | — | No embebido | Crecimiento sin límite y reescrituras. |
| Archivos de un usuario | — | No embebido | Crecimiento sin límite; se consulta por `ownerId`. |

---

## 10. Invariantes e integridad

1. `folder.ownerId == folder.parent.ownerId` (salvo raíz).
2. `file.ownerId == folder.ownerId` cuando `folderId != null`.
3. `folder.ancestors` no contiene a `folder._id`; `depth == ancestors.length`.
4. `folder.parentId` debe existir y estar activo para crear/mover/restaurar.
5. Nombres únicos entre hermanos activos (carpetas y archivos).
6. `shares.ownerId` debe coincidir con el dueño real del recurso.
7. `shares.granteeId != shares.ownerId`.
8. Un recurso con `isDeleted: true` no es accesible aunque tenga `shares`.
9. `files.gridFsId` es único y apunta a un `fs.files` existente.
10. `storageUsed` = suma de `files.size` de todos los archivos del usuario **no
    purgados** (incluye papelera). Se incrementa al subir y se decrementa solo al
    purgar. Se recomienda `$inc` atómico y una verificación periódica por
    agregación.
11. `activity_log` no se actualiza ni se elimina. No hay endpoint de purga.
12. Un usuario no se borra físicamente: se desactiva. Sus referencias e historial
    permanecen.

### Orden seguro de operaciones (sin transacciones)

El despliegue es un MongoDB **standalone**, por lo que **no se usan
transacciones**. Cada operación se compone de pasos independientes que se
ejecutan en un orden elegido para que un fallo intermedio deje un estado
recuperable. Todas las escrituras deben ser **idempotentes** y reintentables.

Regla para operaciones **destructivas** (purga): primero el log de auditoría y
después la destrucción de datos. En operaciones **aditivas o reversibles**
(subida, edición, borrado a papelera, restauración, movimiento) el log se
escribe al final, cuando el estado ya es correcto. Nunca se purga un recurso
antes de haber registrado el evento.

#### Subida de archivo

1. Validar extensión (`.txt`/`.md`) y tipo de contenido.
2. Escribir el binario en GridFS → obtener `gridFsId`.
3. Crear el documento en `files`.
4. `$inc` en `users.storageUsed`.
5. Escribir `FILE_UPLOAD` en `activity_log`.

Si falla entre 2 y 3, queda un binario huérfano en GridFS: se puede detectar y
limpiar con `fs.files` cuyo `metadata.fileId` no exista en `files`. Si falla
entre 3 y 4, el archivo existe pero `storageUsed` está subestimado; se corrige
con el job de reconciliación. El log es el último paso porque un evento sin
archivo sería más confuso que un archivo sin evento.

#### Edición de contenido

1. Escribir el nuevo binario en GridFS.
2. Actualizar `files` (`gridFsId`, `size`, `contentHash`, `updatedAt`).
3. Purga best-effort del binario anterior.
4. Ajustar `storageUsed` con la diferencia (`$inc`).
5. Escribir `FILE_UPDATE` en `activity_log`.

Si falla después de 2, el binario viejo queda huérfano y se limpia con el job de
reconciliación. Nunca se borra el binario viejo antes de actualizar la referencia.

#### Mover carpeta

1. Validar destino (no es ella misma ni un descendiente, mismo dueño, padre
   activo, `MAX_DEPTH`) y calcular el nuevo `ancestors`/`depth` de `F`.
2. Guardar el prefijo antiguo (`F.ancestors + F._id`) en una variable.
3. Actualizar la carpeta `F` (`parentId`, `ancestors`, `depth`).
4. Actualizar los descendientes que aún tengan el prefijo antiguo
   (`{ ancestors: F._id }`) reemplazándolo por el nuevo prefijo.
5. Escribir `FOLDER_MOVE` en `activity_log` con `fromParentId`, `toParentId` y
   `batchId`.

Orden elegido: **primero la raíz, después los descendientes**. Si falla entre 3
y 4, `F` ya está en su nueva ubicación y los descendientes conservan el prefijo
antiguo; sus `parentId` siguen siendo correctos, por lo que el job de
reconciliación recalcula `ancestors`/`depth` desde `parentId` y los corrige.
El paso 4 es reanudable porque el filtro por prefijo antiguo solo toca los
documentos pendientes. No se usa `F` como destino de su propio subárbol, así que
no puede generarse un ciclo.

#### Borrado a papelera (soft delete)

1. Resolver la cascada (`ancestors: F._id`).
2. Marcar los documentos con `isDeleted: true`, `deletedAt`, `deletedBy` y
   `deletedRootId`.
3. Escribir `FOLDER_DELETE` / `FILE_DELETE` en `activity_log`.

Si falla entre 2 y 3, los recursos están en papelera pero sin evento; se puede
detectar por `deletedAt` sin log y registrar el evento faltante. El orden no
pierde datos.

#### Restauración

1. Verificar que el padre esté activo y que no haya conflicto de nombre.
2. Marcar `isDeleted: false`, `deletedAt: null`, `deletedBy: null`,
   `deletedRootId: null` en la raíz y en los documentos con
   `deletedRootId = F._id`.
3. Escribir `FOLDER_RESTORE` / `FILE_RESTORE` en `activity_log`.

#### Purga definitiva (crítico)

Orden obligatorio:

1. **Escribir el log de purga en `activity_log`** (`FILE_PURGE` /
   `FOLDER_PURGE`) con `resourceName`, contadores y `batchId`. Es el último
   momento en que se conoce el nombre y el contexto.
2. Borrar los binarios de GridFS (`fs.chunks` y luego `fs.files`) de los
   archivos afectados.
3. Borrar las comparticiones (`shares`) de los recursos afectados.
4. Borrar los documentos de `files` y `folders`.
5. Decrementar `storageUsed` del dueño con `$inc` por la suma de tamaños
   purgados (solo si los documentos aún existían; usar el `size` capturado en el
   paso 1 para que sea idempotente).
6. Si algo falla, reintentar desde el paso que corresponda. Los pasos 2–4 son
   idempotentes (`deleteMany` por id no falla si ya no existe).

Consecuencias aceptadas de un fallo:

- Evento de log sin purga completa → el recurso sigue existiendo; se reintenta.
- Binario huérfano en GridFS → se limpia con reconciliación.
- `storageUsed` desajustado → se corrige con reconciliación.

Nunca se acepta: recurso purgado sin evento de auditoría.

#### Reconciliación periódica

Un job manual o programado (fuera de la ruta de request) puede:

- Recalcular `storageUsed` por usuario con `$group` sobre `files` no purgados.
- Detectar `fs.files` sin documento en `files` (huérfanos) y eliminarlos.
- Detectar `files.gridFsId` sin `fs.files` y marcarlos como corruptos.
- Recalcular `ancestors`/`depth` de carpetas a partir de `parentId` y reportar
  ciclos o huérfanos.
- Verificar que todo `isDeleted: true` tenga `deletedRootId` y `deletedAt`.

#### Cascadas

Las cascadas se resuelven por consulta (`ancestors`), no por recursión en
memoria, para que el coste dependa del número de documentos y no del árbol en
JS.

---

## 11. Reportes y colección utilizada

Todos los reportes se resuelven con **aggregation pipelines**. Se filtra
`isDeleted: false` cuando se consultan recursos vivos.
Se listan exactamente los **12 reportes del enunciado**; no hay reportes extra.
Los bullets compuestos del enunciado se desglosan para llegar a 12.

| # | Reporte | Colección principal | Pipeline / notas |
|---:|---|---|---|
| 1 | Archivos por tipo (`.txt` vs `.md`) | `files` | `$match { isDeleted: false }`, `$group` por `extension` con `$sum: 1` y `$sum: "$size"`. |
| 2 | Archivos en un rango de fechas (por `createdAt`) | `files` | `$match` por **`createdAt`** (`$gte` / `$lte`) y `isDeleted: false`; orden por `createdAt`. Se usa `createdAt`, no `updatedAt`. |
| 3 | Archivos con mayor número de operaciones | `activity_log` | `$match { resourceType: "FILE" }`, `$group` por `resourceId` con `$sum: 1`, `$sort` descendente y `$limit`; el nombre sale de `resourceName` (snapshot) y opcionalmente `$lookup` a `files`. |
| 4 | Top 10 usuarios con más archivos almacenados | `files` | `$match { isDeleted: false }`, `$group` por `ownerId` con `$sum: 1` y `$sum: "$size"`, `$sort`, `$limit: 10`, `$lookup` a `users`. |
| 5 | Usuarios con más recursos compartidos | `shares` | `$group` por `ownerId` con `$sum: 1` (o `$addToSet` por recurso), `$sort`, `$lookup` a `users`. |
| 6 | Archivos compartidos con más usuarios | `shares` | `$match { resourceType: "FILE" }`, `$group` por `resourceId` con `$addToSet: "$granteeId"` y `$size`, `$sort`, `$lookup` a `files` para el nombre. |
| 7 | Recursos compartidos por un usuario | `shares` | `$match { ownerId: <id> }`, `$group` por `resourceType`, `$lookup` polimórfico a `files`/`folders`. |
| 8 | Recursos recibidos por un usuario | `shares` | `$match { granteeId: <id> }`, `$group` por `resourceType`, `$lookup` polimórfico a `files`/`folders`. |
| 9 | Historial de un usuario en un rango de fechas | `activity_log` | `$match` por `actorId` y `createdAt` (`$gte`/`$lte`), `$sort { createdAt: -1 }`. |
| 10 | Operaciones agrupadas por tipo | `activity_log` | `$group` por `action` con `$sum: 1`, `$sort` descendente. |
| 11 | Operaciones agrupadas por período | `activity_log` | `$group` por período con `$dateTrunc` sobre `createdAt` (día/semana/mes) y `$sum: 1`, `$sort` por período. |
| 12 | Principales acciones | `activity_log` | `$group` por `action` y `resourceType`, `$sum: 1`, `$sort` descendente y `$limit` (top N). |

### Notas para los pipelines

- Para reportes de recursos vivos, aplicar `isDeleted: false` al inicio del
  pipeline para que los índices se usen antes de los `$lookup`.
- En reportes de actividad, **no** filtrar por recursos existentes: el historial
  debe incluir recursos ya purgados y usar `resourceName` como snapshot.
- Los conteos de "compartidos" son de permisos **explícitos**. La herencia de
  carpetas se calcula con `folders.ancestors` cuando el reporte lo requiera; no
  se materializa en `shares` para evitar duplicación.
- Evitar `$unwind` innecesarios sobre arrays grandes; usar `$group` con
  `$addToSet`/`$sum` y proyectar solo los campos necesarios.
- El reporte de rango de fechas usa `createdAt` de forma exclusiva. Si en el
  futuro se necesita "modificados", debe ser un reporte nuevo y explícito sobre
  `updatedAt`.

---

## 12. Decisiones abiertas (no bloquean la implementación)

- **Versionado de contenido**: hoy editar reemplaza el binario. Si se necesita
  historial de versiones, añadir `file_versions` con `fileId`, `gridFsId`,
  `size`, `createdBy`, `createdAt`.
- **Comentarios**: `COMMENT` está reservado. Si se implementa, crear `comments`
  con `fileId`, `authorId`, `body`, `createdAt`.
- **Cuotas**: añadir `storageQuota` a `users` si se requiere limitar subidas.
- **Búsqueda full-text del contenido**: requeriría extraer y almacenar el texto
  (por ejemplo en `files.contentText`) o usar un motor externo; GridFS no es
  indexable por texto directamente.
- **Retención de papelera**: job opcional; nunca debe tocar `activity_log`.
- **Compartición pública por enlace**: añadir `shareLinks` con token, expiración
  y permisos, separado de `shares` (que es usuario a usuario).
