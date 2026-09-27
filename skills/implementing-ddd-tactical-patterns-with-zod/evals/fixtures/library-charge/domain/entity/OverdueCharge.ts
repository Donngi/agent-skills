import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidClockValueError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { type ChargeId, ChargeIdSchema } from "../value-object/ChargeId";
import { MemberIdSchema } from "../value-object/MemberId";
import { type Money, MoneySchema } from "../value-object/Money";
import { TimestampSchema } from "../value-object/Timestamp";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const OverdueChargeBrand: unique symbol;

const OverdueChargeFields = {
	/** 請求の識別子。生成するときに採番する。以後変わらない。 */
	id: ChargeIdSchema,
	/** 請求先の利用者 */
	memberId: MemberIdSchema,
	/** 明細。追加した順に並ぶ。 */
	lines: z
		.array(
			z
				.strictObject({
					/** 明細の金額 */
					amount: MoneySchema,
				})
				.readonly(),
		)
		.readonly(),
	/** 割引額。生成するときに割引率から求め、明細を追加しても変わらない。 */
	discountAmount: MoneySchema,
	/** 請求額。明細の合計から割引額を引いた値。 */
	chargeAmount: MoneySchema,
	/** 作成のタイムスタンプ */
	createdAt: TimestampSchema,
	/** 備考。無ければ項目ごと無い。 */
	// optional は undefined を通し、項目が残る。exactOptional は項目ごと無いことだけを許す
	note: z
		.string()
		.min(1, { error: "備考は1文字以上です" })
		.refine((v) => v === v.trim(), {
			error: "備考の前後に空白を含めることはできません",
		})
		.exactOptional(),
};

/**
 * OverdueCharge
 * 返却期限を過ぎた利用者への延滞請求。
 */
export const OverdueChargeSchema = z
	.strictObject(OverdueChargeFields)
	.superRefine((v, ctx) => {
		// この中から例外を投げる関数を呼ばない。safeParse は例外を捕まえないので、
		// safeParse を呼んだ場所すべてで意図しない例外になる
		const total = totalOfOverdueChargeLines(v.lines);
		if (total === undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["lines"],
				message: "明細の合計は Number.MAX_SAFE_INTEGER までです",
			});
			return;
		}
		if (v.chargeAmount !== total - v.discountAmount) {
			ctx.addIssue({
				code: "custom",
				path: ["chargeAmount"],
				message: "請求額は明細の合計から割引額を引いた値です",
			});
		}
	})
	.readonly()
	.brand<typeof OverdueChargeBrand>();

export type OverdueCharge = z.output<typeof OverdueChargeSchema>;

export type OverdueChargeSchemaInput = z.input<typeof OverdueChargeSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type OverdueChargeDeps = Readonly<{
	clock: Readonly<{
		/** Unix epoch ミリ秒を返す。前に返した値より小さい値を返さない。 */
		now: () => number;
	}>;
	idGenerator: Readonly<{
		/** 小文字の UUID v4 を返す。 */
		next: () => string;
	}>;
}>;

// 割引率は完成値に無いので pick では作れない。項目のスキーマは完成値の部品を再利用する
export const CreateOverdueChargePropsSchema = z
	.strictObject({
		/** 請求先の利用者 */
		memberId: OverdueChargeFields.memberId,
		/** 明細 */
		lines: OverdueChargeFields.lines,
		/** 割引率。パーセント単位の整数で、明細の合計に掛けて割引額を求める。 */
		discountPercent: z
			.int()
			.min(0, { error: "割引率は0以上です" })
			.lt(100, { error: "割引率は100未満です" }),
		/** 備考 */
		note: OverdueChargeFields.note,
	})
	.readonly();

export type CreateOverdueChargeProps = z.output<
	typeof CreateOverdueChargePropsSchema
>;

/**
 * 割引額は明細の合計に割引率を掛けて、1円未満を切り捨てる。
 * @throws InvalidCreationParamError 渡された値が不正なとき。
 * @throws ChargeTotalOutOfRangeError 明細の合計が `Number.MAX_SAFE_INTEGER` を超えるとき。
 * @throws InvalidGeneratedChargeIdError ID ジェネレーターが識別子として不正な値を返したとき。
 * @throws InvalidClockValueError クロックがタイムスタンプとして不正な値を返したとき。
 */
