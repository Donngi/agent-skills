import { LoanNumber } from "./LoanNumber";

export function createDummyLoanNumber(value = "LIB-1"): LoanNumber {
	return LoanNumber.reconstruct(value);
}
