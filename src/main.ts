import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Order Service API')
    .setDescription('API for managing orders')
    .setVersion('1.0')
    .addTag('orders')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document); // URL mặc định: http://localhost:3005/api

  await app.listen(process.env.PORT ?? 3005);
}
bootstrap();
