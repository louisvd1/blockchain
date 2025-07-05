// src/orders/schemas/order.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Order extends Document {
  @Prop()
  orderId: string;

  @Prop()
  walletAddress: string;

  @Prop()
  chain: string; // eth, btc, tron

  @Prop()
  amount: number;

  @Prop()
  token: string; // ETH, USDT, etc.

  @Prop({ default: 'pending' })
  status: string;

  @Prop()
  txHash: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
