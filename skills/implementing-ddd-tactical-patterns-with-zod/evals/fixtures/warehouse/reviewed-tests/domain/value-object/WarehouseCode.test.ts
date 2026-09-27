import { describe, expect, test } from "vitest";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { WarehouseCode, WarehouseCodeSchema } from "./WarehouseCode";
import { createDummyWarehouseCode } from "./WarehouseCode.helper.test";

describe("WarehouseCode.create", () => {
	test("正常系: 大文字英字2文字なら受け入れる", () => {
		// Given: 文字数の下限ちょうどの WarehouseCode の入力があるとき
		const value = "TK";

		// When: その WarehouseCode を生成すると
		const result = WarehouseCode.create(value);

		// Then: その値と一致する WarehouseCode が返される
		expect(result).toBe(value);
	});

	test("正常系: 大文字英字6文字なら受け入れる", () => {
		// Given: 文字数の上限ちょうどの WarehouseCode の入力があるとき
		const value = "OSAKAA";

		// When: その WarehouseCode を生成すると
		// Then: 例外が発生しない
		expect(() => WarehouseCode.create(value)).not.toThrow();
	});

	test.for([
		{ name: "空文字", value: "" },
		{ name: "1文字", value: "T" },
		{ name: "7文字", value: "ABCDEFG" },
		{ name: "小文字を含む", value: "Tokyo" },
		{ name: "数字を含む", value: "TOKYO1" },
		{ name: "前に空白がある", value: " TOKYO" },
		{ name: "後ろに空白がある", value: "TOKYO " },
	])("異常系: $name なら InvalidCreationParamError が発生する", ({ value }) => {
		// Given: 制約に違反する WarehouseCode の入力があるとき

		// When: その WarehouseCode を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => WarehouseCode.create(value)).toThrow(
			InvalidCreationParamError,
		);
	});

	test("異常系: create に失敗したら operation が WarehouseCode.create の InvalidCreationParamError が発生する", () => {
		// Given: 小文字を含む WarehouseCode の入力があるとき
		const value = "Tokyo";

		// When: その WarehouseCode の生成を試みると
		let caught: unknown;
		try {
			WarehouseCode.create(value);
		} catch (error) {
			caught = error;
		}

		// Then: operation が WarehouseCode.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "WarehouseCode.create" });
	});
});

describe("WarehouseCode.reconstruct", () => {
	test("正常系: 制約を満たす値なら復元できる", () => {
		// Given: 制約を満たす WarehouseCode の保存値があるとき
		const value = "TOKYO";

		// When: その WarehouseCode を復元すると
		const result = WarehouseCode.reconstruct(value);

		// Then: その値と一致する WarehouseCode が返される
		expect(result).toBe(value);
	});

	test("異常系: reconstruct に失敗したら operation が WarehouseCode.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 小文字を含む WarehouseCode の保存値があるとき
		const value = "Tokyo";

		// When: その WarehouseCode の復元を試みると
		let caught: unknown;
		try {
			WarehouseCode.reconstruct(value);
		} catch (error) {
			caught = error;
		}

		// Then: operation が WarehouseCode.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "WarehouseCode.reconstruct" });
	});
});

describe("WarehouseCodeSchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす WarehouseCode があるとき
		const value = createDummyWarehouseCode();

		// When: その値を WarehouseCodeSchema で検証すると
		const result = WarehouseCodeSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "小文字を含む", value: "Tokyo" },
		{ name: "数値", value: 1 },
		{ name: "undefined", value: undefined },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: WarehouseCode ではない値があるとき

		// When: その値を WarehouseCodeSchema で検証すると
		const result = WarehouseCodeSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});
