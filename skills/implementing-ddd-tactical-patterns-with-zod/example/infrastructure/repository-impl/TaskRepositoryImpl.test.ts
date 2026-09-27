import { describe, expect, test, vi } from "vitest";
import {
	createDummyBacklogTask,
	createDummyDoneTask,
	createDummyInProgressTask,
} from "../../domain/entity/Task.helper.test";
import { ListLimitOutOfRangeError } from "../../domain/repository/TaskRepository";
import { InvalidReconstructParamError } from "../../domain/shared-errors";
import { createDummyProjectId } from "../../domain/value-object/ProjectId.helper.test";
import { createDummyTaskId } from "../../domain/value-object/TaskId.helper.test";
import { createTaskRepositoryImpl } from "./TaskRepositoryImpl";

describe("TaskRepositoryImpl.get", () => {
	test("正常系: 受け取った TaskId から保存キーを組んで Get を送信する", async () => {
		// Given: 空の応答を返すクライアントと TaskId で
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const id = createDummyTaskId("PROJ-1");

		// When: Task を取得すると
		await repository.get(id);

		// Then: 送信したコマンドがテーブル名と、その TaskId の保存キーを持つ
		expect(mockSend.mock.calls[0]?.[0].input).toStrictEqual({
			TableName: "tasks",
			Key: { PK: "PROJECT#PROJ", SK: "TASK#PROJ-000000001" },
		});
	});

	test("正常系: 応答に Item が無いなら undefined を返す", async () => {
		// Given: Item の無い応答を返すクライアントで
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const id = createDummyTaskId();

		// When: Task を取得すると
		const result = await repository.get(id);

		// Then: undefined が返される
		expect(result).toBeUndefined();
	});

	test.for([
		{
			name: "backlog",
			item: {
				PK: "PROJECT#PROJ",
				SK: "TASK#PROJ-000000001",
				id: "PROJ-1",
				title: "ダミーの表題",
				priority: "medium",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "backlog",
			},
			expected: createDummyBacklogTask(),
		},
		{
			name: "inProgress",
			item: {
				PK: "PROJECT#PROJ",
				SK: "TASK#PROJ-000000001",
				id: "PROJ-1",
				title: "ダミーの表題",
				priority: "medium",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "inProgress",
				assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
				startedAt: 2_000,
			},
			expected: createDummyInProgressTask(),
		},
		{
			name: "done",
			item: {
				PK: "PROJECT#PROJ",
				SK: "TASK#PROJ-000000001",
				id: "PROJ-1",
				title: "ダミーの表題",
				priority: "medium",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "done",
				assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
				workPeriod: { startedAt: 2_000, completedAt: 3_000 },
			},
			expected: createDummyDoneTask(),
		},
	])("正常系: 応答の Item の $name の DTO を対応する Task にして返す", async ({
		item,
		expected,
	}) => {
		// Given: ケースごとの状態に対応する DTO を返すクライアントで
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({ Item: item });
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const id = createDummyTaskId();

		// When: Task を取得すると
		const result = await repository.get(id);

		// Then: そのクライアントが返す DTO に対応する Task と一致する
		expect(result).toStrictEqual(expected);
	});

	test("異常系: 応答の Item の表題が空なら InvalidReconstructParamError が発生する", async () => {
		// Given: 表題が空の DTO を返すクライアントで
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({
			Item: {
				PK: "PROJECT#PROJ",
				SK: "TASK#PROJ-000000001",
				id: "PROJ-1",
				title: "",
				priority: "medium",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "backlog",
			},
		});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const id = createDummyTaskId();

		// When: Task を取得すると
		const pending = repository.get(id);

		// Then: InvalidReconstructParamError が発生する
		await expect(pending).rejects.toThrow(InvalidReconstructParamError);
	});

	test("異常系: クライアントが失敗したらその例外そのものが発生する", async () => {
		// Given: 例外で失敗するクライアントで
		const failure = new Error("保存先に接続できない");
		const mockSend = vi.fn();
		mockSend.mockRejectedValueOnce(failure);
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const id = createDummyTaskId();

		// When: Task を取得すると
		const pending = repository.get(id);

		// Then: そのクライアントの例外そのものが発生する
		await expect(pending).rejects.toBe(failure);
	});
});

