import { describe, test } from "vitest";
import { createDummyCommentId } from "../value-object/CommentId.helper.test";
import { Comment } from "./Comment";
import {
	createDummyCommentDeps,
	createDummyCreateCommentProps,
} from "./Comment.helper.test";

describe("Comment.create の型", () => {
	test("型: authorId に生の文字列を渡せない", () => {
		// Given: 制約を満たす入力と、ブランドの無い UserId の文字列と、採番とクロックがあるとき
		const base = createDummyCreateCommentProps();
		const raw = "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e";
		const deps = createDummyCommentDeps();

		// When: authorId にその生の文字列を入れて Comment.create を呼ぶと
		// Then: 型検査で拒否される
		Comment.create(
			{
				...base,
				// @ts-expect-error 生の文字列は UserId に代入できない
				authorId: raw,
			},
			deps,
		);
	});

	test("型: authorId に CommentId を渡せない", () => {
		// Given: 制約を満たす入力と、UserId と同じ UUID 形式の CommentId と、採番とクロックがあるとき
		const base = createDummyCreateCommentProps();
		const commentId = createDummyCommentId();
		const deps = createDummyCommentDeps();

		// When: authorId にその CommentId を入れて Comment.create を呼ぶと
		// Then: 型検査で拒否される
		Comment.create(
			{
				...base,
				// @ts-expect-error CommentId は UserId に代入できない
				authorId: commentId,
			},
			deps,
		);
	});
});
