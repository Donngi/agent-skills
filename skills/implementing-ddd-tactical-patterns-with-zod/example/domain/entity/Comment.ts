import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidClockValueError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { CommentIdSchema } from "../value-object/CommentId";
import { TimestampSchema } from "../value-object/Timestamp";
import { UserIdSchema } from "../value-object/UserId";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const CommentBrand: unique symbol;

const CommentFields = {
	/** コメントの識別子 */
	id: CommentIdSchema,
	/** 著者 */
	authorId: UserIdSchema,
	/** 本文 */
	body: z
		.string()
		.min(1, { error: "コメントの本文は1文字以上です" })
		.max(1000, { error: "コメントの本文は1000文字までです" })
		.refine((v) => v === v.trim(), {
			error: "コメントの本文の前後に空白を含めることはできません",
		}),
	/** 投稿のタイムスタンプ */
	postedAt: TimestampSchema,
};

/**
 * Comment
 * タスクに追加されたコメント。
 */
export const CommentSchema = z
	.strictObject(CommentFields)
	.readonly()
	.brand<typeof CommentBrand>();

export type Comment = z.output<typeof CommentSchema>;

export type CommentSchemaInput = z.input<typeof CommentSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type CommentDeps = Readonly<{
	clock: Readonly<{
		/** Unix epoch ミリ秒を返す。前に返した値より小さい値を返さない。 */
		now: () => number;
	}>;
	idGenerator: Readonly<{
		/** 小文字の UUID v4 を返す。 */
		next: () => string;
	}>;
}>;

export const CreateCommentPropsSchema = z
	.strictObject(CommentFields)
	.pick({
		authorId: true,
		body: true,
	})
	.readonly();

export type CreateCommentProps = z.output<typeof CreateCommentPropsSchema>;

/**
 * 集約の外からは呼ばない。コメントは `Task.addComment` で追加する。
 * @throws InvalidCreationParamError 渡された値が不正なとき。
 * @throws InvalidGeneratedCommentIdError ID ジェネレーターが識別子として不正な値を返したとき。
 * @throws InvalidClockValueError クロックがタイムスタンプとして不正な値を返したとき。
 */
function createComment(props: CreateCommentProps, deps: CommentDeps): Comment {
	const input = CreateCommentPropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("Comment.create", input.error);
	}
	const id = CommentIdSchema.safeParse(deps.idGenerator.next());
	if (!id.success) {
		throw new InvalidGeneratedCommentIdError("Comment.create", id.error);
	}
	const postedAt = TimestampSchema.safeParse(deps.clock.now());
	if (!postedAt.success) {
		throw new InvalidClockValueError("Comment.create", postedAt.error);
	}
	const result = CommentSchema.safeParse({
		id: id.data,
		authorId: input.data.authorId,
		body: input.data.body,
		postedAt: postedAt.data,
	} satisfies CommentSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Comment.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructComment(props: CommentSchemaInput): Comment {
	const result = CommentSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError("Comment.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

/** 同じタスクに属するコメントどうしだけを比べる。識別子は集約の中でしか一意ではない。 */
function commentEqualsById(a: Comment, b: Comment): boolean {
	return a.id === b.id;
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/**
 * ID ジェネレーターが返した値が、コメントの識別子として不正だった。
 * 呼び出し側には直せない。
 */
export class InvalidGeneratedCommentIdError extends DomainError {
	override readonly name: string = "InvalidGeneratedCommentIdError";

	readonly issues: readonly z.core.$ZodIssue[];

	constructor(operation: string, cause: z.ZodError) {
		super(
			operation,
			"ID ジェネレーターが返した値をコメントの識別子として使うことはできません",
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

export const Comment = {
	create: createComment,
	reconstruct: reconstructComment,
	equalsById: commentEqualsById,
} as const;
