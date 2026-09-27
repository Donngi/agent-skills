import { describe, expect, test } from "vitest";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { createDummyTimestamp } from "./Timestamp.helper.test";
import { WorkPeriod, WorkPeriodSchema } from "./WorkPeriod";
import { createDummyWorkPeriod } from "./WorkPeriod.helper.test";

describe("WorkPeriod.create", () => {
	test("正常系: 制約を満たす値なら同じ着手時刻と完了時刻を持つ WorkPeriod を返す", () => {
		// Given: 完了時刻が着手時刻より後の WorkPeriod の入力で
		const props = {
			startedAt: createDummyTimestamp(2_000),
			completedAt: createDummyTimestamp(3_000),
		};

		// When: WorkPeriod を生成すると
		const result = WorkPeriod.create(props);

		// Then: その入力と同じ着手時刻と完了時刻を持つ WorkPeriod になる
		expect(result).toStrictEqual({ startedAt: 2_000, completedAt: 3_000 });
	});

	test("正常系: 完了時刻が着手時刻と同じなら受け入れる", () => {
		// Given: 着手時刻と完了時刻が同じ入力で
		const props = {
			startedAt: createDummyTimestamp(2_000),
			completedAt: createDummyTimestamp(2_000),
		};

		// When: WorkPeriod を生成すると
		const result = WorkPeriod.create(props);

		// Then: その入力どおり着手時刻と完了時刻が同じ WorkPeriod になる
		expect(result).toStrictEqual({ startedAt: 2_000, completedAt: 2_000 });
	});

	test("異常系: 完了時刻が着手時刻より前なら issue の path が completedAt を指す InvalidCreationParamError が発生する", () => {
		// Given: 完了時刻が着手時刻の1ミリ秒前の入力で
		const props = {
			startedAt: createDummyTimestamp(2_000),
			completedAt: createDummyTimestamp(1_999),
		};

		// When: WorkPeriod の生成を試みると
		let caught: unknown;
		try {
			WorkPeriod.create(props);
		} catch (error) {
			caught = error;
		}

		// Then: issue の path が completedAt を指す InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ issues: [{ path: ["completedAt"] }] });
	});

	test("異常系: 余剰キーを持つなら InvalidCreationParamError が発生する", () => {
		// Given: 余剰キーを含む入力で
		const props = {
			startedAt: createDummyTimestamp(2_000),
			completedAt: createDummyTimestamp(3_000),
			memo: "x",
		};

		// When: WorkPeriod を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => WorkPeriod.create(props)).toThrow(InvalidCreationParamError);
	});

	test("異常系: create に失敗したら operation に WorkPeriod.create を持つ InvalidCreationParamError が発生する", () => {
		// Given: 完了時刻が着手時刻より前の入力で
		const props = {
			startedAt: createDummyTimestamp(2_000),
			completedAt: createDummyTimestamp(1_999),
		};

		// When: WorkPeriod の生成を試みると
		let caught: unknown;
		try {
			WorkPeriod.create(props);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が WorkPeriod.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "WorkPeriod.create" });
	});

	test("不変性: 凍結された WorkPeriod を返す", () => {
		// Given: 制約を満たす WorkPeriod の入力で
		const props = {
			startedAt: createDummyTimestamp(2_000),
			completedAt: createDummyTimestamp(3_000),
		};

		// When: WorkPeriod を生成すると
		const result = WorkPeriod.create(props);

		// Then: 凍結された WorkPeriod になる
		expect(Object.isFrozen(result)).toBe(true);
	});
});

describe("WorkPeriod.reconstruct", () => {
	test("正常系: 制約を満たす値なら復元できる", () => {
		// Given: 制約を満たす WorkPeriod の保存値で
		const props = { startedAt: 2_000, completedAt: 3_000 };

		// When: WorkPeriod を復元すると
		const result = WorkPeriod.reconstruct(props);

		// Then: その保存値と同じ着手時刻と完了時刻を持つ WorkPeriod になる
		expect(result).toStrictEqual({ startedAt: 2_000, completedAt: 3_000 });
	});

	test("異常系: 着手時刻が負なら InvalidReconstructParamError が発生する", () => {
		// Given: 着手時刻が Timestamp の範囲外の保存値で
		const props = { startedAt: -1, completedAt: 3_000 };

		// When: WorkPeriod を復元すると
		// Then: InvalidReconstructParamError が発生する
		expect(() => WorkPeriod.reconstruct(props)).toThrow(
			InvalidReconstructParamError,
		);
	});

	test("異常系: 余剰キーを持つなら operation が WorkPeriod.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 余剰キーを含む WorkPeriod の保存値で
		const props = { startedAt: 2_000, completedAt: 3_000, memo: "x" };

		// When: WorkPeriod の復元を試みると
		let caught: unknown;
		try {
			WorkPeriod.reconstruct(props);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が WorkPeriod.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "WorkPeriod.reconstruct" });
	});
});

describe("WorkPeriodSchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす WorkPeriod があるとき
		const value = createDummyWorkPeriod();

		// When: その値を WorkPeriodSchema で検証すると
		const result = WorkPeriodSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{
			name: "完了時刻が着手時刻より前",
			value: { startedAt: 2_000, completedAt: 1_999 },
		},
		{
			name: "着手時刻が文字列",
			value: { startedAt: "2000", completedAt: 3_000 },
		},
		{ name: "null", value: null },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: WorkPeriod ではない値があるとき

		// When: その値を WorkPeriodSchema で検証すると
		const result = WorkPeriodSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: 余剰キーを持つなら検証を通らない", () => {
		// Given: 余剰キーを含む WorkPeriod の値があるとき
		const value = { startedAt: 2_000, completedAt: 3_000, memo: "x" };

		// When: その値を WorkPeriodSchema で検証すると
		const result = WorkPeriodSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});

describe("WorkPeriod.equals", () => {
	test("正常系: 別々に作った着手時刻も完了時刻も同じ WorkPeriod なら等しいと判定される", () => {
		// Given: 別々に作った同じ内容の2つの WorkPeriod があるとき
		const a = createDummyWorkPeriod({ startedAt: 2_000, completedAt: 3_000 });
		const b = createDummyWorkPeriod({ startedAt: 2_000, completedAt: 3_000 });

		// When: その2つの等価性を判定すると
		const result = WorkPeriod.equals(a, b);

		// Then: 等しいと判定される
		expect(result).toBe(true);
	});

	test.for([
		{
			name: "着手時刻だけが異なる",
			b: { startedAt: 2_500, completedAt: 3_000 },
		},
		{
			name: "完了時刻だけが異なる",
			b: { startedAt: 2_000, completedAt: 3_500 },
		},
	])("正常系: $name なら等しくないと判定される", ({ b: bProps }) => {
		// Given: 基準の WorkPeriod と、それと1項目だけ異なる WorkPeriod があるとき
		const a = createDummyWorkPeriod({ startedAt: 2_000, completedAt: 3_000 });
		const b = createDummyWorkPeriod(bProps);

		// When: その2つの等価性を判定すると
		const result = WorkPeriod.equals(a, b);

		// Then: 等しくないと判定される
		expect(result).toBe(false);
	});
});
