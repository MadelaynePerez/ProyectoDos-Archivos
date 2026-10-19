import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ActivityModule } from '../activity/activity.module.js';
import { File, FileSchema } from '../files/schemas/file.schema.js';
import { Folder, FolderSchema } from '../folders/schemas/folder.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { AccessService } from './access.service.js';
import { Share, ShareSchema } from './schemas/share.schema.js';
import { SharesController } from './shares.controller.js';
import { SharesService } from './shares.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Share.name, schema: ShareSchema },
      // Validar propiedad/estado del recurso y resolver la herencia de
      // permisos sin acoplar SharesModule a FilesModule/FoldersModule.
      { name: File.name, schema: FileSchema },
      { name: Folder.name, schema: FolderSchema },
      // Destinatario del share y datos de los listados.
      { name: User.name, schema: UserSchema },
    ]),
    // Registro de SHARE_GRANT/SHARE_UPDATE/SHARE_REVOKE.
    ActivityModule,
  ],
  controllers: [SharesController],
  providers: [SharesService, AccessService],
  // FilesModule y FoldersModule usan el mismo servicio de permisos.
  exports: [AccessService, SharesService],
})
export class SharesModule {}
