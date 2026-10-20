import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { hash } from 'bcryptjs';
import mongoose, { mongo, Types } from 'mongoose';

import {
  ActivityAction,
  ActivityLogSchema,
  ActivityResourceType,
} from '../activity-log/schemas/activity-log.schema.js';
import { FileSchema } from '../files/schemas/file.schema.js';
import { FolderSchema } from '../folders/schemas/folder.schema.js';
import { ShareAccess, ShareSchema } from '../shares/schemas/share.schema.js';
import { UserRole, UserSchema } from '../users/schemas/user.schema.js';
import { renderSeedContent, SEED_CONTENT } from './seed-content.js';
import {
  SEED_DELETED_FILES,
  SEED_DELETED_FOLDERS,
  SEED_FILES,
  SEED_FOLDERS,
  SEED_RESTORED_FILES,
  SEED_SHARES,
  SEED_USERS,
  type SeedResourceType,
  type SeedUserKey,
} from './seed-data.js';

/**
 * Seed reproducible del sistema de gestión documental.
 *
 * Ejecución: `npm run seed` (compila y ejecuta `dist/seed/seed.js`).
 *
 * El script elimina la base `gestion_documental` antes de insertar, de modo que
 * cada ejecución parte de un estado limpio. Inserta usuarios, carpetas,
 * archivos en GridFS, comparticiones, papelera e historial coherentes entre sí.
 * Al final imprime un resumen y valida los mínimos con consultas a MongoDB.
 */

const DB_NAME = 'gestion_documental';
const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/gestion_documental';
const BCRYPT_ROUNDS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Documento de usuario con todos los campos que persiste el seed. */
interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  storageUsed: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UserRecord {
  key: SeedUserKey;
  plainPassword: string;
  doc: UserDoc;
}

interface FolderDoc {
  _id: Types.ObjectId;
  name: string;
  ownerId: Types.ObjectId;
  parentId: Types.ObjectId | null;
  ancestors: Types.ObjectId[];
  depth: number;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;
  deletedRootId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FolderRecord {
  key: string;
  ownerKey: SeedUserKey;
  doc: FolderDoc;
}

interface FileDoc {
  _id: Types.ObjectId;
  name: string;
  ownerId: Types.ObjectId;
  folderId: Types.ObjectId | null;
  extension: string;
  mimeType: string;
  size: number;
  gridFsId: Types.ObjectId;
  contentHash: string;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;
  deletedRootId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FileRecord {
  key: string;
  ownerKey: SeedUserKey;
  doc: FileDoc;
}

interface ShareDoc {
  _id: Types.ObjectId;
  resourceType: SeedResourceType;
  resourceId: Types.ObjectId;
  ownerId: Types.ObjectId;
  granteeId: Types.ObjectId;
  access: ShareAccess;
  createdAt: Date;
  updatedAt: Date;
}

interface ShareRecord {
  doc: ShareDoc;
  ownerKey: SeedUserKey;
  resourceName: string;
}

interface ActivityDoc {
  _id: Types.ObjectId;
  actorId: Types.ObjectId | null;
  actorName: string;
  actorRole: UserRole | null;
  action: ActivityAction;
  resourceType: ActivityResourceType;
  resourceId: Types.ObjectId | null;
  resourceName: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

interface ValidationCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/** Devuelve una fecha UTC de hace `days` días a la hora indicada. */
function daysAgo(days: number, hour = 9, minute = 0): Date {
  const date = new Date();
  date.setUTCHours(hour, minute, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

/** Evita que un evento calculado con sumas quede en el futuro. */
function notAfterNow(date: Date): Date {
  const limit = Date.now() - 60_000;
  return date.getTime() > limit ? new Date(limit) : date;
}

/** Suma días a una fecha conservando la hora. */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/** Convierte documentos tipados en documentos aceptados por el driver nativo. */
function asDocuments<T extends object>(docs: T[]): Record<string, unknown>[] {
  return docs as unknown as Record<string, unknown>[];
}

function getDb(): mongo.Db {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No hay conexión activa con MongoDB');
  }
  return db;
}

function getUser(users: Map<SeedUserKey, UserRecord>, key: SeedUserKey): UserRecord {
  const user = users.get(key);
  if (!user) {
    throw new Error(`Usuario inexistente en el seed: ${key}`);
  }
  return user;
}

function getFolder(
  folders: Map<string, FolderRecord>,
  key: string,
): FolderRecord {
  const folder = folders.get(key);
  if (!folder) {
    throw new Error(`Carpeta inexistente en el seed: ${key}`);
  }
  return folder;
}

function getFile(files: Map<string, FileRecord>, key: string): FileRecord {
  const file = files.get(key);
  if (!file) {
    throw new Error(`Archivo inexistente en el seed: ${key}`);
  }
  return file;
}

/**
 * Crea los mismos índices declarados en los esquemas, incluidos los de GridFS.
 * Se hace después de `dropDatabase` para que la carga quede completa.
 */
async function createIndexes(db: mongo.Db): Promise<void> {
  const schemaIndexes: Array<{
    collection: string;
    indexes: Array<[Record<string, unknown>, Record<string, unknown>]>;
  }> = [
    {
      collection: 'users',
      indexes: UserSchema.indexes() as Array<
        [Record<string, unknown>, Record<string, unknown>]
      >,
    },
    {
      collection: 'folders',
      indexes: FolderSchema.indexes() as Array<
        [Record<string, unknown>, Record<string, unknown>]
      >,
    },
    {
      collection: 'files',
      indexes: FileSchema.indexes() as Array<
        [Record<string, unknown>, Record<string, unknown>]
      >,
    },
    {
      collection: 'shares',
      indexes: ShareSchema.indexes() as Array<
        [Record<string, unknown>, Record<string, unknown>]
      >,
    },
    {
      collection: 'activity_log',
      indexes: ActivityLogSchema.indexes() as Array<
        [Record<string, unknown>, Record<string, unknown>]
      >,
    },
  ];

  for (const { collection, indexes } of schemaIndexes) {
    for (const [fields, options] of indexes) {
      await db
        .collection(collection)
        .createIndex(
          fields as mongo.IndexSpecification,
          options as mongo.CreateIndexesOptions,
        );
    }
  }

  // Índices operativos de GridFS (cubos `fs.files` y `fs.chunks`).
  await db
    .collection('fs.files')
    .createIndex({ filename: 1, uploadDate: 1 });
  await db
    .collection('fs.files')
    .createIndex(
      { 'metadata.fileId': 1 },
      { unique: true, sparse: true },
    );
  await db
    .collection('fs.chunks')
    .createIndex({ files_id: 1, n: 1 }, { unique: true });
}

/** Inserta los tres usuarios con contraseñas conocidas y hash bcrypt. */
async function insertUsers(db: mongo.Db): Promise<Map<SeedUserKey, UserRecord>> {
  const users = new Map<SeedUserKey, UserRecord>();

  for (const spec of SEED_USERS) {
    const createdAt = daysAgo(spec.createdDaysAgo, 8, 30);
    const doc: UserDoc = {
      _id: new Types.ObjectId(),
      email: spec.email,
      passwordHash: await hash(spec.password, BCRYPT_ROUNDS),
      name: spec.name,
      role: spec.role,
      isActive: spec.isActive,
      storageUsed: 0,
      lastLoginAt:
        spec.lastLoginDaysAgo === null ? null : daysAgo(spec.lastLoginDaysAgo, 9, 15),
      createdAt,
      updatedAt: createdAt,
    };

    users.set(spec.key, {
      key: spec.key,
      plainPassword: spec.password,
      doc,
    });
  }

  await db
    .collection('users')
    .insertMany(asDocuments([...users.values()].map((user) => user.doc)));

  return users;
}

/**
 * Construye e inserta el árbol de carpetas respetando la invariante
 * `ancestors = [...padre.ancestors, padre._id]` y `depth = ancestors.length`.
 */
async function insertFolders(
  db: mongo.Db,
  users: Map<SeedUserKey, UserRecord>,
): Promise<Map<string, FolderRecord>> {
  const folders = new Map<string, FolderRecord>();
  const siblingNames = new Set<string>();

  for (const spec of SEED_FOLDERS) {
    if (folders.has(spec.key)) {
      throw new Error(`Clave de carpeta duplicada: ${spec.key}`);
    }

    const owner = getUser(users, spec.owner);
    const parent = spec.parent ? getFolder(folders, spec.parent) : null;

    if (parent && parent.ownerKey !== spec.owner) {
      throw new Error(
        `La carpeta ${spec.key} y su padre pertenecen a usuarios distintos`,
      );
    }

    // El nombre debe ser único entre hermanas activas del mismo dueño.
    const siblingKey = `${spec.owner}|${spec.parent ?? 'root'}|${spec.name}`;
    if (siblingNames.has(siblingKey)) {
      throw new Error(`Nombre de carpeta duplicado entre hermanas: ${spec.name}`);
    }
    siblingNames.add(siblingKey);

    const ancestors = parent ? [...parent.doc.ancestors, parent.doc._id] : [];
    const createdAt = daysAgo(spec.createdDaysAgo, 8, 45);
    const updatedAt =
      spec.renamedDaysAgo === undefined
        ? createdAt
        : notAfterNow(daysAgo(spec.renamedDaysAgo, 11, 10));

    if (updatedAt < createdAt) {
      throw new Error(`La carpeta ${spec.key} se renombró antes de crearse`);
    }

    const doc: FolderDoc = {
      _id: new Types.ObjectId(),
      name: spec.name,
      ownerId: owner.doc._id,
      parentId: parent?.doc._id ?? null,
      ancestors,
      depth: ancestors.length,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      deletedRootId: null,
      createdAt,
      updatedAt,
    };

    folders.set(spec.key, { key: spec.key, ownerKey: spec.owner, doc });
  }

  await db
    .collection('folders')
    .insertMany(asDocuments([...folders.values()].map((folder) => folder.doc)));

  return folders;
}

/** Escribe un buffer en GridFS con el `_id` indicado y la fecha de subida. */
async function writeGridFs(
  db: mongo.Db,
  bucket: mongo.GridFSBucket,
  options: {
    gridFsId: Types.ObjectId;
    fileId: Types.ObjectId;
    ownerId: Types.ObjectId;
    name: string;
    buffer: Buffer;
    contentType: string;
    createdAt: Date;
  },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const upload = bucket.openUploadStream(options.name, {
      id: options.gridFsId,
      metadata: {
        fileId: options.fileId,
        ownerId: options.ownerId,
        contentType: options.contentType,
      },
    });

    upload.once('error', reject);
    upload.once('finish', resolve);
    upload.end(options.buffer);
  });