describe("TaskRepositoryImpl.listByProject", () => {
	test("正常系: 番号の大きい順に上限件数を取る Query を送信する", async () => {
		// Given: 空の応答を返すクライアントと ProjectId で
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId("PROJ");

		// When: Project の Task を指定した上限件数まで取得すると
		await repository.listByProject(projectId, 20);

		// Then: 送信したコマンドがその Project のパーティションキー・上限件数・降順指定を持つ
		expect(mockSend.mock.calls[0]?.[0].input).toStrictEqual({
			TableName: "tasks",
			KeyConditionExpression: "PK = :pk",
			ExpressionAttributeValues: { ":pk": "PROJECT#PROJ" },
			Limit: 20,
			ScanIndexForward: false,
		});
	});

	test("正常系: 応答に Items が無いなら空配列を返す", async () => {
		// Given: Items の無い応答を返すクライアントで
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId();

		// When: Project の Task を取得すると
		const result = await repository.listByProject(projectId, 20);

		// Then: 空配列と一致する
		expect(result).toStrictEqual([]);
	});

	test("正常系: 応答の Items の並びを変えずに Task を返す", async () => {
		// Given: 番号順ではない並びの DTO を返すクライアントで
		const first = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000001",
			id: "PROJ-1",
			title: "ダミーの表題",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [],
			status: "backlog",
		};
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({
			Items: [
				{ ...first, id: "PROJ-2", SK: "TASK#PROJ-000000002" },
				{ ...first, id: "PROJ-3", SK: "TASK#PROJ-000000003" },
				first,
			],
		});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId();

		// When: Project の Task を取得すると
		const result = await repository.listByProject(projectId, 20);

		// Then: その応答と同じ並びの Task と一致する
		const expected = [
			createDummyBacklogTask({ id: "PROJ-2" }),
			createDummyBacklogTask({ id: "PROJ-3" }),
			createDummyBacklogTask({ id: "PROJ-1" }),
		];
		expect(result).toStrictEqual(expected);
	});

	test("正常系: 応答が続きのキーを返したら、そのキーから続きを取る Query を送信する", async () => {
		// Given: 1回目は1件と続きのキーを、2回目は1件だけを返すクライアントがあるとき
		const item = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000002",
			id: "PROJ-2",
			title: "ダミーの表題",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [],
			status: "backlog",
		};
		const lastKey = { PK: "PROJECT#PROJ", SK: "TASK#PROJ-000000002" };
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({ Items: [item], LastEvaluatedKey: lastKey });
		mockSend.mockResolvedValueOnce({
			Items: [{ ...item, id: "PROJ-1", SK: "TASK#PROJ-000000001" }],
		});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId("PROJ");

		// When: Project の Task を上限20件で取得すると
		await repository.listByProject(projectId, 20);

		// Then: 2回目のコマンドが、残りの件数と1回目の続きのキーを持つ
		expect(mockSend.mock.calls[1]?.[0].input).toStrictEqual({
			TableName: "tasks",
			KeyConditionExpression: "PK = :pk",
			ExpressionAttributeValues: { ":pk": "PROJECT#PROJ" },
			Limit: 19,
			ScanIndexForward: false,
			ExclusiveStartKey: lastKey,
		});
	});

	test("正常系: 続きのキーが無くなるまで取った Task を、取った順につなげて返す", async () => {
		// Given: 1回目は PROJ-3 と続きのキーを、2回目は PROJ-2 と PROJ-1 を返すクライアントがあるとき
		const item = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000003",
			id: "PROJ-3",
			title: "ダミーの表題",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [],
			status: "backlog",
		};
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({
			Items: [item],
			LastEvaluatedKey: { PK: "PROJECT#PROJ", SK: "TASK#PROJ-000000003" },
		});
		mockSend.mockResolvedValueOnce({
			Items: [
				{ ...item, id: "PROJ-2", SK: "TASK#PROJ-000000002" },
				{ ...item, id: "PROJ-1", SK: "TASK#PROJ-000000001" },
			],
		});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId();

		// When: Project の Task を上限20件で取得すると
		const result = await repository.listByProject(projectId, 20);

		// Then: 2回分の Task を取った順につなげた3件と一致する
		const expected = [
			createDummyBacklogTask({ id: "PROJ-3" }),
			createDummyBacklogTask({ id: "PROJ-2" }),
			createDummyBacklogTask({ id: "PROJ-1" }),
		];
		expect(result).toStrictEqual(expected);
	});

	test("正常系: 上限件数に達したら、続きのキーがあっても次の Query を送信しない", async () => {
		// Given: 上限と同じ2件と続きのキーを返すクライアントがあるとき
		const item = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000003",
			id: "PROJ-3",
			title: "ダミーの表題",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [],
			status: "backlog",
		};
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({
			Items: [item, { ...item, id: "PROJ-2", SK: "TASK#PROJ-000000002" }],
			LastEvaluatedKey: { PK: "PROJECT#PROJ", SK: "TASK#PROJ-000000002" },
		});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId();

		// When: Project の Task を上限2件で取得すると
		await repository.listByProject(projectId, 2);

		// Then: Query は1回だけ送信される
		expect(mockSend).toHaveBeenCalledTimes(1);
	});

	test("正常系: 件数が0なら空配列を返す", async () => {
		// Given: Task を1件持つ応答を返すクライアントがあるとき
		const item = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000001",
			id: "PROJ-1",
			title: "ダミーの表題",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [],
			status: "backlog",
		};
		const mockSend = vi.fn();
		mockSend.mockResolvedValue({ Items: [item] });
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId();

		// When: Project の Task を0件で取得すると
		const result = await repository.listByProject(projectId, 0);

		// Then: 空配列になる
		expect(result).toStrictEqual([]);
	});

	test("正常系: 件数が0なら Query を送信しない", async () => {
		// Given: 呼び出しを記録するクライアントがあるとき
		const mockSend = vi.fn();
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId();

		// When: Project の Task を0件で取得すると
		await repository.listByProject(projectId, 0);

		// Then: Query は送信されない
		expect(mockSend).not.toHaveBeenCalled();
	});

	test("正常系: 件数が1なら上限1件の Query を送信する", async () => {
		// Given: 空の応答を返すクライアントがあるとき
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId();

		// When: Project の Task を1件で取得すると
		await repository.listByProject(projectId, 1);

		// Then: 送信したコマンドの上限件数が1になる
		expect(mockSend.mock.calls[0]?.[0].input.Limit).toBe(1);
	});

	test.for([
		{ name: "負", limit: -1 },
		{ name: "整数でない", limit: 1.5 },
		{ name: "NaN", limit: Number.NaN },
	])("異常系: 件数が $name なら ListLimitOutOfRangeError が発生する", async ({
		limit,
	}) => {
		// Given: 呼び出しを記録するクライアントがあるとき
		const mockSend = vi.fn();
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId();

		// When: Project の Task をその件数で取得しようとすると
		const pending = repository.listByProject(projectId, limit);

		// Then: ListLimitOutOfRangeError が発生する
		await expect(pending).rejects.toThrow(ListLimitOutOfRangeError);
	});

	test("異常系: 件数が負なら Query を送信しない", async () => {
		// Given: 呼び出しを記録するクライアントがあるとき
		const mockSend = vi.fn();
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId();

		// When: Project の Task を負の件数で取得しようとすると
		await repository.listByProject(projectId, -1).catch(() => undefined);

		// Then: Query は送信されない
		expect(mockSend).not.toHaveBeenCalled();
	});

	test("異常系: 応答の Items に表題が空の DTO があるなら InvalidReconstructParamError が発生する", async () => {
		// Given: 表題が空の DTO を含む応答を返すクライアントで
		const valid = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000001",
			id: "PROJ-1",
			title: "ダミーの表題",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [],
			status: "backlog",
		};
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({
			Items: [
				valid,
				{ ...valid, id: "PROJ-2", SK: "TASK#PROJ-000000002", title: "" },
			],
		});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId();

		// When: Project の Task を取得すると
		const pending = repository.listByProject(projectId, 20);

		// Then: InvalidReconstructParamError が発生する
		await expect(pending).rejects.toThrow(InvalidReconstructParamError);
	});

	test("異常系: クライアントが失敗したらその例外そのものが発生する", async () => {
		// Given: 例外で失敗するクライアントで
		const failure = new Error("保存先に接続できない");
		const mockSend = vi.fn();
		mockSend.mockRejectedValueOnce(failure);
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const projectId = createDummyProjectId();

		// When: Project の Task を取得すると
		const pending = repository.listByProject(projectId, 20);

		// Then: そのクライアントの例外そのものが発生する
		await expect(pending).rejects.toBe(failure);
	});
});

