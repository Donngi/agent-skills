import { describe, expect, test } from "vitest";
import {
	DomainError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import type { Label } from "./Label";
import { createDummyLabel } from "./Label.helper.test";
import { Labels, LabelsLimitExceededError, LabelsSchema } from "./Labels";
import { createDummyLabels } from "./Labels.helper.test";

describe("Labels.create", () => {
	test("正常系: 重複の無い Label なら同じ並びの Labels を返す", () => {
		// Given: 重複の無い2つの Label を持つ Labels の入力で
		const value = [createDummyLabel("bug"), createDummyLabel("ui")];

		// When: Labels を生成すると
		const result = Labels.create(value);

		// Then: その2つの Label と同じ並びの Labels になる
		expect(result).toStrictEqual(["bug", "ui"]);
	});

	test("正常系: 昇順でない Label なら並べ替えずに同じ並びの Labels を返す", () => {
		// Given: 昇順でない2つの Label を持つ Labels の入力で
		const value = [createDummyLabel("ui"), createDummyLabel("bug")];

		// When: Labels を生成すると
		const result = Labels.create(value);

		// Then: その2つの Label を渡した並びのまま持つ Labels になる
		expect(result).toStrictEqual(["ui", "bug"]);
	});

	test("正常系: 空なら受け入れる", () => {
		// Given: 空の Labels の入力で
		const value: Label[] = [];

		// When: Labels を生成すると
		const result = Labels.create(value);

		// Then: 空の Labels になる
		expect(result).toStrictEqual([]);
	});

	test("正常系: 上限の10件ちょうどなら受け入れる", () => {
		// Given: 重複の無い上限件数の Labels の入力で
		const value = Array.from({ length: 10 }, (_, i) =>
			createDummyLabel(`label-${i}`),
		);

		// When: Labels を生成すると
		const result = Labels.create(value);

		// Then: その入力と同じ並びの Labels になる
		expect(result).toStrictEqual(value);
	});

	test.for([
		{
			name: "11件",
			value: Array.from({ length: 11 }, (_, i) =>
				createDummyLabel(`label-${String(i).padStart(2, "0")}`),
			),
		},
		{
			name: "同じ Label を含む",
			value: [createDummyLabel("bug"), createDummyLabel("bug")],
		},
	])("異常系: $name なら InvalidCreationParamError が発生する", ({ value }) => {
		// Given: 制約に1つ違反する Labels の入力で

		// When: Labels を生成すると
		// Then: InvalidCreationParamError が発生する
		expect(() => Labels.create(value)).toThrow(InvalidCreationParamError);
	});

	test("異常系: 同じ Label を含むなら重複の issue を持つ InvalidCreationParamError が発生する", () => {
		// Given: 同じ Label を含む Labels の入力で
		const value = [
			createDummyLabel("ui"),
			createDummyLabel("bug"),
			createDummyLabel("bug"),
		];

		// When: Labels の生成を試みると
		let caught: unknown;
		try {
			Labels.create(value);
		} catch (error) {
			caught = error;
		}

		// Then: 重複の issue を1件持つ InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({
			issues: [{ message: "同じラベルは2つ追加できません" }],
		});
	});

	test("異常系: create に失敗したら operation に Labels.create を持つ InvalidCreationParamError が発生する", () => {
		// Given: 同じ Label を含む Labels の入力で
		const value = [createDummyLabel("bug"), createDummyLabel("bug")];

		// When: Labels の生成を試みると
		let caught: unknown;
		try {
			Labels.create(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Labels.create の InvalidCreationParamError が発生する
		expect(caught).toBeInstanceOf(InvalidCreationParamError);
		expect(caught).toMatchObject({ operation: "Labels.create" });
	});

	test("不変性: 凍結された Labels を返す", () => {
		// Given: 制約を満たす Labels の入力で
		const value = [createDummyLabel("bug"), createDummyLabel("ui")];

		// When: Labels を生成すると
		const result = Labels.create(value);

		// Then: 凍結された Labels になる
		expect(Object.isFrozen(result)).toBe(true);
	});

	test("不変性: 渡された配列を変更しない", () => {
		// Given: Labels の入力で
		const value = [createDummyLabel("ui"), createDummyLabel("bug")];

		// When: Labels を生成すると
		Labels.create(value);

		// Then: 渡した配列は元の並びのまま凍結されずに残る
		expect(value).toStrictEqual(["ui", "bug"]);
		expect(Object.isFrozen(value)).toBe(false);
	});
});

describe("Labels.reconstruct", () => {
	test("正常系: 昇順でない保存値なら並べ替えずに復元できる", () => {
		// Given: 昇順ではない Labels の保存値で
		const value = ["ui", "bug"];

		// When: Labels を復元すると
		const result = Labels.reconstruct(value);

		// Then: その保存値と同じ並びの Labels になる
		expect(result).toStrictEqual(["ui", "bug"]);
	});

	test("異常系: Label の制約に違反する要素を含むなら operation が Labels.reconstruct の InvalidReconstructParamError が発生する", () => {
		// Given: Label の制約に違反する要素を含む Labels の保存値で
		const value = ["Bug"];

		// When: Labels の復元を試みると
		let caught: unknown;
		try {
			Labels.reconstruct(value);
		} catch (error) {
			caught = error;
		}

		// Then: 操作名が Labels.reconstruct の InvalidReconstructParamError が発生する
		expect(caught).toBeInstanceOf(InvalidReconstructParamError);
		expect(caught).toMatchObject({ operation: "Labels.reconstruct" });
	});
});

describe("LabelsSchema", () => {
	test("正常系: 制約を満たす値なら検証を通る", () => {
		// Given: 制約を満たす Labels があるとき
		const value = createDummyLabels(["bug", "ui"]);

		// When: その値を LabelsSchema で検証すると
		const result = LabelsSchema.safeParse(value).success;

		// Then: 検証を通る
		expect(result).toBe(true);
	});

	test.for([
		{ name: "同じ Label を含む", value: ["bug", "bug"] },
		{ name: "配列でない", value: "bug" },
		{ name: "要素が null", value: [null] },
	])("正常系: $name なら検証を通らない", ({ value }) => {
		// Given: Labels ではない値があるとき

		// When: その値を LabelsSchema で検証すると
		const result = LabelsSchema.safeParse(value).success;

		// Then: 検証を通らない
		expect(result).toBe(false);
	});
});

describe("Labels.equals", () => {
	test("正常系: 別々に作った同じ並びの Labels なら等しいと判定される", () => {
		// Given: 別々に作った同じ内容の2つの Labels があるとき
		const a = createDummyLabels(["bug", "ui"]);
		const b = createDummyLabels(["bug", "ui"]);

		// When: その2つの等価性を判定すると
		const result = Labels.equals(a, b);

		// Then: 等しいと判定される
		expect(result).toBe(true);
	});

	test("正常系: 並び順だけが異なる Labels なら等しいと判定される", () => {
		// Given: 同じ Label を異なる並びで持つ2つの Labels があるとき
		const a = createDummyLabels(["bug", "ui"]);
		const b = createDummyLabels(["ui", "bug"]);

		// When: その2つの等価性を判定すると
		const result = Labels.equals(a, b);

		// Then: 等しいと判定される
		expect(result).toBe(true);
	});

	test.for([
		{ name: "件数が異なり先頭の要素は同じ", b: ["bug", "ui", "wip"] },
		{ name: "件数が同じで要素が異なる", b: ["bug", "feature"] },
	])("正常系: $name なら等しくないと判定される", ({ b: bValue }) => {
		// Given: 基準の Labels と、それと内容が異なる Labels があるとき
		const a = createDummyLabels(["bug", "ui"]);
		const b = createDummyLabels(bValue);

		// When: その2つの等価性を判定すると
		const result = Labels.equals(a, b);

		// Then: 等しくないと判定される
		expect(result).toBe(false);
	});
});

describe("Labels.add", () => {
	test("正常系: 追加されていない Label なら末尾に追加した値を返す", () => {
		// Given: 2件の Labels と、それに含まれない Label があるとき
		const labels = createDummyLabels(["bug", "ui"]);
		const label = createDummyLabel("feature");

		// When: その Label を追加すると
		const result = Labels.add(labels, { label });

		// Then: その Label が末尾に追加された3件の Labels が返される
		expect(result).toStrictEqual(["bug", "ui", "feature"]);
	});

	test("異常系: 上限に達していて追加されていない Label なら上限件数を持つ LabelsLimitExceededError が発生する", () => {
		// Given: 上限件数の Labels と、含まれていない Label があるとき
		const labels = createDummyLabels(
			Array.from({ length: 10 }, (_, i) => `label-${i}`),
		);
		const label = createDummyLabel("zzz");

		// When: その Label の追加を試みると
		let caught: unknown;
		try {
			Labels.add(labels, { label });
		} catch (error) {
			caught = error;
		}

		// Then: LabelsLimitExceededError が発生し
		expect(caught).toBeInstanceOf(LabelsLimitExceededError);
		// And: その例外は操作名 Labels.add と上限件数 10 を持つ
		expect(caught).toMatchObject({ operation: "Labels.add", limit: 10 });
	});

	test("不変性: 引数で受け取った Labels を変更しない", () => {
		// Given: 2件の Labels と、含まれていない Label があるとき
		const labels = createDummyLabels(["bug", "ui"]);
		const label = createDummyLabel("feature");

		// When: その Label を追加すると
		Labels.add(labels, { label });

		// Then: その Labels は追加前の2件と一致する
		expect(labels).toStrictEqual(["bug", "ui"]);
	});

	test("不変性: すでに追加されている Label なら元の値をそのまま返す", () => {
		// Given: Labels と、すでに含まれる Label があるとき
		const labels = createDummyLabels(["bug", "ui"]);
		const label = createDummyLabel("ui");

		// When: その Label を追加すると
		const result = Labels.add(labels, { label });

		// Then: その元の Labels と同じ参照が返される
		expect(result).toBe(labels);
	});

	test("不変性: 上限に達していてすでに追加されている Label なら元の値をそのまま返す", () => {
		// Given: 上限件数の Labels と、その中に含まれる Label があるとき
		const labels = createDummyLabels(
			Array.from({ length: 10 }, (_, i) => `label-${i}`),
		);
		const label = createDummyLabel("label-0");

		// When: その Label を追加すると
		const result = Labels.add(labels, { label });

		// Then: その元の Labels と同じ参照が返される
		expect(result).toBe(labels);
	});
});

describe("Labels.remove", () => {
	test("正常系: 追加されている Label なら削除した値を返す", () => {
		// Given: 3件の Labels と、その中に含まれる Label があるとき
		const labels = createDummyLabels(["bug", "feature", "ui"]);
		const label = createDummyLabel("feature");

		// When: その Label を削除すると
		const result = Labels.remove(labels, { label });

		// Then: その Label を削除した2件の Labels が返される
		expect(result).toStrictEqual(["bug", "ui"]);
	});

	test("不変性: 引数で受け取った Labels を変更しない", () => {
		// Given: 3件の Labels と、その中に含まれる Label があるとき
		const labels = createDummyLabels(["bug", "feature", "ui"]);
		const label = createDummyLabel("feature");

		// When: その Label を削除すると
		Labels.remove(labels, { label });

		// Then: その Labels は削除前の3件と一致する
		expect(labels).toStrictEqual(["bug", "feature", "ui"]);
	});

	test("不変性: 追加されていない Label なら元の値をそのまま返す", () => {
		// Given: Labels と、含まれていない Label があるとき
		const labels = createDummyLabels(["bug", "ui"]);
		const label = createDummyLabel("feature");

		// When: その Label を削除すると
		const result = Labels.remove(labels, { label });

		// Then: その元の Labels と同じ参照が返される
		expect(result).toBe(labels);
	});
});

describe("LabelsLimitExceededError", () => {
	test("正常系: DomainError かつ Error のインスタンスになる", () => {
		// Given: 特別な前提が無いとき

		// When: Label を追加する操作名と上限件数でエラーを作ると
		const error = new LabelsLimitExceededError("Labels.add", 10);

		// Then: 業務エラーの基底 class と Error の両方のインスタンスになる
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(Error);
	});

	test("正常系: operation と上限件数が渡した値のまま残る", () => {
		// Given: 特別な前提が無いとき

		// When: Label を追加する操作名と上限件数でエラーを作ると
		const error = new LabelsLimitExceededError("Labels.add", 10);

		// Then: 操作名と上限件数が渡した値のまま残っている
		expect(error).toMatchObject({ operation: "Labels.add", limit: 10 });
	});

	test("正常系: 直接の親の class が DomainError である", () => {
		// Given: 特別な前提が無いとき

		// When: LabelsLimitExceededError の親の class を調べると
		const parent = Object.getPrototypeOf(LabelsLimitExceededError);

		// Then: 親の class は DomainError である
		expect(parent).toBe(DomainError);
	});

	test("正常系: name が LabelsLimitExceededError になる", () => {
		// Given: 特別な前提が無いとき

		// When: Label を追加する操作名と上限件数でエラーを作ると
		const error = new LabelsLimitExceededError("Labels.add", 10);

		// Then: name が class 名になる
		expect(error.name).toBe("LabelsLimitExceededError");
	});
});
