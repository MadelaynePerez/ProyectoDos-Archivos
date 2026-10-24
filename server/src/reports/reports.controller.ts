import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { DateRangeQueryDto } from './dto/date-range-query.dto.js';
import { OperationsByPeriodQueryDto } from './dto/operations-by-period-query.dto.js';
import { UserActivityQueryDto } from './dto/user-activity-query.dto.js';
import { UserScopeQueryDto } from './dto/user-scope-query.dto.js';
import {
  ReportsService,
  type FileNeverSharedRow,
  type FileOperationsRow,
  type FileRangeRow,
  type FileSharedUsersRow,
  type FilesByTypeRow,
  type FolderMostFilesRow,
  type OperationsByPeriodRow,
  type OperationsByTypeRow,
  type ShareResourceRow,
  type TopActionRow,
  type TopUserFilesRow,
  type UserActivityRow,
  type UserSharesRow,
} from './reports.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/**
 * Endpoints de reportes bajo `/api/reports`.
 *
 * Todos requieren JWT. El rol y el id del solicitante salen del token, nunca
 * del body. Un `USER` solo puede consultar sus propios datos; un `ADMIN` puede
 * consultar datos globales y los de cualquier usuario.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** GET /api/reports/files-by-type — archivos vivos por extensión. */
  @Get('files-by-type')
  filesByType(
    @Req() request: AuthenticatedRequest,
  ): Promise<FilesByTypeRow[]> {
    return this.reportsService.filesByType(request.user);
  }

  /** GET /api/reports/files-by-date-range?from=&to= — archivos por alta. */
  @Get('files-by-date-range')
  filesByDateRange(
    @Query() query: DateRangeQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FileRangeRow[]> {
    return this.reportsService.filesByDateRange(request.user, query);
  }

  /** GET /api/reports/files-most-operations — archivos con más eventos. */
  @Get('files-most-operations')
  filesMostOperations(
    @Req() request: AuthenticatedRequest,
  ): Promise<FileOperationsRow[]> {
    return this.reportsService.filesMostOperations(request.user);
  }

  /** GET /api/reports/top-users-by-files — top 10 por archivos vivos. */
  @Get('top-users-by-files')
  topUsersByFiles(
    @Req() request: AuthenticatedRequest,
  ): Promise<TopUserFilesRow[]> {
    return this.reportsService.topUsersByFiles(request.user);
  }

  /** GET /api/reports/users-most-shared — usuarios que más comparten. */
  @Get('users-most-shared')
  usersMostShared(
    @Req() request: AuthenticatedRequest,
  ): Promise<UserSharesRow[]> {
    return this.reportsService.usersMostShared(request.user);
  }

  /** GET /api/reports/files-most-shared — archivos con más destinatarios. */
  @Get('files-most-shared')
  filesMostShared(
    @Req() request: AuthenticatedRequest,
  ): Promise<FileSharedUsersRow[]> {
    return this.reportsService.filesMostShared(request.user);
  }

  /** GET /api/reports/shared-by-user?userId= — recursos compartidos. */
  @Get('shared-by-user')
  sharedByUser(
    @Query() query: UserScopeQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ShareResourceRow[]> {
    return this.reportsService.sharedByUser(request.user, query);
  }

  /** GET /api/reports/received-by-user?userId= — recursos recibidos. */
  @Get('received-by-user')
  receivedByUser(
    @Query() query: UserScopeQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ShareResourceRow[]> {
    return this.reportsService.receivedByUser(request.user, query);
  }

  /** GET /api/reports/user-activity?userId=&from=&to= — historial. */
  @Get('user-activity')
  userActivity(
    @Query() query: UserActivityQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserActivityRow[]> {
    return this.reportsService.userActivity(request.user, query);
  }

  /** GET /api/reports/operations-by-type — operaciones por acción. */
  @Get('operations-by-type')
  operationsByType(
    @Req() request: AuthenticatedRequest,
  ): Promise<OperationsByTypeRow[]> {
    return this.reportsService.operationsByType(request.user);
  }

  /** GET /api/reports/operations-by-period?granularity=day|month. */
  @Get('operations-by-period')
  operationsByPeriod(
    @Query() query: OperationsByPeriodQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OperationsByPeriodRow[]> {
    return this.reportsService.operationsByPeriod(request.user, query);
  }

  /** GET /api/reports/top-actions — principales acciones. */
  @Get('top-actions')
  topActions(
    @Req() request: AuthenticatedRequest,
  ): Promise<TopActionRow[]> {
    return this.reportsService.topActions(request.user);
  }

  /** GET /api/reports/files-never-shared — archivos sin permisos. */
  @Get('files-never-shared')
  filesNeverShared(
    @Req() request: AuthenticatedRequest,
  ): Promise<FileNeverSharedRow[]> {
    return this.reportsService.filesNeverShared(request.user);
  }

  /** GET /api/reports/folders-most-files — top 10 carpetas con más archivos. */
  @Get('folders-most-files')
  foldersMostFiles(
    @Req() request: AuthenticatedRequest,
  ): Promise<FolderMostFilesRow[]> {
    return this.reportsService.foldersMostFiles(request.user);
  }
}
