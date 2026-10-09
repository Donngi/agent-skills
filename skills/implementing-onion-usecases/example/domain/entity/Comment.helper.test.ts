import { createDummyUserId } from "../value-object/UserId.helper.test";
import {
	Comment,
	type CommentDeps,
	type CommentSchemaInput,
	type CreateCommentProps,
} from "./Comment";

export function createDummyComment(
	params: Partial<CommentSchemaInput> = {},
): Comment {
	return Comment.reconstruct({
		id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
		authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
		body: "ダミーのコメント",
		postedAt: 1_500,
		...params,
	});
}

export function createDummyCreateCommentProps(
	params: Partial<CreateCommentProps> = {},
): CreateCommentProps {
	return {
		authorId: createDummyUserId(),
		body: "ダミーのコメント",
		...params,
	};
}

export function createDummyCommentDeps(
	params: Partial<CommentDeps> = {},
): CommentDeps {
	return {
		clock: { now: () => 1_500 },
		idGenerator: { next: () => "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f" },
		...params,
	};
}
