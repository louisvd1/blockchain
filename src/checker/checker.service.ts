import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrdersService } from '../orders/orders.service';
import { ethers } from 'ethers';
import axios from 'axios';

@Injectable()
export class CheckerService {
  private readonly logger = new Logger(CheckerService.name);

  constructor(private ordersService: OrdersService) {}

  @Cron('*/3 * * * * *')
  async handleCheck() {
    this.logger.log('Checking orders...');

    const limit = parseInt(process.env.ORDER_CHECK_LIMIT ?? '10', 10);
    const pendingOrders = await this.ordersService.findUnverifiedOrders(limit);
    this.logger.log(`Found ${pendingOrders.length} pending orders`);

    const ethNetwork = process.env.ETH_NETWORK;
    const ethRpc =
      ethNetwork === 'mainnet'
        ? (process.env.ETH_RPC_MAINNET ?? '')
        : (process.env.ETH_RPC_TESTNET ?? '');

    const btcNetwork = process.env.BTC_NETWORK;
    const btcApiBase =
      btcNetwork === 'mainnet'
        ? 'https://blockstream.info/api'
        : 'https://blockstream.info/testnet/api';

    const tronNetwork = process.env.TRON_NETWORK;
    const tronApiBase =
      tronNetwork === 'mainnet'
        ? 'https://api.trongrid.io'
        : 'https://api.shasta.trongrid.io';

    const bnbNetwork = process.env.BNB_NETWORK;
    const bnbRpc =
      bnbNetwork === 'mainnet'
        ? (process.env.BNB_RPC_MAINNET ?? '')
        : (process.env.BNB_RPC_TESTNET ?? '');

    this.logger.log(`Using ETH RPC: ${ethRpc}`);
    this.logger.log(`Using BTC API: ${btcApiBase}`);
    this.logger.log(`Using TRON API: ${tronApiBase}`);
    this.logger.log(`Using BNB RPC: ${bnbRpc}`);

    for (const order of pendingOrders) {
      try {
        if (order.chain === 'eth' || order.chain === 'bnb') {
          const rpc = order.chain === 'eth' ? ethRpc : bnbRpc;

          const res = await axios.post(rpc, {
            jsonrpc: '2.0',
            method: 'eth_getTransactionByHash',
            params: [order.txHash],
            id: 1,
          });

          const tx = res.data.result;
          if (!tx || !tx.to || !tx.value) {
            await this.ordersService.updateLastCheckedAt(order.orderId);
            continue;
          }

          const value = parseFloat(ethers.formatEther(BigInt(tx.value)));
          const recipient = tx.to;

          // Check receipt để confirm
          const receiptRes = await axios.post(rpc, {
            jsonrpc: '2.0',
            method: 'eth_getTransactionReceipt',
            params: [order.txHash],
            id: 1,
          });
          const receipt = receiptRes.data.result;

          if (!receipt || !receipt.blockNumber) {
            await this.ordersService.updateLastCheckedAt(order.orderId);
            continue;
          }

          if (
            value >= order.amount &&
            recipient.toLowerCase() === order.recipient.toLowerCase()
          ) {
            await this.ordersService.updateVerifyAndStatus(
              order.orderId,
              true,
              'success',
            );
            this.logger.log(
              `${order.chain.toUpperCase()} Order ${order.orderId} verified & success!`,
            );
            continue;
          } else {
            await this.ordersService.updateVerifyAndStatus(
              order.orderId,
              false,
              'failed',
            );
            this.logger.warn(
              `${order.chain.toUpperCase()} Order ${order.orderId} verify failed (value or recipient mismatch)!`,
            );
            continue;
          }
        } else if (order.chain === 'btc') {
          const res = await axios.get(`${btcApiBase}/tx/${order.txHash}`);
          const tx = res.data;

          const vinSender = tx.vin[0]?.prevout?.scriptpubkey_address;
          const vout1 = tx.vout[1];

          if (!vinSender || !vout1) {
            await this.ordersService.updateLastCheckedAt(order.orderId);
            continue;
          }

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
            continue;
          } else {
            await this.ordersService.updateVerifyAndStatus(
              order.orderId,
              false,
              'failed',
            );
            this.logger.warn(
              `BTC Order ${order.orderId} verify failed (value or recipient mismatch)!`,
            );
            continue;
          }
        } else if (order.chain === 'trx') {
          const res = await axios.get(
            `${tronApiBase}/v1/transaction-info?hash=${order.txHash}`,
          );
          const tx = res.data;

          if (
            tx &&
            tx.trc20TransferInfo &&
            tx.trc20TransferInfo[0]?.to_address &&
            tx.trc20TransferInfo[0]?.from_address
          ) {
            const sender = tx.trc20TransferInfo[0].from_address;
            const recipient = tx.trc20TransferInfo[0].to_address;
            const valueTrx = tx.trc20TransferInfo[0].amount_str / 1e6;

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
              continue;
            } else {
              await this.ordersService.updateVerifyAndStatus(
                order.orderId,
                false,
                'failed',
              );
              this.logger.warn(
                `TRX Order ${order.orderId} verify failed (value or recipient mismatch)!`,
              );
              continue;
            }
          } else {
            await this.ordersService.updateLastCheckedAt(order.orderId);
            continue;
          }
        }

        await this.ordersService.updateLastCheckedAt(order.orderId);
      } catch (e) {
        this.logger.error(
          `Check failed for order ${order.orderId}: ${e.message}`,
        );
        await this.ordersService.updateLastCheckedAt(order.orderId);
      }
    }
  }
}
