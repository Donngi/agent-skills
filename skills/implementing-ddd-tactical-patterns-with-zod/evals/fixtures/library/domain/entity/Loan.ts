import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { BookIdSchema } from "../value-object/BookId";
import { type LoanNumber, LoanNumberSchema } from "../value-object/LoanNumber";
import { type MemberId, MemberIdSchema } from "../value-object/MemberId";
import { type Timestamp, TimestampSchema } from "../value-object/Timestamp";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const LoanBrand: unique symbol;

const LoanCommonFields = {
	/** 貸出番号 */
	id: LoanNumberSchema,
	/** 借りる蔵書 */
	bookId: BookIdSchema,
	/** 借りる利用者 */
	memberId: MemberIdSchema,
	/** 手続きに添えるメモ */
	memo: z
		.string()
		.min(1, { error: "メモは1文字以上です" })
		.max(200, { error: "メモは200文字までです" })
		.refine((v) => v === v.trim(), {
			error: "メモの前後に空白を含めることはできません",
		}),
};

const LoanReservedFields = {
	/** 取り置きの期限 */
	holdUntil: TimestampSchema,
};

/**
 * Loan
 * 利用者が蔵書を1冊借りる手続き。予約してから返却するまでを1つの貸出として追う。
 */
export const LoanSchema = z
	.discriminatedUnion("status", [
		z.strictObject({
			...LoanCommonFields,
			status: z.literal("reserved"),
			...LoanReservedFields,
		}),
		z.strictObject({
			...LoanCommonFields,
			status: z.literal("lent"),
			/** 貸出日のタイムスタンプ */
			lentAt: TimestampSchema,
			/** 返却期限のタイムスタンプ */
			dueAt: TimestampSchema,
		}),
		z.strictObject({
			...LoanCommonFields,
			status: z.literal("returned"),
			/** 貸出日のタイムスタンプ */
			lentAt: TimestampSchema,
			/** 返却期限のタイムスタンプ */
			dueAt: TimestampSchema,
			/** 返却日のタイムスタンプ */
			returnedAt: TimestampSchema,
		}),
	])
	.superRefine((v, ctx) => {
		// この中から例外を投げる関数を呼ばない。safeParse は例外を捕まえないので、
		// safeParse を呼んだ場所すべてで意図しない例外になる
		if (v.status !== "reserved" && v.dueAt < v.lentAt) {
			ctx.addIssue({
				code: "custom",
				path: ["dueAt"],
				message: "返却期限を貸出日より前にすることはできません",
			});
		}
		if (v.status === "returned" && v.returnedAt < v.lentAt) {
			ctx.addIssue({
				code: "custom",
				path: ["returnedAt"],
				message: "返却日を貸出日より前にすることはできません",
			});
		}
	})
	.readonly()
	.brand<typeof LoanBrand>();

export type Loan = z.output<typeof LoanSchema>;

export type LoanSchemaInput = z.input<typeof LoanSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export const CreateLoanPropsSchema = z
	.strictObject({ ...LoanCommonFields, ...LoanReservedFields })
	.pick({
		id: true,
		bookId: true,
		memberId: true,
		memo: true,
		holdUntil: true,
	})
	.readonly();

