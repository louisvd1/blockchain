import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrdersModule } from './orders/orders.module';
import { CheckerModule } from './checker/checker.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // <-- Đảm bảo biến env có thể dùng ở tất cả modules
    }),
    OrdersModule,
    CheckerModule,
    MongooseModule.forRoot('mongodb://127.0.0.1:27017/blockchain'),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
