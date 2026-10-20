import type { ShareAccess } from '../shares/schemas/share.schema.js';
import type { UserRole } from '../users/schemas/user.schema.js';

/**
 * Datos declarativos del seed.
 *
 * Las fechas se expresan como «días transcurridos hasta hoy» para que el seed
 * siga generando actividad reciente cada vez que se ejecuta. El script
 * convierte esos valores en fechas UTC concretas.
 */

export type SeedUserKey = 'admin' | 'ana' | 'luis';
export type SeedResourceType = 'FILE' | 'FOLDER';

export interface SeedUser {
  key: SeedUserKey;
  email: string;
  /** Contraseña en texto plano; solo se usa para generar el hash bcrypt. */
  password: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdDaysAgo: number;
  lastLoginDaysAgo: number | null;
}

export interface SeedFolder {
  key: string;
  name: string;
  owner: SeedUserKey;
  /** Clave de la carpeta padre; `null` para las carpetas raíz. */
  parent: string | null;
  createdDaysAgo: number;
  /** Nombre anterior si la carpeta se renombró después de crearse. */
  renamedFrom?: string;
  renamedDaysAgo?: number;
}

export interface SeedFile {
  key: string;
  name: string;
  owner: SeedUserKey;
  /** Clave de la carpeta contenedora; `null` para la raíz del usuario. */
  folder: string | null;
  createdDaysAgo: number;
  /** Nombre anterior si el archivo se renombró después de subirse. */
  renamedFrom?: string;
  renamedDaysAgo?: number;
}

export interface SeedShare {
  resourceType: SeedResourceType;
  /** Clave del archivo o carpeta compartida. */
  resource: string;
  grantee: SeedUserKey;
  access: ShareAccess;
  createdDaysAgo: number;
  /** Cambio de nivel posterior; genera un evento SHARE_UPDATE. */
  updatedDaysAgo?: number;
  previousAccess?: ShareAccess;
}

/** Archivo enviado individualmente a la papelera (`deletedRootId = _id`). */
export interface SeedDeletedFile {
  file: string;
  deletedDaysAgo: number;
  deletedBy: SeedUserKey;
}

/**
 * Archivo eliminado y restaurado después. Su estado final es activo, pero el
 * historial conserva los eventos FILE_DELETE y FILE_RESTORE.
 */
export interface SeedRestoredFile {
  file: string;
  deletedDaysAgo: number;
  restoredDaysAgo: number;
}

/** Carpeta enviada a la papelera junto con toda su cascada. */
export interface SeedDeletedFolder {
  folder: string;
  deletedDaysAgo: number;
  deletedBy: SeedUserKey;
}

/**
 * Los usuarios del sistema. Las contraseñas quedan documentadas en
 * `docs/api.md` (sección «Datos de prueba del seed»).
 */
export const SEED_USERS: SeedUser[] = [
  {
    key: 'admin',
    email: 'admin@example.com',
    password: 'Admin123!',
    name: 'María Fernández',
    role: 'ADMIN' as UserRole,
    isActive: true,
    createdDaysAgo: 70,
    lastLoginDaysAgo: 2,
  },
  {
    key: 'ana',
    email: 'ana.torres@example.com',
    password: 'Ana123!',
    name: 'Ana Torres',
    role: 'USER' as UserRole,
    isActive: true,
    createdDaysAgo: 65,
    lastLoginDaysAgo: 1,
  },
  {
    key: 'luis',
    email: 'luis@example.com',
    password: 'Luis123!',
    name: 'Luis Gómez',
    role: 'USER' as UserRole,
    isActive: true,
    createdDaysAgo: 64,
    lastLoginDaysAgo: 3,
  },
];

/**
 * Carpetas y subcarpetas. El orden importa: cada padre aparece antes que sus
 * hijas para poder calcular `ancestors` y `depth` en una sola pasada.
 */
