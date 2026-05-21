import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:3000',                 // Your local dev server
      'https://iip.itb.ac.id'       // Your future production URL
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Serve static files from the uploads directory
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
