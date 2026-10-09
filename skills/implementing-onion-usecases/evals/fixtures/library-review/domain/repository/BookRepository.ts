import type { Book } from "../entity/Book";
import type { BookId } from "../value-object/BookId";

// -------------------------------------------------
// 型定義
// -------------------------------------------------

/**
 * BookRepository
 * 蔵書の永続層への入出力インターフェース。
 */
export type BookRepository = Readonly<{
	/**
	 * 識別子で1件取る。無ければ undefined。
	 * @throws InvalidReconstructParamError 保存されている値が壊れているとき。
	 */
	get: (id: BookId) => Promise<Book | undefined>;
	/**
	 * 1件保存する。無ければ作り、あれば置き換える。
	 * 同時更新は検出しない。同じ蔵書を並行して更新すると、後から保存したほうが残る。
	 */
	put: (book: Book) => Promise<void>;
}>;
