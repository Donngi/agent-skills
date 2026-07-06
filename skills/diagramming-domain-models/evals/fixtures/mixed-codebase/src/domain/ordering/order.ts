import { CustomerId } from './customer';

export type OrderId = {
  readonly value: string;
};

export function orderId(value: string): OrderId {
  return { value };
}

export type Money = {
  readonly amount: number;
  readonly currency: string;
};

export function money(amount: number, currency: string): Money {
  if (amount < 0) throw new Error('amount must be >= 0');
  return { amount, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error('currency mismatch');
  return money(a.amount + b.amount, a.currency);
}

export type ProductId = {
  readonly value: string;
};

export function productId(value: string): ProductId {
  return { value };
}

export type Quantity = {
  readonly value: number;
};

export function quantity(value: number): Quantity {
  if (value < 1 || value > 999) throw new Error('quantity must be 1..999');
  return { value };
}

export type OrderStatus = 'DRAFT' | 'PLACED' | 'SHIPPED' | 'CANCELLED';

export type OrderLine = {
  readonly lineNo: number;
  readonly productId: ProductId;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
};

export function orderLine(
  lineNo: number,
  productId: ProductId,
  quantity: Quantity,
  unitPrice: Money,
): OrderLine {
  return { lineNo, productId, quantity, unitPrice };
}

export function subtotal(line: OrderLine): Money {
  return money(line.unitPrice.amount * line.quantity.value, line.unitPrice.currency);
}

export type Order = {
  readonly id: OrderId;
  readonly customerId: CustomerId;
  readonly lines: readonly OrderLine[];
  readonly status: OrderStatus;
  readonly totalAmount: Money;
};

export function draftOrder(id: OrderId, customerId: CustomerId): Order {
  return {
    id,
    customerId,
    lines: [],
    status: 'DRAFT',
    totalAmount: money(0, 'JPY'),
  };
}

export function addLine(order: Order, line: OrderLine): Order {
  // 不変条件: PLACED 以降は明細を変更できない
  if (order.status !== 'DRAFT') throw new Error('cannot modify lines after PLACED');
  const lines = [...order.lines, line];
  // 不変条件: totalAmount は全 OrderLine 小計の合計と常に一致する
  const totalAmount = lines.reduce((sum, l) => addMoney(sum, subtotal(l)), money(0, 'JPY'));
  return { ...order, lines, totalAmount };
}

export function placeOrder(order: Order): Order {
  if (order.lines.length === 0) throw new Error('empty order cannot be placed');
  return { ...order, status: 'PLACED' };
}

export interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