function createOverdueCharge(
	props: CreateOverdueChargeProps,
	deps: OverdueChargeDeps,
): OverdueCharge {
	const input = CreateOverdueChargePropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("OverdueCharge.create", input.error);
	}
	// 入力だけで決まる導出は生成器を呼ぶ前に済ませる。
	// ここで失敗すれば、採番も作成日時の記録もしない
	const total = totalOfOverdueChargeLines(input.data.lines);
	if (total === undefined) {
		throw new ChargeTotalOutOfRangeError("OverdueCharge.create", undefined);
	}
	// 合計に割引率を掛けると Number.MAX_SAFE_INTEGER を超えうるので bigint で計算する。
	// bigint の除算は0の方向に切り捨てるので、0以上の値では1円未満の切り捨てになる
	const discountAmount = Number(
		(BigInt(total) * BigInt(input.data.discountPercent)) / 100n,
	);
	const chargeAmount = total - discountAmount;
	const id = ChargeIdSchema.safeParse(deps.idGenerator.next());
	if (!id.success) {
		throw new InvalidGeneratedChargeIdError("OverdueCharge.create", id.error);
	}
	const createdAt = TimestampSchema.safeParse(deps.clock.now());
	if (!createdAt.success) {
		throw new InvalidClockValueError("OverdueCharge.create", createdAt.error);
	}
	const result = OverdueChargeSchema.safeParse({
		id: id.data,
		memberId: input.data.memberId,
		lines: input.data.lines,
		discountAmount,
		chargeAmount,
		createdAt: createdAt.data,
		// undefined を代入するとキーが残る。satisfies では止まらないので、
		// 値があるときだけ項目を置く
		...(input.data.note !== undefined ? { note: input.data.note } : {}),
	} satisfies OverdueChargeSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("OverdueCharge.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructOverdueCharge(
	props: OverdueChargeSchemaInput,
): OverdueCharge {
	const result = OverdueChargeSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"OverdueCharge.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

function overdueChargeEqualsById(a: OverdueCharge, b: OverdueCharge): boolean {
	return a.id === b.id;
}

// -------------------------------------------------
// 業務操作
// -------------------------------------------------

export type AddOverdueChargeLineParams = Readonly<{
	/** 追加する明細の金額 */
	amount: Money;
}>;

/**
 * 割引額は変えず、請求額だけを求め直す。
 * @throws ChargeTotalOutOfRangeError 明細の合計が `Number.MAX_SAFE_INTEGER` を超えるとき。
 */
function addOverdueChargeLine(
	charge: OverdueCharge,
	params: AddOverdueChargeLineParams,
): OverdueCharge {
	const lines = [...charge.lines, { amount: params.amount }];
	const total = totalOfOverdueChargeLines(lines);
	if (total === undefined) {
		throw new ChargeTotalOutOfRangeError("OverdueCharge.addLine", charge.id);
	}
	const result = OverdueChargeSchema.safeParse({
		...charge,
		lines,
		chargeAmount: total - charge.discountAmount,
	} satisfies OverdueChargeSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("OverdueCharge.addLine", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 導出
// -------------------------------------------------

/** 明細の合計。合計が `Number.MAX_SAFE_INTEGER` を超えると undefined。 */
// 横断検証から呼ぶので、計算できなくても例外を投げない。safeParse は例外を捕まえないので、
// 投げると safeParse を呼んだ場所すべてで意図しない例外になる
function totalOfOverdueChargeLines(
	lines: readonly Readonly<{ amount: Money }>[],
): Money | undefined {
	let total = 0;
	for (const line of lines) {
		total += line.amount;
		if (!Number.isSafeInteger(total)) {
			return undefined;
		}
	}
	const result = MoneySchema.safeParse(total);
	return result.success ? result.data : undefined;
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/**
 * ID ジェネレーターが返した値が、請求の識別子として不正だった。
 * 呼び出し側には直せない。
 */
export class InvalidGeneratedChargeIdError extends DomainError {
	override readonly name: string = "InvalidGeneratedChargeIdError";

	readonly issues: readonly z.core.$ZodIssue[];

	constructor(operation: string, cause: z.ZodError) {
		super(
			operation,
			"ID ジェネレーターが返した値を請求の識別子として使うことはできません",
			{ cause },
		);
		this.issues = cause.issues;
	}
}

/** 明細の合計が `Number.MAX_SAFE_INTEGER` を超えた。 */
export class ChargeTotalOutOfRangeError extends DomainError {
	override readonly name: string = "ChargeTotalOutOfRangeError";

	/** 失敗した請求の識別子。生成の失敗では採番する前なので undefined。 */
	readonly chargeId: ChargeId | undefined;

	constructor(operation: string, chargeId: ChargeId | undefined) {
		super(operation, "明細の合計は Number.MAX_SAFE_INTEGER までです");
		this.chargeId = chargeId;
	}
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const OverdueCharge = {
	create: createOverdueCharge,
	reconstruct: reconstructOverdueCharge,
	equalsById: overdueChargeEqualsById,
	addLine: addOverdueChargeLine,
} as const;
