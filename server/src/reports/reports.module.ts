import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  ActivityLog,
  ActivityLogSchema,
} from '../activity-log/schemas/activity-log.schema.js';
import { File, FileSchema } from '../files/schemas/file.schema.js';
import { Share, ShareSchema } from '../shares/schemas/share.schema.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/**
 * Módulo de reportes.
 *
 * Solo necesita los modelos cuyas colecciones encabezan los pipelines
 * (`files`, `shares`, `activity_log`). Los `$lookup` a `users` y `folders` se
 * resuelven directamente contra sus colecciones sin registrar modelos extra.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: File.name, schema: FileSchema },
      { name: Share.name, schema: ShareSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
