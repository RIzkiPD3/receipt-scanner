import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';

async function bootstrap() {
  // Gunakan NestExpressApplication agar dapat mengakses Express native methods
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Set Global API prefix
  app.setGlobalPrefix('api');

  // Configure Global ValidationPipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // ---------------------------------------------------------------------------
  // Static File Serving — folder temp/uploads disajikan di GET /uploads/*
  // ---------------------------------------------------------------------------
  // Golang Worker membutuhkan URL publik untuk mengakses gambar struk.
  // Dengan ini, file yang disimpan di temp/uploads dapat diakses via:
  //   http://localhost:3000/uploads/{filename}
  //
  // Catatan: Express static TIDAK termasuk dalam setGlobalPrefix('api')
  // karena didaftarkan langsung ke Express layer, bukan ke NestJS router.
  // ---------------------------------------------------------------------------
  const configService = app.get(ConfigService);
  const tempUploadDir =
    configService.get<string>('TEMP_UPLOAD_DIR') || 'temp/uploads';
  app.useStaticAssets(path.resolve(process.cwd(), tempUploadDir), {
    prefix: '/uploads',
  });
  Logger.log(
    `📁 Static assets served from: /${tempUploadDir} → GET /uploads/*`,
    'Bootstrap',
  );

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/api`,
    'Bootstrap',
  );
}
bootstrap();

