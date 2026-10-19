import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument, type Types } from 'mongoose';

/** Extensiones permitidas; se validan junto con el tipo de contenido. */
export enum FileExtension {
  TXT = 'txt',
  MD = 'md',
}

/** Tipos MIME permitidos, correspondientes a las extensiones válidas. */
export enum FileMimeType {
  TXT = 'text/plain',
  MD = 'text/markdown',
}

/**
 * Colección `files`.
 *
 * Solo contiene metadatos. El contenido binario vive en GridFS y se referencia
 * con `gridFsId`; nunca se duplica el texto dentro de este documento.
 */
@Schema({
  collection: 'files',
  timestamps: true,
  versionKey: false,
})
export class File {
  /**
   * Nombre completo con extensión (por ejemplo `informe.md`).
   * Invariante: único en su carpeta activa para el mismo dueño (índice único
   * parcial sobre archivos no borrados).
   */
  @Prop({ required: true, trim: true })
  name: string;

  /**
   * Relación: `users` 1 —— N `files`.
   * Invariante: debe coincidir con el `ownerId` de la carpeta contenedora.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  /**
   * Relación: `folders` 1 —— N `files`.
   * `null` representa la raíz del usuario (archivo sin carpeta).
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Folder', default: null })
  folderId: Types.ObjectId | null;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(FileExtension),
  })
  extension: FileExtension;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(FileMimeType),
  })
  mimeType: FileMimeType;

  /** Tamaño del contenido en bytes. */
  @Prop({ required: true, min: 0 })
  size: number;

  /**
   * Relación 1:1 lógica con `fs.files._id` (GridFS).
   * Invariante: es único; un documento de metadatos no puede apuntar a dos
   * binarios distintos.
   */
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  gridFsId: Types.ObjectId;

  /** SHA-256 del contenido. Opcional; sirve para integridad y deduplicación. */
  @Prop({ type: String })
  contentHash?: string;

  /** Soft delete: conserva `_id`, `folderId` y comparticiones asociadas. */
  @Prop({ required: true, default: false })
  isDeleted: boolean;

  /** Momento del borrado; `null` mientras el archivo está activo. */
  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  /** Relación: usuario que ejecutó el borrado. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  deletedBy: Types.ObjectId | null;

  /**
   * Raíz del borrado en cascada.
   *
   * Invariante: al borrar un archivo suelto es su propio `_id`; si se borró
   * dentro de una carpeta, apunta a la carpeta raíz de esa cascada.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Folder', default: null })
  deletedRootId: Types.ObjectId | null;
}

export type FileDocument = HydratedDocument<File>;

export const FileSchema = SchemaFactory.createForClass(File);

// Único parcial: nombre único por carpeta activa; permite reutilizar nombres de
// archivos que están en papelera.
FileSchema.index(
  { ownerId: 1, folderId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

// Compuesto: listar el contenido de una carpeta ordenado por nombre.
FileSchema.index({ folderId: 1, isDeleted: 1, name: 1 });

// Compuesto: "mis archivos recientes" y listados por propietario.
FileSchema.index({ ownerId: 1, isDeleted: 1, updatedAt: -1 });

// Compuesto: papelera del usuario, ordenada por fecha de borrado.
FileSchema.index({ ownerId: 1, isDeleted: 1, deletedAt: -1 });

// Parcial: restaurar o purgar cascadas.
FileSchema.index(
  { deletedRootId: 1 },
  { partialFilterExpression: { isDeleted: true } },
);

// Único: garantiza la relación 1:1 con `fs.files` y detecta referencias
// duplicadas al mismo binario.
FileSchema.index({ gridFsId: 1 }, { unique: true });

// Compuesto: reporte de archivos por tipo y filtros combinados por extensión.
FileSchema.index({ isDeleted: 1, extension: 1, createdAt: -1 });

// Compuesto: reporte por rango de fechas sin filtrar por tipo.
FileSchema.index({ isDeleted: 1, createdAt: -1 });

// Compuesto: filtros por propietario, tipo y fecha.
FileSchema.index({ ownerId: 1, isDeleted: 1, extension: 1, createdAt: -1 });

// Compuesto: búsqueda por nombre dentro de los archivos del usuario.
FileSchema.index({ ownerId: 1, name: 1 });
