import { Money, subtractMoney, addMoney } from './money';

export type AccountId = {
  readonly value: string;
};

export function accountId(value: string): AccountId {
  return { value };
}

export type Account = {
  readonly id: AccountId;
  readonly balance: Money;
};

export function openAccount(id: AccountId, balance: Money): Account {
  return { id, balance };
}

export function withdraw(account: Account, amount: Money): Account {
  // 不変条件: 残高は 0 未満にならない
  if (account.balance.amount < amount.amount) throw new Error('insufficient balance');
  return { ...account, balance: subtractMoney(account.balance, amount) };
}

export function deposit(account: Account, amount: Money): Account {
  return { ...account, balance: addMoney(account.balance, amount) };
}

export interface AccountRepository {
  findById(id: AccountId): Promise<Account | null>;
  save(account: Account): Promise<void>;
}
