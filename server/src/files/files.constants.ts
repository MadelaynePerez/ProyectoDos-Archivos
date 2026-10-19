/** Límite de tamaño para subidas de archivos de texto: 5 MB. */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Longitud máxima del nombre visible, incluida la extensión. */
export const MAX_FILE_NAME_LENGTH = 255;

/**
 * Forma mínima del archivo que entrega Multer con almacenamiento en memoria.
 * No se usa `Express.Multer.File` para no depender de `@types/multer`.
 */
export interface UploadedMemoryFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
