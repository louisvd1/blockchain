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
  @ApiBody({ description: 'Order data', type: Object })
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
}
