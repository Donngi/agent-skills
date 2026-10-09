import { describe, expect, test } from "vitest";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { Timestamp, TimestampSchema } from "./Timestamp";
import { createDummyTimestamp } from "./Timestamp.helper.test";

describe("Timestamp.create", () => {
	test.for([
		{ name: "0", value: 0 },
		{ name: "9999-12-31 の最後のミリ秒", value: 253_402_300_799_999 },
	])("正常系: $name なら受け入れる", ({ value }) => {
		// Given: 範囲の境界にある Timestamp の入力があるとき

		// When: その Timestamp を生成すると
		const result = Timestamp.create(value);

		// Then: その値と一致する Timestamp が返される
		expect(result).toBe(value);
	});

	test.for([
		{ name: "負の値", value: -1 },
		{ name: "10000-01-01 の最初のミリ秒", value: 253_402_300_800_000 },
		{ name: "小数", value: 1.5 },
		{ name: "NaN", value: Number.NaN },
		{ name: "Infinity", value: Number.POSITIVE_INFINITY },
	])("異常系: $name なら InvalidCreationParamError が発生する", ({ value }) => {
		// Given: 範囲外か整数ではない Timestamp の入力があるとき

		// When: その Timestamp を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => Timestamp.create(value)).toThrow(InvalidCreationParamError);
	});

	test("異常系: create に失敗したら operation に Timestamp.create を持つ InvalidCreationParamError が発生する", () => {
		// Given: 負の Timestamp の入力があるとき
		const value = -1;

		// When: その Timestamp の生成を試みると
		let caught: unknown;
		try {
			Timestamp.create(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Timestamp.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "Timestamp.create" });
	});
});

describe("Timestamp.reconstruct", () => {
	test("正常系: 制約を満たす値なら復元できる", () => {
		// Given: 制約を満たす Timestamp の保存値があるとき
		const value = 1_000;

		// When: その Timestamp を復元すると
		const result = Timestamp.reconstruct(value);

		// Then: その値と一致する Timestamp が返される
		expect(result).toBe(value);
	});

	test("異常系: reconstruct に失敗したら operation が Timestamp.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 負の Timestamp の保存値があるとき
		const value = -1;

		// When: その Timestamp の復元を試みると
		let caught: unknown;
		try {
			Timestamp.reconstruct(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Timestamp.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "Timestamp.reconstruct" });
	});
});

describe("TimestampSchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす Timestamp があるとき
		const value = createDummyTimestamp();

		// When: その値を TimestampSchema で検証すると
		const result = TimestampSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "負の値", value: -1 },
		{ name: "数字の文字列", value: "1000" },
		{ name: "undefined", value: undefined },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: Timestamp ではない値があるとき

		// When: その値を TimestampSchema で検証すると
		const result = TimestampSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});