export type CreateLoanProps = z.output<typeof CreateLoanPropsSchema>;

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createLoan(props: CreateLoanProps): Loan {
	const input = CreateLoanPropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("Loan.create", input.error);
	}
	const result = LoanSchema.safeParse({
		id: input.data.id,
		bookId: input.data.bookId,
		memberId: input.data.memberId,
		memo: input.data.memo,
		status: "reserved",
		holdUntil: input.data.holdUntil,
	} satisfies LoanSchemaInput);
	if (!result.success) {
		throw new InvalidCreationParamError("Loan.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructLoan(props: LoanSchemaInput): Loan {
	const result = LoanSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError("Loan.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

function loanEqualsById(a: Loan, b: Loan): boolean {
	return a.id === b.id;
}

// -------------------------------------------------
// 業務操作
// -------------------------------------------------

export type LendLoanParams = Readonly<{
	/** 借りに来た利用者 */
	memberId: MemberId;
	/** 貸出日のタイムスタンプ */
	at: Timestamp;
	/** 返却期限のタイムスタンプ */
	dueAt: Timestamp;
}>;

/**
 * 予約済の貸出だけ貸し出せる。取り置きの期限は貸し出した時点で無くなる。
 * @throws LoanStatusMismatchError 予約済でないとき。
 * @throws LoanMemberMismatchError 予約した利用者と別の利用者が借りようとしたとき。
 * @throws LoanDueBeforeLendingError 貸出日より前の返却期限を渡したとき。
 */
function lendLoan(loan: Loan, params: LendLoanParams): Loan {
	if (loan.status !== "reserved") {
		throw new LoanStatusMismatchError(
			"Loan.lend",
			loan.id,
			"reserved",
			loan.status,
		);
	}
	if (loan.memberId !== params.memberId) {
		throw new LoanMemberMismatchError(
			"Loan.lend",
			loan.id,
			loan.memberId,
			params.memberId,
		);
	}
	if (params.dueAt < params.at) {
		throw new LoanDueBeforeLendingError(
			"Loan.lend",
			loan.id,
			params.dueAt,
			params.at,
		);
	}
	const { holdUntil: _holdUntil, ...rest } = loan;
	const result = LoanSchema.safeParse({
		...rest,
		status: "lent",
		lentAt: params.at,
		dueAt: params.dueAt,
	} satisfies LoanSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Loan.lend", result.error);
	}
	return result.data;
}

export type ReturnLoanParams = Readonly<{
	/** 返却日のタイムスタンプ */
	at: Timestamp;
}>;

/**
 * 貸出中の貸出だけ返却できる。返却期限を過ぎていても受け付ける。
 * @throws LoanStatusMismatchError 貸出中でないとき。
 * @throws LoanReturnedBeforeLendingError 貸出日より前のタイムスタンプを渡したとき。
 */
function returnLoan(loan: Loan, params: ReturnLoanParams): Loan {
	if (loan.status !== "lent") {
		throw new LoanStatusMismatchError(
			"Loan.return",
			loan.id,
			"lent",
			loan.status,
		);
	}
	if (params.at < loan.lentAt) {
		throw new LoanReturnedBeforeLendingError(
			"Loan.return",
			loan.id,
			params.at,
			loan.lentAt,
		);
	}
	const result = LoanSchema.safeParse({
		...loan,
		status: "returned",
		returnedAt: params.at,
	} satisfies LoanSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Loan.return", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** その操作を許さない状態の貸出に対して処理を実行しようとした。 */
export class LoanStatusMismatchError extends DomainError {
	override readonly name: string = "LoanStatusMismatchError";

	/** 失敗した貸出の貸出番号 */
	readonly loanNumber: LoanNumber;
	/** その操作ができる状態 */
	readonly expected: Loan["status"];
	/** 渡された貸出の状態 */
	readonly actual: Loan["status"];

	constructor(
		operation: string,
		loanNumber: LoanNumber,
		expected: Loan["status"],
		actual: Loan["status"],
	) {
		super(
			operation,
			`${expected} の貸出だけが対象です。渡された貸出は ${actual} です`,
		);
		this.loanNumber = loanNumber;
		this.expected = expected;
		this.actual = actual;
	}
}

/** 予約した利用者とは別の利用者が借りようとした。 */
export class LoanMemberMismatchError extends DomainError {
	override readonly name: string = "LoanMemberMismatchError";

	/** 失敗した貸出の貸出番号 */
	readonly loanNumber: LoanNumber;
	/** 予約した利用者の識別子 */
	readonly reservedBy: MemberId;
	/** 借りようとした利用者の識別子 */
	readonly requestedBy: MemberId;

	constructor(
		operation: string,
		loanNumber: LoanNumber,
		reservedBy: MemberId,
		requestedBy: MemberId,
	) {
		super(
			operation,
			`予約した ${reservedBy} 以外の ${requestedBy} は借りることができません`,
		);
		this.loanNumber = loanNumber;
		this.reservedBy = reservedBy;
		this.requestedBy = requestedBy;
	}
}

/** 返却期限に、貸出日より前の値を渡した。 */
export class LoanDueBeforeLendingError extends DomainError {
	override readonly name: string = "LoanDueBeforeLendingError";

	/** 失敗した貸出の貸出番号 */
	readonly loanNumber: LoanNumber;
	/** 渡された返却期限のタイムスタンプ */
	readonly dueAt: Timestamp;
	/** 渡された貸出日のタイムスタンプ */
	readonly lentAt: Timestamp;

	constructor(
		operation: string,
		loanNumber: LoanNumber,
		dueAt: Timestamp,
		lentAt: Timestamp,
	) {
		super(operation, "返却期限を貸出日より前にすることはできません");
		this.loanNumber = loanNumber;
		this.dueAt = dueAt;
		this.lentAt = lentAt;
	}
}

/** 返却日に、貸出日より前の値を渡した。 */
export class LoanReturnedBeforeLendingError extends DomainError {
	override readonly name: string = "LoanReturnedBeforeLendingError";

	/** 失敗した貸出の貸出番号 */
	readonly loanNumber: LoanNumber;
	/** 渡された返却日のタイムスタンプ */
	readonly returnedAt: Timestamp;
	/** 貸出日のタイムスタンプ */
	readonly lentAt: Timestamp;

	constructor(
		operation: string,
		loanNumber: LoanNumber,
		returnedAt: Timestamp,
		lentAt: Timestamp,
	) {
		super(operation, "返却日を貸出日より前にすることはできません");
		this.loanNumber = loanNumber;
		this.returnedAt = returnedAt;
		this.lentAt = lentAt;
	}
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Loan = {
	create: createLoan,
	reconstruct: reconstructLoan,
	equalsById: loanEqualsById,
	lend: lendLoan,
	return: returnLoan,
} as const;
