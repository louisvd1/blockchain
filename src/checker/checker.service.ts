// src/checker/checker.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrdersService } from '../orders/orders.service';
import { ethers } from 'ethers';
import TronWeb from 'tronweb';
import axios from 'axios';

@Injectable()
export class CheckerService {
  private readonly logger = new Logger(CheckerService.name);

  constructor(private ordersService: OrdersService) {}

  @Cron('*/20 * * * * *') // mỗi 20s
  async handleCheck() {
    this.logger.log('Checking orders...');
    console.log('aaaaaaaaaaaaaaaaa');

    // const ethProvider = new ethers.JsonRpcProvider(process.env.ETH_RPC);
    // const tronWeb = new TronWeb({
    //   fullHost: 'https://api.trongrid.io',
    // });

    // const ethOrders = await this.ordersService.findPendingOrders('eth');
    // const tronOrders = await this.ordersService.findPendingOrders('tron');

    // for (const order of ethOrders) {
    //   // example ETH scan
    //   const tx = await ethProvider.getTransaction(order.txHash);
    //   if (tx && tx.confirmations >= 1) {
    //     await this.ordersService.updateStatus(
    //       order.orderId,
    //       'success',
    //       tx.hash,
    //     );
    //     this.logger.log(`ETH Order ${order.orderId} paid!`);
    //   }
    // }

    // for (const order of tronOrders) {
    //   // example TRON scan
    //   const res = await axios.get(
    //     `https://api.trongrid.io/v1/transactions/${order.txHash}`,
    //   );
    //   const tx = res.data.data?.[0];
    //   if (tx && tx.ret[0].contractRet === 'SUCCESS') {
    //     await this.ordersService.updateStatus(
    //       order.orderId,
    //       'success',
    //       order.txHash,
    //     );
    //     this.logger.log(`Tron Order ${order.orderId} paid!`);
    //   }
    // }
  }
}
