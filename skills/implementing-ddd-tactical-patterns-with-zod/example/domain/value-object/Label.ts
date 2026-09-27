import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const LabelBrand: unique symbol;

/**
 * Label
 * タスクに追加するラベル。
 */
export const LabelSchema = z
	.string()
	.min(1, { error: "ラベルは1文字以上です" })
	.max(30, { error: "ラベルは30文字までです" })
	.regex(/^[a-z0-9-]+$/, { error: "ラベルは小文字英数字とハイフンだけです" })
	.brand<typeof LabelBrand>();

export type Label = z.output<typeof LabelSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createLabel(value: string): Label {
	const result = LabelSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("Label.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructLabel(value: string): Label {
	const result = LabelSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError("Label.reconstruct", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const Label = {
	create: createLabel,
	reconstruct: reconstructLabel,
} as const;
