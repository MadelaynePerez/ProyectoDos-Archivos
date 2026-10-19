import { IsEnum } from 'class-validator';

import { ShareAccess } from '../schemas/share.schema.js';

/** Cambio del nivel de acceso de un permiso existente. */
export class UpdateShareDto {
  @IsEnum(ShareAccess, {
    message: 'access debe ser READ, COMMENT o EDIT',
  })
  access: ShareAccess;
}