export const SEED_FOLDERS: SeedFolder[] = [
  // Árbol de Ana
  {
    key: 'ana-proyectos',
    name: 'Proyectos',
    owner: 'ana',
    parent: null,
    createdDaysAgo: 60,
  },
  {
    key: 'ana-documentacion',
    name: 'Documentación',
    owner: 'ana',
    parent: null,
    createdDaysAgo: 58,
  },
  {
    key: 'ana-personal',
    name: 'Personal',
    owner: 'ana',
    parent: null,
    createdDaysAgo: 57,
  },
  {
    key: 'ana-archivo',
    name: 'Archivo muerto',
    owner: 'ana',
    parent: null,
    createdDaysAgo: 56,
  },
  {
    key: 'ana-proyectos-2025',
    name: '2025',
    owner: 'ana',
    parent: 'ana-proyectos',
    createdDaysAgo: 55,
  },
  {
    key: 'ana-proyectos-2026',
    name: '2026',
    owner: 'ana',
    parent: 'ana-proyectos',
    createdDaysAgo: 54,
  },
  {
    key: 'ana-archivo-borradores',
    name: 'Borradores',
    owner: 'ana',
    parent: 'ana-archivo',
    createdDaysAgo: 53,
  },
  {
    key: 'ana-manuales',
    name: 'Manuales',
    owner: 'ana',
    parent: 'ana-documentacion',
    createdDaysAgo: 52,
  },
  {
    key: 'ana-politicas',
    name: 'Políticas',
    owner: 'ana',
    parent: 'ana-documentacion',
    createdDaysAgo: 51,
  },
  {
    key: 'ana-informes',
    name: 'Informes',
    owner: 'ana',
    parent: 'ana-proyectos-2026',
    createdDaysAgo: 50,
  },
  {
    key: 'ana-actas',
    name: 'Actas',
    owner: 'ana',
    parent: 'ana-proyectos-2026',
    createdDaysAgo: 49,
  },

  // Árbol de Luis
  {
    key: 'luis-clientes',
    name: 'Clientes',
    owner: 'luis',
    parent: null,
    createdDaysAgo: 59,
  },
  {
    key: 'luis-operaciones',
    name: 'Operaciones',
    owner: 'luis',
    parent: null,
    createdDaysAgo: 58,
  },
  {
    key: 'luis-temporal',
    name: 'Temporal',
    owner: 'luis',
    parent: null,
    createdDaysAgo: 57,
  },
  {
    key: 'luis-acme',
    name: 'Acme',
    owner: 'luis',
    parent: 'luis-clientes',
    createdDaysAgo: 53,
  },
  {
    key: 'luis-globex',
    name: 'Globex',
    owner: 'luis',
    parent: 'luis-clientes',
    createdDaysAgo: 52,
  },
  {
    key: 'luis-inventarios',
    name: 'Inventarios',
    owner: 'luis',
    parent: 'luis-operaciones',
    createdDaysAgo: 51,
  },
  {
    key: 'luis-proveedores',
    name: 'Proveedores',
    owner: 'luis',
    parent: 'luis-operaciones',
    createdDaysAgo: 50,
  },
  {
    key: 'luis-temporal-descartados',
    name: 'Descartados',
    owner: 'luis',
    parent: 'luis-temporal',
    createdDaysAgo: 49,
  },
  {
    key: 'luis-acme-contratos',
    name: 'Contratos',
    owner: 'luis',
    parent: 'luis-acme',
    createdDaysAgo: 48,
  },

  // Árbol del administrador
  {
    key: 'admin-administracion',
    name: 'Administración',
    owner: 'admin',
    parent: null,
    createdDaysAgo: 61,
  },
  {
    key: 'admin-plantillas',
    name: 'Plantillas',
    owner: 'admin',
    parent: null,
    createdDaysAgo: 60,
  },
  {
    key: 'admin-usuarios',
    name: 'Usuarios',
    owner: 'admin',
    parent: 'admin-administracion',
    createdDaysAgo: 54,
    renamedFrom: 'Cuentas',
    renamedDaysAgo: 40,
  },
  {
    key: 'admin-reportes',
    name: 'Reportes',
    owner: 'admin',
    parent: 'admin-administracion',
    createdDaysAgo: 53,
  },
];

/**
 * Los 50 archivos del seed. El contenido se toma de `SEED_CONTENT` usando la
 * misma clave, de modo que no puede quedar un archivo sin texto.
 */
