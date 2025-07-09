import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from './schemas/order.schema';
import * as QRCode from 'qrcode';

@Injectable()
export class OrdersService {
  constructor(@InjectModel(Order.name) private orderModel: Model<Order>) {}

  async create(orderData: Partial<Order>): Promise<Order> {
    if (!orderData.recipient || !orderData.amount || !orderData.chain) {
      throw new Error('Recipient, amount, and chain are required');
    }

    const existing = await this.orderModel
      .findOne({ orderId: orderData.orderId })
      .exec();
    if (existing) {
      throw new Error('OrderId already exists!');
    }

    // Tạo order trước, chưa có QR
    const createdOrder = await this.orderModel.create(orderData);

    // Tạo QR code
    const qrUrl = await this.generateQrByChain(
      createdOrder.chain,
      createdOrder.recipient,
      createdOrder.amount,
    );

    // Gọi update để thêm field paymentQr
    const updatedOrder = (await this.orderModel
      .findByIdAndUpdate(createdOrder._id, { paymentQr: qrUrl }, { new: true })
      .exec()) as Order;

    return updatedOrder;
  }

  async generateQrByChain(
    chain: string,
    recipient: string,
    amount: number,
  ): Promise<string> {
    let uri = '';

    switch (chain) {
      case 'eth':
        const amountWei = BigInt(Math.floor(amount * 1e18)).toString();
        uri = `ethereum:${recipient}?value=${amountWei}`;
        break;

      case 'bnb':
        uri = `bnb:${recipient}?amount=${amount}`;
        break;

      case 'btc':
        uri = `bitcoin:${recipient}?amount=${amount}`;
        break;

      case 'trx':
        uri = `tron:${recipient}?amount=${amount}`;
        break;

      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }

    return QRCode.toDataURL(uri);
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
    return this.orderModel.find({ chain, status: 'paid' }).exec();
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
        status: 'paid',
        $or: [{ lastCheckedAt: { $lt: cutoff } }, { lastCheckedAt: null }],
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
  }

  async submitPayment(orderId: string, txHash: string): Promise<Order | null> {
    // Check nếu đã tồn tại order khác có cùng txHash
    const existingOrder = await this.orderModel.findOne({
      txHash,
      orderId: { $ne: orderId },
    });

    if (existingOrder) {
      throw new Error('Transaction hash already used in another order');
    }

    // Nếu chưa tồn tại, thì update
    const updatedOrder = await this.orderModel
      .findOneAndUpdate({ orderId }, { txHash, status: 'paid' }, { new: true })
      .exec();

    if (!updatedOrder) {
      throw new Error('Order not found');
    }

    return updatedOrder;
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
