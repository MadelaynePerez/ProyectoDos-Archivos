import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Contrato con el frontend: todas las rutas cuelgan de /api.
  app.setGlobalPrefix('api');

  // CORS habilitado solo para el cliente Angular en desarrollo.
  app.enableCors({
    origin: 'http://localhost:4200',
    credentials: true,
  });

  // `whitelist: true` descarta propiedades no declaradas en los DTO (por
  // ejemplo, un `role` enviado al registro). `transform: true` permite que los
  // DTO se construyan como clases y apliquen sus @Transform.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
