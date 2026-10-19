import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsMongoId, IsOptional } from 'class-validator';

import { ShareAccess, ShareResourceType } from '../schemas/share.schema.js';

/**
 * Alta de un permiso.
 *
 * El destinatario se identifica con `granteeEmail` o `granteeId`, nunca ambos.
 * La comprobación de "exactamente uno" se hace en el servicio para devolver un
 * mensaje claro.
 */
export class CreateShareDto {
  @IsEnum(ShareResourceType, {
    message: 'resourceType debe ser FILE o FOLDER',
  })
  resourceType: ShareResourceType;

  @IsMongoId({ message: 'resourceId debe ser un ObjectId válido' })
  resourceId: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEmail({}, { message: 'granteeEmail debe ser un email válido' })
  granteeEmail?: string;

  @IsOptional()
  @IsMongoId({ message: 'granteeId debe ser un ObjectId válido' })
  granteeId?: string;

  @IsEnum(ShareAccess, {
    message: 'access debe ser READ, COMMENT o EDIT',
  })
  access: ShareAccess;
}
