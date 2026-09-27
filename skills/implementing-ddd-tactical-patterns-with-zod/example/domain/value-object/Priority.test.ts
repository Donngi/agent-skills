import { describe, expect, test } from "vitest";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { Priority, PrioritySchema } from "./Priority";
import { createDummyPriority } from "./Priority.helper.test";

describe("Priority.create", () => {
	test.for([
		{ value: "highest" },
		{ value: "high" },
		{ value: "medium" },
		{ value: "low" },
		{ value: "lowest" },
	])("正常系: $value なら受け入れる", ({ value }) => {
		// Given: 定義に含まれる Priority の入力があるとき

		// When: その Priority を生成すると
		const result = Priority.create(value);

		// Then: その値と一致する Priority が返される
		expect(result).toBe(value);
	});

	test.for([
		{ name: "定義に無い値", value: "urgent" },
		{ name: "大文字を含む", value: "High" },
		{ name: "前に空白がある", value: " high" },
		{ name: "後ろに空白がある", value: "high " },
		{ name: "空文字", value: "" },
	])("異常系: $name なら InvalidCreationParamError が発生する", ({ value }) => {
		// Given: 定義に無い Priority の入力があるとき

		// When: その Priority を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => Priority.create(value)).toThrow(InvalidCreationParamError);
	});

	test("異常系: create に失敗したら operation に Priority.create を持つ InvalidCreationParamError が発生する", () => {
		// Given: 定義に無い Priority の入力があるとき
		const value = "urgent";

		// When: その Priority の生成を試みると
		let caught: unknown;
		try {
			Priority.create(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Priority.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "Priority.create" });
	});
});

describe("Priority.reconstruct", () => {
	test("正常系: 制約を満たす値なら復元できる", () => {
		// Given: 制約を満たす Priority の保存値があるとき
		const value = "medium";

		// When: その Priority を復元すると
		const result = Priority.reconstruct(value);

		// Then: その値と一致する Priority が返される
		expect(result).toBe(value);
	});

	test("異常系: reconstruct に失敗したら operation が Priority.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 定義に無い Priority の保存値があるとき
		const value = "urgent";

		// When: その Priority の復元を試みると
		let caught: unknown;
		try {
			Priority.reconstruct(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Priority.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "Priority.reconstruct" });
	});
});

describe("PrioritySchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす Priority があるとき
		const value = createDummyPriority();

		// When: その値を PrioritySchema で検証すると
		const result = PrioritySchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "定義に無い値", value: "urgent" },
		{ name: "数値", value: 1 },
		{ name: "undefined", value: undefined },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: Priority ではない値があるとき

		// When: その値を PrioritySchema で検証すると
		const result = PrioritySchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});

describe("Priority.isHigherThan", () => {
	test.for([
		{ a: "highest", b: "high" },
		{ a: "high", b: "medium" },
		{ a: "medium", b: "low" },
		{ a: "low", b: "lowest" },
		{ a: "highest", b: "lowest" },
	])("正常系: $a と $b なら高いと判定される", ({ a, b }) => {
		// Given: 高い Priority と低い Priority の組があるとき
		const higher = createDummyPriority(a);
		const lower = createDummyPriority(b);

		// When: その組の前者が後者より高いかを判定すると
		const result = Priority.isHigherThan(higher, lower);

		// Then: 高いと判定される
		expect(result).toBe(true);
	});

	test.for([
		{ a: "high", b: "highest" },
		{ a: "medium", b: "high" },
		{ a: "low", b: "medium" },
		{ a: "lowest", b: "low" },
		{ a: "lowest", b: "highest" },
	])("正常系: $a と $b なら高くないと判定される", ({ a, b }) => {
		// Given: 低い Priority と高い Priority の組があるとき
		const lower = createDummyPriority(a);
		const higher = createDummyPriority(b);

		// When: その組の前者が後者より高いかを判定すると
		const result = Priority.isHigherThan(lower, higher);

		// Then: 高くないと判定される
		expect(result).toBe(false);
	});

	test("正常系: 同じ Priority どうしなら高くないと判定される", () => {
		// Given: 同じ Priority が2つあるとき
		const a = createDummyPriority("medium");
		const b = createDummyPriority("medium");

		// When: その一方が他方より高いかを判定すると
		const result = Priority.isHigherThan(a, b);

		// Then: 高くないと判定される
		expect(result).toBe(false);
	});
});
