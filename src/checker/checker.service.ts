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

    const ethRpc =
      process.env.ETH_NETWORK === 'mainnet'
        ? 'https://mainnet.infura.io/v3/your_project_id' // <- thay ID thật của bạn
        : 'https://ethereum-sepolia.publicnode.com';

    if (!ethRpc || !/^https?:\/\//.test(ethRpc)) {
      throw new Error(`Invalid ETH RPC URL: ${ethRpc}`);
    }

    const bnbRpc =
      process.env.BNB_NETWORK === 'mainnet'
        ? 'https://bsc-dataseed.binance.org/'
        : 'https://data-seed-prebsc-1-s1.binance.org:8545/';

    if (!bnbRpc || !/^https?:\/\//.test(bnbRpc)) {
      throw new Error(`Invalid BNB RPC URL: ${bnbRpc}`);
    }

    const btcApiBase =
      process.env.BTC_NETWORK === 'mainnet'
        ? 'https://blockstream.info/api'
        : 'https://blockstream.info/testnet/api';
    const tronApiBase =
      process.env.TRON_NETWORK === 'mainnet'
        ? 'https://api.trongrid.io'
        : 'https://api.shasta.trongrid.io';

    for (const order of pendingOrders) {
      try {
        let result = false;

        if (order.chain === 'eth') {
          result = await this.checkEthOrBnb(order, ethRpc, 'ETH');
        } else if (order.chain === 'bnb') {
          result = await this.checkEthOrBnb(order, bnbRpc, 'BNB');
        } else if (order.chain === 'btc') {
          result = await this.checkBTC(order, btcApiBase);
        } else if (order.chain === 'trx') {
          result = await this.checkTRX(order, tronApiBase);
        }

        if (result) {
          await this.ordersService.updateVerifyAndStatus(
            order.orderId,
            true,
            'success',
          );
          this.logger.log(
            `${order.chain.toUpperCase()} Order ${order.orderId} verified & success!`,
          );
        } else {
          await this.ordersService.updateVerifyAndStatus(
            order.orderId,
            false,
            'failed',
          );
          this.logger.warn(
            `${order.chain.toUpperCase()} Order ${order.orderId} verify failed!`,
          );
        }
      } catch (e) {
        this.logger.error(
          `Check failed for order ${order.orderId}: ${e.message}`,
        );
      } finally {
        await this.ordersService.updateLastCheckedAt(order.orderId);
      }
    }
  }

  private async fetchWithRetry(
    fn: () => Promise<any>,
    retries = 2,
  ): Promise<any> {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) throw error;
      this.logger.warn(
        `Retrying... Remaining: ${retries}, Error: ${error.message}`,
      );
      return this.fetchWithRetry(fn, retries - 1);
    }
  }

  private async checkEthOrBnb(
    order: any,
    rpc: string,
    chainName: string,
  ): Promise<boolean> {
    const txRes = await this.fetchWithRetry(() =>
      axios.post(
        rpc,
        {
          jsonrpc: '2.0',
          method: 'eth_getTransactionByHash',
          params: [order.txHash],
          id: 1,
        },
        { timeout: 5000 },
      ),
    );
    console.log('txRes->', txRes);
    const tx = txRes.data.result;

    console.log('tx->', tx);
    if (!tx || !tx.to || !tx.value) {
      this.logger.warn(
        `[${chainName}] Missing tx fields: ${JSON.stringify(tx)}`,
      );
      return false;
    }

    const value = parseFloat(ethers.formatEther(BigInt(tx.value)));
    const recipient = tx.to;

    this.logger.debug(`[${chainName}] txHash: ${order.txHash}`);
    this.logger.debug(`[${chainName}] value: ${value}`);
    this.logger.debug(`[${chainName}] recipient: ${recipient}`);
    this.logger.debug(`[${chainName}] expected amount: ${order.amount}`);
    this.logger.debug(`[${chainName}] expected recipient: ${order.recipient}`);

    const receiptRes = await this.fetchWithRetry(() =>
      axios.post(
        rpc,
        {
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [order.txHash],
          id: 1,
        },
        { timeout: 5000 },
      ),
    );
    const receipt = receiptRes.data.result;
    if (!receipt || !receipt.blockNumber) {
      this.logger.warn(`[${chainName}] No receipt or no block confirmed yet`);
      return false;
    }

    return (
      value >= order.amount &&
      recipient.toLowerCase() === order.recipient.toLowerCase()
    );
  }

  private async checkBTC(order: any, apiBase: string): Promise<boolean> {
    const res = await this.fetchWithRetry(() =>
      axios.get(`${apiBase}/tx/${order.txHash}`, { timeout: 5000 }),
    );
    const tx = res.data;

    const vinSender = tx.vin[0]?.prevout?.scriptpubkey_address;
    const vout1 = tx.vout[1];

    this.logger.debug(`[BTC] txHash: ${order.txHash}`);
    this.logger.debug(`[BTC] vin sender: ${vinSender}`);
    this.logger.debug(`[BTC] vout1 recipient: ${vout1?.scriptpubkey_address}`);
    this.logger.debug(`[BTC] vout1 value: ${vout1?.value / 1e8}`);
    this.logger.debug(`[BTC] expected amount: ${order.amount}`);
    this.logger.debug(`[BTC] expected recipient: ${order.recipient}`);
    this.logger.debug(`[BTC] expected sender: ${order.sender}`);

    if (!vinSender || !vout1) return false;

    const recipientAddress = vout1.scriptpubkey_address;
    const valueBtc = vout1.value / 1e8;

    return (
      valueBtc === order.amount &&
      vinSender.toLowerCase() === order.sender.toLowerCase() &&
      recipientAddress.toLowerCase() === order.recipient.toLowerCase()
    );
  }

  private async checkTRX(order: any, apiBase: string): Promise<boolean> {
    const res = await this.fetchWithRetry(() =>
      axios.get(`${apiBase}/v1/transaction-info?hash=${order.txHash}`, {
        timeout: 5000,
      }),
    );
    const tx = res.data;

    if (!tx || !tx.trc20TransferInfo || !tx.trc20TransferInfo[0]) {
      this.logger.warn(
        `[TRX] Missing trc20TransferInfo: ${JSON.stringify(tx)}`,
      );
      return false;
    }

    const sender = tx.trc20TransferInfo[0].from_address;
    const recipient = tx.trc20TransferInfo[0].to_address;
    const valueTrx = tx.trc20TransferInfo[0].amount_str / 1e6;

    this.logger.debug(`[TRX] txHash: ${order.txHash}`);
    this.logger.debug(`[TRX] value: ${valueTrx}`);
    this.logger.debug(`[TRX] sender: ${sender}`);
    this.logger.debug(`[TRX] recipient: ${recipient}`);
    this.logger.debug(`[TRX] expected amount: ${order.amount}`);
    this.logger.debug(`[TRX] expected sender: ${order.sender}`);
    this.logger.debug(`[TRX] expected recipient: ${order.recipient}`);

    return (
      valueTrx === order.amount &&
      sender.toLowerCase() === order.sender.toLowerCase() &&
      recipient.toLowerCase() === order.recipient.toLowerCase()
    );
  }
}
