import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const ProjectIdBrand: unique symbol;

/**
 * ProjectId
 * プロジェクトの識別子。タスク番号の接頭辞になる。
 */
export const ProjectIdSchema = z
	.string()
	.regex(/^[A-Z]{2,10}$/, {
		error: "プロジェクト ID は大文字英字2〜10文字です",
	})
	.brand<typeof ProjectIdBrand>();

export type ProjectId = z.output<typeof ProjectIdSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createProjectId(value: string): ProjectId {
	const result = ProjectIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("ProjectId.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructProjectId(value: string): ProjectId {
	const result = ProjectIdSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"ProjectId.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const ProjectId = {
	create: createProjectId,
	reconstruct: reconstructProjectId,
} as const;
