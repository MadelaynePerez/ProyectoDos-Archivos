import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivityModule } from '../activity/activity.module.js';
import { Folder, FolderSchema } from '../folders/schemas/folder.schema.js';
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
  ],
  controllers: [FilesController],
  providers: [FilesService],
  // El futuro TrashModule necesitará reutilizar la lógica de archivos.
  exports: [FilesService],
})
export class FilesModule {}
