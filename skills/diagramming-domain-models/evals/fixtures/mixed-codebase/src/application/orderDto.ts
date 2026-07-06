import { Order } from '../domain/ordering/order';

export interface PlaceOrderRequest {
  orderId: string;
  customerId: string;
}

export type OrderDto = {
  readonly orderId: string;
  readonly status: string;
  readonly totalAmount: number;
};

export function toOrderDto(order: Order): OrderDto {
  return {
    orderId: order.id.value,
    status: order.status,
    totalAmount: order.totalAmount.amount,
  };
}
