import { describe, expect, test } from "vitest";
import { createDummyComment } from "../../domain/entity/Comment.helper.test";
import type { Task } from "../../domain/entity/Task";
import {
	createDummyBacklogTask,
	createDummyDoneTask,
	createDummyInProgressTask,
} from "../../domain/entity/Task.helper.test";
import {
	FatalUnreachableError,
	InvalidReconstructParamError,
} from "../../domain/shared-errors";
import { createDummyProjectId } from "../../domain/value-object/ProjectId.helper.test";
import { createDummyPullRequestUrl } from "../../domain/value-object/PullRequestUrl.helper.test";
import { createDummyTaskId } from "../../domain/value-object/TaskId.helper.test";
import {
	fromDynamoDBTaskItemDTO,
	toDynamoDBTaskItemDTO,
	toDynamoDBTaskItemDTOPK,
	toDynamoDBTaskItemDTOPKSK,
} from "./DynamoDBTaskItemDTO";

describe("toDynamoDBTaskItemDTOPKSK", () => {
	test("正常系: PROJ-1 は PROJECT#PROJ と、連番を9桁にゼロ詰めした TASK#PROJ-000000001 になる", () => {
		// Given: 小さな番号の TaskId があるとき
		const id = createDummyTaskId("PROJ-1");

		// When: その保存キーを導出すると
		const result = toDynamoDBTaskItemDTOPKSK(id);

		// Then: その連番をゼロ詰めした SK と、Project を表す PK になる
		expect(result).toStrictEqual({
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000001",
		});
	});

	test("正常系: 最大の番号の PROJ-999999999 は連番が9桁のまま TASK#PROJ-999999999 になる", () => {
		// Given: 許容される最大の番号を持つ TaskId があるとき
		const id = createDummyTaskId("PROJ-999999999");

		// When: その保存キーを導出すると
		const result = toDynamoDBTaskItemDTOPKSK(id);

		// Then: その連番が9桁のままの SK と、Project を表す PK になる
		expect(result).toStrictEqual({
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-999999999",
		});
	});
});

describe("toDynamoDBTaskItemDTOPK", () => {
	test("正常系: PROJ は PROJECT#PROJ になる", () => {
		// Given: ProjectId があるとき
		const projectId = createDummyProjectId("PROJ");

		// When: そのパーティションキーを導出すると
		const result = toDynamoDBTaskItemDTOPK(projectId);

		// Then: その ProjectId に接頭辞を付けたキーになる
		expect(result).toBe("PROJECT#PROJ");
	});
});