describe("TaskRepositoryImpl.put", () => {
	test("正常系: Task を DTO に変換して Put を送信する", async () => {
		// Given: 空の応答を返すクライアントと完了した Task で
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({});
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const task = createDummyDoneTask();

		// When: 保存すると
		await repository.put(task);

		// Then: 送信したコマンドがテーブル名と、その Task の DTO を持つ
		expect(mockSend.mock.calls[0]?.[0].input).toStrictEqual({
			TableName: "tasks",
			Item: {
				PK: "PROJECT#PROJ",
				SK: "TASK#PROJ-000000001",
				id: "PROJ-1",
				title: "ダミーの表題",
				priority: "medium",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "done",
				assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
				workPeriod: { startedAt: 2_000, completedAt: 3_000 },
			},
		});
	});

	test("異常系: クライアントが失敗したらその例外そのものが発生する", async () => {
		// Given: 例外で失敗するクライアントと保存する Task で
		const failure = new Error("保存先に接続できない");
		const mockSend = vi.fn();
		mockSend.mockRejectedValueOnce(failure);
		const repository = createTaskRepositoryImpl({
			client: { send: mockSend },
			tableName: "tasks",
		});
		const task = createDummyBacklogTask();

		// When: 保存すると
		const pending = repository.put(task);

		// Then: そのクライアントの例外そのものが発生する
		await expect(pending).rejects.toBe(failure);
	});
});
