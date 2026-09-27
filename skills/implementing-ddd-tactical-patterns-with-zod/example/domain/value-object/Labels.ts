import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import { type Label, LabelSchema } from "./Label";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const LabelsBrand: unique symbol;

/** 1つのタスクに追加できるラベルの上限。 */
const LABEL_LIMIT = 10;

/**
 * Labels
 * タスクに追加されたラベルの集合。並び順に意味は無い。
 */
export const LabelsSchema = z
	.array(LabelSchema)
	.max(LABEL_LIMIT, { error: `ラベルは${LABEL_LIMIT}件までです` })
	.refine((ls) => new Set(ls).size === ls.length, {
		error: "同じラベルは2つ追加できません",
	})
	.readonly()
	.brand<typeof LabelsBrand>();

export type Labels = z.output<typeof LabelsSchema>;

export type LabelsSchemaInput = z.input<typeof LabelsSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export const CreateLabelsPropsSchema = z.array(LabelSchema).readonly();

export type CreateLabelsProps = z.output<typeof CreateLabelsPropsSchema>;

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createLabels(props: CreateLabelsProps): Labels {
	const input = CreateLabelsPropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("Labels.create", input.error);
	}
	const result = LabelsSchema.safeParse(input.data);
	if (!result.success) {
		throw new InvalidCreationParamError("Labels.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructLabels(props: LabelsSchemaInput): Labels {
	const result = LabelsSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError("Labels.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

/** 並び順は比べない。同じラベルの集合なら等しい。 */
function labelsEquals(a: Labels, b: Labels): boolean {
	// 重複は完成値スキーマが拒否しているので、件数と包含だけで集合として比べられる
	return a.length === b.length && a.every((l) => b.includes(l));
}

// -------------------------------------------------
// 演算
// -------------------------------------------------

export type AddToLabelsParams = Readonly<{
	/** 追加するラベル */
	label: Label;
}>;

/**
 * 末尾に追加する。すでに追加されていれば元の値をそのまま返す。
 * @throws LabelsLimitExceededError 件数が上限を超えるとき。
 */
function addToLabels(labels: Labels, params: AddToLabelsParams): Labels {
	if (labels.includes(params.label)) {
		return labels;
	}
	if (labels.length >= LABEL_LIMIT) {
		throw new LabelsLimitExceededError("Labels.add", LABEL_LIMIT);
	}
	const result = LabelsSchema.safeParse([...labels, params.label]);
	if (!result.success) {
		throw new FatalUnreachableError("Labels.add", result.error);
	}
	return result.data;
}

export type RemoveFromLabelsParams = Readonly<{
	/** 外すラベル */
	label: Label;
}>;

/** 追加されていなければ元の値をそのまま返す。 */
function removeFromLabels(
	labels: Labels,
	params: RemoveFromLabelsParams,
): Labels {
	if (!labels.includes(params.label)) {
		return labels;
	}
	const result = LabelsSchema.safeParse(
		labels.filter((l) => l !== params.label),
	);
	if (!result.success) {
		throw new FatalUnreachableError("Labels.remove", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** ラベルを追加すると件数が上限を超えるため、追加を拒否した。 */
export class LabelsLimitExceededError extends DomainError {
	override readonly name: string = "LabelsLimitExceededError";

	/** 上限の件数 */
	readonly limit: number;

	constructor(operation: string, limit: number) {
		super(operation, `ラベルは${limit}件までです`);
		this.limit = limit;
	}
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Labels = {
	create: createLabels,
	reconstruct: reconstructLabels,
	equals: labelsEquals,
	add: addToLabels,
	remove: removeFromLabels,
} as const;
