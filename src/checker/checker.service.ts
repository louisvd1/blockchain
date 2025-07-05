import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrdersService } from '../orders/orders.service';
import { ethers } from 'ethers';
import axios from 'axios';

@Injectable()
export class CheckerService {
  private readonly logger = new Logger(CheckerService.name);

  constructor(private ordersService: OrdersService) {}

  @Cron('*/10 * * * * *') // mỗi 20s
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

    // TRON network
    const tronNetwork = process.env.TRON_NETWORK;
    const tronApiBase =
      tronNetwork === 'mainnet'
        ? 'https://api.trongrid.io'
        : 'https://api.shasta.trongrid.io';

    this.logger.log(`Using ETH network: ${ethNetwork}, RPC: ${ethRpc}`);
    this.logger.log(`Using BTC network: ${btcNetwork}, API: ${btcApiBase}`);
    this.logger.log(`Using TRON network: ${tronNetwork}, API: ${tronApiBase}`);

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

          const vinSender = tx.vin[0]?.prevout?.scriptpubkey_address;
          const vout1 = tx.vout[1];

          if (vinSender && vout1) {
            const recipientAddress = vout1.scriptpubkey_address;
            const valueBtc = vout1.value / 1e8;

            if (
              valueBtc === order.amount &&
              vinSender.toLowerCase() === order.sender.toLowerCase() &&
              recipientAddress.toLowerCase() === order.recipient.toLowerCase()
            ) {
              await this.ordersService.updateVerifyAndStatus(
                order.orderId,
                true,
                'success',
              );
              this.logger.log(`BTC Order ${order.orderId} verified & success!`);
            }
          }
        } else if (order.chain === 'trx') {
          const res = await axios.get(
            `https://apilist.tronscanapi.com/api/transaction-info?hash=${order.txHash}`,
          );
          const tx = res.data;
          if (
            tx &&
            tx.trc20TransferInfo[0].to_address &&
            tx.trc20TransferInfo[0].from_address &&
            tx.contractData
          ) {
            const sender = tx.trc20TransferInfo[0].from_address;
            const recipient = tx.trc20TransferInfo[0].to_address;
            const valueTrx = tx.trc20TransferInfo[0].amount_str / 1e6; // TRX 6 decimals
            console.log('sender->', sender);
            console.log('recipient->', recipient);
            console.log('valueTrx->', valueTrx);

            if (
              valueTrx === order.amount &&
              sender.toLowerCase() === order.sender.toLowerCase() &&
              recipient.toLowerCase() === order.recipient.toLowerCase()
            ) {
              await this.ordersService.updateVerifyAndStatus(
                order.orderId,
                true,
                'success',
              );
              this.logger.log(`TRX Order ${order.orderId} verified & success!`);
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
