import { Loan } from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import { createGetLoanUseCase } from "./GetLoanUseCase";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type ChangeLoanMemoUseCaseProps = Readonly<{
	/** メモを変える貸出の貸出番号 */
	loanNumber: LoanNumber;
	/** 新しいメモ */
	memo: string;
}>;

/**
 * ChangeLoanMemoUseCase
 * 貸出に添えたメモを書き換える。
 */
export type ChangeLoanMemoUseCase = Readonly<{
	/**
	 * 同じ貸出を並行して更新すると、後から保存したほうが残る（LoanRepository.put）。
	 * @throws LoanNotFoundError 貸出が無いとき。
	 * @throws InvalidReconstructParamError メモが不正なとき。operation は Loan.reconstruct。
	 */
	run: (props: ChangeLoanMemoUseCaseProps) => Promise<void>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type ChangeLoanMemoUseCaseDeps = Readonly<{
	loanRepository: LoanRepository;
}>;

export function createChangeLoanMemoUseCase(
	deps: ChangeLoanMemoUseCaseDeps,
): ChangeLoanMemoUseCase {
	return {
		run: async (props) => {
			const loan = await createGetLoanUseCase({
				loanRepository: deps.loanRepository,
			}).run({ loanNumber: props.loanNumber });

			const changed = Loan.reconstruct({ ...loan, memo: props.memo });
			await deps.loanRepository.put(changed);
		},
	};
}
