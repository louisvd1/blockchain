import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrdersService } from '../orders/orders.service';
import { ethers } from 'ethers';
import axios from 'axios';

@Injectable()
export class CheckerService {
  private readonly logger = new Logger(CheckerService.name);

  constructor(private ordersService: OrdersService) {}

  @Cron('*/20 * * * * *') // mỗi 20s
  async handleCheck() {
    this.logger.log('Checking orders...');

    const pendingOrders = await this.ordersService.findUnverifiedOrders();
    this.logger.log(`Found ${pendingOrders.length} pending orders`);

    // ETH network
    const ethNetwork = process.env.ETH_NETWORK;
    const ethRpc =
      ethNetwork === 'mainnet'
        ? (process.env.ETH_RPC_MAINNET ?? '')
        : (process.env.ETH_RPC_TESTNET ?? '');

    // BTC network
    const btcNetwork = process.env.BTC_NETWORK;
    const btcApiBase =
      btcNetwork === 'mainnet'
        ? 'https://blockstream.info/api'
        : 'https://blockstream.info/testnet/api';

    this.logger.log(`Using ETH network: ${ethNetwork}, RPC: ${ethRpc}`);
    this.logger.log(`Using BTC network: ${btcNetwork}, API: ${btcApiBase}`);

    for (const order of pendingOrders) {
      try {
        if (order.chain === 'eth') {
          const res = await axios.post(ethRpc, {
            jsonrpc: '2.0',
            method: 'eth_getTransactionByHash',
            params: [order.txHash],
            id: 1,
          });

          const tx = res.data.result;
          if (tx && tx.to && tx.value) {
            const valueEth = parseFloat(ethers.formatEther(BigInt(tx.value)));
            const recipient = tx.to;

            this.logger.log(`tx value -> ${tx.value}`);
            this.logger.log(`Converted valueEth: ${valueEth}`);
            this.logger.log(`Recipient from tx: ${recipient}`);
            this.logger.log(`Recipient from DB: ${order.recipient}`);
            this.logger.log(`AmountUsd from DB: ${order.amount}`);

            if (
              valueEth >= order.amount &&
              recipient.toLowerCase() === order.recipient.toLowerCase()
            ) {
              await this.ordersService.updateVerifyAndStatus(
                order.orderId,
                true,
                'success',
              );
              this.logger.log(`ETH Order ${order.orderId} verified & success!`);
            }
          }
        } else if (order.chain === 'btc') {
          const res = await axios.get(`${btcApiBase}/tx/${order.txHash}`);
          const tx = res.data;
          console.log('tx btc -> ', tx);

          if (tx && tx.vin && tx.vout) {
            console.log('checkkking');
            // Lấy sender address từ vin
            const vinSender = tx.vin[0]?.prevout?.scriptpubkey_address;

            // Lấy vout (anh đang muốn check vout[1])
            const vout1 = tx.vout[1];

            if (vinSender && vout1) {
              const recipientAddress = vout1.scriptpubkey_address;
              const valueBtc = vout1.value / 100000000;

              this.logger.log(`Sender from vin: ${vinSender}`);
              this.logger.log(`Recipient from vout[1]: ${recipientAddress}`);
              this.logger.log(`Value (BTC): ${valueBtc}`);
              this.logger.log(`Order sender: ${order.sender}`);
              this.logger.log(`Order recipient: ${order.recipient}`);
              this.logger.log(`Order amount: ${order.amount}`);

              if (
                valueBtc === order.amount &&
                vinSender.toLowerCase() === order.sender.toLowerCase() &&
                recipientAddress.toLowerCase() === order.recipient.toLowerCase()
              ) {
                console.log('checkkking verify');
                await this.ordersService.updateVerifyAndStatus(
                  order.orderId,
                  true,
                  'success',
                );
                this.logger.log(
                  `BTC Order ${order.orderId} verified & success!`,
                );
              }
            }
          }
        }
      } catch (e) {
        this.logger.error(
          `Check failed for order ${order.orderId}: ${e.message}`,
        );
      }
    }
  }
}
