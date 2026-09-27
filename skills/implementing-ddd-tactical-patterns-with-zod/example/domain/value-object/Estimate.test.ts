import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
	DomainError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import {
	Estimate,
	EstimateAmountOutOfRangeError,
	EstimateSchema,
	EstimateUnitMismatchError,
} from "./Estimate";
import { createDummyEstimate } from "./Estimate.helper.test";

describe("Estimate.create", () => {
	test("正常系: 制約を満たす値なら同じ大きさと単位の Estimate を返す", () => {
		// Given: 制約を満たす大きさと単位の入力で
		const props = { amount: 3, unit: "point" } as const;

		// When: Estimate を生成すると
		const result = Estimate.create(props);

		// Then: その入力と同じ大きさと単位を持つ Estimate になる
		expect(result).toStrictEqual({ amount: 3, unit: "point" });
	});

	test.for([
		{ name: "point", unit: "point" },
		{ name: "hour", unit: "hour" },
	] as const)("正常系: 単位が $name なら受け入れる", ({ unit }) => {
		// Given: 定義に含まれる単位を持つ入力で
		const props = { amount: 3, unit };

		// When: Estimate を生成すると
		const result = Estimate.create(props);

		// Then: その単位の Estimate になる
		expect(result.unit).toBe(unit);
	});

	test.for([
		{ name: "1", amount: 1 },
		{ name: "Number.MAX_SAFE_INTEGER", amount: Number.MAX_SAFE_INTEGER },
	])("正常系: 大きさが $name なら受け入れる", ({ amount }) => {
		// Given: 下限か上限に一致する大きさを持つ入力で
		const props = { amount, unit: "point" } as const;

		// When: Estimate を生成すると
		const result = Estimate.create(props);

		// Then: その大きさの Estimate になる
		expect(result.amount).toBe(amount);
	});

	test.for([
		{ name: "0", amount: 0 },
		{ name: "負の数", amount: -1 },
		{
			name: "Number.MAX_SAFE_INTEGER より大きい",
			amount: Number.MAX_SAFE_INTEGER + 1,
		},
		{ name: "小数", amount: 1.5 },
		{ name: "NaN", amount: Number.NaN },
		{ name: "Infinity", amount: Number.POSITIVE_INFINITY },
	])("異常系: 大きさが $name なら InvalidCreationParamError が発生する", ({
		amount,
	}) => {
		// Given: 制約に違反する大きさを持つ入力で
		const props = { amount, unit: "point" } as const;

		// When: Estimate を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => Estimate.create(props)).toThrow(InvalidCreationParamError);
	});

	test("異常系: 余剰キーを持つなら InvalidCreationParamError が発生する", () => {
		// Given: 余剰キーを含む入力で
		const props = { amount: 3, unit: "point", memo: "x" } as const;

		// When: Estimate を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => Estimate.create(props)).toThrow(InvalidCreationParamError);
	});

	test("異常系: create に失敗したら operation に Estimate.create を持つ InvalidCreationParamError が発生する", () => {
		// Given: 大きさが下限より1小さい入力で
		const props = { amount: 0, unit: "point" } as const;

		// When: Estimate の生成を試みると
		let caught: unknown;
		try {
			Estimate.create(props);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Estimate.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "Estimate.create" });
	});

	test("不変性: 凍結された Estimate を返す", () => {
		// Given: 制約を満たす Estimate の入力で
		const props = { amount: 3, unit: "point" } as const;

		// When: Estimate を生成すると
		const result = Estimate.create(props);

		// Then: 凍結された Estimate になる
		expect(Object.isFrozen(result)).toBe(true);
	});
});

describe("Estimate.reconstruct", () => {
	test("正常系: 制約を満たす値なら復元できる", () => {
		// Given: 制約を満たす Estimate の保存値で
		const props = { amount: 5, unit: "hour" } as const;

		// When: Estimate を復元すると
		const result = Estimate.reconstruct(props);

		// Then: その保存値と同じ大きさと単位を持つ Estimate になる
		expect(result).toStrictEqual({ amount: 5, unit: "hour" });
	});

	test("異常系: 余剰キーを持つなら operation が Estimate.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 余剰キーを含む Estimate の保存値で
		const props = { amount: 3, unit: "point", memo: "x" } as const;

		// When: Estimate の復元を試みると
		let caught: unknown;
		try {
			Estimate.reconstruct(props);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Estimate.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "Estimate.reconstruct" });
	});
});

