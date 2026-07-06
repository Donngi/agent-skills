import { Account, withdraw, deposit } from './account';
import { Money } from './money';

// 2つの Account 集約を跨ぐ送金。どちらの集約にも自然に置けないためドメインサービスとする。
// 状態を持たず、集約を引数に取って更新後の集約を返すトップレベル純関数（MoneyTransferService）。
export function moneyTransferService(
  from: Account,
  to: Account,
  amount: Money,
): { from: Account; to: Account } {
  return {
    from: withdraw(from, amount),
    to: deposit(to, amount),
  };
}