describe("toDynamoDBTaskItemDTO", () => {
	test.for([
		{
			name: "backlog",
			task: createDummyBacklogTask(),
			expected: {
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
		},
		{
			name: "inProgress",
			task: createDummyInProgressTask(),
			expected: {
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
		},
		{
			name: "done",
			task: createDummyDoneTask(),
			expected: {
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
		},
	])("正常系: $name の Task は項目をそのまま写した DTO になる", ({
		task,
		expected,
	}) => {
		// Given: ケースごとの状態の Task で

		// When: DTO に変換すると
		const result = toDynamoDBTaskItemDTO(task);

		// Then: その状態の項目をそのまま写した DTO と一致する
		expect(result).toStrictEqual(expected);
	});

	test("正常系: Comment と Label を持つ Task は要素も1件ずつ写した DTO になる", () => {
		// Given: 値が異なる Comment 2件と Label を持つ Task で
		const task = createDummyBacklogTask({
			labels: ["bug", "ui"],
			comments: [
				{
					id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
					authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
					body: "最初のコメント",
					postedAt: 1_500,
				},
				{
					id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
					authorId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
					body: "次のコメント",
					postedAt: 2_500,
				},
			],
		});

		// When: DTO に変換すると
		const result = toDynamoDBTaskItemDTO(task);

		// Then: 各要素も1件ずつ写した DTO と一致する
		const expected = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000001",
			id: "PROJ-1",
			title: "ダミーの表題",
			priority: "medium",
			labels: ["bug", "ui"],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [
				{
					id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
					authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
					body: "最初のコメント",
					postedAt: 1_500,
				},
				{
					id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
					authorId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
					body: "次のコメント",
					postedAt: 2_500,
				},
			],
			status: "backlog",
		};
		expect(result).toStrictEqual(expected);
	});

	test.for([
		{ name: "backlog", task: createDummyBacklogTask(), key: "assigneeId" },
		{ name: "backlog", task: createDummyBacklogTask(), key: "startedAt" },
		{ name: "backlog", task: createDummyBacklogTask(), key: "workPeriod" },
		{
			name: "inProgress",
			task: createDummyInProgressTask(),
			key: "workPeriod",
		},
		{ name: "done", task: createDummyDoneTask(), key: "startedAt" },
	])("正常系: $name の Task の DTO は状態に無い $key のキーを持たない", ({
		task,
		key,
	}) => {
		// Given: ケースごとの状態の Task で

		// When: DTO に変換すると
		const result = toDynamoDBTaskItemDTO(task);

		// Then: その状態に無い項目のキーを持たない
		expect(key in result).toBe(false);
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
		},
	])("正常系: $name の DTO は from したあと to すると元に戻る", ({ item }) => {
		// Given: ケースごとの状態に対応する DTO をドメインに変換した Task で
		const task = fromDynamoDBTaskItemDTO(item);

		// When: DTO に戻すと
		const result = toDynamoDBTaskItemDTO(task);

		// Then: 元の DTO と一致する
		expect(result).toStrictEqual(item);
	});

	test("正常系: PullRequestUrl を持たない Task は DTO にもその項目が無い", () => {
		// Given: PullRequestUrl を持たない Task で
		const task = createDummyBacklogTask();

		// When: DTO に変換すると
		const result = toDynamoDBTaskItemDTO(task);

		// Then: pullRequestUrl の項目を持たない DTO になる
		expect("pullRequestUrl" in result).toBe(false);
	});

	test("正常系: PullRequestUrl を持つ Task は DTO でも文字列で持つ", () => {
		// Given: PullRequestUrl を持つ Task で
		const task = createDummyBacklogTask({
			pullRequestUrl: createDummyPullRequestUrl(),
		});

		// When: DTO に変換すると
		const result = toDynamoDBTaskItemDTO(task);

		// Then: その URL を文字列で持つ DTO になる
		expect(result.pullRequestUrl).toBe("https://example.com/owner/repo/pull/1");
	});

	// 保存先の1項目は、属性名と値を合わせて 400KB までである。文字数の上限はコードポイントで数えるので、
	// UTF-8 で4バイトになる文字で埋めた場合がいちばん大きい。その保存形式を JSON にしたバイト数で見積もる
	test("正常系: 件数と文字数がすべて上限いっぱいの Task でも、保存形式は1項目の上限の 400KB に収まる", () => {
		// Given: 表題・Label・PullRequestUrl・Comment の件数と本文が、どれも上限いっぱいの完了した Task で
		const task = createDummyDoneTask({
			title: "😀".repeat(200),
			labels: Array.from({ length: 10 }, (_, i) =>
				`label-${i}`.padEnd(30, "x"),
			),
			pullRequestUrl: createDummyPullRequestUrl(
				`https://example.com/${"a".repeat(2_048 - 20)}`,
			),
			comments: Array.from({ length: 50 }, (_, i) =>
				createDummyComment({
					id: `${String(i).padStart(8, "0")}-8a4b-4d6e-9f10-2a3b4c5d6e7f`,
					body: "😀".repeat(1_000),
					postedAt: 1_000 + i,
				}),
			),
		});

		// When: DTO に変換して、JSON にしたときの UTF-8 のバイト数を数えると
		const size = Buffer.byteLength(
			JSON.stringify(toDynamoDBTaskItemDTO(task)),
			"utf8",
		);

		// Then: 400KB 以下になる
		expect(size).toBeLessThanOrEqual(400 * 1024);
	});

	test("異常系: スプレッドで不変条件を破った Task なら FatalUnreachableError が発生する", () => {
		// Given: 生成・復元を通さず、スプレッドで表題を空にした Task があるとき
		// ブランドはスプレッドで引き継がれるので、型検査はこの値を止めない
		const forged: Task = { ...createDummyBacklogTask(), title: "" };

		// When: DTO に変換すると
		// Then: FatalUnreachableError が発生する
		expect(() => toDynamoDBTaskItemDTO(forged)).toThrow(FatalUnreachableError);
	});
});

describe("fromDynamoDBTaskItemDTO", () => {
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
	])("正常系: $name の DTO は対応する Task に戻る", ({ item, expected }) => {
		// Given: ケースごとの状態の DTO で

		// When: ドメインに変換すると
		const result = fromDynamoDBTaskItemDTO(item);

		// Then: その DTO に対応する Task と一致する
		expect(result).toStrictEqual(expected);
	});

	test("正常系: Comment と Label を持つ DTO は要素ごとに対応する Task に戻る", () => {
		// Given: 値が異なる Comment 2件と Label を持つ DTO で
		const item = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000001",
			id: "PROJ-1",
			title: "ダミーの表題",
			priority: "medium",
			labels: ["bug", "ui"],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [
				{
					id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
					authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
					body: "最初のコメント",
					postedAt: 1_500,
				},
				{
					id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
					authorId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
					body: "次のコメント",
					postedAt: 2_500,
				},
			],
			status: "backlog",
		};

		// When: ドメインに変換すると
		const result = fromDynamoDBTaskItemDTO(item);

		// Then: 各要素も含め、その DTO に対応する Task と一致する
		const expected = createDummyBacklogTask({
			labels: ["bug", "ui"],
			comments: [
				{
					id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
					authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
					body: "最初のコメント",
					postedAt: 1_500,
				},
				{
					id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
					authorId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
					body: "次のコメント",
					postedAt: 2_500,
				},
			],
		});
		expect(result).toStrictEqual(expected);
	});

	test.for([
		{ name: "backlog", task: createDummyBacklogTask() },
		{ name: "inProgress", task: createDummyInProgressTask() },
		{ name: "done", task: createDummyDoneTask() },
	])("正常系: $name の Task は to したあと from すると元に戻る", ({ task }) => {
		// Given: ケースごとの状態に対応する Task から変換した DTO で
		const item = toDynamoDBTaskItemDTO(task);

		// When: ドメインに変換すると
		const result = fromDynamoDBTaskItemDTO(item);

		// Then: 元の Task と一致する
		expect(result).toStrictEqual(task);
	});

	test.for([
		{
			name: "表題が200文字",
			task: createDummyBacklogTask({ title: "a".repeat(200) }),
		},
		{
			name: "Comment が50件",
			task: createDummyBacklogTask({
				comments: Array.from({ length: 50 }, (_, i) =>
					createDummyComment({
						id: `${String(i).padStart(8, "0")}-8a4b-4d6e-9f10-2a3b4c5d6e7f`,
						postedAt: 1_000 + i,
					}),
				),
			}),
		},
		{
			name: "Comment の本文が1000文字",
			task: createDummyBacklogTask({
				comments: [createDummyComment({ body: "a".repeat(1_000) })],
			}),
		},
		{
			name: "作成時刻が上限の 253402300799999",
			task: createDummyBacklogTask({ createdAt: 253_402_300_799_999 }),
		},
		{
			name: "番号が最大の9桁",
			task: createDummyBacklogTask({ id: "PROJ-999999999" }),
		},
		{
			name: "ProjectId が10文字",
			task: createDummyBacklogTask({ id: "ABCDEFGHIJ-1" }),
		},
	])("正常系: $name の Task は to したあと from すると元に戻る", ({ task }) => {
		// Given: 境界値を持つ Task から変換した DTO で
		const item = toDynamoDBTaskItemDTO(task);

		// When: ドメインに変換すると
		const result = fromDynamoDBTaskItemDTO(item);

		// Then: 元の Task と一致する
		expect(result).toStrictEqual(task);
	});

	test.for([
		{
			name: "PK が別の Project",
			item: {
				PK: "PROJECT#OTHER",
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
			key: "PK",
		},
		{
			name: "SK が別の番号",
			item: {
				PK: "PROJECT#PROJ",
				SK: "TASK#PROJ-000000002",
				id: "PROJ-1",
				title: "ダミーの表題",
				priority: "medium",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "backlog",
			},
			key: "SK",
		},
	])("異常系: $name で TaskId と食い違うなら issue の path が $key を指す InvalidReconstructParamError が発生する", ({
		item,
		key,
	}) => {
		// Given: キーの1つが TaskId と食い違う DTO があるとき

		// When: その DTO のドメインへの変換を試みると
		let caught: unknown;
		try {
			fromDynamoDBTaskItemDTO(item);
		} catch (error) {
			caught = error;
		}

		// Then: InvalidReconstructParamError が発生し
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		// And: その例外は操作名 DynamoDBTaskItemDTO.from と、path がそのキーを指す issue を持つ
		expect(caught).toMatchObject({
			operation: "DynamoDBTaskItemDTO.from",
			issues: [{ path: [key] }],
		});
	});

	test.for([
		{
			name: "PK の ProjectId に区切りの - を含む",
			item: {
				PK: "PROJECT#PROJ-1",
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
			key: "PK",
		},
		{
			name: "SK の連番が8桁",
			item: {
				PK: "PROJECT#PROJ",
				SK: "TASK#PROJ-00000001",
				id: "PROJ-1",
				title: "ダミーの表題",
				priority: "medium",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "backlog",
			},
			key: "SK",
		},
	])("異常系: $name なら形式の issue が $key を指す InvalidReconstructParamError が発生する", ({
		item,
		key,
	}) => {
		// Given: キーの1つだけが保存キーの形式に違反する DTO があるとき

		// When: その DTO のドメインへの変換を試みると
		let caught: unknown;
		try {
			fromDynamoDBTaskItemDTO(item);
		} catch (error) {
			caught = error;
		}

		// Then: そのキーを指す形式の issue を持つ InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({
			issues: expect.arrayContaining([
				expect.objectContaining({ code: "invalid_format", path: [key] }),
			]),
		});
	});

	test.for([
		{
			name: "区切りの無い TaskId",
			item: {
				PK: "PROJECT#PROJ",
				SK: "TASK#PROJ-000000001",
				id: "PROJ",
				title: "ダミーの表題",
				priority: "medium",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "backlog",
			},
		},
		{
			name: "空文字の TaskId",
			item: {
				PK: "PROJECT#PROJ",
				SK: "TASK#PROJ-000000001",
				id: "",
				title: "ダミーの表題",
				priority: "medium",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "backlog",
			},
		},
	])("異常系: $name なら保存キーの導出で TypeError にならず InvalidReconstructParamError が発生する", ({
		item,
	}) => {
		// Given: 保存キーを導出できない形式の TaskId を持つ DTO で

		// When: ドメインに変換すると
		// Then: TypeError ではなく InvalidReconstructParamError が発生する
		expect(() => fromDynamoDBTaskItemDTO(item)).toThrow(
			InvalidReconstructParamError,
		);
	});

	test("異常系: 共通の必須キー title が無いなら InvalidReconstructParamError が発生する", () => {
		// Given: 共通の必須キー title を欠いた DTO で
		const item = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000001",
			id: "PROJ-1",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [],
			status: "backlog",
		};

		// When: ドメインに変換すると
		// Then: InvalidReconstructParamError が発生する
		expect(() => fromDynamoDBTaskItemDTO(item)).toThrow(
			InvalidReconstructParamError,
		);
	});

	test("異常系: inProgress の必須キー startedAt が無いなら InvalidReconstructParamError が発生する", () => {
		// Given: 着手中に必須のキー startedAt を欠いた DTO で
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
			status: "inProgress",
			assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
		};

		// When: ドメインに変換すると
		// Then: InvalidReconstructParamError が発生する
		expect(() => fromDynamoDBTaskItemDTO(item)).toThrow(
			InvalidReconstructParamError,
		);
	});

	test("異常系: createdAt が文字列なら InvalidReconstructParamError が発生する", () => {
		// Given: 保存キーに関わらない createdAt だけが文字列の DTO で
		const item = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000001",
			id: "PROJ-1",
			title: "ダミーの表題",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: "1000",
			comments: [],
			status: "backlog",
		};

		// When: ドメインに変換すると
		// Then: InvalidReconstructParamError が発生する
		expect(() => fromDynamoDBTaskItemDTO(item)).toThrow(
			InvalidReconstructParamError,
		);
	});

	test("異常系: id が数値なら型の issue が id を指す InvalidReconstructParamError が発生する", () => {
		// Given: 保存キーのもとになる id だけが数値で、保存キーを組み直せない DTO で
		const item = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000001",
			id: 1,
			title: "ダミーの表題",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [],
			status: "backlog",
		};

		// When: その DTO のドメインへの変換を試みると
		let caught: unknown;
		try {
			fromDynamoDBTaskItemDTO(item);
		} catch (error) {
			caught = error;
		}

		// Then: id を指す型の issue を持つ InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({
			issues: expect.arrayContaining([
				expect.objectContaining({ code: "invalid_type", path: ["id"] }),
			]),
		});
	});

	test.for([
		{
			name: "トップレベルに余剰キーがある",
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
				memo: "x",
			},
		},
		{
			name: "backlog に startedAt がある",
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
				startedAt: 2_000,
			},
		},
		{
			name: "Comment に余剰キーがある",
			item: {
				PK: "PROJECT#PROJ",
				SK: "TASK#PROJ-000000001",
				id: "PROJ-1",
				title: "ダミーの表題",
				priority: "medium",
				labels: [],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [
					{
						id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
						authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
						body: "ダミーのコメント",
						postedAt: 1_500,
						memo: "x",
					},
				],
				status: "backlog",
			},
		},
	])("異常系: $name なら InvalidReconstructParamError が発生する", ({
		item,
	}) => {
		// Given: 余剰キーを1つ含む DTO で

		// When: ドメインに変換すると
		// Then: InvalidReconstructParamError が発生する
		expect(() => fromDynamoDBTaskItemDTO(item)).toThrow(
			InvalidReconstructParamError,
		);
	});

	test("異常系: 定義に無い status なら InvalidReconstructParamError が発生する", () => {
		// Given: 定義に無い status を持つ DTO で
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
			status: "archived",
		};

		// When: ドメインに変換すると
		// Then: InvalidReconstructParamError が発生する
		expect(() => fromDynamoDBTaskItemDTO(item)).toThrow(
			InvalidReconstructParamError,
		);
	});

	test("異常系: 表題の前に空白があるなら operation が Task.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 表題の前に空白を置いた DTO があるとき
		const item = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000001",
			id: "PROJ-1",
			title: " ダミーの表題",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [],
			status: "backlog",
		};

		// When: その DTO のドメインへの変換を試みると
		let caught: unknown;
		try {
			fromDynamoDBTaskItemDTO(item);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Task.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "Task.reconstruct" });
	});

	test("異常系: 作成時刻より前に着手しているなら operation が Task.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 作成時刻より前に着手した Task の DTO があるとき
		const item = {
			PK: "PROJECT#PROJ",
			SK: "TASK#PROJ-000000001",
			id: "PROJ-1",
			title: "ダミーの表題",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 2_000,
			comments: [],
			status: "inProgress",
			assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
			startedAt: 1_000,
		};

		// When: その DTO のドメインへの変換を試みると
		let caught: unknown;
		try {
			fromDynamoDBTaskItemDTO(item);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Task.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "Task.reconstruct" });
	});
});
