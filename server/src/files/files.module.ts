import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivityModule } from '../activity/activity.module.js';
import { Folder, FolderSchema } from '../folders/schemas/folder.schema.js';
import { SharesModule } from '../shares/shares.module.js';
import { TrashModule } from '../trash/trash.module.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { File, FileSchema } from './schemas/file.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: File.name, schema: FileSchema },
      // Validar la carpeta destino y mantener storageUsed del dueño.
      { name: Folder.name, schema: FolderSchema },
      { name: User.name, schema: UserSchema },
    ]),
    // Registro de FILE_UPLOAD/DOWNLOAD/RENAME/MOVE/UPDATE.
    ActivityModule,
    // AccessService: permisos directos y heredados de carpetas.
    SharesModule,
    // TrashService: DELETE /api/files/:id (soft delete).
    TrashModule,
  ],
  controllers: [FilesController],
  providers: [FilesService],
  // FilesService queda disponible para otros módulos que necesiten la lógica
  // de archivos (el TrashModule actual usa los modelos directamente).
  exports: [FilesService],
})
export class FilesModule {}
