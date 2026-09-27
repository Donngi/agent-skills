import { describe, expect, test } from "vitest";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { ProjectId, ProjectIdSchema } from "./ProjectId";
import { createDummyProjectId } from "./ProjectId.helper.test";

describe("ProjectId.create", () => {
	test.for([
		{ name: "大文字英字2文字", value: "PR" },
		{ name: "大文字英字10文字", value: "ABCDEFGHIJ" },
	])("正常系: $name なら受け入れる", ({ value }) => {
		// Given: 制約を満たす ProjectId の入力があるとき

		// When: その ProjectId を生成すると
		const result = ProjectId.create(value);

		// Then: その値と一致する ProjectId が返される
		expect(result).toBe(value);
	});

	test.for([
		{ name: "空文字", value: "" },
		{ name: "1文字", value: "P" },
		{ name: "11文字", value: "ABCDEFGHIJK" },
		{ name: "小文字を含む", value: "Proj" },
		{ name: "数字を含む", value: "PROJ1" },
		{ name: "ハイフンを含む", value: "PR-OJ" },
		{ name: "前に空白がある", value: " PROJ" },
		{ name: "後ろに空白がある", value: "PROJ " },
		{ name: "末尾に改行がある", value: "PROJ\n" },
	])("異常系: $name なら InvalidCreationParamError が発生する", ({ value }) => {
		// Given: 制約に違反する ProjectId の入力があるとき

		// When: その ProjectId を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => ProjectId.create(value)).toThrow(InvalidCreationParamError);
	});

	test("異常系: create に失敗したら operation に ProjectId.create を持つ InvalidCreationParamError が発生する", () => {
		// Given: 小文字の ProjectId の入力があるとき
		const value = "proj";

		// When: その ProjectId の生成を試みると
		let caught: unknown;
		try {
			ProjectId.create(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が ProjectId.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "ProjectId.create" });
	});
});

describe("ProjectId.reconstruct", () => {
	test("正常系: 制約を満たす値なら復元できる", () => {
		// Given: 制約を満たす ProjectId の保存値があるとき
		const value = "PROJ";

		// When: その ProjectId を復元すると
		const result = ProjectId.reconstruct(value);

		// Then: その値と一致する ProjectId が返される
		expect(result).toBe(value);
	});

	test("異常系: reconstruct に失敗したら operation が ProjectId.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 小文字の ProjectId の保存値があるとき
		const value = "proj";

		// When: その ProjectId の復元を試みると
		let caught: unknown;
		try {
			ProjectId.reconstruct(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が ProjectId.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "ProjectId.reconstruct" });
	});
});

describe("ProjectIdSchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす ProjectId があるとき
		const value = createDummyProjectId();

		// When: その値を ProjectIdSchema で検証すると
		const result = ProjectIdSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "小文字を含む", value: "Proj" },
		{ name: "数値", value: 1 },
		{ name: "undefined", value: undefined },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: ProjectId ではない値があるとき

		// When: その値を ProjectIdSchema で検証すると
		const result = ProjectIdSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});
