import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const EstimateBrand: unique symbol;

const EstimateFields = {
	/** 見積りの大きさ。0は「見積っていない」と区別できないので受け付けない。 */
	amount: z.int().positive({ error: "見積りは1以上です" }),
	/** 見積りの単位。point はストーリーポイント、hour は人時。 */
	unit: z.enum(["point", "hour"]),
};

/**
 * Estimate
 * 見積り。
 */
export const EstimateSchema = z
	.strictObject(EstimateFields)
	.readonly()
	.brand<typeof EstimateBrand>();

export type Estimate = z.output<typeof EstimateSchema>;

export type EstimateSchemaInput = z.input<typeof EstimateSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export const CreateEstimatePropsSchema = z
	.strictObject(EstimateFields)
	.pick({ amount: true, unit: true })
	.readonly();

export type CreateEstimateProps = z.output<typeof CreateEstimatePropsSchema>;

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createEstimate(props: CreateEstimateProps): Estimate {
	const input = CreateEstimatePropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("Estimate.create", input.error);
	}
	const result = EstimateSchema.safeParse(input.data);
	if (!result.success) {
		throw new FatalUnreachableError("Estimate.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructEstimate(props: EstimateSchemaInput): Estimate {
	const result = EstimateSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"Estimate.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

function estimateEquals(a: Estimate, b: Estimate): boolean {
	return a.amount === b.amount && a.unit === b.unit;
}

// -------------------------------------------------
// 演算
// -------------------------------------------------

export type AddEstimateParams = Readonly<{
	/** 足す見積り */
	addend: Estimate;
}>;

/**
 * @throws EstimateUnitMismatchError 単位が異なるとき。
 * @throws EstimateAmountOutOfRangeError 合計が `Number.MAX_SAFE_INTEGER` を超えるとき。
 */
function addEstimate(estimate: Estimate, params: AddEstimateParams): Estimate {
	if (estimate.unit !== params.addend.unit) {
		throw new EstimateUnitMismatchError(
			"Estimate.add",
			estimate.unit,
			params.addend.unit,
		);
	}
	const result = EstimateSchema.safeParse({
		amount: estimate.amount + params.addend.amount,
		unit: estimate.unit,
	} satisfies EstimateSchemaInput);
	if (!result.success) {
		throw new EstimateAmountOutOfRangeError("Estimate.add", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 単位が異なる見積りを足そうとした。 */
export class EstimateUnitMismatchError extends DomainError {
	override readonly name: string = "EstimateUnitMismatchError";

	/** 左辺の単位 */
	readonly left: Estimate["unit"];
	/** 右辺の単位 */
	readonly right: Estimate["unit"];

	constructor(
		operation: string,
		left: Estimate["unit"],
		right: Estimate["unit"],
	) {
		super(
			operation,
			`${left} の見積りと ${right} の見積りを足すことはできません`,
		);
		this.left = left;
		this.right = right;
	}
}

/** 見積りの合計が `Number.MAX_SAFE_INTEGER` を超えた。 */
export class EstimateAmountOutOfRangeError extends DomainError {
	override readonly name: string = "EstimateAmountOutOfRangeError";

	readonly issues: readonly z.core.$ZodIssue[];

	constructor(operation: string, cause: z.ZodError) {
		super(operation, "見積りの合計は Number.MAX_SAFE_INTEGER までです", {
			cause,
		});
		this.issues = cause.issues;
	}
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Estimate = {
	create: createEstimate,
	reconstruct: reconstructEstimate,
	equals: estimateEquals,
	add: addEstimate,
} as const;
