export type Money = {
  readonly amount: number;
  readonly currency: string;
};

export function money(amount: number, currency: string): Money {
  if (amount < 0) throw new Error('amount must be >= 0');
  return { amount, currency };
}

export function addMoney(a: Money, b: Money): Money {
  return money(a.amount + b.amount, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  return money(a.amount - b.amount, a.currency);
}
