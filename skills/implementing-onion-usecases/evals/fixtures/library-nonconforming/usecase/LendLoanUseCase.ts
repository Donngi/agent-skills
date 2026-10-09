import { Loan } from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import type { MemberId } from "../domain/value-object/MemberId";
import { Timestamp } from "../domain/value-object/Timestamp";

export type LendLoanUseCase = {
	run: (props: RunProps) => Promise<Loan>;
};

type RunProps = {
	loanNumber: LoanNumber;
	memberId: MemberId;
	dueAt: Timestamp;
};

export function createLendLoanUseCase(props: {
	loanRepository: LoanRepository;
}): LendLoanUseCase {
	return {
		run: async (runProps) => {
			const loan = await props.loanRepository.get(runProps.loanNumber);
			if (!loan) {
				throw new Error("not found");
			}

			const lent = Loan.lend(loan, {
				memberId: runProps.memberId,
				at: Timestamp.create(Date.now()),
				dueAt: runProps.dueAt,
			});
			await props.loanRepository.put(lent);
			return lent;
		},
	};
}