  // GridFS fija `uploadDate` al momento de la escritura; se ajusta al
  // `createdAt` del seed para que el espejo operativo sea coherente.
  await db
    .collection('fs.files')
    .updateOne({ _id: options.gridFsId }, { $set: { uploadDate: options.createdAt } });
}

/**
 * Crea los 50 archivos: escribe el contenido en GridFS y después inserta los
 * metadatos en `files`, igual que la operación real de subida.
 */
async function insertFiles(
  db: mongo.Db,
  users: Map<SeedUserKey, UserRecord>,
  folders: Map<string, FolderRecord>,
): Promise<Map<string, FileRecord>> {
  const files = new Map<string, FileRecord>();
  const bucket = new mongo.GridFSBucket(db, { bucketName: 'fs' });
  const activeNames = new Set<string>();

  for (const [index, spec] of SEED_FILES.entries()) {
    if (files.has(spec.key)) {
      throw new Error(`Clave de archivo duplicada: ${spec.key}`);
    }

    const owner = getUser(users, spec.owner);
    const folder = spec.folder ? getFolder(folders, spec.folder) : null;

    if (folder && folder.ownerKey !== spec.owner) {
      throw new Error(
        `El archivo ${spec.key} y su carpeta pertenecen a usuarios distintos`,
      );
    }

    const content = SEED_CONTENT[spec.key];
    if (!content) {
      throw new Error(`Falta el contenido del archivo: ${spec.key}`);
    }

    const nameKey = `${spec.owner}|${spec.folder ?? 'root'}|${spec.name}`;
    if (activeNames.has(nameKey)) {
      throw new Error(`Nombre de archivo duplicado en la misma carpeta: ${spec.name}`);
    }
    activeNames.add(nameKey);

    const extension = extname(spec.name).toLowerCase().slice(1);
    if (extension !== 'txt' && extension !== 'md') {
      throw new Error(`Extensión no permitida en el seed: ${spec.name}`);
    }

    const mimeType = extension === 'md' ? 'text/markdown' : 'text/plain';
    const text = renderSeedContent(spec.name, content);
    const buffer = Buffer.from(text, 'utf8');
    const createdAt = daysAgo(spec.createdDaysAgo, 10, (index * 7) % 60);
    const renamedAt =
      spec.renamedDaysAgo === undefined
        ? null
        : notAfterNow(daysAgo(spec.renamedDaysAgo, 12, 20));

    if (renamedAt && renamedAt < createdAt) {
      throw new Error(`El archivo ${spec.key} se renombró antes de subirse`);
    }

    const fileId = new Types.ObjectId();
    const gridFsId = new Types.ObjectId();

    await writeGridFs(db, bucket, {
      gridFsId,
      fileId,
      ownerId: owner.doc._id,
      name: spec.name,
      buffer,
      contentType: mimeType,
      createdAt,
    });

    const doc: FileDoc = {
      _id: fileId,
      name: spec.name,
      ownerId: owner.doc._id,
      folderId: folder?.doc._id ?? null,
      extension,
      mimeType,
      size: buffer.byteLength,
      gridFsId,
      contentHash: createHash('sha256').update(buffer).digest('hex'),
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      deletedRootId: null,
      createdAt,
      updatedAt: renamedAt ?? createdAt,
    };

    files.set(spec.key, { key: spec.key, ownerKey: spec.owner, doc });
  }

  await db
    .collection('files')
    .insertMany(asDocuments([...files.values()].map((file) => file.doc)));

  return files;
}

/**
 * Envía archivos individuales a la papelera. Se ejecuta antes de las cascadas
 * para que estos documentos conserven su propia `deletedRootId`.
 */
async function deleteIndividualFiles(
  db: mongo.Db,
  users: Map<SeedUserKey, UserRecord>,
  files: Map<string, FileRecord>,
): Promise<void> {
  for (const spec of SEED_DELETED_FILES) {
    const file = getFile(files, spec.file);
    const actor = getUser(users, spec.deletedBy);

    if (file.doc.isDeleted) {
      throw new Error(`El archivo ${spec.file} ya estaba en papelera`);
    }

    const deletedAt = notAfterNow(daysAgo(spec.deletedDaysAgo, 17, 5));

    if (deletedAt < file.doc.createdAt) {
      throw new Error(`El archivo ${spec.file} se borró antes de crearse`);
    }

    await db.collection('files').updateOne(
      { _id: file.doc._id },
      {
        $set: {
          isDeleted: true,
          deletedAt,
          deletedBy: actor.doc._id,
          deletedRootId: file.doc._id,
          updatedAt: deletedAt,
        },
      },
    );

    file.doc.isDeleted = true;
    file.doc.deletedAt = deletedAt;
    file.doc.deletedBy = actor.doc._id;
    file.doc.deletedRootId = file.doc._id;
    file.doc.updatedAt = deletedAt;
  }
}

/**
 * Marca el borrado y la restauración de un archivo. El estado final es activo,
 * pero el historial conserva ambos eventos con sus fechas.
 */
function prepareRestoredFiles(
  users: Map<SeedUserKey, UserRecord>,
  files: Map<string, FileRecord>,
): Array<{
  file: FileRecord;
  actor: UserRecord;
  deletedAt: Date;
  restoredAt: Date;
}> {
  return SEED_RESTORED_FILES.map((spec) => {
    const file = getFile(files, spec.file);
    const actor = getUser(users, file.ownerKey);
    const deletedAt = notAfterNow(daysAgo(spec.deletedDaysAgo, 16, 40));
    const restoredAt = notAfterNow(daysAgo(spec.restoredDaysAgo, 9, 25));

    if (deletedAt < file.doc.createdAt || restoredAt <= deletedAt) {
      throw new Error(`Fechas inválidas de borrado/restauración en ${spec.file}`);
    }

    // El archivo queda activo: `storageUsed` ya contaba su tamaño desde la
    // subida y restaurar no lo modifica.
    file.doc.updatedAt = restoredAt;

    return { file, actor, deletedAt, restoredAt };
  });
}

/**
 * Envía carpetas a la papelera en cascada.
 *
 * - La raíz recibe `deletedRootId = _id`.
 * - Los descendientes activos reciben la misma raíz, fecha y actor.
 * - Los documentos que ya estaban en papelera no se tocan.
 */
async function deleteFolderCascades(
  db: mongo.Db,
  users: Map<SeedUserKey, UserRecord>,
  folders: Map<string, FolderRecord>,
  files: Map<string, FileRecord>,
): Promise<
  Array<{
    folder: FolderRecord;
    actor: UserRecord;
    deletedAt: Date;
    batchId: string;
    affectedFolders: number;
    affectedFiles: number;
  }>
> {
  const results: Array<{
    folder: FolderRecord;
    actor: UserRecord;
    deletedAt: Date;
    batchId: string;
    affectedFolders: number;
    affectedFiles: number;
  }> = [];

  for (const spec of SEED_DELETED_FOLDERS) {
    const root = getFolder(folders, spec.folder);
    const actor = getUser(users, spec.deletedBy);

    if (root.doc.isDeleted) {
      throw new Error(`La carpeta ${spec.folder} ya estaba en papelera`);
    }

    const deletedAt = notAfterNow(daysAgo(spec.deletedDaysAgo, 18, 10));

    if (deletedAt < root.doc.createdAt) {
      throw new Error(`La carpeta ${spec.folder} se borró antes de crearse`);
    }

    // Descendientes por cadena de ancestros, sin recursión en JavaScript.
    const cascadeFolders = [...folders.values()].filter(
      (candidate) =>
        !candidate.doc.isDeleted &&
        (candidate.doc._id.equals(root.doc._id) ||
          candidate.doc.ancestors.some((ancestor) =>
            ancestor.equals(root.doc._id),
          )),
    );

    for (const candidate of cascadeFolders) {
      if (candidate.doc.createdAt > deletedAt) {
        throw new Error(
          `La carpeta ${candidate.key} se creó después del borrado de ${spec.folder}`,
        );
      }
    }

    const cascadeFolderIds = new Set(
      cascadeFolders.map((candidate) => candidate.doc._id.toHexString()),
    );

    const cascadeFiles = [...files.values()].filter(
      (candidate) =>
        !candidate.doc.isDeleted &&
        candidate.doc.folderId !== null &&
        cascadeFolderIds.has(candidate.doc.folderId.toHexString()),
    );

    await db.collection('folders').updateMany(
      { _id: { $in: cascadeFolders.map((candidate) => candidate.doc._id) } },
      {
        $set: {
          isDeleted: true,
          deletedAt,
          deletedBy: actor.doc._id,
          deletedRootId: root.doc._id,
          updatedAt: deletedAt,
        },
      },
    );

    if (cascadeFiles.length > 0) {
      await db.collection('files').updateMany(
        { _id: { $in: cascadeFiles.map((candidate) => candidate.doc._id) } },
        {
          $set: {
            isDeleted: true,
            deletedAt,
            deletedBy: actor.doc._id,
            deletedRootId: root.doc._id,
            updatedAt: deletedAt,
          },
        },
      );
    }

    for (const candidate of cascadeFolders) {
      candidate.doc.isDeleted = true;
      candidate.doc.deletedAt = deletedAt;
      candidate.doc.deletedBy = actor.doc._id;
      candidate.doc.deletedRootId = root.doc._id;
      candidate.doc.updatedAt = deletedAt;
    }

    for (const candidate of cascadeFiles) {
      candidate.doc.isDeleted = true;
      candidate.doc.deletedAt = deletedAt;
      candidate.doc.deletedBy = actor.doc._id;
      candidate.doc.deletedRootId = root.doc._id;
      candidate.doc.updatedAt = deletedAt;
    }

    results.push({
      folder: root,
      actor,
      deletedAt,
      batchId: randomUUID(),
      affectedFolders: cascadeFolders.length,
      affectedFiles: cascadeFiles.length,
    });
  }

  return results;
}

/** Resuelve y valida el recurso de una compartición. */
function resolveShareResource(
  spec: { resourceType: SeedResourceType; resource: string },
  folders: Map<string, FolderRecord>,
  files: Map<string, FileRecord>,
): {
  resourceId: Types.ObjectId;
  ownerKey: SeedUserKey;
  ownerId: Types.ObjectId;
  name: string;
  createdAt: Date;
} {
  if (spec.resourceType === 'FOLDER') {
    const folder = getFolder(folders, spec.resource);
    return {
      resourceId: folder.doc._id,
      ownerKey: folder.ownerKey,
      ownerId: folder.doc.ownerId,
      name: folder.doc.name,
      createdAt: folder.doc.createdAt,
    };
  }

  const file = getFile(files, spec.resource);
  return {
    resourceId: file.doc._id,
    ownerKey: file.ownerKey,
    ownerId: file.doc.ownerId,
    name: file.doc.name,
    createdAt: file.doc.createdAt,
  };
}

/**
 * Inserta las comparticiones. La fecha del permiso se ajusta para que nunca
 * sea anterior a la creación del recurso.
 */
async function insertShares(
  db: mongo.Db,
  users: Map<SeedUserKey, UserRecord>,
  folders: Map<string, FolderRecord>,
  files: Map<string, FileRecord>,
): Promise<ShareRecord[]> {
  const shares: ShareRecord[] = [];
  const uniqueKeys = new Set<string>();

  for (const spec of SEED_SHARES) {
    const resource = resolveShareResource(spec, folders, files);
    const grantee = getUser(users, spec.grantee);

    if (grantee.doc._id.equals(resource.ownerId)) {
      throw new Error(`El destinatario de un share no puede ser el dueño: ${spec.resource}`);
    }

    const uniqueKey = `${spec.resourceType}|${resource.resourceId.toHexString()}|${grantee.doc._id.toHexString()}`;
    if (uniqueKeys.has(uniqueKey)) {
      throw new Error(`Compartición duplicada en el seed: ${spec.resource}`);
    }
    uniqueKeys.add(uniqueKey);

    const earliest = addDays(resource.createdAt, 1);
    const candidateCreated = daysAgo(spec.createdDaysAgo, 15, 30);
    const createdAt = notAfterNow(
      candidateCreated > earliest ? candidateCreated : earliest,
    );

    let updatedAt = createdAt;
    if (spec.updatedDaysAgo !== undefined) {
      const candidateUpdated = daysAgo(spec.updatedDaysAgo, 16, 45);
      updatedAt = notAfterNow(
        candidateUpdated > createdAt ? candidateUpdated : addDays(createdAt, 1),
      );
    }

    const doc: ShareDoc = {
      _id: new Types.ObjectId(),
      resourceType: spec.resourceType,
      resourceId: resource.resourceId,
      ownerId: resource.ownerId,
      granteeId: grantee.doc._id,
      access: spec.access,
      createdAt,
      updatedAt,
    };

    shares.push({ doc, ownerKey: resource.ownerKey, resourceName: resource.name });
  }

  await db
    .collection('shares')
    .insertMany(asDocuments(shares.map((share) => share.doc)));

  return shares;
}

/**
 * Ajusta el historial al estado real del seed. Cada evento guarda el nombre del
 * actor y del recurso como copia (snapshot), nunca por referencia.
 */
function buildActivity(
  users: Map<SeedUserKey, UserRecord>,
  folders: Map<string, FolderRecord>,
  files: Map<string, FileRecord>,
  shares: ShareRecord[],
  individualDeletions: Array<{ file: FileRecord; actor: UserRecord; deletedAt: Date }>,
  restoredFiles: Array<{
    file: FileRecord;
    actor: UserRecord;
    deletedAt: Date;
    restoredAt: Date;
  }>,
  folderCascades: Array<{
    folder: FolderRecord;
    actor: UserRecord;
    deletedAt: Date;
    batchId: string;
    affectedFolders: number;
    affectedFiles: number;
  }>,
): ActivityDoc[] {
  const events: ActivityDoc[] = [];

  const addEvent = (input: {
    actor: UserRecord | null;
    action: ActivityAction;
    resourceType: ActivityResourceType;
    resourceId: Types.ObjectId | null;
    resourceName: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  }): void => {
    events.push({
      _id: new Types.ObjectId(),
      actorId: input.actor?.doc._id ?? null,
      actorName: input.actor?.doc.name ?? 'Sistema',
      actorRole: input.actor?.doc.role ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      resourceName: input.resourceName,
      metadata: input.metadata ?? {},
      createdAt: input.createdAt,
    });
  };

  const admin = getUser(users, 'admin');
  const ana = getUser(users, 'ana');
  const luis = getUser(users, 'luis');

  // 1. Alta de usuarios: el administrador nace del proceso de sistema y crea
  //    las dos cuentas USER.
  addEvent({
    actor: null,
    action: ActivityAction.USER_CREATE,
    resourceType: ActivityResourceType.USER,
    resourceId: admin.doc._id,
    resourceName: admin.doc.name,
    metadata: { email: admin.doc.email, role: admin.doc.role },
    createdAt: admin.doc.createdAt,
  });
  for (const user of [ana, luis]) {
    addEvent({
      actor: admin,
      action: ActivityAction.USER_CREATE,
      resourceType: ActivityResourceType.USER,
      resourceId: user.doc._id,
      resourceName: user.doc.name,
      metadata: { email: user.doc.email, role: user.doc.role },
      createdAt: user.doc.createdAt,
    });
  }

  // 2. Inicios de sesión repartidos en varios días y usuarios.
  const loginDays: Record<SeedUserKey, number[]> = {
    admin: [45, 30, 18, 9, 2],
    ana: [50, 33, 21, 12, 1],
    luis: [48, 31, 19, 10, 3],
  };
  for (const [key, days] of Object.entries(loginDays) as Array<
    [SeedUserKey, number[]]
  >) {
    const user = getUser(users, key);
    days.forEach((day, index) => {
      addEvent({
        actor: user,
        action: ActivityAction.AUTH_LOGIN,
        resourceType: ActivityResourceType.AUTH,
        resourceId: user.doc._id,
        resourceName: 'Inicio de sesión',
        metadata: { ip: `192.168.10.${20 + index}` },
        createdAt: notAfterNow(daysAgo(day, 8 + index, 15)),
      });
    });
  }

  // 3. Creación de carpetas. Si luego se renombró, el evento conserva el
  //    nombre que tenía en ese momento.
  for (const folder of folders.values()) {
    const spec = SEED_FOLDERS.find((candidate) => candidate.key === folder.key);
    addEvent({
      actor: getUser(users, folder.ownerKey),
      action: ActivityAction.FOLDER_CREATE,
      resourceType: ActivityResourceType.FOLDER,
      resourceId: folder.doc._id,
      resourceName: spec?.renamedFrom ?? folder.doc.name,
      metadata: { parentId: folder.doc.parentId },
      createdAt: folder.doc.createdAt,
    });

    if (spec?.renamedFrom && spec.renamedDaysAgo !== undefined) {
      addEvent({
        actor: getUser(users, folder.ownerKey),
        action: ActivityAction.FOLDER_RENAME,
        resourceType: ActivityResourceType.FOLDER,
        resourceId: folder.doc._id,
        resourceName: folder.doc.name,
        metadata: { previousName: spec.renamedFrom },
        createdAt: notAfterNow(daysAgo(spec.renamedDaysAgo, 11, 10)),
      });
    }
  }

  // 4. Subida de los 50 archivos.
  for (const file of files.values()) {
    const spec = SEED_FILES.find((candidate) => candidate.key === file.key);
    addEvent({
      actor: getUser(users, file.ownerKey),
      action: ActivityAction.FILE_UPLOAD,
      resourceType: ActivityResourceType.FILE,
      resourceId: file.doc._id,
      resourceName: spec?.renamedFrom ?? file.doc.name,
      metadata: {
        parentId: file.doc.folderId,
        extension: file.doc.extension,
        size: file.doc.size,
      },
      createdAt: file.doc.createdAt,
    });

    // 5. Renombrados posteriores.
    if (spec?.renamedFrom && spec.renamedDaysAgo !== undefined) {
      addEvent({
        actor: getUser(users, file.ownerKey),
        action: ActivityAction.FILE_RENAME,
        resourceType: ActivityResourceType.FILE,
        resourceId: file.doc._id,
        resourceName: file.doc.name,
        metadata: { previousName: spec.renamedFrom },
        createdAt: notAfterNow(daysAgo(spec.renamedDaysAgo, 12, 20)),
      });
    }
  }

  // 6. Descargas. Todos los actores tienen acceso directo o heredado.
  const downloads: Array<{ file: string; actor: SeedUserKey; days: number }> = [
    { file: 'ana-informe-anual', actor: 'luis', days: 22 },
    { file: 'ana-informe-anual', actor: 'admin', days: 20 },
    { file: 'ana-manual-usuario', actor: 'admin', days: 19 },
    { file: 'ana-plan', actor: 'luis', days: 15 },
    { file: 'luis-contrato-acme', actor: 'ana', days: 18 },
    { file: 'luis-propuesta-globex', actor: 'ana', days: 10 },
    { file: 'admin-plantilla-informe', actor: 'ana', days: 12 },
    { file: 'ana-politica-privacidad', actor: 'luis', days: 14 },
    { file: 'luis-lista-proveedores', actor: 'admin', days: 11 },
    { file: 'ana-acta-09', actor: 'luis', days: 6 },
    { file: 'admin-plantilla-acta', actor: 'luis', days: 7 },
  ];

  for (const download of downloads) {
    const file = getFile(files, download.file);
    const actor = getUser(users, download.actor);
    addEvent({
      actor,
      action: ActivityAction.FILE_DOWNLOAD,
      resourceType: ActivityResourceType.FILE,
      resourceId: file.doc._id,
      resourceName: file.doc.name,
      metadata: { extension: file.doc.extension, size: file.doc.size },
      createdAt: notAfterNow(daysAgo(download.days, 16, 20)),
    });
  }

  // 7. Borrados individuales de archivos.
  for (const deletion of individualDeletions) {
    addEvent({
      actor: deletion.actor,
      action: ActivityAction.FILE_DELETE,
      resourceType: ActivityResourceType.FILE,
      resourceId: deletion.file.doc._id,
      resourceName: deletion.file.doc.name,
      metadata: {
        parentId: deletion.file.doc.folderId,
        extension: deletion.file.doc.extension,
        size: deletion.file.doc.size,
      },
      createdAt: deletion.deletedAt,
    });
  }

  // 8. Borrado y restauración del archivo que vuelve a estar activo.
  for (const restored of restoredFiles) {
    addEvent({
      actor: restored.actor,
      action: ActivityAction.FILE_DELETE,
      resourceType: ActivityResourceType.FILE,
      resourceId: restored.file.doc._id,
      resourceName: restored.file.doc.name,
      metadata: {
        parentId: restored.file.doc.folderId,
        extension: restored.file.doc.extension,
        size: restored.file.doc.size,
      },
      createdAt: restored.deletedAt,
    });
    addEvent({
      actor: restored.actor,
      action: ActivityAction.FILE_RESTORE,
      resourceType: ActivityResourceType.FILE,
      resourceId: restored.file.doc._id,
      resourceName: restored.file.doc.name,
      metadata: {},
      createdAt: restored.restoredAt,
    });
  }

  // 9. Cascadas de carpetas: un evento raíz con contadores y `batchId`.
  for (const cascade of folderCascades) {
    addEvent({
      actor: cascade.actor,
      action: ActivityAction.FOLDER_DELETE,
      resourceType: ActivityResourceType.FOLDER,
      resourceId: cascade.folder.doc._id,
      resourceName: cascade.folder.doc.name,
      metadata: {
        batchId: cascade.batchId,
        affectedFolders: cascade.affectedFolders,
        affectedFiles: cascade.affectedFiles,
      },
      createdAt: cascade.deletedAt,
    });
  }

  // 10. Comparticiones: concesión y, si cambió el nivel, actualización.
  for (const share of shares) {
    const granteeKey = [...users.entries()].find(([, user]) =>
      user.doc._id.equals(share.doc.granteeId),
    )?.[0];

    // Se identifica la definición exacta por recurso y destinatario, no solo
    // por tipo, para no confundir comparticiones del mismo dueño.
    const spec = SEED_SHARES.find((candidate) => {
      if (
        candidate.resourceType !== share.doc.resourceType ||
        candidate.grantee !== granteeKey
      ) {
        return false;
      }
      return resolveShareResource(candidate, folders, files).resourceId.equals(
        share.doc.resourceId,
      );
    });

    const owner = getUser(users, share.ownerKey);
    const grantAccess = spec?.previousAccess ?? share.doc.access;

    addEvent({
      actor: owner,
      action: ActivityAction.SHARE_GRANT,
      resourceType: ActivityResourceType.SHARE,
      resourceId: share.doc._id,
      resourceName: share.resourceName,
      metadata: {
        resourceType: share.doc.resourceType,
        resourceId: share.doc.resourceId,
        granteeId: share.doc.granteeId,
        access: grantAccess,
      },
      createdAt: share.doc.createdAt,
    });

    if (spec?.previousAccess) {
      addEvent({
        actor: owner,
        action: ActivityAction.SHARE_UPDATE,
        resourceType: ActivityResourceType.SHARE,
        resourceId: share.doc._id,
        resourceName: share.resourceName,
        metadata: {
          resourceType: share.doc.resourceType,
          resourceId: share.doc.resourceId,
          granteeId: share.doc.granteeId,
          access: share.doc.access,
          previousAccess: spec.previousAccess,
        },
        createdAt: share.doc.updatedAt,
      });
    }
  }

  // El historial se inserta ordenado por fecha para facilitar la inspección.
  return events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Recalcula `storageUsed` con la suma real de todos los archivos no purgados. */
async function updateStorageUsed(
  db: mongo.Db,
  users: Map<SeedUserKey, UserRecord>,
  files: Map<string, FileRecord>,
): Promise<void> {
  for (const user of users.values()) {
    // Incluye los archivos en papelera: solo se resta al purgar.
    const total = [...files.values()]
      .filter((file) => file.ownerKey === user.key)
      .reduce((sum, file) => sum + file.doc.size, 0);

    await db
      .collection('users')
      .updateOne({ _id: user.doc._id }, { $set: { storageUsed: total } });

    user.doc.storageUsed = total;
  }
}

/** Comprueba con consultas que el estado cumple los mínimos del enunciado. */
async function validateSeed(
  db: mongo.Db,
  users: Map<SeedUserKey, UserRecord>,
  folders: Map<string, FolderRecord>,
  files: Map<string, FileRecord>,
  shares: ShareRecord[],
  folderCascades: Array<{
    folder: FolderRecord;
    affectedFolders: number;
    affectedFiles: number;
  }>,
  bucket: mongo.GridFSBucket,
): Promise<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];

