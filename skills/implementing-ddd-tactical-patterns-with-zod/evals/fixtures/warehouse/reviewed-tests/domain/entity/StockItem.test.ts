import { describe, expect, test } from "vitest";
import {
	DomainError,
	InvalidClockValueError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { createDummyShipmentNumber } from "../value-object/ShipmentNumber.helper.test";
import { createDummyTimestamp } from "../value-object/Timestamp.helper.test";
import {
	type CreateStockItemProps,
	HoldQuantityOutOfRangeError,
	StockItem,
	StockItemHeldBeforeLastUpdateError,
	StockItemReleasedBeforeLastUpdateError,
	StockItemSchema,
	type StockItemSchemaInput,
	StockItemStatusMismatchError,
	StockQuantityShortageError,
} from "./StockItem";
import {
	createDummyAvailableStockItem,
	createDummyCreateStockItemProps,
	createDummyHeldStockItem,
	createDummyStockItemDeps,
} from "./StockItem.helper.test";

describe("StockItem.create", () => {
	test("正常系: 制約を満たす入力なら available の StockItem になる", () => {
		// Given: 制約を満たす入力で
		const props = createDummyCreateStockItemProps({ quantity: 5 });

		// When: StockItem を生成すると
		const result = StockItem.create(props, createDummyStockItemDeps());

		// Then: その入力の値を持つ available の StockItem と一致する
		const expected = createDummyAvailableStockItem({ quantity: 5 });
		expect(result).toStrictEqual(expected);
	});

	test("正常系: 数量が0なら受け入れる", () => {
		// Given: 数量の下限ちょうどの入力で
		const props = createDummyCreateStockItemProps({ quantity: 0 });

		// When: StockItem を生成すると
		const result = StockItem.create(props, createDummyStockItemDeps());

		// Then: 数量が0の StockItem になる
		expect(result.quantity).toBe(0);
	});

	test.for([
		{ name: "数量が負", quantity: -1 },
		{ name: "数量が上限より1多い", quantity: 10_000 },
		{ name: "数量が小数", quantity: 1.5 },
	])("異常系: $name なら InvalidCreationParamError が発生する", ({
		quantity,
	}) => {
		// Given: 制約に1つ違反する数量を持つ入力で
		const props = createDummyCreateStockItemProps({ quantity });

		// When: StockItem の生成を試みると
		// Then: InvalidCreationParamError が発生する
		expect(() => StockItem.create(props, createDummyStockItemDeps())).toThrow(InvalidCreationParamError);
	});

	test("異常系: warehouseCode が小文字なら InvalidCreationParamError が発生する", () => {
		// Given: warehouseCode が小文字の入力で
		const props: CreateStockItemProps = {
			...createDummyCreateStockItemProps(),
			// @ts-expect-error 生の文字列は WarehouseCode に代入できない
			warehouseCode: "tokyo",
		};

		// When: StockItem の生成を試みると
		// Then: InvalidCreationParamError が発生する
		expect(() => StockItem.create(props, createDummyStockItemDeps())).toThrow(InvalidCreationParamError);
	});

	test("異常系: create に失敗したら operation が StockItem.create の InvalidCreationParamError が発生する", () => {
		// Given: 数量が負の入力で
		const props = createDummyCreateStockItemProps({ quantity: -1 });

		// When: StockItem の生成を試みると
		let caught: unknown;
		try {
			StockItem.create(props, createDummyStockItemDeps());
		} catch (error) {
			caught = error;
		}

		// Then: operation が StockItem.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "StockItem.create" });
	});

	test("異常系: 余剰キーを持つなら InvalidCreationParamError が発生する", () => {
		// Given: 余剰キーを含む入力で
		const props = { ...createDummyCreateStockItemProps(), memo: "x" };

		// When: StockItem の生成を試みると
		// Then: InvalidCreationParamError が発生する
		expect(() => StockItem.create(props, createDummyStockItemDeps())).toThrow(InvalidCreationParamError);
	});

	test("異常系: クロックがタイムスタンプとして不正な値を返したら InvalidClockValueError が発生する", () => {
		// Given: 制約を満たす入力と、負の値を返すクロックで
		const props = createDummyCreateStockItemProps();
		const deps = createDummyStockItemDeps(-1);

		// When: StockItem の生成を試みると
		// Then: InvalidClockValueError が発生する
		expect(() => StockItem.create(props, deps)).toThrow(InvalidClockValueError);
	});

	test("不変性: 結果が凍結されている", () => {
		// Given: 制約を満たす入力で
		const props = createDummyCreateStockItemProps();

		// When: StockItem を生成すると
		const result = StockItem.create(props, createDummyStockItemDeps());

		// Then: 凍結された StockItem になる
		expect(Object.isFrozen(result)).toBe(true);
	});
});

describe("StockItem.reconstruct", () => {
	test("正常系: 制約を満たす held の保存値なら同じ内容の StockItem になる", () => {
		// Given: 制約を満たす held の StockItem の保存値で
		const input: StockItemSchemaInput = {
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
			warehouseCode: "TOKYO",
			sku: "ABC-00001",
			quantity: 10,
			updatedAt: 2_000,
			status: "held",
			heldFor: "SHP-000001",
			heldQuantity: 3,
			heldAt: 2_000,
		};

		// When: StockItem を復元すると
		const result = StockItem.reconstruct(input);

		// Then: その保存値と同じ内容の StockItem になる
		expect(result).toStrictEqual(input);
	});

	test("異常系: 引き当てた数量が置いてある数量を超えるなら DomainError が発生する", () => {
		// Given: 引き当てた数量が置いてある数量より1多い held の保存値で
		const input = { ...createDummyHeldStockItem(), heldQuantity: 11 };

		// When: StockItem の復元を試みると
		// Then: DomainError が発生する
		expect(() => StockItem.reconstruct(input)).toThrow(DomainError);
	});

	test("異常系: reconstruct に失敗したら operation が StockItem.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: 数量だけを負にした available の StockItem の保存値で
		const input = { ...createDummyAvailableStockItem(), quantity: -1 };

		// When: StockItem の復元を試みると
		let caught: unknown;
		try {
			StockItem.reconstruct(input);
		} catch (error) {
			caught = error;
		}

		// Then: operation が StockItem.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "StockItem.reconstruct" });
	});
});

