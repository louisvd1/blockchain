// src/orders/orders.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from './schemas/order.schema';

@Injectable()
export class OrdersService {
  constructor(@InjectModel(Order.name) private orderModel: Model<Order>) {}

  async create(orderData: Partial<Order>): Promise<Order> {
    return this.orderModel.create(orderData);
  }

  async findPendingOrders(chain: string): Promise<Order[]> {
    return this.orderModel.find({ chain, status: 'pending' }).exec();
  }

  async updateStatus(orderId: string, status: string, txHash?: string) {
    return this.orderModel.updateOne({ orderId }, { status, txHash });
  }

  async findUnverifiedOrders() {
    return this.orderModel.find({ verify: false }).exec();
  }

  async updateVerifyAndStatus(
    orderId: string,
    verify: boolean,
    status: string,
  ) {
    console.log(
      'Updating order:',
      orderId,
      'verify:',
      verify,
      'status:',
      status,
    );

    const updated = await this.orderModel
      .findOneAndUpdate({ orderId }, { verify, status }, { new: true })
      .exec();

    console.log('Updated order:', updated);
    return updated;
  }
}
