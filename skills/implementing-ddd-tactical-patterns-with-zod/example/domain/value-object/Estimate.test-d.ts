import { describe, test } from "vitest";
import {
	Estimate,
	type EstimateSchemaInput,
	EstimateUnitMismatchError,
} from "./Estimate";
import { createDummyEstimate } from "./Estimate.helper.test";

describe("Estimate.add の型", () => {
	test("型: addend に生のオブジェクトを渡せない", () => {
		// Given: Estimate と、ブランドの無い生の Estimate の入力オブジェクトがあるとき
		const estimate = createDummyEstimate();
		const raw: EstimateSchemaInput = { amount: 3, unit: "point" };

		// When: addend にその生のオブジェクトを入れて Estimate.add を呼ぶと
		// Then: 型検査で拒否される
		Estimate.add(estimate, {
			// @ts-expect-error 生のオブジェクトは Estimate に代入できない
			addend: raw,
		});
	});
});

describe("Estimate.create の型", () => {
	test("型: unit に定義に無い単位を渡せない", () => {
		// Given: 特別な前提が無いとき

		// When: unit に単位の定義に無い値を入れて Estimate.create を呼ぶと
		// Then: 型検査で拒否される
		Estimate.create({
			amount: 3,
			// @ts-expect-error day は単位に含まれない
			unit: "day",
		});
	});
});

describe("EstimateUnitMismatchError の型", () => {
	test("型: left に定義に無い単位を渡せない", () => {
		// Given: 特別な前提が無いとき

		// When: left に単位の定義に無い値を渡すと
		// Then: 型検査で拒否される
		void new EstimateUnitMismatchError(
			"Estimate.add",
			// @ts-expect-error day は単位に含まれない
			"day",
			"point",
		);
	});

	test("型: right に定義に無い単位を渡せない", () => {
		// Given: 特別な前提が無いとき

		// When: right に単位の定義に無い値を渡すと
		// Then: 型検査で拒否される
		void new EstimateUnitMismatchError(
			"Estimate.add",
			"point",
			// @ts-expect-error day は単位に含まれない
			"day",
		);
	});
});
