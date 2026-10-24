import { map, type Observable } from 'rxjs';

import { activityActionLabel } from '../../../core/models/activity.model';
import type { ReportId, ReportQuery } from '../../../core/models/report.model';
import type { ReportsService } from '../../../core/services/reports.service';
import type {
  DataTableColumn,
  DataTableRow,
} from '../../../shared/data-table/data-table.component';

/** Grupos del selector, en el orden en que se muestran. */
export type ReportGroup = 'Archivos y almacenamiento' | 'Usuarios' | 'Compartición' | 'Actividad';

export const REPORT_GROUPS: readonly ReportGroup[] = [
  'Archivos y almacenamiento',
  'Usuarios',
  'Compartición',
  'Actividad',
];

/** Indica qué filtros necesita cada reporte. */
export interface ReportFiltersConfig {
  /** Rango de fechas `from`/`to`. */
  dates?: boolean;
  /** Selector de usuario; solo se muestra a ADMIN. */
  userId?: boolean;
  /** Selector día/mes exclusivo de `operations-by-period`. */
  granularity?: boolean;
}

/** Configuración del resumen gráfico opcional de un reporte. */
export interface ReportSummaryConfig {
  title: string;
  valueLabel: string;
  /** Texto de cada barra a partir de una fila de la API. */
  label: (row: DataTableRow) => string;
  /** Valor numérico representado por la barra. */
  value: (row: DataTableRow) => number;
}

/** Definición declarativa de un reporte. */
export interface ReportDefinition {
  id: ReportId;
  name: string;
  endpoint: string;
  group: ReportGroup;
  description: string;
  filters: ReportFiltersConfig;
  columns: readonly DataTableColumn[];
  summary?: ReportSummaryConfig;
  /** Ejecuta el endpoint con los filtros ya normalizados por la pantalla. */
  load: (service: ReportsService, query: ReportQuery) => Observable<readonly DataTableRow[]>;
}

/** Acceso genérico a una celda, incluidas rutas anidadas como "owner.name". */
function read(row: DataTableRow, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => {
    if (value !== null && typeof value === 'object') {
      return (value as Record<string, unknown>)[part];
    }
    return undefined;
  }, row);
}

