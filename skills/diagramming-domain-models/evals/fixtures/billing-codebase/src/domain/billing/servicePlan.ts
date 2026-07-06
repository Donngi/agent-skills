import { Money } from './money';

export type PlanId = {
  readonly value: string;
};

export function planId(value: string): PlanId {
  return { value };
}

// 通信サービスの料金プラン。「ServicePlan」はこの事業のドメイン語彙である
export type ServicePlan = {
  readonly id: PlanId;
  readonly name: string;
  readonly monthlyFee: Money;
};

export function registerServicePlan(id: PlanId, name: string, monthlyFee: Money): ServicePlan {
  return { id, name, monthlyFee };
}

export function changeFee(plan: ServicePlan, newFee: Money): ServicePlan {
  return { ...plan, monthlyFee: newFee };
}

export interface ServicePlanRepository {
  findById(id: PlanId): Promise<ServicePlan | null>;
  save(plan: ServicePlan): Promise<void>;
}
