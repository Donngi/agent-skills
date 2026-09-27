import { describe, expect, test } from "vitest";
import { z } from "zod";
import { DomainError } from "../shared-errors";
import { createDummyProjectId } from "../value-object/ProjectId.helper.test";
import {
	InvalidTaskNumberResponseError,
	TaskNumberExhaustedError,
} from "./TaskNumberIssuer";

describe("InvalidTaskNumberResponseError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 採番の操作名と ProjectId、その ZodError を渡してエラーを作ると
		const error = new InvalidTaskNumberResponseError(
			"TaskNumberIssuer.next",
			createDummyProjectId(),
			cause,
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と ProjectId が渡した値のまま残る", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 採番の操作名と ProjectId、その ZodError を渡してエラーを作ると
		const error = new InvalidTaskNumberResponseError(
			"TaskNumberIssuer.next",
			createDummyProjectId(),
			cause,
		);

		// Then: 操作名と採番しようとした ProjectId が残っている
		expect(error).toMatchObject({
			operation: "TaskNumberIssuer.next",
			projectId: "PROJ",
		});
	});

	test("正常系: 元の ZodError の issues を件数と path ごと持つ", () => {
		// Given: 番号を指す issue を1件持つ ZodError があるとき
		const cause = new z.ZodError([
			{
				code: "custom",
				message: "番号が不正です",
				path: ["number"],
				input: "1",
			},
		]);

		// When: 採番の操作名と ProjectId、その ZodError を渡してエラーを作ると
		const error = new InvalidTaskNumberResponseError(
			"TaskNumberIssuer.next",
			createDummyProjectId(),
			cause,
		);

		// Then: issues は番号を指すその1件の issue だけを持つ
		expect(error.issues).toHaveLength(1);
		expect(error.issues).toMatchObject([{ path: ["number"] }]);
	});

	test("正常系: cause に元の ZodError を持つ", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 採番の操作名と ProjectId、その ZodError を渡してエラーを作ると
		const error = new InvalidTaskNumberResponseError(
			"TaskNumberIssuer.next",
			createDummyProjectId(),
			cause,
		);

		// Then: cause がその ZodError そのものになる
		expect(error.cause).toBe(cause);
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: InvalidTaskNumberResponseError の親の class を調べると
		const parent = Object.getPrototypeOf(InvalidTaskNumberResponseError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が InvalidTaskNumberResponseError になる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 採番の操作名と ProjectId、その ZodError を渡してエラーを作ると
		const error = new InvalidTaskNumberResponseError(
			"TaskNumberIssuer.next",
			createDummyProjectId(),
			cause,
		);

		// Then: name が class 名になる
		expect(error.name).toBe("InvalidTaskNumberResponseError");
	});
});

describe("TaskNumberExhaustedError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 採番の操作名と ProjectId、保存先が返した番号を渡してエラーを作ると
		const error = new TaskNumberExhaustedError(
			"TaskNumberIssuer.next",
			createDummyProjectId(),
			1_000_000_000,
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と ProjectId と番号が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 採番の操作名と ProjectId、保存先が返した番号を渡してエラーを作ると
		const error = new TaskNumberExhaustedError(
			"TaskNumberIssuer.next",
			createDummyProjectId(),
			1_000_000_000,
		);

		// Then: 操作名と採番しようとした ProjectId と番号が残っている
		expect(error).toMatchObject({
			operation: "TaskNumberIssuer.next",
			projectId: "PROJ",
			issuedNumber: 1_000_000_000,
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: TaskNumberExhaustedError の親の class を調べると
		const parent = Object.getPrototypeOf(TaskNumberExhaustedError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が TaskNumberExhaustedError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 採番の操作名と ProjectId、保存先が返した番号を渡してエラーを作ると
		const error = new TaskNumberExhaustedError(
			"TaskNumberIssuer.next",
			createDummyProjectId(),
			1_000_000_000,
		);

		// Then: name が class 名になる
		expect(error.name).toBe("TaskNumberExhaustedError");
	});
});
