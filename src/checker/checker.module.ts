// src/checker/checker.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CheckerService } from './checker.service';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [ScheduleModule.forRoot(), OrdersModule],
  providers: [CheckerService],
})
export class CheckerModule {}
