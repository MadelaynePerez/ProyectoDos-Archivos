import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivityModule } from '../activity/activity.module.js';
import { File, FileSchema } from '../files/schemas/file.schema.js';
import { Folder, FolderSchema } from '../folders/schemas/folder.schema.js';
import { Share, ShareSchema } from '../shares/schemas/share.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { TrashController } from './trash.controller.js';
import { TrashService } from './trash.service.js';

/**
 * Papelera: soft delete de archivos, restauración, purga y vaciado.
 *
 * Se registran directamente los modelos que necesita el servicio. No importa
 * FilesModule ni FoldersModule para evitar dependencias circulares: la
 * eliminación de carpetas sigue viviendo en FoldersModule y ya propaga el
 * `deletedRootId` a todo el subárbol.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: File.name, schema: FileSchema },
      { name: Folder.name, schema: FolderSchema },
      { name: Share.name, schema: ShareSchema },
      { name: User.name, schema: UserSchema },
    ]),
    // Registro de FILE_DELETE/RESTORE/PURGE, FOLDER_RESTORE/PURGE y TRASH_EMPTY.
    ActivityModule,
  ],
  controllers: [TrashController],
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashModule {}
