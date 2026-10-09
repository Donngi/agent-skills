import { ReviewId } from "./ReviewId";

export function createDummyReviewId(
	value = "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
): ReviewId {
	return ReviewId.reconstruct(value);
}
