import { describe, expect, test, vi } from "vitest";
import {
	InvalidTaskNumberResponseError,
	TaskNumberExhaustedError,
} from "../../domain/domain-service/TaskNumberIssuer";
import { createDummyProjectId } from "../../domain/value-object/ProjectId.helper.test";
import { TASK_NUMBER_MAX } from "../../domain/value-object/TaskId";
import { createTaskNumberIssuerImpl } from "./TaskNumberIssuerImpl";

describe("TaskNumberIssuerImpl.next", () => {
	test("正常系: カウンタを1増やす Update を送信する", async () => {
		// Given: 最初の番号をカウンタ値として返すクライアントと ProjectId で
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({ Attributes: { seq: 1 } });
		const issuer = createTaskNumberIssuerImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId("PROJ");

		// When: 採番すると
		await issuer.next(projectId);

		// Then: 送信した Update の input がそのプロジェクトのカウンタのキーと加算の更新式を持つ
		expect(mockSend.mock.calls[0]?.[0].input).toStrictEqual({
			TableName: "tasks",
			Key: { PK: "COUNTER#PROJ", SK: "COUNTER" },
			UpdateExpression: "ADD #seq :one",
			ExpressionAttributeNames: { "#seq": "seq" },
			ExpressionAttributeValues: { ":one": 1 },
			ReturnValues: "UPDATED_NEW",
		});
	});

	test("正常系: カウンタの値が1なら番号1の TaskId を返す", async () => {
		// Given: 最初の番号をカウンタ値として返すクライアントと ProjectId で
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({ Attributes: { seq: 1 } });
		const issuer = createTaskNumberIssuerImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId("PROJ");

		// When: 採番すると
		const result = await issuer.next(projectId);

		// Then: その Project の最初の番号を持つ TaskId が返される
		expect(result).toBe("PROJ-1");
	});

	test("正常系: カウンタの値が TASK_NUMBER_MAX なら9桁の番号の TaskId を返す", async () => {
		// Given: TASK_NUMBER_MAX をカウンタ値として返すクライアントで
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({ Attributes: { seq: TASK_NUMBER_MAX } });
		const issuer = createTaskNumberIssuerImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId("PROJ");

		// When: 採番すると
		const result = await issuer.next(projectId);

		// Then: その Project の最大の番号を持つ TaskId が返される
		expect(result).toBe("PROJ-999999999");
	});

	test.for([
		{ name: "カウンタの値が文字列", response: { Attributes: { seq: "1" } } },
		{ name: "カウンタの値が配列", response: { Attributes: { seq: [1] } } },
		{ name: "Attributes が無い", response: {} },
		{ name: "カウンタの値が無い", response: { Attributes: {} } },
		{ name: "カウンタの値が0", response: { Attributes: { seq: 0 } } },
		{ name: "カウンタの値が小数", response: { Attributes: { seq: 1.5 } } },
	])("異常系: $name なら InvalidTaskNumberResponseError が発生する", async ({
		response,
	}) => {
		// Given: TaskId の生成に使えない応答を返すクライアントで
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce(response);
		const issuer = createTaskNumberIssuerImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId("PROJ");

		// When: 採番を始めると
		const pending = issuer.next(projectId);

		// Then: InvalidTaskNumberResponseError が発生する
		await expect(pending).rejects.toThrow(InvalidTaskNumberResponseError);
	});

	test("異常系: 採番結果が不正なら operation と projectId を持つ InvalidTaskNumberResponseError が発生する", async () => {
		// Given: カウンタ値を文字列で返すクライアントと ProjectId で
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({ Attributes: { seq: "1" } });
		const issuer = createTaskNumberIssuerImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId("PROJ");

		// When: 採番を試みると
		let caught: unknown;
		try {
			await issuer.next(projectId);
		} catch (error) {
			caught = error;
		}

		// Then: InvalidTaskNumberResponseError が発生し
		expect(caught).toBeInstanceOf(InvalidTaskNumberResponseError);
		// And: その例外は操作名 TaskNumberIssuer.next と対象の ProjectId を持つ
		expect(caught).toMatchObject({
			operation: "TaskNumberIssuer.next",
			projectId: "PROJ",
		});
	});

	test("異常系: カウンタの値が TASK_NUMBER_MAX より大きいなら operation と projectId と番号を持つ TaskNumberExhaustedError が発生する", async () => {
		// Given: TASK_NUMBER_MAX の1つ上をカウンタ値として返すクライアントと ProjectId で
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({ Attributes: { seq: TASK_NUMBER_MAX + 1 } });
		const issuer = createTaskNumberIssuerImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId("PROJ");

		// When: 採番を試みると
		let caught: unknown;
		try {
			await issuer.next(projectId);
		} catch (error) {
			caught = error;
		}

		// Then: TaskNumberExhaustedError が発生し
		expect(caught).toBeInstanceOf(TaskNumberExhaustedError);
		// And: その例外は操作名 TaskNumberIssuer.next と対象の ProjectId と、保存先が返した番号を持つ
		expect(caught).toMatchObject({
			operation: "TaskNumberIssuer.next",
			projectId: "PROJ",
			issuedNumber: TASK_NUMBER_MAX + 1,
		});
	});

	test("異常系: クライアントが失敗したらその例外そのものが発生する", async () => {
		// Given: 接続の例外で失敗するクライアントで
		const failure = new Error("接続できません");
		const mockSend = vi.fn();
		mockSend.mockRejectedValueOnce(failure);
		const issuer = createTaskNumberIssuerImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId("PROJ");

		// When: 採番を始めると
		const pending = issuer.next(projectId);

		// Then: そのクライアントの接続の例外そのものが発生する
		await expect(pending).rejects.toBe(failure);
	});
});
