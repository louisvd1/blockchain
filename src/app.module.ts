import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrdersModule } from './orders/orders.module';
import { CheckerModule } from './checker/checker.module';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    OrdersModule,
    CheckerModule,
    MongooseModule.forRoot('mongodb://127.0.0.1:27017/blockchain'),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