export const SEED_FILES: SeedFile[] = [
  // Ana — 23 archivos
  {
    key: 'ana-informe-anual',
    name: 'informe-anual-2026.md',
    owner: 'ana',
    folder: 'ana-informes',
    createdDaysAgo: 40,
  },
  {
    key: 'ana-informe-q1',
    name: 'informe-trimestral-q1.md',
    owner: 'ana',
    folder: 'ana-informes',
    createdDaysAgo: 44,
  },
  {
    key: 'ana-informe-q2',
    name: 'informe-trimestral-q2.md',
    owner: 'ana',
    folder: 'ana-informes',
    createdDaysAgo: 35,
  },
  {
    key: 'ana-informe-q3',
    name: 'informe-trimestral-q3.txt',
    owner: 'ana',
    folder: 'ana-informes',
    createdDaysAgo: 14,
  },
  {
    key: 'ana-acta-01',
    name: 'acta-reunion-2026-01.md',
    owner: 'ana',
    folder: 'ana-actas',
    createdDaysAgo: 38,
  },
  {
    key: 'ana-acta-05',
    name: 'acta-reunion-2026-05.md',
    owner: 'ana',
    folder: 'ana-actas',
    createdDaysAgo: 25,
  },
  {
    key: 'ana-acta-09',
    name: 'acta-reunion-2026-09.txt',
    owner: 'ana',
    folder: 'ana-actas',
    createdDaysAgo: 9,
  },
  {
    key: 'ana-cierre-2025',
    name: 'cierre-proyecto-2025.md',
    owner: 'ana',
    folder: 'ana-proyectos-2025',
    createdDaysAgo: 45,
  },
  {
    key: 'ana-lecciones',
    name: 'lecciones-aprendidas.txt',
    owner: 'ana',
    folder: 'ana-proyectos-2025',
    createdDaysAgo: 43,
  },
  {
    key: 'ana-plan',
    name: 'plan-proyecto.md',
    owner: 'ana',
    folder: 'ana-proyectos',
    createdDaysAgo: 39,
    renamedFrom: 'plan-proyecto-v2.md',
    renamedDaysAgo: 30,
  },
  {
    key: 'ana-presupuesto',
    name: 'presupuesto-2026.txt',
    owner: 'ana',
    folder: 'ana-proyectos',
    createdDaysAgo: 33,
  },
  {
    key: 'ana-manual-usuario',
    name: 'manual-usuario.md',
    owner: 'ana',
    folder: 'ana-manuales',
    createdDaysAgo: 34,
  },
  {
    key: 'ana-guia-instalacion',
    name: 'guia-instalacion.txt',
    owner: 'ana',
    folder: 'ana-manuales',
    createdDaysAgo: 31,
  },
  {
    key: 'ana-manual-admin',
    name: 'manual-administrador.md',
    owner: 'ana',
    folder: 'ana-manuales',
    createdDaysAgo: 29,
  },
  {
    key: 'ana-politica-privacidad',
    name: 'politica-privacidad.md',
    owner: 'ana',
    folder: 'ana-politicas',
    createdDaysAgo: 37,
  },
  {
    key: 'ana-politica-respaldo',
    name: 'politica-respaldo.txt',
    owner: 'ana',
    folder: 'ana-politicas',
    createdDaysAgo: 36,
  },
  {
    key: 'ana-notas-reunion',
    name: 'notas-reunion.txt',
    owner: 'ana',
    folder: 'ana-personal',
    createdDaysAgo: 50,
  },
  {
    key: 'ana-objetivos',
    name: 'objetivos-2026.md',
    owner: 'ana',
    folder: 'ana-personal',
    createdDaysAgo: 32,
  },
  {
    key: 'ana-readme',
    name: 'readme.txt',
    owner: 'ana',
    folder: null,
    createdDaysAgo: 28,
  },
  {
    key: 'ana-borrador-articulo',
    name: 'borrador-articulo.md',
    owner: 'ana',
    folder: 'ana-archivo-borradores',
    createdDaysAgo: 42,
  },
  {
    key: 'ana-borrador-discurso',
    name: 'borrador-discurso.txt',
    owner: 'ana',
    folder: 'ana-archivo-borradores',
    createdDaysAgo: 41,
  },
  {
    key: 'ana-notas-viejas',
    name: 'notas-viejas.txt',
    owner: 'ana',
    folder: 'ana-archivo',
    createdDaysAgo: 40,
  },
  {
    key: 'ana-borrador-antiguo',
    name: 'borrador-antiguo.md',
    owner: 'ana',
    folder: 'ana-archivo',
    createdDaysAgo: 40,
  },

  // Luis — 19 archivos
  {
    key: 'luis-contrato-acme',
    name: 'contrato-acme-2026.md',
    owner: 'luis',
    folder: 'luis-acme-contratos',
    createdDaysAgo: 40,
  },
  {
    key: 'luis-anexo-acme',
    name: 'anexo-acme-servicios.txt',
    owner: 'luis',
    folder: 'luis-acme-contratos',
    createdDaysAgo: 39,
  },
  {
    key: 'luis-nda-acme',
    name: 'nda-acme.md',
    owner: 'luis',
    folder: 'luis-acme-contratos',
    createdDaysAgo: 38,
  },
  {
    key: 'luis-propuesta-acme',
    name: 'propuesta-acme.md',
    owner: 'luis',
    folder: 'luis-acme',
    createdDaysAgo: 34,
  },
  {
    key: 'luis-contrato-globex',
    name: 'contrato-globex-2026.md',
    owner: 'luis',
    folder: 'luis-globex',
    createdDaysAgo: 36,
    renamedFrom: 'contrato-globex-2025.md',
    renamedDaysAgo: 25,
  },
  {
    key: 'luis-propuesta-globex',
    name: 'propuesta-globex.txt',
    owner: 'luis',
    folder: 'luis-globex',
    createdDaysAgo: 30,
  },
  {
    key: 'luis-acta-globex',
    name: 'acta-globex.txt',
    owner: 'luis',
    folder: 'luis-globex',
    createdDaysAgo: 18,
  },
  {
    key: 'luis-resumen-clientes',
    name: 'resumen-clientes.md',
    owner: 'luis',
    folder: 'luis-clientes',
    createdDaysAgo: 27,
  },
  {
    key: 'luis-inventario-equipos',
    name: 'inventario-equipos.md',
    owner: 'luis',
    folder: 'luis-inventarios',
    createdDaysAgo: 33,
  },
  {
    key: 'luis-inventario-licencias',
    name: 'inventario-licencias.txt',
    owner: 'luis',
    folder: 'luis-inventarios',
    createdDaysAgo: 32,
  },
  {
    key: 'luis-inventario-mobiliario',
    name: 'inventario-mobiliario.md',
    owner: 'luis',
    folder: 'luis-inventarios',
    createdDaysAgo: 26,
  },
  {
    key: 'luis-inventario-software',
    name: 'inventario-software.txt',
    owner: 'luis',
    folder: 'luis-inventarios',
    createdDaysAgo: 12,
  },
  {
    key: 'luis-lista-proveedores',
    name: 'lista-proveedores.md',
    owner: 'luis',
    folder: 'luis-proveedores',
    createdDaysAgo: 29,
  },
  {
    key: 'luis-evaluacion-proveedores',
    name: 'evaluacion-proveedores.txt',
    owner: 'luis',
    folder: 'luis-proveedores',
    createdDaysAgo: 22,
  },
  {
    key: 'luis-procedimiento-compras',
    name: 'procedimiento-compras.md',
    owner: 'luis',
    folder: 'luis-operaciones',
    createdDaysAgo: 24,
  },
  {
    key: 'luis-pendientes',
    name: 'pendientes.txt',
    owner: 'luis',
    folder: null,
    createdDaysAgo: 20,
  },
  {
    key: 'luis-borrador-propuesta',
    name: 'borrador-propuesta.txt',
    owner: 'luis',
    folder: 'luis-temporal-descartados',
    createdDaysAgo: 43,
  },
  {
    key: 'luis-notas-vieja',
    name: 'notas-reunion-vieja.md',
    owner: 'luis',
    folder: 'luis-temporal-descartados',
    createdDaysAgo: 42,
  },
  {
    key: 'luis-temporal',
    name: 'temporal.txt',
    owner: 'luis',
    folder: 'luis-temporal',
    createdDaysAgo: 41,
  },

  // Administrador — 8 archivos
  {
    key: 'admin-politica-usuarios',
    name: 'politica-usuarios.md',
    owner: 'admin',
    folder: 'admin-usuarios',
    createdDaysAgo: 42,
  },
  {
    key: 'admin-registro-altas',
    name: 'registro-altas.txt',
    owner: 'admin',
    folder: 'admin-usuarios',
    createdDaysAgo: 21,
  },
  {
    key: 'admin-reporte-octubre',
    name: 'reporte-octubre.txt',
    owner: 'admin',
    folder: 'admin-reportes',
    createdDaysAgo: 5,
  },
  {
    key: 'admin-reporte-septiembre',
    name: 'reporte-septiembre.md',
    owner: 'admin',
    folder: 'admin-reportes',
    createdDaysAgo: 44,
  },
  {
    key: 'admin-plantilla-informe',
    name: 'plantilla-informe.md',
    owner: 'admin',
    folder: 'admin-plantillas',
    createdDaysAgo: 47,
  },
  {
    key: 'admin-plantilla-acta',
    name: 'plantilla-acta.txt',
    owner: 'admin',
    folder: 'admin-plantillas',
    createdDaysAgo: 46,
  },
  {
    key: 'admin-plantilla-correo',
    name: 'plantilla-correo.txt',
    owner: 'admin',
    folder: 'admin-plantillas',
    createdDaysAgo: 45,
  },
  {
    key: 'admin-procedimiento-admin',
    name: 'procedimiento-admin.md',
    owner: 'admin',
    folder: 'admin-administracion',
    createdDaysAgo: 28,
  },
];

