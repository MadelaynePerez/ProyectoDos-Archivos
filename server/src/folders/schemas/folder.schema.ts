import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument, type Types } from 'mongoose';

/**
 * Colección `folders`.
 *
 * Jerarquía representada con `parentId` + `ancestors` + `depth`
 * (materialized path con ObjectIds). Los hijos no se embeben: crecen sin
 * límite y se consultan por `parentId` o por `ancestors`.
 */
@Schema({
  collection: 'folders',
  timestamps: true,
  versionKey: false,
})
export class Folder {
  /**
   * Nombre visible. Invariante: único entre hermanas activas del mismo dueño
   * (lo garantiza el índice único parcial sobre nombres no borrados).
   */
  @Prop({ required: true, trim: true })
  name: string;

  /** Relación: `users` 1 —— N `folders` (propietario de la carpeta). */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  /**
   * Relación jerárquica: `folders` 1 —— N `folders`.
   * Invariante: una subcarpeta siempre pertenece al mismo `ownerId` que su
   * padre; no se permite mover un subárbol a otro usuario. `null` = raíz.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Folder', default: null })
  parentId: Types.ObjectId | null;

  /**
   * Cadena de ancestros de raíz a padre, sin incluir la propia carpeta.
   *
   * Invariantes:
   * - Raíz: `parentId = null`, `ancestors = []`, `depth = 0`.
   * - Hija: `ancestors = [...padre.ancestors, padre._id]`.
   * - La cadena nunca contiene a la propia carpeta, lo que hace imposible un
   *   ciclo si se mantiene esta invariante.
   */
  @Prop({
    type: [{ type: SchemaTypes.ObjectId, ref: 'Folder' }],
    default: [],
  })
  ancestors: Types.ObjectId[];

  /**
   * Invariante: `depth === ancestors.length`. Se guarda para limitar la
   * profundidad (`MAX_DEPTH`) sin recalcular la cadena en cada consulta.
   */
  @Prop({ required: true, default: 0, min: 0 })
  depth: number;

  /** Soft delete: la carpeta sigue existiendo y conserva `_id` y ubicación. */
  @Prop({ required: true, default: false })
  isDeleted: boolean;

  /** Momento del borrado; `null` mientras la carpeta está activa. */
  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  /** Relación: usuario que ejecutó el borrado. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  deletedBy: Types.ObjectId | null;

  /**
   * Raíz del borrado en cascada.
   *
   * Invariante: al borrar una carpeta `F`, `F.deletedRootId = F._id` y cada
   * descendiente que no estuviera ya en papelera recibe el mismo valor. Los
   * descendientes borrados antes conservan su propia raíz para no resucitarlos
   * al restaurar `F`.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Folder', default: null })
  deletedRootId: Types.ObjectId | null;
}

export type FolderDocument = HydratedDocument<Folder>;

export const FolderSchema = SchemaFactory.createForClass(Folder);

// Único parcial: nombres únicos entre hermanas activas, permitiendo reutilizar
// el nombre de una carpeta que está en papelera.
FolderSchema.index(
  { ownerId: 1, parentId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

// Multikey: consultar subárboles, resolver cascadas y validar ciclos.
FolderSchema.index({ ancestors: 1, isDeleted: 1 });

// Compuesto: "mis carpetas recientes" y listados por propietario.
FolderSchema.index({ ownerId: 1, isDeleted: 1, updatedAt: -1 });

// Compuesto: papelera del usuario, ordenada por fecha de borrado.
FolderSchema.index({ ownerId: 1, isDeleted: 1, deletedAt: -1 });

// Parcial: restaurar o purgar una cascada completa agrupada por raíz.
FolderSchema.index(
  { deletedRootId: 1 },
  { partialFilterExpression: { isDeleted: true } },
);

// Compuesto: búsqueda por nombre dentro de las carpetas del usuario.
FolderSchema.index({ ownerId: 1, name: 1 });
