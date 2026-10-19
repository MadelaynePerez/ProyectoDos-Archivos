import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  ActivityLog,
  ActivityLogSchema,
} from '../activity-log/schemas/activity-log.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { ActivityController } from './activity.controller.js';
import { ActivityService } from './activity.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ActivityLog.name, schema: ActivityLogSchema },
      // Necesario para copiar actorName/actorRole cuando solo llega actorId.
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ActivityController],
  providers: [ActivityService],
  // Folders, Files y Auth escriben en el log mediante este servicio.
  exports: [ActivityService],
})
export class ActivityModule {}