/**
 * Comparticiones explícitas. El propietario se deduce del recurso; el
 * destinatario nunca coincide con él. Se cubren archivos y carpetas con los
 * tres niveles: READ, COMMENT y EDIT.
 */
export const SEED_SHARES: SeedShare[] = [
  // Ana comparte con Luis y con el administrador
  {
    resourceType: 'FOLDER',
    resource: 'ana-proyectos',
    grantee: 'luis',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 33,
  },
  {
    resourceType: 'FOLDER',
    resource: 'ana-proyectos',
    grantee: 'admin',
    access: 'COMMENT' as ShareAccess,
    createdDaysAgo: 31,
  },
  {
    resourceType: 'FOLDER',
    resource: 'ana-proyectos-2026',
    grantee: 'luis',
    access: 'EDIT' as ShareAccess,
    createdDaysAgo: 28,
    updatedDaysAgo: 20,
    previousAccess: 'COMMENT' as ShareAccess,
  },
  {
    resourceType: 'FOLDER',
    resource: 'ana-informes',
    grantee: 'admin',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 22,
  },
  {
    resourceType: 'FOLDER',
    resource: 'ana-actas',
    grantee: 'luis',
    access: 'COMMENT' as ShareAccess,
    createdDaysAgo: 26,
  },
  {
    resourceType: 'FILE',
    resource: 'ana-informe-anual',
    grantee: 'luis',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 24,
  },
  {
    resourceType: 'FILE',
    resource: 'ana-informe-anual',
    grantee: 'admin',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 23,
  },
  {
    resourceType: 'FILE',
    resource: 'ana-plan',
    grantee: 'luis',
    access: 'EDIT' as ShareAccess,
    createdDaysAgo: 18,
  },
  {
    resourceType: 'FILE',
    resource: 'ana-manual-usuario',
    grantee: 'admin',
    access: 'COMMENT' as ShareAccess,
    createdDaysAgo: 21,
  },
  {
    resourceType: 'FILE',
    resource: 'ana-politica-privacidad',
    grantee: 'luis',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 17,
  },
  {
    resourceType: 'FILE',
    resource: 'ana-presupuesto',
    grantee: 'admin',
    access: 'EDIT' as ShareAccess,
    createdDaysAgo: 16,
    updatedDaysAgo: 9,
    previousAccess: 'COMMENT' as ShareAccess,
  },
  {
    resourceType: 'FOLDER',
    resource: 'ana-documentacion',
    grantee: 'admin',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 30,
  },
  {
    resourceType: 'FOLDER',
    resource: 'ana-proyectos-2025',
    grantee: 'admin',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 27,
  },
  {
    resourceType: 'FILE',
    resource: 'ana-cierre-2025',
    grantee: 'luis',
    access: 'COMMENT' as ShareAccess,
    createdDaysAgo: 19,
  },
  {
    // Compartición que sobrevive al borrado del archivo: el share sigue
    // existiendo, pero el recurso en papelera no es accesible.
    resourceType: 'FILE',
    resource: 'ana-borrador-antiguo',
    grantee: 'luis',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 16,
  },

  // Luis comparte con Ana y con el administrador
  {
    resourceType: 'FOLDER',
    resource: 'luis-clientes',
    grantee: 'ana',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 34,
  },
  {
    resourceType: 'FOLDER',
    resource: 'luis-clientes',
    grantee: 'admin',
    access: 'COMMENT' as ShareAccess,
    createdDaysAgo: 29,
  },
  {
    resourceType: 'FOLDER',
    resource: 'luis-acme',
    grantee: 'ana',
    access: 'EDIT' as ShareAccess,
    createdDaysAgo: 27,
    updatedDaysAgo: 15,
    previousAccess: 'READ' as ShareAccess,
  },
  {
    resourceType: 'FOLDER',
    resource: 'luis-acme-contratos',
    grantee: 'admin',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 25,
  },
  {
    resourceType: 'FOLDER',
    resource: 'luis-globex',
    grantee: 'ana',
    access: 'COMMENT' as ShareAccess,
    createdDaysAgo: 23,
  },
  {
    resourceType: 'FILE',
    resource: 'luis-contrato-acme',
    grantee: 'ana',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 21,
  },
  {
    resourceType: 'FILE',
    resource: 'luis-contrato-acme',
    grantee: 'admin',
    access: 'COMMENT' as ShareAccess,
    createdDaysAgo: 20,
  },
  {
    resourceType: 'FILE',
    resource: 'luis-propuesta-globex',
    grantee: 'ana',
    access: 'EDIT' as ShareAccess,
    createdDaysAgo: 14,
  },
  {
    resourceType: 'FILE',
    resource: 'luis-lista-proveedores',
    grantee: 'admin',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 13,
  },
  {
    resourceType: 'FOLDER',
    resource: 'luis-operaciones',
    grantee: 'ana',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 26,
  },
  {
    resourceType: 'FILE',
    resource: 'luis-procedimiento-compras',
    grantee: 'ana',
    access: 'COMMENT' as ShareAccess,
    createdDaysAgo: 11,
  },
  {
    resourceType: 'FOLDER',
    resource: 'luis-inventarios',
    grantee: 'admin',
    access: 'EDIT' as ShareAccess,
    createdDaysAgo: 12,
    updatedDaysAgo: 5,
    previousAccess: 'COMMENT' as ShareAccess,
  },

  // El administrador comparte con Ana y con Luis
  {
    resourceType: 'FOLDER',
    resource: 'admin-plantillas',
    grantee: 'ana',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 32,
  },
  {
    resourceType: 'FOLDER',
    resource: 'admin-plantillas',
    grantee: 'luis',
    access: 'COMMENT' as ShareAccess,
    createdDaysAgo: 30,
  },
  {
    resourceType: 'FILE',
    resource: 'admin-plantilla-informe',
    grantee: 'ana',
    access: 'EDIT' as ShareAccess,
    createdDaysAgo: 15,
  },
  {
    resourceType: 'FILE',
    resource: 'admin-plantilla-acta',
    grantee: 'luis',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 10,
  },
  {
    resourceType: 'FOLDER',
    resource: 'admin-administracion',
    grantee: 'ana',
    access: 'READ' as ShareAccess,
    createdDaysAgo: 25,
  },
  {
    resourceType: 'FILE',
    resource: 'admin-politica-usuarios',
    grantee: 'ana',
    access: 'COMMENT' as ShareAccess,
    createdDaysAgo: 8,
  },
];

