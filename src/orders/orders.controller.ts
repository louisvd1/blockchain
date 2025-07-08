import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Patch,
  Delete,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { ApiTags, ApiOperation, ApiBody, ApiParam } from '@nestjs/swagger';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiBody({
    description: 'Order data',
    schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', example: '12311123123' },
        sender: {
          type: 'string',
          example: '0xD72dBC29DE22f169489129aF154526feF0dc0353',
        },
        recipient: {
          type: 'string',
          example: '0xb848b708ED9EB70c56877A56e0fFA7510b9e38ca',
        },
        chain: { type: 'string', example: 'bnb' },
        amount: { type: 'number', example: 0.00001 },
        token: { type: 'string', example: 'BNB' },
        status: { type: 'string', example: 'pending' },
        verify: { type: 'boolean', example: false },
        orderDetail: {
          type: 'object',
          example: {
            productName: 'iPhone 15 Pro',
            quantity: 1,
            price: 1500,
            customerName: 'John Doe',
            phone: '+123456789',
            address: '123 Main St, New York, USA',
            note: 'Deliver before weekend',
          },
        },
      },
    },
  })
  async createOrder(@Body() body) {
    return this.ordersService.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders' })
  async getAllOrders() {
    return this.ordersService.findAll();
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get order by orderId' })
  @ApiParam({ name: 'orderId', type: String })
  async getOrderById(@Param('orderId') orderId: string) {
    return this.ordersService.findByOrderId(orderId);
  }

  @Patch(':orderId')
  @ApiOperation({ summary: 'Update order by orderId' })
  @ApiParam({ name: 'orderId', type: String })
  @ApiBody({ description: 'Update data', type: Object })
  async updateOrder(@Param('orderId') orderId: string, @Body() updateData) {
    return this.ordersService.updateOrder(orderId, updateData);
  }

  @Delete(':orderId')
  @ApiOperation({ summary: 'Delete order by orderId' })
  @ApiParam({ name: 'orderId', type: String })
  async deleteOrder(@Param('orderId') orderId: string) {
    return this.ordersService.deleteOrder(orderId);
  }

  @Post('/payment')
  @ApiOperation({ summary: 'Submit txHash for payment' })
  @ApiBody({
    description: 'Payment info',
    schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        txHash: { type: 'string' },
      },
      required: ['orderId', 'txHash'],
    },
  })
  async paymentOrder(@Body() body) {
    const { orderId, txHash } = body;
    return this.ordersService.submitPayment(orderId, txHash);
  }
}
