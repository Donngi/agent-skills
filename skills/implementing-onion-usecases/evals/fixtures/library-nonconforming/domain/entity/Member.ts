import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { type MemberId, MemberIdSchema } from "../value-object/MemberId";
import { type CreateLoanProps, Loan } from "./Loan";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const MemberBrand: unique symbol;

const MemberFields = {
	/** 会員番号 */
	id: MemberIdSchema,
	/** 氏名 */
	name: z
		.string()
		.min(1, { error: "氏名は1文字以上です" })
		.max(100, { error: "氏名は100文字までです" })
		.refine((v) => v === v.trim(), {
			error: "氏名の前後に空白を含めることはできません",
		}),
	/** 退会済みか。退会しても記録は消さない。 */
	withdrawn: z.boolean(),
};

/**
 * Member
 * 図書館の利用者。
 */
export const MemberSchema = z
	.strictObject(MemberFields)
	.readonly()
	.brand<typeof MemberBrand>();

export type Member = z.output<typeof MemberSchema>;

export type MemberSchemaInput = z.input<typeof MemberSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export const CreateMemberPropsSchema = z
	.strictObject(MemberFields)
	.pick({
		id: true,
		name: true,
	})
	.readonly();

export type CreateMemberProps = z.output<typeof CreateMemberPropsSchema>;

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createMember(props: CreateMemberProps): Member {
	const input = CreateMemberPropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("Member.create", input.error);
	}
	const result = MemberSchema.safeParse({
		id: input.data.id,
		name: input.data.name,
		withdrawn: false,
	} satisfies MemberSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Member.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructMember(props: MemberSchemaInput): Member {
	const result = MemberSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError("Member.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

function memberEqualsById(a: Member, b: Member): boolean {
	return a.id === b.id;
}

// -------------------------------------------------
// 業務操作
// -------------------------------------------------

export type ReserveLoanParams = Readonly<Omit<CreateLoanProps, "memberId">>;

/**
 * この利用者の予約として貸出を作る。貸出を作る入口はこの操作である。
 * 貸出番号は、呼び出し側が LoanNumberIssuer で先に採番して渡す。この操作で失敗した番号は欠番になる。
 * @throws MemberWithdrawnError 利用者が退会済みのとき。
 * @throws InvalidCreationParamError 貸出の入力が不正なとき。operation は Loan.create。
 */
function reserveLoanForMember(member: Member, params: ReserveLoanParams): Loan {
	if (member.withdrawn) {
		throw new MemberWithdrawnError("Member.reserveLoan", member.id);
	}
	return Loan.create({ ...params, memberId: member.id });
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 退会済みの利用者で予約しようとした。 */
export class MemberWithdrawnError extends DomainError {
	override readonly name: string = "MemberWithdrawnError";

	/** 失敗した利用者の会員番号 */
	readonly memberId: MemberId;

	constructor(operation: string, memberId: MemberId) {
		super(operation, "退会済みの利用者は予約できません");
		this.memberId = memberId;
	}
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Member = {
	create: createMember,
	reconstruct: reconstructMember,
	equalsById: memberEqualsById,
	reserveLoan: reserveLoanForMember,
} as const;
