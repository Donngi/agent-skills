import { Book } from "../domain/entity/Book";
import type { BookRepository } from "../domain/repository/BookRepository";
import {
	FatalUnreachableError,
	InvalidCreationParamError,
} from "../domain/shared-errors";
import type { BookId } from "../domain/value-object/BookId";
import type { MemberId } from "../domain/value-object/MemberId";
import { findBookOrThrow } from "./book-steps";
import { InvalidInputError } from "./shared-errors";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

export type AddBookReviewUseCaseProps = Readonly<{
	/** 書評を足す蔵書の ID */
	bookId: BookId;
	/** 書いた利用者の会員番号 */
	reviewerId: MemberId;
	/** 本文 */
	body: string;
}>;

export type AddBookReviewUseCaseResult = Readonly<{
	/** 足した書評の ID */
	reviewId: string;
}>;

/**
 * AddBookReviewUseCase
 * 蔵書に書評を足す。
 */
export type AddBookReviewUseCase = Readonly<{
	/**
	 * 同じ蔵書を並行して更新すると、後から保存したほうが残る（BookRepository.put）。
	 * @throws BookNotFoundError 蔵書が無いとき。
	 * @throws InvalidInputError 書いた利用者か本文が不正なとき。cause は InvalidCreationParamError。
	 */
	run: (
		props: AddBookReviewUseCaseProps,
	) => Promise<AddBookReviewUseCaseResult>;
}>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export type AddBookReviewUseCaseDeps = Readonly<{
	bookRepository: BookRepository;
	idGenerator: Readonly<{
		/** 小文字の UUID v4 を返す。 */
		next: () => string;
	}>;
}>;

export function createAddBookReviewUseCase(
	deps: AddBookReviewUseCaseDeps,
): AddBookReviewUseCase {
	return {
		run: async (props) => {
			// 蔵書を取得する
			const book = await findBookOrThrow(
				deps.bookRepository,
				props.bookId,
				"AddBookReviewUseCase.run",
			);

			// 書評を足す
			let reviewed: Book;
			try {
				reviewed = Book.addReview(
					book,
					{ reviewerId: props.reviewerId, body: props.body },
					{ clock: { now: () => Date.now() }, idGenerator: deps.idGenerator },
				);
			} catch (error) {
				if (error instanceof InvalidCreationParamError) {
					throw new InvalidInputError("AddBookReviewUseCase.run", {
						cause: error,
					});
				}
				throw error;
			}
			// 足した書評は先頭にある（Book.addReview は新しい書評を先頭に置く）
			const added = reviewed.reviews[0];
			if (added === undefined) {
				throw new FatalUnreachableError("AddBookReviewUseCase.run");
			}

			// 保存する
			await deps.bookRepository.put(reviewed);

			return { reviewId: added.id };
		},
	};
}
