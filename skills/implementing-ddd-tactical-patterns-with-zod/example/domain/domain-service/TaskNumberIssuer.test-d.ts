import { describe, test } from "vitest";
import { z } from "zod";
import { createDummyTaskId } from "../value-object/TaskId.helper.test";
import {
	InvalidTaskNumberResponseError,
	TaskNumberExhaustedError,
} from "./TaskNumberIssuer";

describe("InvalidTaskNumberResponseError の型", () => {
	test("型: projectId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列があるとき
		const raw = "PROJ";

		// When: projectId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new InvalidTaskNumberResponseError(
			"TaskNumberIssuer.next",
			// @ts-expect-error 生の文字列は ProjectId に代入できない
			raw,
			new z.ZodError([]),
		);
	});

	test("型: projectId に TaskId を渡せない", () => {
		// Given: 別種である TaskId があるとき
		const taskId = createDummyTaskId();

		// When: projectId にその TaskId を渡すと
		// Then: 型検査で拒否される
		void new InvalidTaskNumberResponseError(
			"TaskNumberIssuer.next",
			// @ts-expect-error TaskId は ProjectId に代入できない
			taskId,
			new z.ZodError([]),
		);
	});
});

describe("TaskNumberExhaustedError の型", () => {
	test("型: projectId に生の文字列を渡せない", () => {
		// Given: ブランドの無い識別子の文字列があるとき
		const raw = "PROJ";

		// When: projectId にその生の文字列を渡すと
		// Then: 型検査で拒否される
		void new TaskNumberExhaustedError(
			"TaskNumberIssuer.next",
			// @ts-expect-error 生の文字列は ProjectId に代入できない
			raw,
			1_000_000_000,
		);
	});

	test("型: projectId に TaskId を渡せない", () => {
		// Given: 別種である TaskId があるとき
		const taskId = createDummyTaskId();

		// When: projectId にその TaskId を渡すと
		// Then: 型検査で拒否される
		void new TaskNumberExhaustedError(
			"TaskNumberIssuer.next",
			// @ts-expect-error TaskId は ProjectId に代入できない
			taskId,
			1_000_000_000,
		);
	});
});
