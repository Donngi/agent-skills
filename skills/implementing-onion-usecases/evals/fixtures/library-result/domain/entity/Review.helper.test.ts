import { Review, type ReviewDeps, type ReviewSchemaInput } from "./Review";

export function createDummyReview(
	params: Partial<ReviewSchemaInput> = {},
): Review {
	return Review.reconstruct({
		id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
		reviewerId: "M-0001",
		body: "ダミーの書評",
		postedAt: 1_500,
		...params,
	});
}

export function createDummyReviewDeps(
	params: Partial<ReviewDeps> = {},
): ReviewDeps {
	return {
		clock: { now: () => 1_500 },
		idGenerator: { next: () => "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f" },
		...params,
	};
}
