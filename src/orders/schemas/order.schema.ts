// src/orders/schemas/order.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Order extends Document {
  @Prop()
  orderId: string;

  @Prop()
  sender: string;

  @Prop()
  recipient: string;

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

  @Prop({ default: false })
  verify: boolean;

  @Prop({ default: () => Date.now() })
  timestamp: Date;

  @Prop({ type: Object })
  orderDetail;

  @Prop()
  paymentQr: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
