import { placeOrderUseCase } from '../application/placeOrderUseCase';

export function orderController(useCase: ReturnType<typeof placeOrderUseCase>) {
  return {
    async post(req: { body: { orderId: string; customerId: string } }): Promise<{ status: number; body: unknown }> {
      const dto = await useCase.execute(req.body);
      return { status: 201, body: dto };
    },
  };
}
