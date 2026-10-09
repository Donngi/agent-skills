import type { Loan } from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";

export type GetLoanUseCase = {
	run: (loanNumber: LoanNumber) => Promise<Loan>;
};

export function createGetLoanUseCase(props: {
	loanRepository: LoanRepository;
}): GetLoanUseCase {
	return {
		run: async (loanNumber) => {
			const loan = await props.loanRepository.get(loanNumber);
			if (!loan) {
				throw new Error("not found");
			}
			return loan;
		},
	};
}
