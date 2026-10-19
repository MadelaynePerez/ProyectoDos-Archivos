import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument, type Types } from 'mongoose';

/** Tipos de recurso compartible. */
export enum ShareResourceType {
  FILE = 'FILE',
  FOLDER = 'FOLDER',
}

/** Niveles de acceso, en orden creciente: READ < COMMENT < EDIT. */
export enum ShareAccess {
  READ = 'READ',
  COMMENT = 'COMMENT',
  EDIT = 'EDIT',
}

/**
 * Colección `shares`.
 *
 * Permisos explícitos de un recurso hacia un usuario. Es una relación
 * muchos-a-muchos entre usuarios y recursos; no se embebe en `files` ni en
 * `folders` para evitar arrays sin límite y permitir consultas en ambas
 * direcciones.
 *
 * Importante: el permiso de una carpeta aplica por herencia a su contenido
 * actual y futuro. No se copia a cada archivo.
 */
@Schema({
  collection: 'shares',
  timestamps: true,
  versionKey: false,
})
export class Share {
  /** Tipo del recurso: `FILE` o `FOLDER`. */
  @Prop({
    required: true,
    type: String,
    enum: Object.values(ShareResourceType),
  })
  resourceType: ShareResourceType;

  /**
   * Referencia lógica polimórfica al `_id` del archivo o carpeta.
   * No usa `ref` fijo porque el modelo destino depende de `resourceType`.
   */
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  resourceId: Types.ObjectId;

  /**
   * Relación: dueño real del recurso en el momento de conceder el permiso.
   * Invariante: debe coincidir con el `ownerId` del archivo o carpeta.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  /**
   * Relación: usuario que recibe el permiso.
   * Invariante: `granteeId` nunca puede ser igual a `ownerId`.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  granteeId: Types.ObjectId;

  /** Nivel de acceso concedido explícitamente. */
  @Prop({
    required: true,
    type: String,
    enum: Object.values(ShareAccess),
  })
  access: ShareAccess;
}

export type ShareDocument = HydratedDocument<Share>;

export const ShareSchema = SchemaFactory.createForClass(Share);

// Único: un solo permiso por recurso y usuario. Para cambiarlo se actualiza
// `access`, no se crea un documento duplicado.
ShareSchema.index(
  { resourceType: 1, resourceId: 1, granteeId: 1 },
  { unique: true },
);

// Compuesto: "compartido conmigo", separado por tipo de recurso.
ShareSchema.index({ granteeId: 1, resourceType: 1, createdAt: -1 });

// Compuesto: "compartido por mí" y reportes de usuarios que más comparten.
ShareSchema.index({ ownerId: 1, resourceType: 1, createdAt: -1 });
