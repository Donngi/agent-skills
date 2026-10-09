import { BookStatus } from "./BookStatus";

export function createDummyBookStatus(
	value: BookStatus = "onShelf",
): BookStatus {
	return BookStatus.reconstruct(value);
}
