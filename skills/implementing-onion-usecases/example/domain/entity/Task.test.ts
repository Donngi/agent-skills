import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import {
	DomainError,
	InvalidClockValueError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { createDummyCommentId } from "../value-object/CommentId.helper.test";
import { createDummyLabel } from "../value-object/Label.helper.test";
import { LabelsLimitExceededError } from "../value-object/Labels";
import { createDummyLabels } from "../value-object/Labels.helper.test";
import { createDummyPriority } from "../value-object/Priority.helper.test";
import { createDummyPullRequestUrl } from "../value-object/PullRequestUrl.helper.test";
import { createDummyTaskId } from "../value-object/TaskId.helper.test";
import { createDummyTimestamp } from "../value-object/Timestamp.helper.test";
import { createDummyUserId } from "../value-object/UserId.helper.test";
import { type Comment, InvalidGeneratedCommentIdError } from "./Comment";
import {
	createDummyComment,
	createDummyCommentDeps,
} from "./Comment.helper.test";
import {
	CommentLimitExceededError,
	CommentPostedBeforePreviousCommentError,
	CommentPostedBeforeTaskCreationError,
	DuplicateCommentError,
	InvalidTaskTitleError,
	Task,
	TaskCompletedBeforeStartError,
	TaskSchema,
	type TaskSchemaInput,
	TaskStartedBeforeCreationError,
	TaskStatusMismatchError,
} from "./Task";
import {
	createDummyBacklogTask,
	createDummyCreateTaskProps,
	createDummyDoneTask,
	createDummyInProgressTask,
	createDummyTaskDeps,
} from "./Task.helper.test";

describe("Task.create", () => {
	test("正常系: 制約を満たす値ならクロックの時刻を作成時刻とした、Comment の無いバックログの Task になる", () => {
		// Given: 制約を満たす入力と固定の時刻を返すクロックで
		const props = createDummyCreateTaskProps();
		const deps = createDummyTaskDeps({ clock: { now: () => 5_000 } });

		// When: Task を生成すると
		const result = Task.create(props, deps);

		// Then: その時刻に作成された、Comment の無いバックログの Task と一致する
		const expected = createDummyBacklogTask({ createdAt: 5_000 });
		expect(result).toStrictEqual(expected);
	});

	test("正常系: 表題が200文字なら表題がそのまま入る", () => {
		// Given: 文字数の上限ちょうどの表題を持つ入力で
		const title = "あ".repeat(200);
		const props = createDummyCreateTaskProps({ title });
		const deps = createDummyTaskDeps();

		// When: Task を生成すると
		const result = Task.create(props, deps);

		// Then: 表題はその入力の値のままである
		expect(result.title).toBe(title);
	});

	test("正常系: 表題が絵文字200文字なら、文字をコードポイントで数えて受け入れる", () => {
		// Given: サロゲートペアの絵文字200文字の表題を持つ入力があるとき
		const title = "😀".repeat(200);
		const props = createDummyCreateTaskProps({ title });
		const deps = createDummyTaskDeps();

		// When: Task を生成すると
		const result = Task.create(props, deps);

		// Then: 表題はその入力の値のままである
		expect(result.title).toBe(title);
	});

	test("正常系: PullRequestUrl を渡さなければ pullRequestUrl の項目を持たない Task を返す", () => {
		// Given: PullRequestUrl を含まない入力とクロックで
		const props = createDummyCreateTaskProps();
		const deps = createDummyTaskDeps();

		// When: Task を生成すると
		const result = Task.create(props, deps);

		// Then: pullRequestUrl の項目を持たない Task になる
		expect("pullRequestUrl" in result).toBe(false);
	});

	test("正常系: PullRequestUrl を渡せばその値を持つ", () => {
		// Given: PullRequestUrl を含む入力とクロックで
		const url = createDummyPullRequestUrl();
		const props = createDummyCreateTaskProps({ pullRequestUrl: url });
		const deps = createDummyTaskDeps();

		// When: Task を生成すると
		const result = Task.create(props, deps);

		// Then: その URL を持つ Task になる
		expect(result.pullRequestUrl).toBe(url);
	});

	test.for([
		{ name: "表題が空", title: "" },
		{ name: "表題が201文字", title: "あ".repeat(201) },
		{ name: "表題が絵文字201文字", title: "😀".repeat(201) },
		{ name: "表題の先頭に空白がある", title: " ダミーの表題" },
		{ name: "表題の末尾に空白がある", title: "ダミーの表題 " },
	])("異常系: $name なら InvalidCreationParamError が発生する", ({ title }) => {
		// Given: 制約に1つ違反する表題を持つ入力で
		const props = createDummyCreateTaskProps({ title });
		const deps = createDummyTaskDeps();

		// When: Task の生成を試みると
		// Then: InvalidCreationParamError が発生する
		expect(() => Task.create(props, deps)).toThrow(InvalidCreationParamError);
	});

	test("異常系: create に失敗したら operation が Task.create の InvalidCreationParamError が発生する", () => {
		// Given: 表題が空の入力とクロックで
		const props = createDummyCreateTaskProps({ title: "" });
		const deps = createDummyTaskDeps();

		// When: Task の生成を試みると
		let caught: unknown;
		try {
			Task.create(props, deps);
		} catch (error) {
			caught = error;
		}

		// Then: operation が Task.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "Task.create" });
	});

	test("異常系: 余剰キーを持つなら InvalidCreationParamError が発生する", () => {
		// Given: 余剰キーを含む入力とクロックで
		const props = { ...createDummyCreateTaskProps(), memo: "x" };
		const deps = createDummyTaskDeps();

		// When: Task の生成を試みると
		// Then: InvalidCreationParamError が発生する
		expect(() => Task.create(props, deps)).toThrow(InvalidCreationParamError);
	});

	test("異常系: クロックが負の値を返すなら operation が Task.create の InvalidClockValueError が発生する", () => {
		// Given: 制約を満たす入力と負の時刻を返すクロックで
		const props = createDummyCreateTaskProps();
		const deps = createDummyTaskDeps({ clock: { now: () => -1 } });

		// When: Task の生成を試みると
		let caught: unknown;
		try {
			Task.create(props, deps);
		} catch (error) {
			caught = error;
		}

		// Then: operation が Task.create の InvalidClockValueError が発生する
		expect(caught).toBeInstanceOf(InvalidClockValueError);
		expect(caught).toMatchObject({ operation: "Task.create" });
	});

	test("異常系: クロックが例外を投げるならその例外を包まずに発生させる", () => {
		// Given: 制約を満たす入力と、例外を投げるクロックで
		const props = createDummyCreateTaskProps();
		const failure = new Error("時刻の取得に失敗した");
		const deps = createDummyTaskDeps({
			clock: {
				now: () => {
					throw failure;
				},
			},
		});

		// When: Task の生成を試みると
		let caught: unknown;
		try {
			Task.create(props, deps);
		} catch (error) {
			caught = error;
		}

		// Then: そのクロックが投げた例外がそのまま発生する
		expect(caught).toBe(failure);
	});

	test("異常系: 表題が空ならクロックを呼ばない", () => {
		// Given: 表題が空の入力と、呼び出しを記録するクロックで
		const props = createDummyCreateTaskProps({ title: "" });
		const mockNow = vi.fn(() => 1_000);
		const deps = createDummyTaskDeps({ clock: { now: mockNow } });

		// When: Task の生成を試みると
		try {
			Task.create(props, deps);
		} catch {
			// 失敗の種別は「表題が空なら InvalidCreationParamError」のテストで確かめる
		}

		// Then: そのクロックは一度も呼ばれていない
		expect(mockNow).not.toHaveBeenCalled();
	});

	test("不変性: 凍結された Task を返す", () => {
		// Given: 制約を満たす入力とクロックで
		const props = createDummyCreateTaskProps();
		const deps = createDummyTaskDeps();

		// When: Task を生成すると
		const result = Task.create(props, deps);

		// Then: 生成された Task が凍結されている
		expect(Object.isFrozen(result)).toBe(true);
	});

	test("不変性: comments が凍結された Task を返す", () => {
		// Given: 制約を満たす入力とクロックで
		const props = createDummyCreateTaskProps();
		const deps = createDummyTaskDeps();

		// When: Task を生成すると
		const result = Task.create(props, deps);

		// Then: 生成された Task の Comment の一覧が凍結されている
		expect(Object.isFrozen(result.comments)).toBe(true);
	});

	test("不変性: labels が凍結された Task を返す", () => {
		// Given: Label を2つ持つ入力とクロックで
		const props = createDummyCreateTaskProps({
			labels: createDummyLabels(["bug", "ui"]),
		});
		const deps = createDummyTaskDeps();

		// When: Task を生成すると
		const result = Task.create(props, deps);

		// Then: 生成された Task の Label の一覧が凍結されている
		expect(Object.isFrozen(result.labels)).toBe(true);
	});
});

describe("Task.reconstruct", () => {
	test.for<Readonly<{ name: string; input: TaskSchemaInput }>>([
		{
			name: "backlog",
			input: {
				id: "PROJ-1",
				title: "ダミーの表題",
				priority: "medium",
				labels: ["bug"],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [],
				status: "backlog",
			},
		},
		{
			name: "inProgress",
			input: {
				id: "PROJ-1",
				title: "ダミーの表題",
				priority: "medium",
				labels: ["bug"],
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
			input: {
				id: "PROJ-1",
				title: "ダミーの表題",
				priority: "medium",
				labels: ["bug"],
				creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
				createdAt: 1_000,
				comments: [
					{
						id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
						authorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
						body: "ダミーのコメント",
						postedAt: 1_500,
					},
				],
				status: "done",
				assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
				workPeriod: { startedAt: 2_000, completedAt: 3_000 },
			},
		},
	])("正常系: 制約を満たす $name の値なら同じ内容の Task になる", ({
		input,
	}) => {
		// Given: ケースごとの状態に対応する制約を満たす Task の保存値で

		// When: Task を復元すると
		const result = Task.reconstruct(input);

		// Then: その保存値と同じ内容の Task になる
		expect(result).toStrictEqual(input);
	});

	test("正常系: 着手時刻が作成時刻と同じなら復元できる", () => {
		// Given: create が組まない着手中の状態で、作成時刻に着手した Task の保存値があるとき
		const input = {
			id: "PROJ-1",
			title: "ダミーの表題",
			priority: "medium",
			labels: [],
			creatorId: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e",
			createdAt: 1_000,
			comments: [],
			status: "inProgress",
			assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
			startedAt: 1_000,
		} satisfies TaskSchemaInput;

		// When: Task を復元すると
		const result = Task.reconstruct(input);

		// Then: その値と同じ内容の Task になる
		expect(result).toStrictEqual(input);
	});

	test("異常系: 余剰キーを持つなら operation が Task.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 余剰キーを含む Task の保存値で
		const input = { ...createDummyBacklogTask(), memo: "x" };

		// When: Task の復元を試みると
		let caught: unknown;
		try {
			Task.reconstruct(input);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Task.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "Task.reconstruct" });
	});

	test("異常系: バックログなのに startedAt を持つなら InvalidReconstructParamError が発生する", () => {
		// Given: 着手中の Task の状態だけをバックログにした保存値で
		const input = {
			...createDummyInProgressTask(),
			status: "backlog" as const,
		};

		// When: Task の復元を試みると
		// Then: InvalidReconstructParamError が発生する
		expect(() => Task.reconstruct(input)).toThrow(InvalidReconstructParamError);
	});

	test("異常系: 着手中で着手時刻が作成時刻より前なら startedAt を指す InvalidReconstructParamError が発生する", () => {
		// Given: 着手時刻が作成時刻より前の、着手中の Task の保存値で
		const input = { ...createDummyInProgressTask(), startedAt: 999 };

		// When: Task の復元を試みると
		let caught: unknown;
		try {
			Task.reconstruct(input);
		} catch (error) {
			caught = error;
		}

		// Then: startedAt を指す issue を持つ InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ issues: [{ path: ["startedAt"] }] });
	});

	test("異常系: 完了で着手時刻が作成時刻より前なら workPeriod.startedAt を指す InvalidReconstructParamError が発生する", () => {
		// Given: WorkPeriod の着手時刻が作成時刻より前の、完了した Task の保存値で
		const input = {
			...createDummyDoneTask(),
			workPeriod: { startedAt: 999, completedAt: 3_000 },
		};

		// When: Task の復元を試みると
		let caught: unknown;
		try {
			Task.reconstruct(input);
		} catch (error) {
			caught = error;
		}

		// Then: workPeriod.startedAt を指す issue を持つ InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({
			issues: [{ path: ["workPeriod", "startedAt"] }],
		});
	});

	test("異常系: 作成時刻より前に投稿された Comment があるなら comments を指す InvalidReconstructParamError が発生する", () => {
		// Given: Task の作成時刻より前に投稿された Comment を持つ Task の保存値で
		const input = {
			...createDummyBacklogTask(),
			comments: [createDummyComment({ postedAt: 999 })],
		};

		// When: Task の復元を試みると
		let caught: unknown;
		try {
			Task.reconstruct(input);
		} catch (error) {
			caught = error;
		}

		// Then: comments を指す issue を持つ InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ issues: [{ path: ["comments"] }] });
	});

	test("異常系: CommentId が重複しているなら InvalidReconstructParamError が発生する", () => {
		// Given: 同じ Comment を2つ持つ Task の保存値で
		const comment = createDummyComment();
		const input = {
			...createDummyBacklogTask(),
			comments: [comment, comment],
		};

		// When: Task の復元を試みると
		// Then: InvalidReconstructParamError が発生する
		expect(() => Task.reconstruct(input)).toThrow(InvalidReconstructParamError);
	});

	test("異常系: Comment が投稿順に並んでいないなら InvalidReconstructParamError が発生する", () => {
		// Given: 新しい Comment が先に並んだ Task の保存値で
		const input = {
			...createDummyBacklogTask(),
			comments: [
				createDummyComment({
					id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
					postedAt: 2_000,
				}),
				createDummyComment({
					id: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
					postedAt: 1_500,
				}),
			],
		};

		// When: Task の復元を試みると
		// Then: InvalidReconstructParamError が発生する
		expect(() => Task.reconstruct(input)).toThrow(InvalidReconstructParamError);
	});

	test("異常系: Comment が51件なら InvalidReconstructParamError が発生する", () => {
		// Given: Comment を上限より1件多く持つ Task の保存値で
		const comments: Comment[] = [];
		for (let i = 0; i < 51; i++) {
			comments.push(
				createDummyComment({
					id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
					postedAt: 1_000 + i,
				}),
			);
		}
		const input = { ...createDummyBacklogTask(), comments };

		// When: Task の復元を試みると
		// Then: InvalidReconstructParamError が発生する
		expect(() => Task.reconstruct(input)).toThrow(InvalidReconstructParamError);
	});
});

