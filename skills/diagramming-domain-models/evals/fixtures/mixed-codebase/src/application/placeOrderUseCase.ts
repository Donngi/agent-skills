import { draftOrder, placeOrder, orderId, OrderRepository } from '../domain/ordering/order';
import { customerId } from '../domain/ordering/customer';
import { OrderDto, PlaceOrderRequest, toOrderDto } from './orderDto';

export function placeOrderUseCase(orderRepository: OrderRepository) {
  return {
    async execute(request: PlaceOrderRequest): Promise<OrderDto> {
      const draft = draftOrder(orderId(request.orderId), customerId(request.customerId));
      const order = placeOrder(draft);
      await orderRepository.save(order);
      return toOrderDto(order);
    },
  };
}
