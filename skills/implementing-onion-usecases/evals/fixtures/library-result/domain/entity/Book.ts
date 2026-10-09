import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { type BookId, BookIdSchema } from "../value-object/BookId";
import { type BookStatus, BookStatusSchema } from "../value-object/BookStatus";
import type { MemberId } from "../value-object/MemberId";
import type { ReviewId } from "../value-object/ReviewId";
import { Review, type ReviewDeps, ReviewSchema } from "./Review";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const BookBrand: unique symbol;

const BookFields = {
	/** 蔵書の識別子 */
	id: BookIdSchema,
	/** 書名 */
	title: z
		.string()
		.min(1, { error: "書名は1文字以上です" })
		.max(200, { error: "書名は200文字までです" })
		.refine((v) => v === v.trim(), {
			error: "書名の前後に空白を含めることはできません",
		}),
	/** 蔵書の状態 */
	status: BookStatusSchema,
	/** 寄せられた書評。新しいものから順に並ぶ。 */
	reviews: z
		.array(ReviewSchema)
		.refine((rs) => new Set(rs.map((r) => r.id)).size === rs.length, {
			error: "書評 ID は一意です",
		})
		.refine(
			(rs) =>
				rs.every((r, i) => {
					const prev = rs[i - 1];
					return prev === undefined || prev.postedAt >= r.postedAt;
				}),
			{ error: "書評は新しいものから順に並びます" },
		)
		.readonly(),
};

/**
 * Book
 * 図書館が所蔵する1冊の本。
 */
export const BookSchema = z
	.strictObject(BookFields)
	.readonly()
	.brand<typeof BookBrand>();

export type Book = z.output<typeof BookSchema>;

export type BookSchemaInput = z.input<typeof BookSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export const CreateBookPropsSchema = z
	.strictObject(BookFields)
	.pick({
		id: true,
		title: true,
	})
	.readonly();

export type CreateBookProps = z.output<typeof CreateBookPropsSchema>;

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createBook(props: CreateBookProps): Book {
	const input = CreateBookPropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("Book.create", input.error);
	}
	const result = BookSchema.safeParse({
		id: input.data.id,
		title: input.data.title,
		status: "onShelf",
		reviews: [],
	} satisfies BookSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Book.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructBook(props: BookSchemaInput): Book {
	const result = BookSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError("Book.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

function bookEqualsById(a: Book, b: Book): boolean {
	return a.id === b.id;
}

// -------------------------------------------------
// 業務操作
// -------------------------------------------------

/**
 * 貸出中の蔵書を棚に戻す。
 * @throws BookStatusMismatchError 貸出中でないとき。
 */
function returnBookToShelf(book: Book): Book {
	if (book.status !== "onLoan") {
		throw new BookStatusMismatchError(
			"Book.returnToShelf",
			book.id,
			"onLoan",
			book.status,
		);
	}
	const result = BookSchema.safeParse({
		...book,
		status: "onShelf",
	} satisfies BookSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Book.returnToShelf", result.error);
	}
	return result.data;
}

export type AddBookReviewParams = Readonly<{
	/** 書いた利用者 */
	reviewerId: MemberId;
	/** 本文 */
	body: string;
}>;

/**
 * どの状態でも追加できる。新しい書評は先頭に置く。書評の識別子と投稿のタイムスタンプは deps から決まる。
 * @throws InvalidCreationParamError 書いた利用者か本文が不正なとき。operation は Review.create。
 * @throws InvalidGeneratedReviewIdError ID ジェネレーターが識別子として不正な値を返したとき。operation は Review.create。
 * @throws InvalidClockValueError クロックがタイムスタンプとして不正な値を返したとき。operation は Review.create。
 * @throws DuplicateReviewError 採番した識別子が、すでに追加されている書評と重複したとき。
 * @throws ReviewPostedBeforeLatestReviewError クロックが最新の書評より前のタイムスタンプを返したとき。
 */
function addBookReview(
	book: Book,
	params: AddBookReviewParams,
	deps: ReviewDeps,
): Book {
	const review = Review.create(
		{ reviewerId: params.reviewerId, body: params.body },
		deps,
	);
	if (book.reviews.some((r) => r.id === review.id)) {
		throw new DuplicateReviewError("Book.addReview", book.id, review.id);
	}
	const latest = book.reviews[0];
	if (latest !== undefined && review.postedAt < latest.postedAt) {
		throw new ReviewPostedBeforeLatestReviewError("Book.addReview", book.id);
	}
	const result = BookSchema.safeParse({
		...book,
		reviews: [review, ...book.reviews],
	} satisfies BookSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("Book.addReview", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** その操作を許さない状態の蔵書に対して処理を実行しようとした。 */
export class BookStatusMismatchError extends DomainError {
	override readonly name: string = "BookStatusMismatchError";

	/** 失敗した蔵書の識別子 */
	readonly bookId: BookId;
	/** 操作が求めた状態 */
	readonly expected: BookStatus;
	/** 実際の状態 */
	readonly actual: BookStatus;

	constructor(
		operation: string,
		bookId: BookId,
		expected: BookStatus,
		actual: BookStatus,
	) {
		super(
			operation,
			`状態が ${expected} の蔵書だけに実行できます。実際の状態は ${actual} です`,
		);
		this.bookId = bookId;
		this.expected = expected;
		this.actual = actual;
	}
}

/** 追加する書評として採番した識別子が、すでに追加されている書評と重複した。 */
export class DuplicateReviewError extends DomainError {
	override readonly name: string = "DuplicateReviewError";

	/** 失敗した蔵書の識別子 */
	readonly bookId: BookId;
	/** 重複した書評の識別子 */
	readonly reviewId: ReviewId;

	constructor(operation: string, bookId: BookId, reviewId: ReviewId) {
		super(operation, "書評 ID は蔵書の中で一意です");
		this.bookId = bookId;
		this.reviewId = reviewId;
	}
}

/** 書評の投稿のタイムスタンプとしてクロックが返した値が、最新の書評より前だった。 */
export class ReviewPostedBeforeLatestReviewError extends DomainError {
	override readonly name: string = "ReviewPostedBeforeLatestReviewError";

	/** 失敗した蔵書の識別子 */
	readonly bookId: BookId;

	constructor(operation: string, bookId: BookId) {
		super(operation, "書評の投稿を最新の書評より前にすることはできません");
		this.bookId = bookId;
	}
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Book = {
	create: createBook,
	reconstruct: reconstructBook,
	equalsById: bookEqualsById,
	returnToShelf: returnBookToShelf,
	addReview: addBookReview,
} as const;
