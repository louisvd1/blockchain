import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrdersService } from '../orders/orders.service';
import { ethers } from 'ethers';
import axios from 'axios';
import bs58 from 'bs58';
import { createHash } from 'crypto';
import TronWeb from 'tronweb';

@Injectable()
export class CheckerService {
  private readonly logger = new Logger(CheckerService.name);

  constructor(private ordersService: OrdersService) {}

  @Cron('*/3 * * * * *')
  async handleCheck() {
    this.logger.log('Checking orders...');

    const limit = parseInt(process.env.ORDER_CHECK_LIMIT ?? '10', 10);
    const pendingOrders = await this.ordersService.findUnverifiedOrders(limit);
    this.logger.log(`Found ${pendingOrders.length} paid orders`);

    const ethRpc =
      process.env.ETH_NETWORK === 'mainnet'
        ? 'https://mainnet.infura.io/v3/your_project_id'
        : 'https://ethereum-sepolia.publicnode.com';

    const bnbRpc =
      process.env.BNB_NETWORK === 'mainnet'
        ? 'https://bsc-dataseed.binance.org/'
        : 'https://data-seed-prebsc-1-s1.binance.org:8545/';

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
        let result: boolean | null = false;

        if (order.chain === 'eth') {
          if (order.token === 'USDT') {
            result = await this.checkERC20(
              order,
              ethRpc,
              'ETH',
              order.recipient,
              order.amount,
            );
          } else {
            result = await this.checkNative(order, ethRpc, 'ETH');
          }
        } else if (order.chain === 'bnb') {
          if (order.token === 'USDT') {
            result = await this.checkERC20(
              order,
              bnbRpc,
              'BNB',
              order.recipient,
              order.amount,
            );
          } else {
            result = await this.checkNative(order, bnbRpc, 'BNB');
          }
        } else if (order.chain === 'btc') {
          result = await this.checkBTC(order, btcApiBase);
        } else if (order.chain === 'trx') {
          console.log(tronApiBase, 'tronApiBase');
          result = await this.checkTRX(order, tronApiBase);
        }

        if (result === true) {
          await this.ordersService.updateVerifyAndStatus(
            order.orderId,
            true,
            'success',
          );
          this.logger.log(
            `${order.chain.toUpperCase()} Order ${order.orderId} verified & success!`,
          );
        } else if (result === false) {
          // Chỉ fail nếu quá thời gian max hoặc điều kiện thất bại
          const createdAt = new Date(order.timestamp);
          const now = new Date();
          const diffMinutes =
            (now.getTime() - createdAt.getTime()) / (1000 * 60);
          const maxPendingMinutes = 60; // ví dụ: cho phép pending tối đa 60 phút

          if (diffMinutes > maxPendingMinutes) {
            await this.ordersService.updateVerifyAndStatus(
              order.orderId,
              false,
              'failed',
            );
            this.logger.warn(
              `${order.chain.toUpperCase()} Order ${order.orderId} verify failed (timeout)!`,
            );
          } else {
            this.logger.log(
              `${order.chain.toUpperCase()} Order ${order.orderId} still pending, waiting...`,
            );
          }
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

  private async checkNative(
    order: any,
    rpc: string,
    chainName: string,
  ): Promise<boolean | null> {
    const txRes = await this.fetchWithRetry(() =>
      axios.post(rpc, {
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [order.txHash],
        id: 1,
      }),
    );
    const tx = txRes.data.result;
    if (!tx || !tx.to || !tx.value) return false;

    const value = parseFloat(ethers.formatEther(BigInt(tx.value)));
    const recipient = tx.to;

    this.logger.debug(`[${chainName}] txHash: ${order.txHash}`);
    this.logger.debug(`[${chainName}] value: ${value}`);
    this.logger.debug(`[${chainName}] recipient: ${recipient}`);
    this.logger.debug(`[${chainName}] expected amount: ${order.amount}`);
    this.logger.debug(`[${chainName}] expected recipient: ${order.recipient}`);

    const receiptRes = await this.fetchWithRetry(() =>
      axios.post(rpc, {
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [order.txHash],
        id: 1,
      }),
    );
    const receipt = receiptRes.data.result;
    if (!receipt || !receipt.blockNumber) {
      this.logger.log(`[${chainName}] No receipt yet, tx still pending`);
      return null;
    }

    return (
      value >= order.amount &&
      recipient.toLowerCase() === order.recipient.toLowerCase()
    );
  }

  private async checkERC20(
    order: any,
    rpc: string,
    chainName: string,
    expectedRecipient: string,
    expectedAmount: number,
  ): Promise<boolean | null> {
    const receiptRes = await this.fetchWithRetry(() =>
      axios.post(rpc, {
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [order.txHash],
        id: 1,
      }),
    );

    const receipt = receiptRes.data.result;
    if (!receipt || !receipt.logs || receipt.logs.length === 0) return false;

    const transferEventSig =
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    for (const log of receipt.logs) {
      if (log.topics[0] === transferEventSig) {
        const from = '0x' + log.topics[1].substring(26);
        const to = '0x' + log.topics[2].substring(26);
        const amount = BigInt(log.data);

        this.logger.debug(`[ERC20 ${chainName}] txHash: ${order.txHash}`);
        this.logger.debug(`[ERC20 ${chainName}] from: ${from}`);
        this.logger.debug(`[ERC20 ${chainName}] to: ${to}`);
        this.logger.debug(
          `[ERC20 ${chainName}] amount raw: ${amount.toString()}`,
        );

        // USDT decimals = 6
        const normalizedAmount = parseFloat(ethers.formatUnits(amount, 6));

        if (
          to.toLowerCase() === expectedRecipient.toLowerCase() &&
          normalizedAmount === expectedAmount
        ) {
          return true;
        }
      }
    }

    if (!receipt.blockNumber) {
      this.logger.log(`[ERC20 ${chainName}] No block yet, tx still pending`);
      return null;
    }

    return false;
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
    const txRes = await this.fetchWithRetry(() =>
      axios.post(
        `${apiBase}/wallet/gettransactionbyid`,
        {
          value: order.txHash,
        },
        {
          headers: {
            'TRON-PRO-API-KEY': process.env.TRON_API_KEY_MAINNET,
          },
        },
      ),
    );
    console.log(`${apiBase}/wallet/gettransactionbyid`);

    const infoRes = await this.fetchWithRetry(() =>
      axios.post(
        `${apiBase}/wallet/gettransactioninfobyid`,
        {
          value: order.txHash,
        },
        {
          headers: {
            'TRON-PRO-API-KEY': process.env.TRON_API_KEY_MAINNET,
          },
        },
      ),
    );

    const tx = txRes.data;
    const info = infoRes.data;

    if (!tx || !info || !info.receipt || !info.log || info.log.length === 0) {
      this.logger.warn(`[TRX] Missing transaction data or logs`);
      return false;
    }

    const log = info.log.find((l) => l.topics && l.topics.length > 2);
    if (!log) return false;

    const fromHex = log.topics[1].slice(-40);
    const toHex = log.topics[2].slice(-40);

    const fromHexWith41 = '41' + fromHex;
    const toHexWith41 = '41' + toHex;

    const sender = TronWeb.utils.address.fromHex(fromHexWith41);
    const recipient = TronWeb.utils.address.fromHex(toHexWith41);

    const value = Number(BigInt('0x' + log.data) / 10n ** 6n);

    this.logger.debug(`[TRX] txHash: ${order.txHash}`);
    this.logger.debug(`[TRX] value: ${value}`);
    this.logger.debug(`[TRX] sender: ${sender}`);
    this.logger.debug(`[TRX] recipient: ${recipient}`);
    this.logger.debug(`[TRX] expected amount: ${order.amount}`);
    this.logger.debug(`[TRX] expected sender: ${order.sender}`);
    this.logger.debug(`[TRX] expected recipient: ${order.recipient}`);

    return (
      value === order.amount &&
      sender.toLowerCase() === order.sender.toLowerCase() &&
      recipient.toLowerCase() === order.recipient.toLowerCase()
    );
  }
}
