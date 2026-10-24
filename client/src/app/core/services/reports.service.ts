import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { apiUrl } from '../api/api';
import type {
  FilesByDateRangeReport,
  FilesByTypeReport,
  FilesMostOperationsReport,
  FilesMostSharedReport,
  FilesNeverSharedReport,
  FoldersMostFilesReport,
  OperationsByPeriodReport,
  OperationsByTypeReport,
  ReportGranularity,
  ReportId,
  ReportQuery,
  TopActionsReport,
  TopUsersByFilesReport,
  UserActivityReport,
  UserSharesReport,
  UsersMostSharedReport,
} from '../models/report.model';

/** Claves de query string aceptadas por los reportes. */
type ReportParams = Partial<Record<'from' | 'to' | 'userId' | 'granularity', string>>;

/**
 * Servicio de reportes.
 *
 * Expone un método por cada endpoint de `/api/reports`. Todos los cálculos
 * viven en el backend (aggregation pipelines); el cliente solo arma los query
 * params, por eso un reporte sin filtros no envía parámetros vacíos.
 */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);

  /** Cantidad y tamaño de archivos vivos agrupados por extensión. */
  filesByType(): Observable<FilesByTypeReport[]> {
    return this.http.get<FilesByTypeReport[]>(this.url('files-by-type'));
  }

  /** Archivos vivos creados dentro del rango indicado. */
  filesByDateRange(
    query: Pick<ReportQuery, 'from' | 'to'> = {},
  ): Observable<FilesByDateRangeReport[]> {
    return this.http.get<FilesByDateRangeReport[]>(this.url('files-by-date-range'), {
      params: this.params(query),
    });
  }

  /** Archivos con más eventos de auditoría registrados. */
  filesMostOperations(): Observable<FilesMostOperationsReport[]> {
    return this.http.get<FilesMostOperationsReport[]>(this.url('files-most-operations'));
  }

  /** Top 10 de usuarios por cantidad de archivos vivos. */
  topUsersByFiles(): Observable<TopUsersByFilesReport[]> {
    return this.http.get<TopUsersByFilesReport[]>(this.url('top-users-by-files'));
  }

  /** Usuarios con más permisos y recursos compartidos. */
  usersMostShared(): Observable<UsersMostSharedReport[]> {
    return this.http.get<UsersMostSharedReport[]>(this.url('users-most-shared'));
  }

  /** Archivos compartidos con más destinatarios distintos. */
  filesMostShared(): Observable<FilesMostSharedReport[]> {
    return this.http.get<FilesMostSharedReport[]>(this.url('files-most-shared'));
  }

  /** Recursos que ha compartido un usuario; sin `userId` usa el autenticado. */
  sharedByUser(userId?: string): Observable<UserSharesReport[]> {
    return this.http.get<UserSharesReport[]>(this.url('shared-by-user'), {
      params: this.params({ userId }),
    });
  }

  /** Recursos que ha recibido un usuario; sin `userId` usa el autenticado. */
  receivedByUser(userId?: string): Observable<UserSharesReport[]> {
    return this.http.get<UserSharesReport[]>(this.url('received-by-user'), {
      params: this.params({ userId }),
    });
  }

  /** Historial de actividad de un usuario, opcionalmente por rango de fechas. */
  userActivity(
    query: Pick<ReportQuery, 'userId' | 'from' | 'to'> = {},
  ): Observable<UserActivityReport[]> {
    return this.http.get<UserActivityReport[]>(this.url('user-activity'), {
      params: this.params(query),
    });
  }

  /** Operaciones agrupadas por acción. */
  operationsByType(): Observable<OperationsByTypeReport[]> {
    return this.http.get<OperationsByTypeReport[]>(this.url('operations-by-type'));
  }

  /** Operaciones agrupadas por día o por mes. */
  operationsByPeriod(granularity?: ReportGranularity): Observable<OperationsByPeriodReport[]> {
    return this.http.get<OperationsByPeriodReport[]>(this.url('operations-by-period'), {
      params: this.params({ granularity }),
    });
  }

  /** Top 10 de acciones desglosadas por tipo de recurso. */
  topActions(): Observable<TopActionsReport[]> {
    return this.http.get<TopActionsReport[]>(this.url('top-actions'));
  }

  /** Archivos vivos sin ningún permiso directo ni heredado de su carpeta. */
  filesNeverShared(): Observable<FilesNeverSharedReport[]> {
    return this.http.get<FilesNeverSharedReport[]>(this.url('files-never-shared'));
  }

  /** Top 10 de carpetas vivas con más archivos vivos directos. */
  foldersMostFiles(): Observable<FoldersMostFilesReport[]> {
    return this.http.get<FoldersMostFilesReport[]>(this.url('folders-most-files'));
  }

  /** URL absoluta del reporte; `ReportId` ya coincide con el path. */
  private url(reportId: ReportId): string {
    return apiUrl(`/reports/${reportId}`);
  }

  /** Construye los query params omitiendo valores vacíos. */
  private params(values: ReportParams): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== '') {
        params = params.set(key, value);
      }
    }

    return params;
  }
}
