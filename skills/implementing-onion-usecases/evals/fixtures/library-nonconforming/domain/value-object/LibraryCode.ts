import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const LibraryCodeBrand: unique symbol;

/**
 * LibraryCode
 * 館の識別に使う館コード。貸出番号の接頭辞になる。
 */
export const LibraryCodeSchema = z
	.string()
	.regex(/^[A-Z]{2,10}$/, {
		error: "館コードは大文字英字2〜10文字です",
	})
	.brand<typeof LibraryCodeBrand>();

export type LibraryCode = z.output<typeof LibraryCodeSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createLibraryCode(value: string): LibraryCode {
	const result = LibraryCodeSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("LibraryCode.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructLibraryCode(value: string): LibraryCode {
	const result = LibraryCodeSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"LibraryCode.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const LibraryCode = {
	create: createLibraryCode,
	reconstruct: reconstructLibraryCode,
} as const;
