import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidClockValueError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { MemberIdSchema } from "../value-object/MemberId";
import { ReviewIdSchema } from "../value-object/ReviewId";
import { TimestampSchema } from "../value-object/Timestamp";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const ReviewBrand: unique symbol;

const ReviewFields = {
	/** 書評の識別子 */
	id: ReviewIdSchema,
	/** 書いた利用者 */
	reviewerId: MemberIdSchema,
	/** 本文 */
	body: z
		.string()
		.min(1, { error: "書評の本文は1文字以上です" })
		.max(1000, { error: "書評の本文は1000文字までです" })
		.refine((v) => v === v.trim(), {
			error: "書評の本文の前後に空白を含めることはできません",
		}),
	/** 投稿のタイムスタンプ */
	postedAt: TimestampSchema,
};

/**
 * Review
 * 蔵書に寄せられた書評。
 */
export const ReviewSchema = z
	.strictObject(ReviewFields)
	.readonly()
	.brand<typeof ReviewBrand>();

export type Review = z.output<typeof ReviewSchema>;

export type ReviewSchemaInput = z.input<typeof ReviewSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type ReviewDeps = Readonly<{
	clock: Readonly<{
		/** Unix epoch ミリ秒を返す。前に返した値より小さい値を返さない。 */
		now: () => number;
	}>;
	idGenerator: Readonly<{
		/** 小文字の UUID v4 を返す。 */
		next: () => string;
	}>;
}>;

export const CreateReviewPropsSchema = z
	.strictObject(ReviewFields)
	.pick({
		reviewerId: true,
		body: true,
	})
	.readonly();

export type CreateReviewProps = z.output<typeof CreateReviewPropsSchema>;

/**
 * 集約の外からは呼ばない。書評は `Book.addReview` で追加する。
 * @throws InvalidCreationParamError 渡された値が不正なとき。
 * @throws InvalidGeneratedReviewIdError ID ジェネレーターが識別子として不正な値を返したとき。
 * @throws InvalidClockValueError クロックがタイムスタンプとして不正な値を返したとき。
 */
function createReview(props: CreateReviewProps, deps: ReviewDeps): Review {
	const input = CreateReviewPropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("Review.create", input.error);
	}
	const id = ReviewIdSchema.safeParse(deps.idGenerator.next());
	if (!id.success) {
		throw new InvalidGeneratedReviewIdError("Review.create", id.error);
	}
	const postedAt = TimestampSchema.safeParse(deps.clock.now());
	if (!postedAt.success) {
		throw new InvalidClockValueError("Review.create", postedAt.error);
	}
	const result = ReviewSchema.safeParse({
		id: id.data,
		reviewerId: input.data.reviewerId,
		body: input.data.body,
		postedAt: postedAt.data,
	} satisfies ReviewSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Review.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructReview(props: ReviewSchemaInput): Review {
	const result = ReviewSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError("Review.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

/** 同じ蔵書に属する書評どうしだけを比べる。識別子は集約の中でしか一意ではない。 */
function reviewEqualsById(a: Review, b: Review): boolean {
	return a.id === b.id;
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/**
 * ID ジェネレーターが返した値が、書評の識別子として不正だった。
 * 呼び出し側には直せない。
 */
export class InvalidGeneratedReviewIdError extends DomainError {
	override readonly name: string = "InvalidGeneratedReviewIdError";

	readonly issues: readonly z.core.$ZodIssue[];

	constructor(operation: string, cause: z.ZodError) {
		super(
			operation,
			"ID ジェネレーターが返した値を書評の識別子として使うことはできません",
			{
				cause,
			},
		);
		this.issues = cause.issues;
	}
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Review = {
	create: createReview,
	reconstruct: reconstructReview,
	equalsById: reviewEqualsById,
} as const;
