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

  async findAll(): Promise<Order[]> {
    return this.orderModel.find().exec();
  }

  async findByOrderId(orderId: string): Promise<Order | null> {
    return this.orderModel.findOne({ orderId }).exec();
  }

  async updateOrder(
    orderId: string,
    updateData: Partial<Order>,
  ): Promise<Order | null> {
    return this.orderModel
      .findOneAndUpdate({ orderId }, updateData, { new: true })
      .exec();
  }

  async deleteOrder(orderId: string): Promise<any> {
    return this.orderModel.deleteOne({ orderId }).exec();
  }

  async findPendingOrders(chain: string): Promise<Order[]> {
    return this.orderModel.find({ chain, status: 'pending' }).exec();
  }

  async updateStatus(orderId: string, status: string, txHash?: string) {
    return this.orderModel.updateOne({ orderId }, { status, txHash });
  }

  async findUnverifiedOrders(limit = 10) {
    const X = 10; // Giãn cách kiểm tra lại 10 giây
    const cutoff = new Date(Date.now() - X * 1000);
    return this.orderModel
      .find({
        verify: false,
        $or: [{ lastCheckedAt: { $lt: cutoff } }, { lastCheckedAt: null }],
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
  }

  async updateVerifyAndStatus(
    orderId: string,
    verify: boolean,
    status: string,
  ) {
    return this.orderModel
      .findOneAndUpdate(
        { orderId },
        { verify, status, lastCheckedAt: new Date() },
        { new: true },
      )
      .exec();
  }

  async updateLastCheckedAt(orderId: string) {
    await this.orderModel
      .updateOne({ orderId }, { lastCheckedAt: new Date() })
      .exec();
  }
}
