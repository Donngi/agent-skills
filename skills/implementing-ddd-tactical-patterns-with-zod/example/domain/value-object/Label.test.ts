import { describe, expect, test } from "vitest";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { Label, LabelSchema } from "./Label";
import { createDummyLabel } from "./Label.helper.test";

describe("Label.create", () => {
	test.for([
		{ name: "1文字", value: "a" },
		{ name: "30文字", value: "a".repeat(30) },
		{ name: "小文字英数字とハイフン", value: "ui-v2" },
	])("正常系: $name なら受け入れる", ({ value }) => {
		// Given: 制約を満たす Label の入力があるとき

		// When: その Label を生成すると
		const result = Label.create(value);

		// Then: その値と一致する Label が返される
		expect(result).toBe(value);
	});

	test.for([
		{ name: "空文字", value: "" },
		{ name: "31文字", value: "a".repeat(31) },
		{ name: "大文字を含む", value: "Bug" },
		{ name: "アンダースコアを含む", value: "bug_fix" },
		{ name: "途中に空白がある", value: "bug fix" },
		{ name: "前に空白がある", value: " bug" },
		{ name: "後ろに空白がある", value: "bug " },
		{ name: "日本語を含む", value: "バグ" },
	])("異常系: $name なら InvalidCreationParamError が発生する", ({ value }) => {
		// Given: 制約に違反する Label の入力があるとき

		// When: その Label を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => Label.create(value)).toThrow(InvalidCreationParamError);
	});

	test("異常系: create に失敗したら operation に Label.create を持つ InvalidCreationParamError が発生する", () => {
		// Given: 大文字を含む Label の入力があるとき
		const value = "Bug";

		// When: その Label の生成を試みると
		let caught: unknown;
		try {
			Label.create(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Label.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "Label.create" });
	});
});

describe("Label.reconstruct", () => {
	test("正常系: 制約を満たす値なら復元できる", () => {
		// Given: 制約を満たす Label の保存値があるとき
		const value = "bug";

		// When: その Label を復元すると
		const result = Label.reconstruct(value);

		// Then: その値と一致する Label が返される
		expect(result).toBe(value);
	});

	test("異常系: reconstruct に失敗したら operation が Label.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 大文字を含む Label の保存値があるとき
		const value = "Bug";

		// When: その Label の復元を試みると
		let caught: unknown;
		try {
			Label.reconstruct(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Label.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "Label.reconstruct" });
	});
});

describe("LabelSchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす Label があるとき
		const value = createDummyLabel();

		// When: その値を LabelSchema で検証すると
		const result = LabelSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "大文字を含む", value: "Bug" },
		{ name: "数値", value: 1 },
		{ name: "undefined", value: undefined },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: Label ではない値があるとき

		// When: その値を LabelSchema で検証すると
		const result = LabelSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});