describe("EstimateSchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす Estimate があるとき
		const value = createDummyEstimate();

		// When: その値を EstimateSchema で検証すると
		const result = EstimateSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "大きさが0", value: { amount: 0, unit: "point" } },
		{ name: "単位が定義に無い", value: { amount: 3, unit: "day" } },
		{ name: "null", value: null },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: Estimate ではない値があるとき

		// When: その値を EstimateSchema で検証すると
		const result = EstimateSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: 余剰キーを持つなら検証を通らない", () => {
		// Given: 余剰キーを含む Estimate の値があるとき
		const value = { amount: 3, unit: "point", memo: "x" };

		// When: その値を EstimateSchema で検証すると
		const result = EstimateSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});

describe("Estimate.equals", () => {
	test("正常系: 別々に作った大きさも単位も同じ Estimate なら等しいと判定される", () => {
		// Given: 別々に作った同じ内容の2つの Estimate があるとき
		const a = createDummyEstimate({ amount: 3, unit: "point" });
		const b = createDummyEstimate({ amount: 3, unit: "point" });

		// When: その2つの等価性を判定すると
		const result = Estimate.equals(a, b);

		// Then: 等しいと判定される
		expect(result).toBe(true);
	});

	test.for([
		{ name: "大きさだけが異なる", b: { amount: 5, unit: "point" } },
		{ name: "単位だけが異なる", b: { amount: 3, unit: "hour" } },
	] as const)("正常系: $name なら等しくないと判定される", ({ b: bProps }) => {
		// Given: 基準の Estimate と、それと1項目だけ異なる Estimate があるとき
		const a = createDummyEstimate({ amount: 3, unit: "point" });
		const b = createDummyEstimate(bProps);

		// When: その2つの等価性を判定すると
		const result = Estimate.equals(a, b);

		// Then: 等しくないと判定される
		expect(result).toBe(false);
	});
});

