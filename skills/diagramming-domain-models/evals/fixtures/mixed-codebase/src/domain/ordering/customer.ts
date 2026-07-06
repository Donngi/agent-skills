export type CustomerId = {
  readonly value: string;
};

export function customerId(value: string): CustomerId {
  return { value };
}

export type CustomerName = {
  readonly value: string;
};

export function customerName(value: string): CustomerName {
  if (value.trim().length === 0) throw new Error('name must not be empty');
  return { value };
}

export type CustomerGrade = 'REGULAR' | 'GOLD';

export type Customer = {
  readonly id: CustomerId;
  readonly name: CustomerName;
  readonly grade: CustomerGrade;
};

export function registerCustomer(id: CustomerId, name: CustomerName): Customer {
  return { id, name, grade: 'REGULAR' };
}

export function upgradeToGold(customer: Customer): Customer {
  return { ...customer, grade: 'GOLD' };
}

export interface CustomerRepository {
  findById(id: CustomerId): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
}