describe("TaskSchema", () => {
	test.for([
		{ name: "backlog", task: createDummyBacklogTask() },
		{ name: "inProgress", task: createDummyInProgressTask() },
		{ name: "done", task: createDummyDoneTask() },
	])("正常系: 制約を満たす $name の Task なら検証を通る", ({ task }) => {
		// Given: ケースごとの状態に対応する制約を満たす Task があるとき

		// When: その値を TaskSchema で検証すると
		const result = TaskSchema.safeParse(task).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test("正常系: pullRequestUrl が undefined なら検証を通らない", () => {
		// Given: pullRequestUrl の項目に undefined を置いた Task の値があるとき
		const value = { ...createDummyBacklogTask(), pullRequestUrl: undefined };

		// When: その値を TaskSchema で検証すると
		const result = TaskSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: 表題が空なら検証を通らない", () => {
		// Given: 表題だけを空にした Task の値があるとき
		const value = { ...createDummyBacklogTask(), title: "" };

		// When: その値を TaskSchema で検証すると
		const result = TaskSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: 余剰キーを持つなら検証を通らない", () => {
		// Given: 余剰キーを含む Task の値があるとき
		const value = { ...createDummyBacklogTask(), memo: "x" };

		// When: その値を TaskSchema で検証すると
		const result = TaskSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: CommentId が重複しているなら検証を通らない", () => {
		// Given: 同じ Comment を2つ持つ Task の値があるとき
		const comment = createDummyComment();
		const value = {
			...createDummyBacklogTask(),
			comments: [comment, comment],
		};

		// When: その値を TaskSchema で検証すると
		const result = TaskSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: Comment の本文が空なら検証を通らない", () => {
		// Given: 本文が空の Comment を持つ Task の値があるとき
		const comment = { ...createDummyComment(), body: "" };
		const value = { ...createDummyBacklogTask(), comments: [comment] };

		// When: その値を TaskSchema で検証すると
		const result = TaskSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: comments が配列でなければ検証を通らない", () => {
		// Given: comments が文字列の Task の値があるとき
		const value = { ...createDummyBacklogTask(), comments: "配列ではない" };

		// When: その値を TaskSchema で検証すると
		const result = TaskSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: comments の要素が null なら検証を通らない", () => {
		// Given: comments の要素が null の Task の値があるとき
		const value = { ...createDummyBacklogTask(), comments: [null] };

		// When: その値を TaskSchema で検証すると
		const result = TaskSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});

describe("Task.equalsById", () => {
	test("正常系: 識別子が同じならほかの項目が異なっても等しいと判定される", () => {
		// Given: 識別子が同じで表題と状態が異なる2つの Task があるとき
		const a = createDummyBacklogTask({ id: "PROJ-1", title: "表題A" });
		const b = createDummyDoneTask({ id: "PROJ-1", title: "表題B" });

		// When: その2つの識別子で等価性を判定すると
		const result = Task.equalsById(a, b);

		// Then: 等しいと判定される
		expect(result).toBe(true);
	});

	test("正常系: 識別子が異なればほかの項目が同じでも等しくないと判定される", () => {
		// Given: 識別子だけが異なる2つの Task があるとき
		const a = createDummyBacklogTask({ id: "PROJ-1" });
		const b = createDummyBacklogTask({ id: "PROJ-2" });

		// When: その2つの識別子で等価性を判定すると
		const result = Task.equalsById(a, b);

		// Then: 等しくないと判定される
		expect(result).toBe(false);
	});
});

describe("Task.start", () => {
	test("正常系: バックログの Task は担当者と着手時刻を持つ着手中の Task になる", () => {
		// Given: バックログの Task と、担当者と着手時刻があるとき
		const task = createDummyBacklogTask({ createdAt: 1_000 });
		const params = {
			assigneeId: createDummyUserId("9d8e7f6a-5b4c-4d3e-8f2a-1b0c9d8e7f6a"),
			at: createDummyTimestamp(2_000),
		};

		// When: その担当者と着手時刻でその Task に着手すると
		const result = Task.start(task, params);

		// Then: それらを持つ着手中の Task と一致する
		const expected = createDummyInProgressTask({
			createdAt: 1_000,
			assigneeId: "9d8e7f6a-5b4c-4d3e-8f2a-1b0c9d8e7f6a",
			startedAt: 2_000,
		});
		expect(result).toStrictEqual(expected);
	});

	test("正常系: 作成時刻と同じ着手時刻なら着手できる", () => {
		// Given: バックログの Task と、作成時刻と同じ着手時刻があるとき
		const task = createDummyBacklogTask({ createdAt: 1_000 });
		const params = {
			assigneeId: createDummyUserId("7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b"),
			at: createDummyTimestamp(1_000),
		};

		// When: その着手時刻でその Task に着手すると
		const result = Task.start(task, params);

		// Then: その作成時刻に着手した着手中の Task と一致する
		const expected = createDummyInProgressTask({
			createdAt: 1_000,
			assigneeId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
			startedAt: 1_000,
		});
		expect(result).toStrictEqual(expected);
	});

	test.for([
		{ name: "inProgress", task: createDummyInProgressTask() },
		{ name: "done", task: createDummyDoneTask() },
	])("異常系: $name の Task なら期待した状態と実際の状態を持つ TaskStatusMismatchError が発生する", ({
		name,
		task,
	}) => {
		// Given: バックログ以外の状態の Task と、担当者と着手時刻があるとき
		const params = {
			assigneeId: createDummyUserId(),
			at: createDummyTimestamp(3_000),
		};

		// When: その Task の着手を試みると
		let caught: unknown;
		try {
			Task.start(task, params);
		} catch (error) {
			caught = error;
		}

		// Then: TaskStatusMismatchError が発生し
		expect(caught).toBeInstanceOf(TaskStatusMismatchError);
		// And: その例外は操作名 Task.start と、期待した状態 backlog とその Task の状態を持つ
		expect(caught).toMatchObject({
			operation: "Task.start",
			taskId: "PROJ-1",
			expected: "backlog",
			actual: name,
		});
	});

	test("異常系: 作成時刻より前の着手時刻なら渡した値と作成時刻を持つ TaskStartedBeforeCreationError が発生する", () => {
		// Given: バックログの Task と、作成時刻より前の着手時刻があるとき
		const task = createDummyBacklogTask({ createdAt: 1_000 });
		const params = {
			assigneeId: createDummyUserId(),
			at: createDummyTimestamp(999),
		};

		// When: その着手時刻で着手を試みると
		let caught: unknown;
		try {
			Task.start(task, params);
		} catch (error) {
			caught = error;
		}

		// Then: TaskStartedBeforeCreationError が発生し
		expect(caught).toBeInstanceOf(TaskStartedBeforeCreationError);
		// And: その例外は操作名 Task.start と、渡した着手時刻と作成時刻を持つ
		expect(caught).toMatchObject({
			operation: "Task.start",
			taskId: "PROJ-1",
			startedAt: 999,
			createdAt: 1_000,
		});
	});

	test("不変性: 着手しても元の Task は変わらない", () => {
		// Given: バックログの Task と、着手のパラメータがあるとき
		const task = createDummyBacklogTask();
		const params = {
			assigneeId: createDummyUserId(),
			at: createDummyTimestamp(2_000),
		};

		// When: その Task に着手すると
		Task.start(task, params);

		// Then: 元の Task はバックログのまま変わっていない
		const expected = createDummyBacklogTask();
		expect(task).toStrictEqual(expected);
	});
});

describe("Task.complete", () => {
	test("正常系: 着手中の Task は着手時刻から完了時刻までの WorkPeriod を持つ完了した Task になる", () => {
		// Given: 着手中の Task と、着手時刻より後の完了時刻があるとき
		const task = createDummyInProgressTask({
			assigneeId: "9d8e7f6a-5b4c-4d3e-8f2a-1b0c9d8e7f6a",
			startedAt: 2_000,
		});
		const params = { at: createDummyTimestamp(3_000) };

		// When: その完了時刻でその Task を完了すると
		const result = Task.complete(task, params);

		// Then: その着手時刻から完了時刻までの WorkPeriod を持つ完了した Task と一致する
		const expected = createDummyDoneTask({
			assigneeId: "9d8e7f6a-5b4c-4d3e-8f2a-1b0c9d8e7f6a",
			workPeriod: { startedAt: 2_000, completedAt: 3_000 },
		});
		expect(result).toStrictEqual(expected);
	});

	test("正常系: 完了した Task は startedAt のキーを持たない", () => {
		// Given: 着手中の Task と、完了時刻があるとき
		const task = createDummyInProgressTask({ startedAt: 2_000 });
		const params = { at: createDummyTimestamp(3_000) };

		// When: その完了時刻でその Task を完了すると
		const result = Task.complete(task, params);

		// Then: 完了した Task は startedAt のキーを持たない
		expect("startedAt" in result).toBe(false);
	});

	test("正常系: 着手時刻と同じ完了時刻なら完了できる", () => {
		// Given: 着手中の Task と、着手時刻と同じ完了時刻があるとき
		const task = createDummyInProgressTask({ startedAt: 2_000 });
		const params = { at: createDummyTimestamp(2_000) };

		// When: その完了時刻でその Task を完了すると
		const result = Task.complete(task, params);

		// Then: その着手時刻に完了した Task と一致する
		const expected = createDummyDoneTask({
			workPeriod: { startedAt: 2_000, completedAt: 2_000 },
		});
		expect(result).toStrictEqual(expected);
	});

	test.for([
		{ name: "backlog", task: createDummyBacklogTask() },
		{ name: "done", task: createDummyDoneTask() },
	])("異常系: $name の Task なら期待した状態と実際の状態を持つ TaskStatusMismatchError が発生する", ({
		name,
		task,
	}) => {
		// Given: 着手中以外の状態の Task と、完了時刻があるとき
		const params = { at: createDummyTimestamp(4_000) };

		// When: その Task の完了を試みると
		let caught: unknown;
		try {
			Task.complete(task, params);
		} catch (error) {
			caught = error;
		}

		// Then: TaskStatusMismatchError が発生し
		expect(caught).toBeInstanceOf(TaskStatusMismatchError);
		// And: その例外は操作名 Task.complete と、期待した状態 inProgress とその Task の状態を持つ
		expect(caught).toMatchObject({
			operation: "Task.complete",
			taskId: "PROJ-1",
			expected: "inProgress",
			actual: name,
		});
	});

	test("異常系: 着手時刻より前の完了時刻なら渡した値と着手時刻を持つ TaskCompletedBeforeStartError が発生する", () => {
		// Given: 着手中の Task と、着手時刻より前の完了時刻があるとき
		const task = createDummyInProgressTask({ startedAt: 2_000 });
		const params = { at: createDummyTimestamp(1_999) };

		// When: その完了時刻で完了を試みると
		let caught: unknown;
		try {
			Task.complete(task, params);
		} catch (error) {
			caught = error;
		}

		// Then: TaskCompletedBeforeStartError が発生し
		expect(caught).toBeInstanceOf(TaskCompletedBeforeStartError);
		// And: その例外は操作名 Task.complete と、渡した完了時刻と着手時刻を持つ
		expect(caught).toMatchObject({
			operation: "Task.complete",
			taskId: "PROJ-1",
			completedAt: 1_999,
			startedAt: 2_000,
		});
	});

	test("不変性: 完了しても元の Task は変わらない", () => {
		// Given: 着手中の Task と、完了時刻があるとき
		const task = createDummyInProgressTask();
		const params = { at: createDummyTimestamp(3_000) };

		// When: その Task を完了すると
		Task.complete(task, params);

		// Then: 元の Task は着手中のまま変わっていない
		const expected = createDummyInProgressTask();
		expect(task).toStrictEqual(expected);
	});
});

describe("Task.reopen", () => {
	test("正常系: 完了した Task は担当者と着手時刻を残した着手中の Task になる", () => {
		// Given: 担当者と WorkPeriod を持つ完了した Task があるとき
		const task = createDummyDoneTask({
			assigneeId: "9d8e7f6a-5b4c-4d3e-8f2a-1b0c9d8e7f6a",
			workPeriod: { startedAt: 2_000, completedAt: 3_000 },
		});

		// When: その Task を着手中に戻すと
		const result = Task.reopen(task);

		// Then: その担当者と着手時刻を引き継いだ着手中の Task と一致する
		const expected = createDummyInProgressTask({
			assigneeId: "9d8e7f6a-5b4c-4d3e-8f2a-1b0c9d8e7f6a",
			startedAt: 2_000,
		});
		expect(result).toStrictEqual(expected);
	});

	test("正常系: 着手中に戻した Task は workPeriod のキーを持たない", () => {
		// Given: 完了した Task があるとき
		const task = createDummyDoneTask();

		// When: その Task を着手中に戻すと
		const result = Task.reopen(task);

		// Then: 着手中に戻った Task は workPeriod のキーを持たない
		expect("workPeriod" in result).toBe(false);
	});

	test.for([
		{ name: "backlog", task: createDummyBacklogTask() },
		{ name: "inProgress", task: createDummyInProgressTask() },
	])("異常系: $name の Task なら期待した状態と実際の状態を持つ TaskStatusMismatchError が発生する", ({
		name,
		task,
	}) => {
		// Given: 完了以外の状態の Task があるとき

		// When: その Task を着手中に戻すのを試みると
		let caught: unknown;
		try {
			Task.reopen(task);
		} catch (error) {
			caught = error;
		}

		// Then: TaskStatusMismatchError が発生し
		expect(caught).toBeInstanceOf(TaskStatusMismatchError);
		// And: その例外は操作名 Task.reopen と、期待した状態 done とその Task の状態を持つ
		expect(caught).toMatchObject({
			operation: "Task.reopen",
			taskId: "PROJ-1",
			expected: "done",
			actual: name,
		});
	});

	test("不変性: 着手中に戻しても元の Task は変わらない", () => {
		// Given: 完了した Task があるとき
		const task = createDummyDoneTask();

		// When: その Task を着手中に戻すと
		Task.reopen(task);

		// Then: 元の Task は完了したまま変わっていない
		const expected = createDummyDoneTask();
		expect(task).toStrictEqual(expected);
	});
});

describe("Task.addComment", () => {
	test("正常系: 採番した識別子とクロックの時刻を持つ Comment が末尾に追加された Task になる", () => {
		// Given: Comment を1件持つ Task と、著者と本文と、その後の時刻を返すクロックと固定の識別子を返す採番があるとき
		const first = createDummyComment({
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
			postedAt: 1_500,
		});
		const task = createDummyBacklogTask({ comments: [first] });
		const params = {
			authorId: createDummyUserId("7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b"),
			body: "追加する本文",
		};
		const deps = createDummyCommentDeps({
			clock: { now: () => 2_000 },
			idGenerator: { next: () => "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d" },
		});

		// When: その Task にその著者と本文でコメントを追加すると
		const result = Task.addComment(task, params, deps);

		// Then: 既存の Comment の後ろに、その識別子と著者と本文と時刻を持つ Comment が並んだ Task と一致する
		const expected = createDummyBacklogTask({
			comments: [
				first,
				createDummyComment({
					id: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
					authorId: "7c1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
					body: "追加する本文",
					postedAt: 2_000,
				}),
			],
		});
		expect(result).toStrictEqual(expected);
	});

	test.for([
		{ name: "backlog", task: createDummyBacklogTask() },
		{ name: "inProgress", task: createDummyInProgressTask() },
		{ name: "done", task: createDummyDoneTask() },
	])("正常系: $name の Task にも Comment を追加できる", ({ task }) => {
		// Given: ケースごとの状態に対応する Task と、著者と本文と、作成より後の時刻を返すクロックがあるとき
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps({ clock: { now: () => 3_000 } });

		// When: その Task にコメントを追加すると
		const result = Task.addComment(task, params, deps);

		// Then: Comment の一覧にはその追加した Comment 1件だけが含まれる
		const expected = [createDummyComment({ postedAt: 3_000 })];
		expect(result.comments).toStrictEqual(expected);
	});

	test("正常系: クロックが直前の Comment と同じ時刻を返すなら追加できる", () => {
		// Given: Comment を1件持つ Task と、その投稿時刻と同じ時刻を返すクロックがあるとき
		const first = createDummyComment({
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
			postedAt: 1_500,
		});
		const task = createDummyBacklogTask({ comments: [first] });
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps({
			clock: { now: () => 1_500 },
			idGenerator: { next: () => "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d" },
		});

		// When: その Task にコメントを追加すると
		const result = Task.addComment(task, params, deps);

		// Then: 既存の Comment の後ろに、同じ投稿時刻の Comment が並んだ Task と一致する
		const expected = createDummyBacklogTask({
			comments: [
				first,
				createDummyComment({
					id: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
					postedAt: 1_500,
				}),
			],
		});
		expect(result).toStrictEqual(expected);
	});

	test("正常系: クロックが作成時刻と同じ時刻を返すなら追加できる", () => {
		// Given: Comment の無い Task と、作成時刻と同じ時刻を返すクロックがあるとき
		const task = createDummyBacklogTask({ createdAt: 1_000 });
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps({ clock: { now: () => 1_000 } });

		// When: その Task にコメントを追加すると
		const result = Task.addComment(task, params, deps);

		// Then: 作成時刻に投稿された Comment を持つ Task と一致する
		const expected = createDummyBacklogTask({
			createdAt: 1_000,
			comments: [createDummyComment({ postedAt: 1_000 })],
		});
		expect(result).toStrictEqual(expected);
	});

	test("正常系: Comment が49件なら50件目を追加できる", () => {
		// Given: Comment の数が上限まであと1件の Task と、著者と本文と、その後の時刻を返すクロックがあるとき
		const comments: Comment[] = [];
		for (let i = 0; i < 49; i++) {
			comments.push(
				createDummyComment({
					id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
					postedAt: 1_000 + i,
				}),
			);
		}
		const task = createDummyBacklogTask({ comments });
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps({
			clock: { now: () => 2_000 },
			idGenerator: { next: () => "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d" },
		});

		// When: その Task にコメントを追加すると
		const result = Task.addComment(task, params, deps);

		// Then: その Comment が追加され、Comment の数が上限に達した Task と一致する
		const expected = createDummyBacklogTask({
			comments: [
				...comments,
				createDummyComment({
					id: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
					postedAt: 2_000,
				}),
			],
		});
		expect(result).toStrictEqual(expected);
	});

	test("異常系: 本文が空なら operation が Comment.create の InvalidCreationParamError が発生する", () => {
		// Given: Comment の無い Task と、本文が空のパラメータがあるとき
		const task = createDummyBacklogTask();
		const params = { authorId: createDummyUserId(), body: "" };
		const deps = createDummyCommentDeps();

		// When: そのパラメータでコメントの追加を試みると
		let caught: unknown;
		try {
			Task.addComment(task, params, deps);
		} catch (error) {
			caught = error;
		}

		// Then: operation が Comment.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "Comment.create" });
	});

	test("異常系: IDジェネレーターが UUID でない値を返すなら operation が Comment.create の InvalidGeneratedCommentIdError が発生する", () => {
		// Given: Comment の無い Task と、著者と本文と、UUID でない値を返す採番があるとき
		const task = createDummyBacklogTask();
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps({
			idGenerator: { next: () => "comment-1" },
		});

		// When: コメントの追加を試みると
		let caught: unknown;
		try {
			Task.addComment(task, params, deps);
		} catch (error) {
			caught = error;
		}

		// Then: operation が Comment.create の InvalidGeneratedCommentIdError が発生する
		expect(caught).toBeInstanceOf(InvalidGeneratedCommentIdError);
		expect(caught).toMatchObject({ operation: "Comment.create" });
	});

	test("異常系: クロックが負の値を返すなら operation が Comment.create の InvalidClockValueError が発生する", () => {
		// Given: Comment の無い Task と、著者と本文と、負の時刻を返すクロックがあるとき
		const task = createDummyBacklogTask();
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps({ clock: { now: () => -1 } });

		// When: コメントの追加を試みると
		let caught: unknown;
		try {
			Task.addComment(task, params, deps);
		} catch (error) {
			caught = error;
		}

		// Then: operation が Comment.create の InvalidClockValueError が発生する
		expect(caught).toBeInstanceOf(InvalidClockValueError);
		expect(caught).toMatchObject({ operation: "Comment.create" });
	});

	test("異常系: 採番した識別子の Comment がすでにあるならその識別子を持つ DuplicateCommentError が発生する", () => {
		// Given: Comment を1件持つ Task と、その識別子を返す採番があるとき
		const first = createDummyComment({
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
			postedAt: 1_500,
		});
		const task = createDummyBacklogTask({ comments: [first] });
		const params = { authorId: createDummyUserId(), body: "別の本文" };
		const deps = createDummyCommentDeps({
			clock: { now: () => 2_000 },
			idGenerator: { next: () => "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f" },
		});

		// When: コメントの追加を試みると
		let caught: unknown;
		try {
			Task.addComment(task, params, deps);
		} catch (error) {
			caught = error;
		}

		// Then: DuplicateCommentError が発生し
		expect(caught).toBeInstanceOf(DuplicateCommentError);
		// And: その例外は操作名 Task.addComment と、重複した識別子を持つ
		expect(caught).toMatchObject({
			operation: "Task.addComment",
			taskId: "PROJ-1",
			commentId: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
		});
	});

	test("異常系: クロックが直前の Comment より前の時刻を返すならその時刻と直前の投稿時刻を持つ CommentPostedBeforePreviousCommentError が発生する", () => {
		// Given: Comment を1件持つ Task と、その投稿時刻より前の時刻を返すクロックがあるとき
		const first = createDummyComment({
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
			postedAt: 2_000,
		});
		const task = createDummyBacklogTask({ comments: [first] });
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps({
			clock: { now: () => 1_999 },
			idGenerator: { next: () => "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d" },
		});

		// When: コメントの追加を試みると
		let caught: unknown;
		try {
			Task.addComment(task, params, deps);
		} catch (error) {
			caught = error;
		}

		// Then: CommentPostedBeforePreviousCommentError が発生し
		expect(caught).toBeInstanceOf(CommentPostedBeforePreviousCommentError);
		// And: その例外は操作名 Task.addComment と、クロックが返した時刻と直前の投稿時刻を持つ
		expect(caught).toMatchObject({
			operation: "Task.addComment",
			taskId: "PROJ-1",
			postedAt: 1_999,
			previousPostedAt: 2_000,
		});
	});

	test("異常系: クロックが作成時刻より前の時刻を返すならその時刻と作成時刻を持つ CommentPostedBeforeTaskCreationError が発生する", () => {
		// Given: Comment の無い Task と、その作成時刻より前の時刻を返すクロックがあるとき
		const task = createDummyBacklogTask({ createdAt: 1_000 });
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps({ clock: { now: () => 999 } });

		// When: コメントの追加を試みると
		let caught: unknown;
		try {
			Task.addComment(task, params, deps);
		} catch (error) {
			caught = error;
		}

		// Then: CommentPostedBeforeTaskCreationError が発生し
		expect(caught).toBeInstanceOf(CommentPostedBeforeTaskCreationError);
		// And: その例外は操作名 Task.addComment と、クロックが返した時刻と作成時刻を持つ
		expect(caught).toMatchObject({
			operation: "Task.addComment",
			taskId: "PROJ-1",
			postedAt: 999,
			taskCreatedAt: 1_000,
		});
	});

	test("異常系: Comment が上限の50件なら上限件数を持つ CommentLimitExceededError が発生する", () => {
		// Given: Comment を上限件数まで持つ Task と、著者と本文があるとき
		const comments: Comment[] = [];
		for (let i = 0; i < 50; i++) {
			comments.push(
				createDummyComment({
					id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
					postedAt: 1_000 + i,
				}),
			);
		}
		const task = createDummyBacklogTask({ comments });
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps({ clock: { now: () => 2_000 } });

		// When: コメントの追加を試みると
		let caught: unknown;
		try {
			Task.addComment(task, params, deps);
		} catch (error) {
			caught = error;
		}

		// Then: CommentLimitExceededError が発生し
		expect(caught).toBeInstanceOf(CommentLimitExceededError);
		// And: その例外は操作名 Task.addComment と、上限件数を持つ
		expect(caught).toMatchObject({
			operation: "Task.addComment",
			taskId: "PROJ-1",
			limit: 50,
		});
	});

	test("異常系: 本文が空なら採番とクロックを呼ばない", () => {
		// Given: Comment の無い Task と、本文が空のパラメータと、呼び出しを記録する採番とクロックがあるとき
		const task = createDummyBacklogTask();
		const params = { authorId: createDummyUserId(), body: "" };
		const mockNext = vi.fn(() => "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d");
		const mockNow = vi.fn(() => 2_000);
		const deps = createDummyCommentDeps({
			clock: { now: mockNow },
			idGenerator: { next: mockNext },
		});

		// When: そのパラメータでコメントの追加を試みると
		try {
			Task.addComment(task, params, deps);
		} catch {
			// 失敗の種別は「本文が空なら InvalidCreationParamError」のテストで確かめる
		}

		// Then: その採番とクロックは一度も呼ばれていない
		expect(mockNext).not.toHaveBeenCalled();
		expect(mockNow).not.toHaveBeenCalled();
	});

	test("異常系: Comment が上限の50件なら採番とクロックを呼ばない", () => {
		// Given: Comment を上限件数まで持つ Task と、呼び出しを記録する採番とクロックがあるとき
		const comments: Comment[] = [];
		for (let i = 0; i < 50; i++) {
			comments.push(
				createDummyComment({
					id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
					postedAt: 1_000 + i,
				}),
			);
		}
		const task = createDummyBacklogTask({ comments });
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const mockNext = vi.fn(() => "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d");
		const mockNow = vi.fn(() => 2_000);
		const deps = createDummyCommentDeps({
			clock: { now: mockNow },
			idGenerator: { next: mockNext },
		});

		// When: コメントの追加を試みると
		try {
			Task.addComment(task, params, deps);
		} catch {
			// 失敗の種別は「上限の50件なら CommentLimitExceededError」のテストで確かめる
		}

		// Then: その採番とクロックは一度も呼ばれていない
		expect(mockNext).not.toHaveBeenCalled();
		expect(mockNow).not.toHaveBeenCalled();
	});

	test("不変性: Comment を追加しても元の Task は変わらない", () => {
		// Given: Comment の無い Task と、著者と本文があるとき
		const task = createDummyBacklogTask();
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps();

		// When: その Task にコメントを追加すると
		Task.addComment(task, params, deps);

		// Then: 元の Task は Comment の無いまま変わっていない
		const expected = createDummyBacklogTask();
		expect(task).toStrictEqual(expected);
	});

	test("不変性: comments が凍結された Task を返す", () => {
		// Given: Comment の無い Task と、著者と本文があるとき
		const task = createDummyBacklogTask();
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps();

		// When: その Task にコメントを追加すると
		const result = Task.addComment(task, params, deps);

		// Then: 追加後の Task の Comment の一覧が凍結されている
		expect(Object.isFrozen(result.comments)).toBe(true);
	});

	test("不変性: 追加した Comment が凍結された Task を返す", () => {
		// Given: Comment の無い Task と、著者と本文があるとき
		const task = createDummyBacklogTask();
		const params = { authorId: createDummyUserId(), body: "ダミーのコメント" };
		const deps = createDummyCommentDeps();

		// When: その Task にコメントを追加すると
		const result = Task.addComment(task, params, deps);

		// Then: 追加された Comment が凍結されている
		expect(Object.isFrozen(result.comments[0])).toBe(true);
	});
});

describe("Task.rename", () => {
	test("正常系: 制約を満たす表題ならその表題を持つ Task になる", () => {
		// Given: Task と、制約を満たす表題があるとき
		const task = createDummyBacklogTask();
		const params = { title: "新しい表題" };

		// When: その表題に変えると
		const result = Task.rename(task, params);

		// Then: その表題を持つ Task と一致する
		const expected = createDummyBacklogTask({ title: "新しい表題" });
		expect(result).toStrictEqual(expected);
	});

	test.for([
		{ name: "backlog", task: createDummyBacklogTask() },
		{ name: "inProgress", task: createDummyInProgressTask() },
		{ name: "done", task: createDummyDoneTask() },
	])("正常系: $name の Task も表題を変えられる", ({ task }) => {
		// Given: ケースごとの状態に対応する Task と、制約を満たす表題があるとき
		const params = { title: "新しい表題" };

		// When: その表題に変えると
		const result = Task.rename(task, params);

		// Then: その表題を持つ
		expect(result.title).toBe("新しい表題");
	});

	test.for([
		{ name: "空", title: "" },
		{ name: "201文字", title: "a".repeat(201) },
		{ name: "先頭に空白がある", title: " 新しい表題" },
	])("異常系: 表題が $name なら InvalidTaskTitleError が発生する", ({ title }) => {
		// Given: Task と、制約に1つ違反する表題があるとき
		const task = createDummyBacklogTask();

		// When: その表題に変えようとすると
		// Then: InvalidTaskTitleError が発生する
		expect(() => Task.rename(task, { title })).toThrow(InvalidTaskTitleError);
	});

	test("異常系: 表題が空なら操作名と識別子と issue を持つ InvalidTaskTitleError が発生する", () => {
		// Given: Task と、空の表題があるとき
		const task = createDummyBacklogTask();

		// When: その表題に変えようとすると
		let caught: unknown;
		try {
			Task.rename(task, { title: "" });
		} catch (error) {
			caught = error;
		}

		// Then: InvalidTaskTitleError が発生し
		expect(caught).toBeInstanceOf(InvalidTaskTitleError);
		// And: その例外は操作名 Task.rename と、その Task の識別子と、長さの下限の issue を持つ
		expect(caught).toMatchObject({
			operation: "Task.rename",
			taskId: "PROJ-1",
			issues: [{ message: "表題は1文字以上です" }],
		});
	});

	test("不変性: 表題を変えても元の Task は変わらない", () => {
		// Given: Task と、制約を満たす表題があるとき
		const task = createDummyBacklogTask();

		// When: その表題に変えると
		Task.rename(task, { title: "新しい表題" });

		// Then: 元の Task は元の表題のまま変わっていない
		const expected = createDummyBacklogTask();
		expect(task).toStrictEqual(expected);
	});
});

describe("Task.changePriority", () => {
	test("正常系: その優先度を持つ Task になる", () => {
		// Given: 優先度が medium の Task と、優先度 high があるとき
		const task = createDummyBacklogTask({ priority: "medium" });
		const priority = createDummyPriority("high");

		// When: その優先度に変えると
		const result = Task.changePriority(task, { priority });

		// Then: 優先度 high を持つ Task と一致する
		const expected = createDummyBacklogTask({ priority: "high" });
		expect(result).toStrictEqual(expected);
	});

	test("不変性: 優先度を変えても元の Task は変わらない", () => {
		// Given: 優先度が medium の Task と、優先度 high があるとき
		const task = createDummyBacklogTask({ priority: "medium" });
		const priority = createDummyPriority("high");

		// When: その優先度に変えると
		Task.changePriority(task, { priority });

		// Then: 元の Task は優先度 medium のまま変わっていない
		expect(task.priority).toBe("medium");
	});
});

describe("Task.addLabel", () => {
	test("正常系: 追加されていない Label なら末尾に追加した Task になる", () => {
		// Given: Label を1件持つ Task と、それに含まれない Label があるとき
		const task = createDummyBacklogTask({ labels: ["bug"] });
		const label = createDummyLabel("ui");

		// When: その Label を追加すると
		const result = Task.addLabel(task, { label });

		// Then: その Label が末尾に追加された Task と一致する
		const expected = createDummyBacklogTask({ labels: ["bug", "ui"] });
		expect(result).toStrictEqual(expected);
	});

	test("異常系: Label が上限の10件なら operation が Labels.add の LabelsLimitExceededError が発生する", () => {
		// Given: Label を上限件数まで持つ Task と、それに含まれない Label があるとき
		const task = createDummyBacklogTask({
			labels: Array.from({ length: 10 }, (_, i) => `label-${i}`),
		});
		const label = createDummyLabel("zzz");

		// When: その Label の追加を試みると
		let caught: unknown;
		try {
			Task.addLabel(task, { label });
		} catch (error) {
			caught = error;
		}

		// Then: LabelsLimitExceededError が発生し
		expect(caught).toBeInstanceOf(LabelsLimitExceededError);
		// And: その例外は操作名 Labels.add と上限件数 10 を持つ
		expect(caught).toMatchObject({ operation: "Labels.add", limit: 10 });
	});

	test("不変性: すでに追加されている Label なら元の Task をそのまま返す", () => {
		// Given: Label を持つ Task と、すでに含まれる Label があるとき
		const task = createDummyBacklogTask({ labels: ["bug"] });
		const label = createDummyLabel("bug");

		// When: その Label を追加すると
		const result = Task.addLabel(task, { label });

		// Then: その元の Task と同じ参照が返される
		expect(result).toBe(task);
	});

	test("不変性: Label を追加しても元の Task は変わらない", () => {
		// Given: Label を1件持つ Task と、それに含まれない Label があるとき
		const task = createDummyBacklogTask({ labels: ["bug"] });
		const label = createDummyLabel("ui");

		// When: その Label を追加すると
		Task.addLabel(task, { label });

		// Then: 元の Task は Label を1件持つまま変わっていない
		const expected = createDummyBacklogTask({ labels: ["bug"] });
		expect(task).toStrictEqual(expected);
	});
});

describe("Task.removeLabel", () => {
	test("正常系: 追加されている Label なら外した Task になる", () => {
		// Given: Label を2件持つ Task と、その中に含まれる Label があるとき
		const task = createDummyBacklogTask({ labels: ["bug", "ui"] });
		const label = createDummyLabel("bug");

		// When: その Label を外すと
		const result = Task.removeLabel(task, { label });

		// Then: その Label を外した Task と一致する
		const expected = createDummyBacklogTask({ labels: ["ui"] });
		expect(result).toStrictEqual(expected);
	});

	test("不変性: 追加されていない Label なら元の Task をそのまま返す", () => {
		// Given: Label を持つ Task と、含まれていない Label があるとき
		const task = createDummyBacklogTask({ labels: ["bug"] });
		const label = createDummyLabel("ui");

		// When: その Label を外すと
		const result = Task.removeLabel(task, { label });

		// Then: その元の Task と同じ参照が返される
		expect(result).toBe(task);
	});

	test("不変性: Label を外しても元の Task は変わらない", () => {
		// Given: Label を2件持つ Task と、その中に含まれる Label があるとき
		const task = createDummyBacklogTask({ labels: ["bug", "ui"] });
		const label = createDummyLabel("bug");

		// When: その Label を外すと
		Task.removeLabel(task, { label });

		// Then: 元の Task は Label を2件持つまま変わっていない
		const expected = createDummyBacklogTask({ labels: ["bug", "ui"] });
		expect(task).toStrictEqual(expected);
	});
});

describe("Task.linkPullRequest", () => {
	test("正常系: PullRequestUrl を持つ Task になる", () => {
		// Given: まだプルリクエストが紐づいていない Task と、PullRequestUrl があるとき
		const task = createDummyBacklogTask();
		const url = createDummyPullRequestUrl();

		// When: その Task にその URL を紐づけると
		const result = Task.linkPullRequest(task, { url });

		// Then: その URL を持つ Task と一致する
		const expected = createDummyBacklogTask({ pullRequestUrl: url });
		expect(result).toStrictEqual(expected);
	});

	test.for([
		{ name: "backlog", task: createDummyBacklogTask() },
		{ name: "inProgress", task: createDummyInProgressTask() },
		{ name: "done", task: createDummyDoneTask() },
	])("正常系: $name の Task にも紐づけられる", ({ task }) => {
		// Given: ケースごとの状態に対応する Task と、PullRequestUrl があるとき
		const url = createDummyPullRequestUrl();

		// When: その Task にその URL を紐づけると
		const result = Task.linkPullRequest(task, { url });

		// Then: その URL を持つ
		expect(result.pullRequestUrl).toBe(url);
	});

	test("正常系: すでに紐づいていればその URL で置き換える", () => {
		// Given: すでにプルリクエストが紐づいている Task と、別の URL があるとき
		const task = createDummyBacklogTask({
			pullRequestUrl: createDummyPullRequestUrl(
				"https://example.com/owner/repo/pull/1",
			),
		});
		const url = createDummyPullRequestUrl(
			"https://example.com/owner/repo/pull/2",
		);

		// When: その Task にその URL を紐づけると
		const result = Task.linkPullRequest(task, { url });

		// Then: 後から紐づけた URL を持つ
		expect(result.pullRequestUrl).toBe(url);
	});

	test("不変性: 紐づけても元の Task は変わらない", () => {
		// Given: まだプルリクエストが紐づいていない Task と、PullRequestUrl があるとき
		const task = createDummyBacklogTask();
		const url = createDummyPullRequestUrl();

		// When: その Task にその URL を紐づけると
		Task.linkPullRequest(task, { url });

		// Then: その Task は pullRequestUrl の項目を持たないままである
		expect("pullRequestUrl" in task).toBe(false);
	});

	test("不変性: 凍結された Task を返す", () => {
		// Given: まだプルリクエストが紐づいていない Task と、PullRequestUrl があるとき
		const task = createDummyBacklogTask();
		const url = createDummyPullRequestUrl();

		// When: その Task にその URL を紐づけると
		const result = Task.linkPullRequest(task, { url });

		// Then: 凍結された Task になる
		expect(Object.isFrozen(result)).toBe(true);
	});
});

describe("TaskStatusMismatchError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 着手の操作名と、期待した状態・実際の状態でエラーを作ると
		const error = new TaskStatusMismatchError(
			"Task.start",
			createDummyTaskId("PROJ-123"),
			"backlog",
			"done",
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と TaskId と期待した状態と実際の状態が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 着手の操作名と、期待した状態・実際の状態でエラーを作ると
		const error = new TaskStatusMismatchError(
			"Task.start",
			createDummyTaskId("PROJ-123"),
			"backlog",
			"done",
		);

		// Then: 操作名と TaskId と期待した状態と実際の状態が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "Task.start",
			taskId: "PROJ-123",
			expected: "backlog",
			actual: "done",
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: TaskStatusMismatchError の親の class を調べると
		const parent = Object.getPrototypeOf(TaskStatusMismatchError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が TaskStatusMismatchError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 着手の操作名と、期待した状態・実際の状態でエラーを作ると
		const error = new TaskStatusMismatchError(
			"Task.start",
			createDummyTaskId("PROJ-123"),
			"backlog",
			"done",
		);

		// Then: name が class 名になる
		expect(error.name).toBe("TaskStatusMismatchError");
	});
});

describe("TaskStartedBeforeCreationError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 着手の操作名と、作成より前の着手時刻でエラーを作ると
		const error = new TaskStartedBeforeCreationError(
			"Task.start",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation とTaskId と渡された着手時刻と作成時刻が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 着手の操作名と、作成より前の着手時刻でエラーを作ると
		const error = new TaskStartedBeforeCreationError(
			"Task.start",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: 操作名と着手時刻・作成時刻が取り違えられずに残っている
		expect(error).toMatchObject({
			operation: "Task.start",
			taskId: "PROJ-123",
			startedAt: 1_000,
			createdAt: 2_000,
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: TaskStartedBeforeCreationError の親の class を調べると
		const parent = Object.getPrototypeOf(TaskStartedBeforeCreationError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が TaskStartedBeforeCreationError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 着手の操作名と、作成より前の着手時刻でエラーを作ると
		const error = new TaskStartedBeforeCreationError(
			"Task.start",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: name が class 名になる
		expect(error.name).toBe("TaskStartedBeforeCreationError");
	});
});

describe("TaskCompletedBeforeStartError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 完了の操作名と、着手より前の完了時刻でエラーを作ると
		const error = new TaskCompletedBeforeStartError(
			"Task.complete",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation とTaskId と渡された完了時刻と着手時刻が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 完了の操作名と、着手より前の完了時刻でエラーを作ると
		const error = new TaskCompletedBeforeStartError(
			"Task.complete",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: 操作名と完了時刻・着手時刻が取り違えられずに残っている
		expect(error).toMatchObject({
			operation: "Task.complete",
			taskId: "PROJ-123",
			completedAt: 1_000,
			startedAt: 2_000,
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: TaskCompletedBeforeStartError の親の class を調べると
		const parent = Object.getPrototypeOf(TaskCompletedBeforeStartError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が TaskCompletedBeforeStartError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 完了の操作名と、着手より前の完了時刻でエラーを作ると
		const error = new TaskCompletedBeforeStartError(
			"Task.complete",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: name が class 名になる
		expect(error.name).toBe("TaskCompletedBeforeStartError");
	});
});

describe("CommentPostedBeforePreviousCommentError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: コメントを追加する操作名と、直前のコメントより前の投稿時刻でエラーを作ると
		const error = new CommentPostedBeforePreviousCommentError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation とTaskId とクロックが返した投稿時刻と直前の投稿時刻が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: コメントを追加する操作名と、直前のコメントより前の投稿時刻でエラーを作ると
		const error = new CommentPostedBeforePreviousCommentError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: 操作名と投稿時刻・直前の投稿時刻が取り違えられずに残っている
		expect(error).toMatchObject({
			operation: "Task.addComment",
			taskId: "PROJ-123",
			postedAt: 1_000,
			previousPostedAt: 2_000,
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: CommentPostedBeforePreviousCommentError の親の class を調べると
		const parent = Object.getPrototypeOf(CommentPostedBeforePreviousCommentError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が CommentPostedBeforePreviousCommentError になる", () => {
		// Given: 特別な前提が無いとき

		// When: コメントを追加する操作名と、直前のコメントより前の投稿時刻でエラーを作ると
		const error = new CommentPostedBeforePreviousCommentError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: name が class 名になる
		expect(error.name).toBe("CommentPostedBeforePreviousCommentError");
	});
});

describe("CommentPostedBeforeTaskCreationError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: コメントを追加する操作名と、作成より前の投稿時刻でエラーを作ると
		const error = new CommentPostedBeforeTaskCreationError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation とTaskId とクロックが返した投稿時刻と作成時刻が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: コメントを追加する操作名と、作成より前の投稿時刻でエラーを作ると
		const error = new CommentPostedBeforeTaskCreationError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: 操作名と投稿時刻・作成時刻が取り違えられずに残っている
		expect(error).toMatchObject({
			operation: "Task.addComment",
			taskId: "PROJ-123",
			postedAt: 1_000,
			taskCreatedAt: 2_000,
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: CommentPostedBeforeTaskCreationError の親の class を調べると
		const parent = Object.getPrototypeOf(CommentPostedBeforeTaskCreationError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が CommentPostedBeforeTaskCreationError になる", () => {
		// Given: 特別な前提が無いとき

		// When: コメントを追加する操作名と、作成より前の投稿時刻でエラーを作ると
		const error = new CommentPostedBeforeTaskCreationError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			createDummyTimestamp(1_000),
			createDummyTimestamp(2_000),
		);

		// Then: name が class 名になる
		expect(error.name).toBe("CommentPostedBeforeTaskCreationError");
	});
});

describe("DuplicateCommentError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: Comment を追加する操作名と、重複した識別子でエラーを作ると
		const error = new DuplicateCommentError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			createDummyCommentId("3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f"),
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と TaskId と CommentId が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: Comment を追加する操作名と、重複した識別子でエラーを作ると
		const error = new DuplicateCommentError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			createDummyCommentId("3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f"),
		);

		// Then: 操作名と TaskId と重複した CommentId が残っている
		expect(error).toMatchObject({
			operation: "Task.addComment",
			taskId: "PROJ-123",
			commentId: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: DuplicateCommentError の親の class を調べると
		const parent = Object.getPrototypeOf(DuplicateCommentError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が DuplicateCommentError になる", () => {
		// Given: 特別な前提が無いとき

		// When: Comment を追加する操作名と、重複した識別子でエラーを作ると
		const error = new DuplicateCommentError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			createDummyCommentId("3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f"),
		);

		// Then: name が class 名になる
		expect(error.name).toBe("DuplicateCommentError");
	});
});

describe("CommentLimitExceededError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: Comment を追加する操作名と上限件数でエラーを作ると
		const error = new CommentLimitExceededError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			100,
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と TaskId と上限件数が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: Comment を追加する操作名と TaskId と上限件数でエラーを作ると
		const error = new CommentLimitExceededError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			100,
		);

		// Then: 操作名と上限件数が渡した値のまま残っている
		expect(error).toMatchObject({
			operation: "Task.addComment",
			taskId: "PROJ-123",
			limit: 100,
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: CommentLimitExceededError の親の class を調べると
		const parent = Object.getPrototypeOf(CommentLimitExceededError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が CommentLimitExceededError になる", () => {
		// Given: 特別な前提が無いとき

		// When: Comment を追加する操作名と上限件数でエラーを作ると
		const error = new CommentLimitExceededError(
			"Task.addComment",
			createDummyTaskId("PROJ-123"),
			100,
		);

		// Then: name が class 名になる
		expect(error.name).toBe("CommentLimitExceededError");
	});
});

describe("InvalidTaskTitleError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 表題を変える操作名と TaskId とその ZodError を渡してエラーを作ると
		const error = new InvalidTaskTitleError(
			"Task.rename",
			createDummyTaskId("PROJ-1"),
			cause,
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と TaskId が渡した値のまま残る", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 表題を変える操作名と TaskId とその ZodError を渡してエラーを作ると
		const error = new InvalidTaskTitleError(
			"Task.rename",
			createDummyTaskId("PROJ-1"),
			cause,
		);

		// Then: operation と taskId が渡した値になる
		expect(error.operation).toBe("Task.rename");
		expect(error.taskId).toBe("PROJ-1");
	});

	test("正常系: 元の ZodError の issues を件数と path ごと持つ", () => {
		// Given: 値そのものを指す issue を1件持つ ZodError があるとき
		const cause = new z.ZodError([
			{
				code: "custom",
				message: "表題は1文字以上です",
				path: [],
				input: "",
			},
		]);

		// When: 表題を変える操作名と TaskId とその ZodError を渡してエラーを作ると
		const error = new InvalidTaskTitleError(
			"Task.rename",
			createDummyTaskId("PROJ-1"),
			cause,
		);

		// Then: issues は値そのものを指すその1件の issue だけを持つ
		expect(error.issues).toHaveLength(1);
		expect(error.issues).toMatchObject([{ path: [] }]);
	});

	test("正常系: cause に元の ZodError を持つ", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 表題を変える操作名と TaskId とその ZodError を渡してエラーを作ると
		const error = new InvalidTaskTitleError(
			"Task.rename",
			createDummyTaskId("PROJ-1"),
			cause,
		);

		// Then: cause がその ZodError そのものになる
		expect(error.cause).toBe(cause);
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: InvalidTaskTitleError の親の class を調べると
		const parent = Object.getPrototypeOf(InvalidTaskTitleError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が InvalidTaskTitleError になる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 表題を変える操作名と TaskId とその ZodError を渡してエラーを作ると
		const error = new InvalidTaskTitleError(
			"Task.rename",
			createDummyTaskId("PROJ-1"),
			cause,
		);

		// Then: name が class 名になる
		expect(error.name).toBe("InvalidTaskTitleError");
	});
});