function text(row: DataTableRow, key: string): string {
  const value = read(row, key);
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function numeric(row: DataTableRow, key: string): number {
  const value = read(row, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Formatea un período ISO como fecha corta en español. */
function formatPeriod(row: DataTableRow): string {
  const value = read(row, 'period');
  if (value === null || value === undefined) {
    return '—';
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Configuración de los 14 reportes.
 *
 * Toda la pantalla (selector, filtros, columnas y resumen) se genera a partir
 * de esta lista: agregar o cambiar un reporte no requiere crear otra pantalla.
 */
export const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  {
    id: 'files-by-type',
    name: 'Archivos por tipo',
    endpoint: 'GET /api/reports/files-by-type',
    group: 'Archivos y almacenamiento',
    description:
      'Cantidad y tamaño total de los archivos vivos agrupados por extensión (.txt y .md).',
    filters: {},
    columns: [
      { key: 'extension', label: 'Extensión' },
      { key: 'count', label: 'Archivos' },
      { key: 'totalSize', label: 'Tamaño total', format: 'size' },
    ],
    summary: {
      title: 'Archivos por extensión',
      valueLabel: 'archivos',
      label: (row) => text(row, 'extension'),
      value: (row) => numeric(row, 'count'),
    },
    load: (service) => service.filesByType(),
  },
  {
    id: 'files-by-date-range',
    name: 'Archivos por rango de fechas',
    endpoint: 'GET /api/reports/files-by-date-range',
    group: 'Archivos y almacenamiento',
    description: 'Archivos vivos creados dentro del rango de fechas seleccionado.',
    filters: { dates: true },
    columns: [
      { key: 'name', label: 'Archivo' },
      { key: 'extension', label: 'Extensión' },
      { key: 'size', label: 'Tamaño', format: 'size' },
      { key: 'createdAt', label: 'Creado', format: 'date' },
    ],
    load: (service, query) => service.filesByDateRange(query),
  },
  {
    id: 'files-most-operations',
    name: 'Archivos con más operaciones',
    endpoint: 'GET /api/reports/files-most-operations',
    group: 'Archivos y almacenamiento',
    description:
      'Archivos con más eventos de auditoría. Incluye recursos que hoy están en papelera o fueron purgados.',
    filters: {},
    columns: [
      { key: 'resourceName', label: 'Archivo' },
      { key: 'operations', label: 'Operaciones' },
    ],
    summary: {
      title: 'Archivos con más operaciones',
      valueLabel: 'operaciones',
      label: (row) => text(row, 'resourceName'),
      value: (row) => numeric(row, 'operations'),
    },
    load: (service) => service.filesMostOperations(),
  },
  {
    id: 'folders-most-files',
    name: 'Carpetas con más archivos',
    endpoint: 'GET /api/reports/folders-most-files',
    group: 'Archivos y almacenamiento',
    description:
      'Top 10 de carpetas vivas con más archivos vivos directos (sin contar los de sus subcarpetas).',
    filters: {},
    columns: [
      { key: 'name', label: 'Carpeta' },
      { key: 'ownerName', label: 'Propietario' },
      { key: 'files', label: 'Archivos directos' },
    ],
    summary: {
      title: 'Carpetas con más archivos',
      valueLabel: 'archivos',
      label: (row) => text(row, 'name'),
      value: (row) => numeric(row, 'files'),
    },
    load: (service) => service.foldersMostFiles(),
  },
  {
    id: 'top-users-by-files',
    name: 'Top usuarios por archivos',
    endpoint: 'GET /api/reports/top-users-by-files',
    group: 'Usuarios',
    description: 'Top 10 de usuarios con más archivos vivos y su almacenamiento total.',
    filters: {},
    columns: [
      { key: 'name', label: 'Usuario' },
      { key: 'email', label: 'Email' },
      { key: 'files', label: 'Archivos' },
      { key: 'totalSize', label: 'Tamaño', format: 'size' },
    ],
    summary: {
      title: 'Top usuarios por archivos',
      valueLabel: 'archivos',
      label: (row) => text(row, 'name'),
      value: (row) => numeric(row, 'files'),
    },
    load: (service) => service.topUsersByFiles(),
  },
  {
    id: 'users-most-shared',
    name: 'Usuarios con más recursos compartidos',
    endpoint: 'GET /api/reports/users-most-shared',
    group: 'Usuarios',
    description:
      'Usuarios que más permisos han concedido y cuántos recursos distintos han compartido.',
    filters: {},
    columns: [
      { key: 'name', label: 'Usuario' },
      { key: 'email', label: 'Email' },
      { key: 'shares', label: 'Permisos concedidos' },
      { key: 'sharedResources', label: 'Recursos compartidos' },
    ],
    summary: {
      title: 'Usuarios con más recursos compartidos',
      valueLabel: 'recursos',
      label: (row) => text(row, 'name'),
      value: (row) => numeric(row, 'sharedResources'),
    },
    load: (service) => service.usersMostShared(),
  },
  {
    id: 'files-most-shared',
    name: 'Archivos más compartidos',
    endpoint: 'GET /api/reports/files-most-shared',
    group: 'Compartición',
    description: 'Archivos vivos compartidos con más destinatarios distintos.',
    filters: {},
    columns: [
      { key: 'name', label: 'Archivo' },
      { key: 'extension', label: 'Extensión' },
      { key: 'ownerName', label: 'Propietario' },
      { key: 'sharedWith', label: 'Compartido con' },
    ],
    summary: {
      title: 'Archivos más compartidos',
      valueLabel: 'destinatarios',
      label: (row) => text(row, 'name'),
      value: (row) => numeric(row, 'sharedWith'),
    },
    load: (service) => service.filesMostShared(),
  },
  {
    id: 'files-never-shared',
    name: 'Archivos nunca compartidos',
    endpoint: 'GET /api/reports/files-never-shared',
    group: 'Compartición',
    description:
      'Archivos vivos sin shares directos ni heredados de su carpeta o de sus carpetas ancestro.',
    filters: {},
    columns: [
      { key: 'name', label: 'Archivo' },
      { key: 'extension', label: 'Extensión' },
      { key: 'size', label: 'Tamaño', format: 'size' },
      { key: 'ownerName', label: 'Propietario' },
      { key: 'createdAt', label: 'Creado', format: 'date' },
    ],
    load: (service) => service.filesNeverShared(),
  },
  {
    id: 'shared-by-user',
    name: 'Recursos compartidos por un usuario',
    endpoint: 'GET /api/reports/shared-by-user',
    group: 'Compartición',
    description:
      'Permisos que ha concedido el usuario seleccionado. Sin selección se consulta el usuario autenticado.',
    filters: { userId: true },
    columns: [
      { key: 'resourceName', label: 'Recurso' },
      { key: 'resourceType', label: 'Tipo', format: 'badge' },
      { key: 'access', label: 'Permiso', format: 'badge' },
      { key: 'grantee.name', label: 'Destinatario' },
      { key: 'grantee.email', label: 'Email' },
      { key: 'createdAt', label: 'Concedido', format: 'date' },
    ],
    load: (service, query) => service.sharedByUser(query.userId),
  },
  {
    id: 'received-by-user',
    name: 'Recursos recibidos por un usuario',
    endpoint: 'GET /api/reports/received-by-user',
    group: 'Compartición',
    description:
      'Permisos que ha recibido el usuario seleccionado. Sin selección se consulta el usuario autenticado.',
    filters: { userId: true },
    columns: [
      { key: 'resourceName', label: 'Recurso' },
      { key: 'resourceType', label: 'Tipo', format: 'badge' },
      { key: 'access', label: 'Permiso', format: 'badge' },
      { key: 'owner.name', label: 'Propietario' },
      { key: 'owner.email', label: 'Email' },
      { key: 'createdAt', label: 'Recibido', format: 'date' },
    ],
    load: (service, query) => service.receivedByUser(query.userId),
  },
  {
    id: 'user-activity',
    name: 'Actividad de un usuario',
    endpoint: 'GET /api/reports/user-activity',
    group: 'Actividad',
    description: 'Historial de auditoría del usuario seleccionado dentro de un rango de fechas.',
    filters: { dates: true, userId: true },
    columns: [
      { key: 'createdAt', label: 'Fecha', format: 'date' },
      { key: 'action', label: 'Acción' },
      { key: 'resourceType', label: 'Tipo', format: 'badge' },
      { key: 'resourceName', label: 'Recurso' },
      { key: 'actorName', label: 'Actor' },
    ],
    load: (service, query) =>
      service.userActivity(query).pipe(
        map((events) =>
          events.map((event) => ({
            _id: event._id,
            createdAt: event.createdAt,
            action: activityActionLabel(event.action),
            resourceType: event.resourceType,
            resourceName: event.resourceName,
            actorName: event.actorName,
          })),
        ),
      ),
  },
  {
    id: 'operations-by-type',
    name: 'Operaciones por tipo',
    endpoint: 'GET /api/reports/operations-by-type',
    group: 'Actividad',
    description: 'Cantidad de eventos de auditoría agrupados por acción.',
    filters: {},
    columns: [
      { key: 'action', label: 'Acción' },
      { key: 'count', label: 'Operaciones' },
    ],
    summary: {
      title: 'Operaciones por acción',
      valueLabel: 'operaciones',
      label: (row) => text(row, 'action'),
      value: (row) => numeric(row, 'count'),
    },
    load: (service) =>
      service.operationsByType().pipe(
        map((rows) =>
          rows.map((row) => ({
            action: activityActionLabel(row.action),
            count: row.count,
          })),
        ),
      ),
  },
  {
    id: 'operations-by-period',
    name: 'Operaciones por período',
    endpoint: 'GET /api/reports/operations-by-period',
    group: 'Actividad',
    description: 'Eventos de auditoría agrupados por día o por mes, en UTC.',
    filters: { granularity: true },
    columns: [
      { key: 'period', label: 'Período', format: 'date' },
      { key: 'count', label: 'Operaciones' },
    ],
    summary: {
      title: 'Operaciones por período',
      valueLabel: 'operaciones',
      label: (row) => formatPeriod(row),
      value: (row) => numeric(row, 'count'),
    },
    load: (service, query) => service.operationsByPeriod(query.granularity),
  },
  {
    id: 'top-actions',
    name: 'Acciones más frecuentes',
    endpoint: 'GET /api/reports/top-actions',
    group: 'Actividad',
    description: 'Top 10 de acciones desglosadas por tipo de recurso.',
    filters: {},
    columns: [
      { key: 'action', label: 'Acción' },
      { key: 'resourceType', label: 'Tipo de recurso', format: 'badge' },
      { key: 'count', label: 'Operaciones' },
    ],
    summary: {
      title: 'Acciones más frecuentes',
      valueLabel: 'operaciones',
      label: (row) => `${text(row, 'action')} · ${text(row, 'resourceType')}`,
      value: (row) => numeric(row, 'count'),
    },
    load: (service) =>
      service.topActions().pipe(
        map((rows) =>
          rows.map((row) => ({
            action: activityActionLabel(row.action),
            resourceType: row.resourceType,
            count: row.count,
          })),
        ),
      ),
  },
];