  const addCheck = (label: string, ok: boolean, detail: string): void => {
    checks.push({ label, ok, detail });
  };

  // --- Usuarios -----------------------------------------------------------
  const usersCollection = db.collection('users');
  const userTotal = await usersCollection.countDocuments();
  const roleRows = await usersCollection
    .aggregate([{ $group: { _id: '$role', total: { $sum: 1 } } }])
    .toArray();
  const admins = Number(roleRows.find((row) => row._id === 'ADMIN')?.total ?? 0);
  const normalUsers = Number(roleRows.find((row) => row._id === 'USER')?.total ?? 0);

  addCheck(
    'Usuarios: 3 con 1 ADMIN y 2 USER',
    userTotal === 3 && admins === 1 && normalUsers === 2,
    `${userTotal} usuarios (ADMIN ${admins}, USER ${normalUsers})`,
  );

  // --- Archivos y GridFS --------------------------------------------------
  const filesCollection = db.collection('files');
  const fileTotal = await filesCollection.countDocuments();
  const extensionRows = await filesCollection
    .aggregate([
      { $group: { _id: '$extension', total: { $sum: 1 }, size: { $sum: '$size' } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  const mdCount = Number(extensionRows.find((row) => row._id === 'md')?.total ?? 0);
  const txtCount = Number(extensionRows.find((row) => row._id === 'txt')?.total ?? 0);

  addCheck(
    'Archivos: 50 entre .txt y .md',
    fileTotal === 50 && mdCount > 0 && txtCount > 0,
    `${fileTotal} archivos (md ${mdCount}, txt ${txtCount})`,
  );

  const fsFilesCount = await db.collection('fs.files').countDocuments();
  const fsChunksCount = await db.collection('fs.chunks').countDocuments();

  const missingBinaries = await filesCollection
    .aggregate([
      {
        $lookup: {
          from: 'fs.files',
          localField: 'gridFsId',
          foreignField: '_id',
          as: 'binario',
        },
      },
      { $match: { $expr: { $ne: [{ $size: '$binario' }, 1] } } },
    ])
    .toArray();

  const sizeMismatch = await filesCollection
    .aggregate([
      {
        $lookup: {
          from: 'fs.files',
          localField: 'gridFsId',
          foreignField: '_id',
          as: 'binario',
        },
      },
      { $unwind: '$binario' },
      { $match: { $expr: { $ne: ['$size', '$binario.length'] } } },
    ])
    .toArray();

  addCheck(
    'GridFS: cada archivo tiene binario y tamaño coincidente',
    fsFilesCount === fileTotal &&
      fsChunksCount >= fileTotal &&
      missingBinaries.length === 0 &&
      sizeMismatch.length === 0,
    `${fsFilesCount} binarios, ${fsChunksCount} chunks, ${missingBinaries.length + sizeMismatch.length} incidencias`,
  );

  // Se descarga una muestra real desde GridFS para comprobar el contenido.
  const sample = getFile(files, 'ana-informe-anual');
  const sampleChunks: Buffer[] = [];
  for await (const chunk of bucket.openDownloadStream(sample.doc.gridFsId)) {
    sampleChunks.push(Buffer.from(chunk as Buffer));
  }
  const sampleBuffer = Buffer.concat(sampleChunks);
  const sampleHash = createHash('sha256').update(sampleBuffer).digest('hex');

  addCheck(
    'GridFS: el contenido de una muestra es legible e íntegro',
    sampleBuffer.byteLength === sample.doc.size &&
      sampleHash === sample.doc.contentHash,
    `${sample.doc.name}: ${formatBytes(sampleBuffer.byteLength)}`,
  );

  // --- Almacenamiento -----------------------------------------------------
  const storageRows = await filesCollection
    .aggregate([{ $group: { _id: '$ownerId', total: { $sum: '$size' } } }])
    .toArray();
  const storageErrors: string[] = [];

  for (const user of users.values()) {
    const row = storageRows.find(
      (candidate) => candidate._id?.toString() === user.doc._id.toString(),
    );
    const expected = Number(row?.total ?? 0);
    if (expected !== user.doc.storageUsed) {
      storageErrors.push(
        `${user.doc.name}: usuario ${user.doc.storageUsed} / archivos ${expected}`,
      );
    }
  }

  addCheck(
    'storageUsed coincide con la suma de size de cada usuario',
    storageErrors.length === 0,
    storageErrors.length === 0
      ? [...users.values()]
          .map((user) => `${user.doc.name} ${formatBytes(user.doc.storageUsed)}`)
          .join(', ')
      : storageErrors.join('; '),
  );

  // --- Jerarquía de carpetas ---------------------------------------------
  const foldersCollection = db.collection('folders');
  const folderTotal = await foldersCollection.countDocuments();
  const depthErrors = await foldersCollection
    .aggregate([
      { $match: { $expr: { $ne: ['$depth', { $size: '$ancestors' }] } } },
      { $count: 'total' },
    ])
    .toArray();

  let chainErrors = 0;
  let ownerErrors = 0;
  let selfReferenceErrors = 0;

  for (const folder of folders.values()) {
    const { doc } = folder;

    if (doc.ancestors.some((ancestor) => ancestor.equals(doc._id))) {
      selfReferenceErrors += 1;
    }

    if (doc.parentId === null) {
      if (doc.ancestors.length !== 0 || doc.depth !== 0) {
        chainErrors += 1;
      }
      continue;
    }

    const parent = [...folders.values()].find((candidate) =>
      candidate.doc._id.equals(doc.parentId as Types.ObjectId),
    );

    if (!parent) {
      chainErrors += 1;
      continue;
    }

    const expectedAncestors = [...parent.doc.ancestors, parent.doc._id];
    const sameChain =
      expectedAncestors.length === doc.ancestors.length &&
      expectedAncestors.every((ancestor, index) =>
        ancestor.equals(doc.ancestors[index]),
      );

    if (!sameChain) {
      chainErrors += 1;
    }
    if (!parent.doc.ownerId.equals(doc.ownerId)) {
      ownerErrors += 1;
    }
  }

  addCheck(
    'Carpetas: depth y ancestors coherentes con el padre',
    Number(depthErrors[0]?.total ?? 0) === 0 &&
      chainErrors === 0 &&
      ownerErrors === 0 &&
      selfReferenceErrors === 0,
    `${folderTotal} carpetas, ${Number(depthErrors[0]?.total ?? 0)} errores de depth, ${chainErrors + ownerErrors + selfReferenceErrors} de cadena/propiedad`,
  );

  const duplicateFolderNames = await foldersCollection
    .aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: { ownerId: '$ownerId', parentId: '$parentId', name: '$name' },
          total: { $sum: 1 },
        },
      },
      { $match: { total: { $gt: 1 } } },
    ])
    .toArray();

