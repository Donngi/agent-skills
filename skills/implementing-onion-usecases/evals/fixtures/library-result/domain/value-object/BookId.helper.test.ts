import { BookId } from "./BookId";

export function createDummyBookId(
	value = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
): BookId {
	return BookId.reconstruct(value);
}
