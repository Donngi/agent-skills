import type { Book } from "../domain/entity/Book";
import type { BookRepository } from "../domain/repository/BookRepository";
import type { BookId } from "../domain/value-object/BookId";
import { BookNotFoundError } from "./shared-errors";

/** 蔵書を取得する。無ければ BookNotFoundError を投げる。 */
export async function findBookOrThrow(
	bookRepository: BookRepository,
	bookId: BookId,
	operation: string,
): Promise<Book> {
	const book = await bookRepository.get(bookId);
	if (book === undefined) {
		throw new BookNotFoundError(operation, bookId);
	}
	return book;
}