describe("StockItemSchema", () => {
	test.for([
		{ name: "available", item: createDummyAvailableStockItem() },
		{ name: "held", item: createDummyHeldStockItem() },
	])("正常系: 制約を満たす $name の StockItem なら検証を通る", ({ item }) => {
		// Given: ケースごとの状態に対応する制約を満たす StockItem があるとき

		// When: その値を StockItemSchema で検証すると
		const result = StockItemSchema.safeParse(item).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test("正常系: 数量が負なら検証を通らない", () => {
		// Given: 数量だけを負にした StockItem の値があるとき
		const value = { ...createDummyAvailableStockItem(), quantity: -1 };

		// When: その値を StockItemSchema で検証すると
		const result = StockItemSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: 引き当てた数量が置いてある数量を超えるなら検証を通らない", () => {
		// Given: 引き当てた数量が置いてある数量より1多い StockItem の値があるとき
		const value = { ...createDummyHeldStockItem(), heldQuantity: 11 };

		// When: その値を StockItemSchema で検証すると
		const result = StockItemSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});

	test("正常系: 余剰キーを持つなら検証を通らない", () => {
		// Given: 余剰キーを含む StockItem の値があるとき
		const value = { ...createDummyAvailableStockItem(), memo: "x" };

		// When: その値を StockItemSchema で検証すると
		const result = StockItemSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});

describe("StockItem.equalsById", () => {
	test("正常系: 識別子が同じならほかの項目が異なっても等しいと判定される", () => {
		// Given: 識別子が同じで数量と状態が異なる2つの StockItem があるとき
		const a = createDummyAvailableStockItem({ quantity: 1 });
		const b = createDummyHeldStockItem({ quantity: 20 });

		// When: その2つの識別子で等価性を判定すると
		const result = StockItem.equalsById(a, b);

		// Then: 等しいと判定される
		expect(result).toBe(true);
	});

	test("正常系: 識別子が異なればほかの項目が同じでも等しくないと判定される", () => {
		// Given: 識別子だけが異なる2つの StockItem があるとき
		const a = createDummyHeldStockItem({
			id: "3f2c0c1e-8a4b-4d6e-9f10-2a3b4c5d6e7f",
		});
		const b = createDummyHeldStockItem({
			id: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
		});

		// When: その2つの識別子で等価性を判定すると
		const result = StockItem.equalsById(a, b);

		// Then: 等しくないと判定される
		expect(result).toBe(false);
	});
});

describe("StockItem.hold", () => {
	test("正常系: available の StockItem は出荷指示と数量とタイムスタンプを持つ held の StockItem になる", () => {
		// Given: available の StockItem と、出荷指示と数量と最終更新より後のタイムスタンプがあるとき
		const item = createDummyAvailableStockItem({
			quantity: 10,
			updatedAt: createDummyTimestamp(1_000),
		});
		const params = {
			shipmentNumber: createDummyShipmentNumber("SHP-000002"),
			quantity: 3,
			at: createDummyTimestamp(2_000),
		};

		// When: その出荷指示と数量とタイムスタンプでその StockItem を引き当てると
		const result = StockItem.hold(item, params);

		// Then: それらを持つ held の StockItem と一致する
		const expected = StockItem.hold(
			createDummyAvailableStockItem({
				quantity: 10,
				updatedAt: createDummyTimestamp(1_000),
			}),
			params,
		);
		expect(result).toStrictEqual(expected);
	});

	test("正常系: 最終更新と同じタイムスタンプなら引き当てられる", () => {
		// Given: available の StockItem と、最終更新と同じタイムスタンプがあるとき
		const item = createDummyAvailableStockItem({
			quantity: 10,
			updatedAt: createDummyTimestamp(1_000),
		});
		const params = {
			shipmentNumber: createDummyShipmentNumber("SHP-000001"),
			quantity: 3,
			at: createDummyTimestamp(1_000),
		};

		// When: そのタイムスタンプでその StockItem を引き当てると
		const result = StockItem.hold(item, params);

		// Then: 最終更新と同じタイムスタンプで引き当てた held の StockItem と一致する
		const expected = createDummyHeldStockItem({
			quantity: 10,
			updatedAt: 1_000,
			heldFor: "SHP-000001",
			heldQuantity: 3,
			heldAt: 1_000,
		});
		expect(result).toStrictEqual(expected);
	});

	test.for([
		{ name: "置いてある数量と同じ", quantity: 10, shortage: false },
		{ name: "置いてある数量より1多い", quantity: 11, shortage: true },
	])("正常系: 引き当てる数量が $name なら仕様どおりの結果になる", ({
		quantity,
		shortage,
	}) => {
		// Given: 数量が10の available の StockItem と、ケースごとの引き当てる数量があるとき
		const item = createDummyAvailableStockItem({ quantity: 10 });
		const params = {
			shipmentNumber: createDummyShipmentNumber(),
			quantity,
			at: createDummyTimestamp(2_000),
		};

		// When: その数量でその StockItem を引き当てると
		// Then: 数量が足りれば held の StockItem になり、足りなければ StockQuantityShortageError が発生する
		if (shortage) {
			expect(() => StockItem.hold(item, params)).toThrow(
				StockQuantityShortageError,
			);
		} else {
			expect(StockItem.hold(item, params)).toMatchObject({
				status: "held",
				heldQuantity: quantity,
			});
		}
	});

	test("異常系: held の StockItem なら StockItemStatusMismatchError が発生する", () => {
		// Given: held の StockItem と、引き当てのパラメータがあるとき
		const item = createDummyHeldStockItem();
		const params = {
			shipmentNumber: createDummyShipmentNumber(),
			quantity: 1,
			at: createDummyTimestamp(2_000),
		};

		// When: その StockItem の引き当てを試みると
		try {
			StockItem.hold(item, params);
		} catch (error) {
			// Then: StockItemStatusMismatchError が発生する
			expect(error).toBeInstanceOf(StockItemStatusMismatchError);
		}
	});

	test("異常系: 引き当てる数量が0なら HoldQuantityOutOfRangeError が発生する", () => {
		// Given: available の StockItem と、引き当てる数量が0のパラメータがあるとき
		const item = createDummyAvailableStockItem();
		const params = {
			shipmentNumber: createDummyShipmentNumber(),
			quantity: 0,
			at: createDummyTimestamp(2_000),
		};

		// When: その StockItem の引き当てを試みると
		// Then: HoldQuantityOutOfRangeError が発生する
		expect(() => StockItem.hold(item, params)).toThrow(
			HoldQuantityOutOfRangeError,
		);
	});

	test("異常系: 最終更新より前のタイムスタンプなら渡した値と最終更新を持つ StockItemHeldBeforeLastUpdateError が発生する", () => {
		// Given: available の StockItem と、最終更新より前のタイムスタンプがあるとき
		const item = createDummyAvailableStockItem({
			updatedAt: createDummyTimestamp(1_000),
		});
		const params = {
			shipmentNumber: createDummyShipmentNumber(),
			quantity: 1,
			at: createDummyTimestamp(999),
		};

		// When: そのタイムスタンプで引き当てを試みると
		let caught: unknown;
		try {
			StockItem.hold(item, params);
		} catch (error) {
			caught = error;
		}

		// Then: StockItemHeldBeforeLastUpdateError が発生し
		expect(caught).toBeInstanceOf(StockItemHeldBeforeLastUpdateError);
		// And: その例外は操作名 StockItem.hold と、渡したタイムスタンプと最終更新を持つ
		expect(caught).toMatchObject({
			operation: "StockItem.hold",
			heldAt: 999,
			updatedAt: 1_000,
		});
	});

	test("不変性: 結果が凍結されている", () => {
		// Given: available の StockItem と、引き当てのパラメータがあるとき
		const item = createDummyAvailableStockItem();
		const params = {
			shipmentNumber: createDummyShipmentNumber(),
			quantity: 1,
			at: createDummyTimestamp(2_000),
		};

		// When: その StockItem を引き当てると
		const result = StockItem.hold(item, params);

		// Then: 凍結された StockItem になる
		expect(result.status).toBe("held");
	});

	test("不変性: 引き当てても元の StockItem は変わらない", () => {
		// Given: available の StockItem と、引き当てのパラメータがあるとき
		const item = createDummyAvailableStockItem();
		const params = {
			shipmentNumber: createDummyShipmentNumber(),
			quantity: 1,
			at: createDummyTimestamp(2_000),
		};

		// When: その StockItem を引き当てると
		StockItem.hold(item, params);

		// Then: 元の StockItem は available のまま変わっていない
		const expected = createDummyAvailableStockItem();
		expect(item).toStrictEqual(expected);
	});
});

describe("StockItem.release", () => {
	test("正常系: held の StockItem は引き当てを外した available の StockItem になる", () => {
		// Given: held の StockItem と、最終更新より後のタイムスタンプがあるとき
		const item = createDummyHeldStockItem({ quantity: 10, updatedAt: 1_000 });
		const params = { at: createDummyTimestamp(2_000) };

		// When: そのタイムスタンプでその StockItem の引き当てを外すと
		const result = StockItem.release(item, params);

		// Then: そのタイムスタンプを最終更新とする available の StockItem と一致する
		const expected = createDummyAvailableStockItem({
			quantity: 10,
			updatedAt: createDummyTimestamp(2_000),
		});
		expect(result).toStrictEqual(expected);
	});

	test("正常系: 引き当てを外した StockItem は heldFor のキーを持たない", () => {
		// Given: held の StockItem と、最終更新より後のタイムスタンプがあるとき
		const item = createDummyHeldStockItem();
		const params = { at: createDummyTimestamp(2_000) };

		// When: そのタイムスタンプでその StockItem の引き当てを外すと
		const result = StockItem.release(item, params);

		// Then: heldFor のキーを持たない available の StockItem になる
		expect(Reflect.get(result, "heldFor")).toBeUndefined();
	});

	test("異常系: available の StockItem なら期待した状態と実際の状態を持つ StockItemStatusMismatchError が発生する", () => {
		// Given: available の StockItem と、タイムスタンプがあるとき
		const item = createDummyAvailableStockItem();
		const params = { at: createDummyTimestamp(2_000) };

		// When: その StockItem の引き当てを外すのを試みると
		let caught: unknown;
		try {
			StockItem.release(item, params);
		} catch (error) {
			caught = error;
		}

		// Then: StockItemStatusMismatchError が発生し
		expect(caught).toBeInstanceOf(StockItemStatusMismatchError);
		// And: その例外は操作名 StockItem.release と、期待した状態 held とその StockItem の状態を持つ
		expect(caught).toMatchObject({
			operation: "StockItem.release",
			expected: "held",
			actual: "available",
		});
	});

	test("異常系: 最終更新より前のタイムスタンプなら StockItemReleasedBeforeLastUpdateError が発生する", () => {
		// Given: held の StockItem と、最終更新より前のタイムスタンプがあるとき
		const item = createDummyHeldStockItem({ updatedAt: 1_000 });
		const params = { at: createDummyTimestamp(999) };

		// When: そのタイムスタンプで引き当てを外すのを試みると
		// Then: StockItemReleasedBeforeLastUpdateError が発生する
		expect(() => StockItem.release(item, params)).toThrow(
			StockItemReleasedBeforeLastUpdateError,
		);
	});

	test("不変性: 引き当てを外しても元の StockItem は変わらない", () => {
		// Given: held の StockItem と、タイムスタンプがあるとき
		const item = createDummyHeldStockItem();
		const params = { at: createDummyTimestamp(2_000) };

		// When: その StockItem の引き当てを外すと
		StockItem.release(item, params);

		// Then: 元の StockItem は held のまま変わっていない
		const expected = createDummyHeldStockItem();
		expect(item).toStrictEqual(expected);
	});
});