/** Archivos enviados a la papelera de forma individual. */
export const SEED_DELETED_FILES: SeedDeletedFile[] = [
  {
    file: 'ana-borrador-antiguo',
    deletedDaysAgo: 15,
    deletedBy: 'ana',
  },
  {
    file: 'luis-inventario-licencias',
    deletedDaysAgo: 9,
    deletedBy: 'luis',
  },
  {
    file: 'admin-reporte-septiembre',
    deletedDaysAgo: 4,
    deletedBy: 'admin',
  },
];

/** Archivo eliminado y restaurado; el estado final queda activo. */
export const SEED_RESTORED_FILES: SeedRestoredFile[] = [
  {
    file: 'ana-notas-reunion',
    deletedDaysAgo: 20,
    restoredDaysAgo: 14,
  },
];

/**
 * Carpetas que se envían a la papelera con toda su cascada. El borrado se
 * aplica después de los archivos individuales para que los descendientes que
 * ya estaban en papelera conserven su propia raíz.
 */
export const SEED_DELETED_FOLDERS: SeedDeletedFolder[] = [
  {
    folder: 'ana-archivo',
    deletedDaysAgo: 8,
    deletedBy: 'ana',
  },
  {
    folder: 'luis-temporal',
    deletedDaysAgo: 6,
    deletedBy: 'luis',
  },
];
