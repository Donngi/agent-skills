import { describe, expect, test } from "vitest";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { createDummyProjectId } from "./ProjectId.helper.test";
import { TaskId, TaskIdSchema } from "./TaskId";
import { createDummyTaskId } from "./TaskId.helper.test";

describe("TaskId.create", () => {
	test.for([
		{ name: "番号が1", value: "PROJ-1" },
		{ name: "番号が9桁の最大値", value: "PROJ-999999999" },
		{ name: "接頭辞が2文字", value: "PR-1" },
		{ name: "接頭辞が10文字", value: "ABCDEFGHIJ-1" },
	])("正常系: $name なら受け入れる", ({ value }) => {
		// Given: 制約を満たす TaskId の入力があるとき

		// When: その TaskId を生成すると
		const result = TaskId.create(value);

		// Then: その文字列と同じ TaskId が返される
		expect(result).toBe(value);
	});

	test.for([
		{ name: "区切りが無い", value: "PROJ1" },
		{ name: "接頭辞が ProjectId ではない", value: "Proj-1" },
		{ name: "番号が0", value: "PROJ-0" },
		{ name: "番号に先頭ゼロがある", value: "PROJ-01" },
		{ name: "番号に負号がある", value: "PROJ--1" },
		{ name: "番号が小数", value: "PROJ-1.5" },
		{ name: "番号に英字を含む", value: "PROJ-1a" },
		{ name: "区切りの後ろが空", value: "PROJ-" },
		{ name: "番号が10桁", value: "PROJ-1000000000" },
		{ name: "後ろに空白がある", value: "PROJ-1 " },
	])("異常系: $name なら InvalidCreationParamError が発生する", ({ value }) => {
		// Given: 制約に1つ違反する TaskId の入力があるとき

		// When: その TaskId を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => TaskId.create(value)).toThrow(InvalidCreationParamError);
	});

	test.for([
		{
			name: "番号に負号がある",
			value: "PROJ--1",
			message: "タスク番号を負の数にすることはできません",
		},
		{
			name: "番号が0",
			value: "PROJ-0",
			message: "タスク番号を0や0で始まる数にすることはできません",
		},
		{
			name: "番号に先頭ゼロがある",
			value: "PROJ-01",
			message: "タスク番号を0や0で始まる数にすることはできません",
		},
		{
			name: "番号が10桁",
			value: "PROJ-1000000000",
			message: "タスク番号は9桁までです",
		},
	])(
		"異常系: $name なら、その違反だけを述べる issue を持つ InvalidCreationParamError が発生する",
		({ value, message }) => {
			// Given: 番号の制約に1つ違反する TaskId の入力があるとき

			// When: その TaskId の生成を試みると
			let caught: unknown;
			try {
				TaskId.create(value);
			} catch (error) {
				caught = error;
			}

			// Then: 違反した条件を述べる issue を1件だけ持つ InvalidCreationParamError が発生する
			expect(caught).toBeInstanceOf(InvalidCreationParamError);
			expect(caught).toMatchObject({ issues: [{ message }] });
		},
	);

	test("異常系: create に失敗したら operation に TaskId.create を持つ InvalidCreationParamError が発生する", () => {
		// Given: 番号が下限より1小さい TaskId の入力があるとき
		const value = "PROJ-0";

		// When: その TaskId の生成を試みると
		let caught: unknown;
		try {
			TaskId.create(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が TaskId.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "TaskId.create" });
	});
});

describe("TaskId.reconstruct", () => {
	test("正常系: 制約を満たす値なら復元できる", () => {
		// Given: 制約を満たす TaskId の保存値があるとき
		const value = "PROJ-123";

		// When: その TaskId を復元すると
		const result = TaskId.reconstruct(value);

		// Then: その文字列と同じ TaskId が返される
		expect(result).toBe(value);
	});

	test("異常系: reconstruct に失敗したら operation が TaskId.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 番号が下限より1小さい TaskId の保存値があるとき
		const value = "PROJ-0";

		// When: その TaskId の復元を試みると
		let caught: unknown;
		try {
			TaskId.reconstruct(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が TaskId.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "TaskId.reconstruct" });
	});
});

describe("TaskIdSchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす TaskId があるとき
		const value = createDummyTaskId();

		// When: その値を TaskIdSchema で検証すると
		const result = TaskIdSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "番号が0", value: "PROJ-0" },
		{ name: "数値", value: 1 },
		{ name: "undefined", value: undefined },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: TaskId ではない値があるとき

		// When: その値を TaskIdSchema で検証すると
		const result = TaskIdSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});

describe("TaskId.projectId", () => {
	test("正常系: 区切りより前を ProjectId として返す", () => {
		// Given: ProjectId を接頭辞に持つ TaskId があるとき
		const id = createDummyTaskId("ABC-123");

		// When: その TaskId から ProjectId を取り出すと
		const result = TaskId.projectId(id);

		// Then: 接頭辞の ProjectId が返される
		const expected = createDummyProjectId("ABC");
		expect(result).toBe(expected);
	});
});
