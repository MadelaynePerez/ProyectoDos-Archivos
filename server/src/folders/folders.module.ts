import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { File, FileSchema } from '../files/schemas/file.schema.js';
import { FoldersController } from './folders.controller.js';
import { FoldersService } from './folders.service.js';
import { Folder, FolderSchema } from './schemas/folder.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Folder.name, schema: FolderSchema },
      // Solo para propagar el soft delete de una carpeta a sus archivos.
      { name: File.name, schema: FileSchema },
    ]),
  ],
  controllers: [FoldersController],
  providers: [FoldersService],
  // Otros módulos (Files, Trash) podrán validar la jerarquía.
  exports: [FoldersService],
})
export class FoldersModule {}
