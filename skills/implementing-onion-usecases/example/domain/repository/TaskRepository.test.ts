import { describe, expect, test } from "vitest";
import { DomainError } from "../shared-errors";
import { createDummyProjectId } from "../value-object/ProjectId.helper.test";
import { ListLimitOutOfRangeError } from "./TaskRepository";

describe("ListLimitOutOfRangeError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 一覧を取る操作名と ProjectId と件数でエラーを作ると
		const error = new ListLimitOutOfRangeError(
			"TaskRepository.listByProject",
			createDummyProjectId("PROJ"),
			-1,
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と ProjectId と件数が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 一覧を取る操作名と ProjectId と件数でエラーを作ると
		const error = new ListLimitOutOfRangeError(
			"TaskRepository.listByProject",
			createDummyProjectId("PROJ"),
			-1,
		);

		// Then: 操作名と ProjectId と件数が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "TaskRepository.listByProject",
			projectId: "PROJ",
			limit: -1,
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: ListLimitOutOfRangeError の親の class を調べると
		const parent = Object.getPrototypeOf(ListLimitOutOfRangeError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が ListLimitOutOfRangeError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 一覧を取る操作名と ProjectId と件数でエラーを作ると
		const error = new ListLimitOutOfRangeError(
			"TaskRepository.listByProject",
			createDummyProjectId("PROJ"),
			-1,
		);

		// Then: name が class 名になる
		expect(error.name).toBe("ListLimitOutOfRangeError");
	});
});
