import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivityModule } from './activity/activity.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { FilesModule } from './files/files.module.js';
import { FoldersModule } from './folders/folders.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SharesModule } from './shares/shares.module.js';
import { TrashModule } from './trash/trash.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    // Variables de entorno globales (.env): MONGODB_URI, JWT_SECRET, etc.
    ConfigModule.forRoot({ isGlobal: true }),

    // Conexión única a MongoDB compartida por todos los módulos.
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),

    UsersModule,
    AuthModule,
    ActivityModule,
    FoldersModule,
    FilesModule,
    SharesModule,
    TrashModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
