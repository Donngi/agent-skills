import type { LoanNumberIssuer } from "../domain/domain-service/LoanNumberIssuer";
import { Member } from "../domain/entity/Member";
import type { LoanRepository } from "../domain/repository/LoanRepository";
import type { MemberRepository } from "../domain/repository/MemberRepository";
import type { BookId } from "../domain/value-object/BookId";
import type { LibraryCode } from "../domain/value-object/LibraryCode";
import type { MemberId } from "../domain/value-object/MemberId";
import type { Timestamp } from "../domain/value-object/Timestamp";
import { UseCaseError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type ReserveLoanUseCaseProps = Readonly<{
	/** 予約する利用者の会員番号 */
	memberId: MemberId;
	/** 予約する蔵書の ID */
	bookId: BookId;
	/** 貸出番号を採番する館 */
	libraryCode: LibraryCode;
	/** 取り置きの期限 */
	holdUntil: Timestamp;
	/** 手続きに添えるメモ */
	memo?: string;
}>;

export type ReserveLoanUseCaseResult = Readonly<{
	/** 作った貸出の貸出番号 */
	loanNumber: string;
}>;

/**
 * ReserveLoanUseCase
 * 利用者の予約として貸出を作る。
 */
export type ReserveLoanUseCase = Readonly<{
	/**
	 * 採番器で番号を取ったあとで失敗すると、その番号は欠番になる。
	 * @param props 予約する利用者・蔵書・館・取り置きの期限とメモ
	 * @throws MemberNotFoundError 利用者が無いとき。
	 * @throws MemberWithdrawnError 利用者が退会済みのとき。
	 * @throws InvalidCreationParamError 貸出の入力が不正なとき。operation は Loan.create。
	 */
	run: (props: ReserveLoanUseCaseProps) => Promise<ReserveLoanUseCaseResult>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type ReserveLoanUseCaseDeps = Readonly<{
	memberRepository: MemberRepository;
	loanRepository: LoanRepository;
	loanNumberIssuer: LoanNumberIssuer;
}>;

export function createReserveLoanUseCase(
	deps: ReserveLoanUseCaseDeps,
): ReserveLoanUseCase {
	return {
		run: async (props) => {
			const member = await deps.memberRepository.get(props.memberId);
			if (member === undefined) {
				throw new MemberNotFoundError("ReserveLoanUseCase.run", props.memberId);
			}

			const loanNumber = await deps.loanNumberIssuer.next(props.libraryCode);
			// ユースケースは Loan.create を直接呼ばず、生成の入口の Member.reserveLoan を通す
			const loan = Member.reserveLoan(member, {
				id: loanNumber,
				bookId: props.bookId,
				holdUntil: props.holdUntil,
				...(props.memo !== undefined ? { memo: props.memo } : {}),
			});
			await deps.loanRepository.put(loan);

			return { loanNumber: loan.id };
		},
	};
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 指定された会員番号の利用者が無かった。 */
export class MemberNotFoundError extends UseCaseError {
	override readonly name: string = "MemberNotFoundError";

	/** 指定された会員番号 */
	readonly memberId: MemberId;

	constructor(operation: string, memberId: MemberId) {
		super(operation, `利用者 ${memberId} が見つかりません`);
		this.memberId = memberId;
	}
}
