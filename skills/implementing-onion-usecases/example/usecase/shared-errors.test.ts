import { describe, expect, test } from "vitest";
import { z } from "zod";
import { InvalidCreationParamError } from "../domain/shared-errors";
import { createDummyTaskId } from "../domain/value-object/TaskId.helper.test";
import {
	InvalidInputError,
	TaskNotFoundError,
	UseCaseError,
} from "./shared-errors";

describe("TaskNotFoundError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と TaskId でエラーを作ると
		const error = new TaskNotFoundError(
			"StartTaskUseCase.run",
			createDummyTaskId("PROJ-123"),
		);

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と TaskId が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と TaskId でエラーを作ると
		const error = new TaskNotFoundError(
			"StartTaskUseCase.run",
			createDummyTaskId("PROJ-123"),
		);

		// Then: 操作名と TaskId が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "StartTaskUseCase.run",
			taskId: "PROJ-123",
		});
	});

	test("正常系: name が TaskNotFoundError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 操作名と TaskId でエラーを作ると
		const error = new TaskNotFoundError(
			"StartTaskUseCase.run",
			createDummyTaskId("PROJ-123"),
		);

		// Then: name が class 名と同じになる
		expect(error.name).toBe("TaskNotFoundError");
	});
});

describe("InvalidInputError", () => {
	test("正常系: UseCaseError かつ Error のインスタンスになる", () => {
		// Given: 入力の形の不正を表すドメインのエラーがあるとき
		const cause = new InvalidCreationParamError(
			"Task.create",
			new z.ZodError([]),
		);

		// When: 操作名と cause でエラーを作ると
		const error = new InvalidInputError("CreateTaskUseCase.run", { cause });

		// Then: ユースケースのエラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(UseCaseError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と cause が渡した値のまま残る", () => {
		// Given: 入力の形の不正を表すドメインのエラーがあるとき
		const cause = new InvalidCreationParamError(
			"Task.create",
			new z.ZodError([]),
		);

		// When: 操作名と cause でエラーを作ると
		const error = new InvalidInputError("CreateTaskUseCase.run", { cause });

		// Then: 操作名が渡した値のまま残り、cause は渡したエラーそのものになる
		expect(error).toMatchObject({ operation: "CreateTaskUseCase.run" });
		expect(error.cause).toBe(cause);
	});

	test("正常系: name が InvalidInputError になる", () => {
		// Given: 入力の形の不正を表すドメインのエラーがあるとき
		const cause = new InvalidCreationParamError(
			"Task.create",
			new z.ZodError([]),
		);

		// When: 操作名と cause でエラーを作ると
		const error = new InvalidInputError("CreateTaskUseCase.run", { cause });

		// Then: name が class 名と同じになる
		expect(error.name).toBe("InvalidInputError");
	});
});
