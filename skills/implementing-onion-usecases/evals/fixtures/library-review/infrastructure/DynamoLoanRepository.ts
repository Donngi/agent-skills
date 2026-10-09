import type { Loan } from "../domain/entity/Loan";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { LibraryCode } from "../domain/value-object/LibraryCode";
import type { LoanNumber } from "../domain/value-object/LoanNumber";
import type { MemberId } from "../domain/value-object/MemberId";

/**
 * DynamoLoanRepository
 * LoanRepository の DynamoDB の実装。fixture では、テーブルの代わりに Map に置く。
 */
export class DynamoLoanRepository implements LoanRepository {
	readonly #table = new Map<string, Loan>();

	async get(id: LoanNumber): Promise<Loan | undefined> {
		return this.#table.get(id);
	}

	async listByLibrary(
		libraryCode: LibraryCode,
		limit: number,
	): Promise<readonly Loan[]> {
		return [...this.#table.values()]
			.filter((loan) => loan.id.startsWith(`${libraryCode}-`))
			.slice(0, limit);
	}

	async listByMember(
		memberId: MemberId,
		limit: number,
	): Promise<readonly Loan[]> {
		return [...this.#table.values()]
			.filter((loan) => loan.memberId === memberId)
			.slice(0, limit);
	}

	async put(loan: Loan): Promise<void> {
		this.#table.set(loan.id, loan);
	}
}
