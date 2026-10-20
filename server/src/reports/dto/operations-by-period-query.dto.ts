import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';

/** Unidades de agrupación admitidas por `$dateTrunc`. */
export enum ReportGranularity {
  DAY = 'day',
  MONTH = 'month',
}

/**
 * Granularidad del reporte de operaciones por período.
 * Por defecto se agrupa por día.
 */
export class OperationsByPeriodQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.trim().toLowerCase() || undefined
      : value,
  )
  @IsOptional()
  @IsEnum(ReportGranularity, {
    message: 'granularity debe ser day o month',
  })
  granularity: ReportGranularity = ReportGranularity.DAY;
}
