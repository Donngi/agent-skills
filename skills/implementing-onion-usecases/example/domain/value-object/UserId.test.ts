import { describe, expect, test } from "vitest";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { UserId, UserIdSchema } from "./UserId";
import { createDummyUserId } from "./UserId.helper.test";

describe("UserId.create", () => {
	test("正常系: 小文字の UUID v4 なら受け入れる", () => {
		// Given: 小文字の UUID v4 の UserId の入力があるとき
		const value = "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e";

		// When: その UserId を生成すると
		const result = UserId.create(value);

		// Then: その値と一致する UserId が返される
		expect(result).toBe(value);
	});

	test.for([
		{ name: "空文字", value: "" },
		{ name: "大文字を含む", value: "0B6F5F5E-1B5E-4F1E-9F1E-1B5E4F1E9F1E" },
		{ name: "バージョンが1", value: "0b6f5f5e-1b5e-1f1e-9f1e-1b5e4f1e9f1e" },
		{ name: "バリアントが不正", value: "0b6f5f5e-1b5e-4f1e-7f1e-1b5e4f1e9f1e" },
		{ name: "ハイフンが無い", value: "0b6f5f5e1b5e4f1e9f1e1b5e4f1e9f1e" },
		{ name: "1文字足りない", value: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1" },
		{ name: "前に空白がある", value: " 0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e" },
		{
			name: "後ろに空白がある",
			value: "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e ",
		},
	])("異常系: $name なら InvalidCreationParamError が発生する", ({ value }) => {
		// Given: 制約に違反する UserId の入力があるとき

		// When: その UserId を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => UserId.create(value)).toThrow(InvalidCreationParamError);
	});

	test("異常系: create に失敗したら operation に UserId.create を持つ InvalidCreationParamError が発生する", () => {
		// Given: 大文字を含む UserId の入力があるとき
		const value = "0B6F5F5E-1B5E-4F1E-9F1E-1B5E4F1E9F1E";

		// When: その UserId の生成を試みると
		let caught: unknown;
		try {
			UserId.create(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が UserId.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "UserId.create" });
	});
});

describe("UserId.reconstruct", () => {
	test("正常系: 制約を満たす値なら復元できる", () => {
		// Given: 制約を満たす UserId の保存値があるとき
		const value = "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e";

		// When: その UserId を復元すると
		const result = UserId.reconstruct(value);

		// Then: その値と一致する UserId が返される
		expect(result).toBe(value);
	});

	test("異常系: reconstruct に失敗したら operation が UserId.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 大文字を含む UserId の保存値があるとき
		const value = "0B6F5F5E-1B5E-4F1E-9F1E-1B5E4F1E9F1E";

		// When: その UserId の復元を試みると
		let caught: unknown;
		try {
			UserId.reconstruct(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が UserId.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "UserId.reconstruct" });
	});
});

describe("UserIdSchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす UserId があるとき
		const value = createDummyUserId();

		// When: その値を UserIdSchema で検証すると
		const result = UserIdSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "大文字を含む", value: "0B6F5F5E-1B5E-4F1E-9F1E-1B5E4F1E9F1E" },
		{ name: "数値", value: 1 },
		{ name: "undefined", value: undefined },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: UserId ではない値があるとき

		// When: その値を UserIdSchema で検証すると
		const result = UserIdSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});