  const duplicateFileNames = await filesCollection
    .aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: { ownerId: '$ownerId', folderId: '$folderId', name: '$name' },
          total: { $sum: 1 },
        },
      },
      { $match: { total: { $gt: 1 } } },
    ])
    .toArray();

  addCheck(
    'Nombres únicos entre hermanos activos',
    duplicateFolderNames.length === 0 && duplicateFileNames.length === 0,
    `${duplicateFolderNames.length + duplicateFileNames.length} duplicados`,
  );

  // --- Comparticiones -----------------------------------------------------
  const sharesCollection = db.collection('shares');
  const shareTotal = await sharesCollection.countDocuments();
  const shareAccessRows = await sharesCollection
    .aggregate([{ $group: { _id: '$access', total: { $sum: 1 } } }])
    .toArray();
  const shareTypeRows = await sharesCollection
    .aggregate([{ $group: { _id: '$resourceType', total: { $sum: 1 } } }])
    .toArray();
  const invalidGrantee = await sharesCollection
    .aggregate([
      { $match: { $expr: { $eq: ['$ownerId', '$granteeId'] } } },
      { $count: 'total' },
    ])
    .toArray();

  let shareOwnerErrors = 0;
  let activeShareCount = 0;

  for (const share of shares) {
    const resource =
      share.doc.resourceType === 'FOLDER'
        ? [...folders.values()].find((folder) =>
            folder.doc._id.equals(share.doc.resourceId),
          )
        : [...files.values()].find((file) =>
            file.doc._id.equals(share.doc.resourceId),
          );

    if (!resource || !resource.doc.ownerId.equals(share.doc.ownerId)) {
      shareOwnerErrors += 1;
    }
    if (resource && !resource.doc.isDeleted) {
      activeShareCount += 1;
    }
  }

  const accessLevels = new Set(shareAccessRows.map((row) => row._id));
  const resourceTypes = new Set(shareTypeRows.map((row) => row._id));

  addCheck(
    'Comparticiones: más de 20, archivos y carpetas, READ/COMMENT/EDIT',
    shareTotal > 20 &&
      activeShareCount > 20 &&
      accessLevels.size === 3 &&
      resourceTypes.size === 2 &&
      Number(invalidGrantee[0]?.total ?? 0) === 0 &&
      shareOwnerErrors === 0,
    `${shareTotal} shares (${activeShareCount} sobre recursos activos; FILE/FOLDER y 3 niveles)`,
  );

  // --- Papelera -----------------------------------------------------------
  const deletedFiles = [...files.values()].filter((file) => file.doc.isDeleted);
  const deletedFolders = [...folders.values()].filter(
    (folder) => folder.doc.isDeleted,
  );

  const trashWithoutRoot = [...deletedFiles, ...deletedFolders].filter(
    (record) =>
      record.doc.deletedRootId === null || record.doc.deletedAt === null,
  ).length;

  const activeWithDeletedRoot = [...files.values(), ...folders.values()].filter(
    (record) => !record.doc.isDeleted && record.doc.deletedRootId !== null,
  ).length;

  const fileRoots = deletedFiles.filter((file) =>
    file.doc.deletedRootId?.equals(file.doc._id),
  );
  const folderRoots = deletedFolders.filter((folder) =>
    folder.doc.deletedRootId?.equals(folder.doc._id),
  );

  const cascadeErrors = folderCascades.filter((cascade) => {
    const rootId = cascade.folder.doc._id;
    const descendants = deletedFolders.filter(
      (folder) =>
        !folder.doc._id.equals(rootId) &&
        folder.doc.deletedRootId?.equals(rootId),
    );
    const descendantFiles = deletedFiles.filter((file) =>
      file.doc.deletedRootId?.equals(rootId),
    );

    return (
      descendants.length + 1 !== cascade.affectedFolders ||
      descendantFiles.length !== cascade.affectedFiles
    );
  }).length;

  addCheck(
    'Papelera: raíces y cascadas con deletedRootId correcto',
    deletedFiles.length > 0 &&
      deletedFolders.length > 0 &&
      fileRoots.length > 0 &&
      folderRoots.length > 0 &&
      trashWithoutRoot === 0 &&
      activeWithDeletedRoot === 0 &&
      cascadeErrors === 0,
    `${fileRoots.length + folderRoots.length} raíces (${folderRoots.length} carpetas, ${fileRoots.length} archivos), ${deletedFiles.length} archivos y ${deletedFolders.length} carpetas en papelera`,
  );

  const staleShares = shares.filter((share) => {
    const resource =
      share.doc.resourceType === 'FOLDER'
        ? [...folders.values()].find((folder) =>
            folder.doc._id.equals(share.doc.resourceId),
          )
        : [...files.values()].find((file) =>
            file.doc._id.equals(share.doc.resourceId),
          );
    return resource?.doc.isDeleted === true;
  }).length;

  addCheck(
    'Papelera: las comparticiones sobreviven al soft delete',
    staleShares > 0,
    `${staleShares} share(s) apuntan a recursos en papelera`,
  );

  // --- Historial ----------------------------------------------------------
  const activityCollection = db.collection('activity_log');
  const activityTotal = await activityCollection.countDocuments();
  const actionRows = await activityCollection
    .aggregate([
      { $group: { _id: '$action', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ])
    .toArray();
  const dayRows = await activityCollection
    .aggregate([
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: 'UTC',
            },
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  const rangeRows = await activityCollection
    .aggregate([
      {
        $group: {
          _id: null,
          min: { $min: '$createdAt' },
          max: { $max: '$createdAt' },
        },
      },
    ])
    .toArray();

  const uploads = Number(
    actionRows.find((row) => row._id === ActivityAction.FILE_UPLOAD)?.total ?? 0,
  );
  const grants = Number(
    actionRows.find((row) => row._id === ActivityAction.SHARE_GRANT)?.total ?? 0,
  );
  const folderCreates = Number(
    actionRows.find((row) => row._id === ActivityAction.FOLDER_CREATE)?.total ?? 0,
  );
  const distinctUploadedFiles = (
    await activityCollection
      .aggregate([
        { $match: { action: ActivityAction.FILE_UPLOAD } },
        { $group: { _id: '$resourceId' } },
        { $count: 'total' },
      ])
      .toArray()
  )[0];

  addCheck(
    'Historial: un FILE_UPLOAD por archivo y un SHARE_GRANT por share',
    uploads === fileTotal &&
      Number(distinctUploadedFiles?.total ?? 0) === fileTotal &&
      grants === shareTotal &&
      folderCreates === folderTotal,
    `${uploads} subidas, ${grants} concesiones, ${folderCreates} carpetas creadas`,
  );

  addCheck(
    'Historial: fechas variadas y acciones suficientes para los reportes',
    dayRows.length >= 8 &&
      actionRows.length >= 10 &&
      dayRows.some((row) => Number(row.total) >= 5),
    `${activityTotal} eventos en ${dayRows.length} días, ${actionRows.length} acciones distintas`,
  );

  const activityFiles = await activityCollection
    .aggregate([
      { $match: { resourceType: ActivityResourceType.FILE } },
      { $group: { _id: '$resourceId', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 3 },
    ])
    .toArray();

  addCheck(
    'Historial: hay archivos con varias operaciones (reporte 3)',
    activityFiles.length > 0 && Number(activityFiles[0]?.total ?? 0) >= 2,
    activityFiles
      .map((row) => {
        const file = [...files.values()].find((candidate) =>
          candidate.doc._id.equals(row._id as Types.ObjectId),
        );
        return `${file?.doc.name ?? row._id}: ${Number(row.total)}`;
      })
      .join(', '),
  );

  // Fechas variadas también en los archivos, para el reporte por rango.
  const fileDays = new Set(
    [...files.values()].map((file) => formatDate(file.doc.createdAt)),
  );
  const activityMin = rangeRows[0]?.min as Date | undefined;
  const activityMax = rangeRows[0]?.max as Date | undefined;
  const activitySpanOk =
    activityMin !== undefined &&
    activityMax !== undefined &&
    activityMax.getTime() - activityMin.getTime() >= 14 * DAY_MS;

  addCheck(
    'Archivos: createdAt repartido en varios días',
    fileDays.size >= 5,
    `${fileDays.size} días distintos entre ${
      activityMin ? formatDate(activityMin) : 'sin datos'
    } y ${activityMax ? formatDate(activityMax) : 'sin datos'}`,
  );

  // El resumen de fechas del historial se imprime aparte, pero se deja aquí
  // la comprobación de rango para que un fallo sea visible en las validaciones.
  addCheck(
    'Historial: rango temporal cubre varias semanas',
    rangeRows.length === 1 && activitySpanOk,
    activityMin && activityMax
      ? `${formatDate(activityMin)} → ${formatDate(activityMax)}`
      : 'sin eventos',
  );

  return checks;
}

/** Imprime el resumen final y el resultado de las validaciones. */
function printReport(
  users: Map<SeedUserKey, UserRecord>,
  folders: Map<string, FolderRecord>,
  files: Map<string, FileRecord>,
  shares: ShareRecord[],
  checks: ValidationCheck[],
): void {
  const folderList = [...folders.values()];
  const fileList = [...files.values()];
  const activeFolders = folderList.filter((folder) => !folder.doc.isDeleted).length;
  const activeFiles = fileList.filter((file) => !file.doc.isDeleted).length;
  const deletedFolders = folderList.length - activeFolders;
  const deletedFiles = fileList.length - activeFiles;
  const totalBytes = fileList.reduce((sum, file) => sum + file.doc.size, 0);
  const mdCount = fileList.filter((file) => file.doc.extension === 'md').length;
  const txtCount = fileList.length - mdCount;
  const fileShares = shares.filter(
    (share) => share.doc.resourceType === 'FILE',
  ).length;
  const folderShares = shares.length - fileShares;
  const accessCount = {
    READ: shares.filter((share) => share.doc.access === 'READ').length,
    COMMENT: shares.filter((share) => share.doc.access === 'COMMENT').length,
    EDIT: shares.filter((share) => share.doc.access === 'EDIT').length,
  };
  const trashRoots =
    fileList.filter((file) => file.doc.deletedRootId?.equals(file.doc._id)).length +
    folderList.filter((folder) =>
      folder.doc.deletedRootId?.equals(folder.doc._id),
    ).length;

  console.log('\nResumen del seed');
  console.log('────────────────────────────────────────────────────────────');
  console.log(
    `Usuarios:       ${users.size} (ADMIN ${[...users.values()].filter((user) => user.doc.role === 'ADMIN').length}, USER ${[...users.values()].filter((user) => user.doc.role === 'USER').length})`,
  );
  console.log(
    `Carpetas:       ${folderList.length} (${activeFolders} activas, ${deletedFolders} en papelera)`,
  );
  console.log(
    `Archivos:       ${fileList.length} (md ${mdCount}, txt ${txtCount}; ${activeFiles} activos, ${deletedFiles} en papelera)`,
  );
  console.log(`GridFS:         ${fileList.length} binarios, ${formatBytes(totalBytes)}`);
  console.log(
    `Comparticiones: ${shares.length} (FILE ${fileShares}, FOLDER ${folderShares}; READ ${accessCount.READ}, COMMENT ${accessCount.COMMENT}, EDIT ${accessCount.EDIT})`,
  );
  console.log(
    `Papelera:       ${trashRoots} raíces visibles en GET /api/trash`,
  );
  console.log('Almacenamiento por usuario:');
  for (const user of users.values()) {
    console.log(
      `  ${user.doc.name.padEnd(18)} ${user.doc.email.padEnd(28)} ${formatBytes(user.doc.storageUsed)}`,
    );
  }
  console.log('\nCredenciales de prueba (también en docs/api.md):');
  for (const user of users.values()) {
    console.log(
      `  ${user.doc.role.padEnd(5)} ${user.doc.email.padEnd(28)} ${user.plainPassword}`,
    );
  }

  console.log('\nValidaciones');
  console.log('────────────────────────────────────────────────────────────');
  for (const check of checks) {
    console.log(`${check.ok ? 'OK  ' : 'FALLA'} ${check.label}: ${check.detail}`);
  }

  const failed = checks.filter((check) => !check.ok);
  console.log('────────────────────────────────────────────────────────────');
  if (failed.length === 0) {
    console.log(`Seed completado: ${checks.length} validaciones correctas.`);
  } else {
    console.error(
      `Seed con ${failed.length} validación(es) fallida(s) de ${checks.length}.`,
    );
    process.exitCode = 1;
  }
}

async function seed(): Promise<void> {
  const startedAt = Date.now();

  await mongoose.connect(MONGODB_URI, {
    dbName: DB_NAME,
    autoIndex: false,
    serverSelectionTimeoutMS: 10_000,
  });

  try {
    const db = getDb();

    // 1. Carga limpia: se elimina la base completa antes de insertar.
    await db.dropDatabase();
    console.log(`Base "${DB_NAME}" eliminada; se recreará desde cero.`);

    // 2. Índices del modelo (incluidos los de GridFS).
    await createIndexes(db);

    // 3. Usuarios con hash bcrypt.
    const users = await insertUsers(db);

    // 4. Carpetas y subcarpetas con ancestors/depth.
    const folders = await insertFolders(db, users);

    // 5. Archivos con contenido real en GridFS.
    const files = await insertFiles(db, users, folders);

    // 6. Papelera: archivos individuales, restauración y cascadas.
    await deleteIndividualFiles(db, users, files);
    const restoredFiles = prepareRestoredFiles(users, files);
    const folderCascades = await deleteFolderCascades(db, users, folders, files);

    // Estado final de los archivos restaurados (activos y sin raíz de borrado).
    for (const restored of restoredFiles) {
      await db.collection('files').updateOne(
        { _id: restored.file.doc._id },
        {
          $set: {
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            deletedRootId: null,
            updatedAt: restored.restoredAt,
          },
        },
      );
      restored.file.doc.isDeleted = false;
      restored.file.doc.deletedAt = null;
      restored.file.doc.deletedBy = null;
      restored.file.doc.deletedRootId = null;
    }

    // 7. Comparticiones explícitas.
    const shares = await insertShares(db, users, folders, files);

    // 8. `storageUsed` coherente con la suma de `size`.
    await updateStorageUsed(db, users, files);

    // 9. Historial append-only con fechas variadas.
    const individualDeletions = SEED_DELETED_FILES.map((spec) => {
      const file = getFile(files, spec.file);
      return {
        file,
        actor: getUser(users, spec.deletedBy),
        deletedAt: file.doc.deletedAt as Date,
      };
    });

    const activity = buildActivity(
      users,
      folders,
      files,
      shares,
      individualDeletions,
      restoredFiles,
      folderCascades,
    );

    await db.collection('activity_log').insertMany(asDocuments(activity));

    // 10. Resumen y validaciones con consultas a MongoDB.
    const bucket = new mongo.GridFSBucket(db, { bucketName: 'fs' });
    const checks = await validateSeed(
      db,
      users,
      folders,
      files,
      shares,
      folderCascades,
      bucket,
    );

    printReport(users, folders, files, shares, checks);
    console.log(`Tiempo de ejecución: ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);

    if (checks.some((check) => !check.ok)) {
      throw new Error('El seed no superó todas las validaciones');
    }
  } finally {
    await mongoose.disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error('\nEl seed falló:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