describe("Estimate.add", () => {
	test("正常系: 単位が同じなら大きさを加算した Estimate を返す", () => {
		// Given: 単位が同じ2つの Estimate があるとき
		const estimate = createDummyEstimate({ amount: 3, unit: "hour" });
		const addend = createDummyEstimate({ amount: 2, unit: "hour" });

		// When: その2つの Estimate を加算すると
		const result = Estimate.add(estimate, { addend });

		// Then: その大きさの合計を同じ単位で持つ Estimate になる
		expect(result).toStrictEqual({ amount: 5, unit: "hour" });
	});

	test("正常系: 合計がちょうど Number.MAX_SAFE_INTEGER なら受け入れる", () => {
		// Given: 合計がちょうど Number.MAX_SAFE_INTEGER になる2つの Estimate があるとき
		const estimate = createDummyEstimate({
			amount: Number.MAX_SAFE_INTEGER - 1,
		});
		const addend = createDummyEstimate({ amount: 1 });

		// When: その2つの Estimate を加算すると
		const result = Estimate.add(estimate, { addend });

		// Then: 大きさが Number.MAX_SAFE_INTEGER の Estimate になる
		expect(result.amount).toBe(Number.MAX_SAFE_INTEGER);
	});

	test("異常系: 単位が異なるなら左辺と右辺の単位を持つ EstimateUnitMismatchError が発生する", () => {
		// Given: 単位が異なる2つの Estimate があるとき
		const estimate = createDummyEstimate({ unit: "point" });
		const addend = createDummyEstimate({ unit: "hour" });

		// When: その2つの加算を試みると
		let caught: unknown;
		try {
			Estimate.add(estimate, { addend });
		} catch (error) {
			caught = error;
		}

		// Then: EstimateUnitMismatchError が発生し
		expect(caught).toBeInstanceOf(EstimateUnitMismatchError);
		// And: その例外は操作名 Estimate.add と、左辺の単位 point・右辺の単位 hour を持つ
		expect(caught).toMatchObject({
			operation: "Estimate.add",
			left: "point",
			right: "hour",
		});
	});

	test("異常系: 合計が Number.MAX_SAFE_INTEGER を超えるなら operation に Estimate.add を持つ EstimateAmountOutOfRangeError が発生する", () => {
		// Given: 合計が Number.MAX_SAFE_INTEGER を超える2つの Estimate があるとき
		const estimate = createDummyEstimate({ amount: Number.MAX_SAFE_INTEGER });
		const addend = createDummyEstimate({ amount: 1 });

		// When: その2つの加算を試みると
		let caught: unknown;
		try {
			Estimate.add(estimate, { addend });
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Estimate.add の EstimateAmountOutOfRangeError が発生する
		expect(caught).toBeInstanceOf(EstimateAmountOutOfRangeError);
		expect(caught).toMatchObject({ operation: "Estimate.add" });
	});
});

describe("EstimateUnitMismatchError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: 加算の操作名と、異なる2つの単位でエラーを作ると
		const error = new EstimateUnitMismatchError(
			"Estimate.add",
			"point",
			"hour",
		);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と左辺と右辺の単位が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: 加算の操作名と、異なる2つの単位でエラーを作ると
		const error = new EstimateUnitMismatchError(
			"Estimate.add",
			"point",
			"hour",
		);

		// Then: 操作名と左辺・右辺の単位が渡した順のまま残っている
		expect(error).toMatchObject({
			operation: "Estimate.add",
			left: "point",
			right: "hour",
		});
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: EstimateUnitMismatchError の親の class を調べると
		const parent = Object.getPrototypeOf(EstimateUnitMismatchError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が EstimateUnitMismatchError になる", () => {
		// Given: 特別な前提が無いとき

		// When: 加算の操作名と、異なる2つの単位でエラーを作ると
		const error = new EstimateUnitMismatchError(
			"Estimate.add",
			"point",
			"hour",
		);

		// Then: name が class 名になる
		expect(error.name).toBe("EstimateUnitMismatchError");
	});
});

describe("EstimateAmountOutOfRangeError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 加算の操作名とその ZodError を渡してエラーを作ると
		const error = new EstimateAmountOutOfRangeError("Estimate.add", cause);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation が渡した値のまま残る", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 加算の操作名とその ZodError を渡してエラーを作ると
		const error = new EstimateAmountOutOfRangeError("Estimate.add", cause);

		// Then: operation が渡した操作名になる
		expect(error.operation).toBe("Estimate.add");
	});

	test("正常系: 元の ZodError の issues を件数と path ごと持つ", () => {
		// Given: 大きさを指す issue を1件持つ ZodError があるとき
		const cause = new z.ZodError([
			{
				code: "custom",
				message: "見積りは1以上です",
				path: ["amount"],
				input: 1,
			},
		]);

		// When: 加算の操作名とその ZodError を渡してエラーを作ると
		const error = new EstimateAmountOutOfRangeError("Estimate.add", cause);

		// Then: issues は大きさを指すその1件の issue だけを持つ
		expect(error.issues).toHaveLength(1);
		expect(error.issues).toMatchObject([{ path: ["amount"] }]);
	});

	test("正常系: cause に元の ZodError を持つ", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 加算の操作名とその ZodError を渡してエラーを作ると
		const error = new EstimateAmountOutOfRangeError("Estimate.add", cause);

		// Then: cause がその ZodError そのものになる
		expect(error.cause).toBe(cause);
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: EstimateAmountOutOfRangeError の親の class を調べると
		const parent = Object.getPrototypeOf(EstimateAmountOutOfRangeError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が EstimateAmountOutOfRangeError になる", () => {
		// Given: 原因に渡す ZodError があるとき
		const cause = new z.ZodError([]);

		// When: 加算の操作名とその ZodError を渡してエラーを作ると
		const error = new EstimateAmountOutOfRangeError("Estimate.add", cause);

		// Then: name が class 名になる
		expect(error.name).toBe("EstimateAmountOutOfRangeError");
	});
});
