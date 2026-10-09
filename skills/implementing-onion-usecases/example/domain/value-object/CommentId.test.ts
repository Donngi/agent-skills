import { describe, expect, test } from "vitest";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { CommentId, CommentIdSchema } from "./CommentId";
import { createDummyCommentId } from "./CommentId.helper.test";

describe("CommentId.create", () => {
	test("正常系: 小文字の UUID v4 なら受け入れる", () => {
		// Given: 小文字の UUID v4 の CommentId の入力があるとき
		const value = "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f";

		// When: その CommentId を生成すると
		const result = CommentId.create(value);

		// Then: その値と一致する CommentId が返される
		expect(result).toBe(value);
	});

	test.for([
		{ name: "空文字", value: "" },
		{ name: "大文字を含む", value: "3F2C0C1E-8A4B-4D6E-9F10-2A3B4C5D6E7F" },
		{ name: "バージョンが1", value: "3f2c0c1e-8a4b-1d6e-9f10-2a3b4c5d6e7f" },
		{ name: "バリアントが不正", value: "3f2c0c1e-8a4b-4d6e-7f10-2a3b4c5d6e7f" },
		{ name: "ハイフンが無い", value: "3f2c0c1e8a4b4d6e9f102a3b4c5d6e7f" },
		{ name: "1文字足りない", value: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7" },
		{ name: "前に空白がある", value: " 3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f" },
		{
			name: "後ろに空白がある",
			value: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f ",
		},
	])("異常系: $name なら InvalidCreationParamError が発生する", ({ value }) => {
		// Given: 制約に違反する CommentId の入力があるとき

		// When: その CommentId を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => CommentId.create(value)).toThrow(InvalidCreationParamError);
	});

	test("異常系: create に失敗したら operation に CommentId.create を持つ InvalidCreationParamError が発生する", () => {
		// Given: 大文字を含む CommentId の入力があるとき
		const value = "3F2C0C1E-8A4B-4D6E-9F10-2A3B4C5D6E7F";

		// When: その CommentId の生成を試みると
		let caught: unknown;
		try {
			CommentId.create(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が CommentId.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "CommentId.create" });
	});
});

describe("CommentId.reconstruct", () => {
	test("正常系: 制約を満たす値なら復元できる", () => {
		// Given: 制約を満たす CommentId の保存値があるとき
		const value = "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f";

		// When: その CommentId を復元すると
		const result = CommentId.reconstruct(value);

		// Then: その値と一致する CommentId が返される
		expect(result).toBe(value);
	});

	test("異常系: reconstruct に失敗したら operation が CommentId.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 大文字を含む CommentId の保存値があるとき
		const value = "3F2C0C1E-8A4B-4D6E-9F10-2A3B4C5D6E7F";

		// When: その CommentId の復元を試みると
		let caught: unknown;
		try {
			CommentId.reconstruct(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が CommentId.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "CommentId.reconstruct" });
	});
});

describe("CommentIdSchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす CommentId があるとき
		const value = createDummyCommentId();

		// When: その値を CommentIdSchema で検証すると
		const result = CommentIdSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "大文字を含む", value: "3F2C0C1E-8A4B-4D6E-9F10-2A3B4C5D6E7F" },
		{ name: "数値", value: 1 },
		{ name: "undefined", value: undefined },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: CommentId ではない値があるとき

		// When: その値を CommentIdSchema で検証すると
		const result = CommentIdSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});
