import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

/**
 * BookStatus
 * 蔵書の状態。貸し出せるのは onShelf の蔵書だけである。
 */
export const BookStatusSchema = z.enum([
	"onShelf",
	"onLoan",
	"inRepair",
	"lost",
]);

export type BookStatus = z.output<typeof BookStatusSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createBookStatus(value: string): BookStatus {
	const result = BookStatusSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("BookStatus.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructBookStatus(value: string): BookStatus {
	const result = BookStatusSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"BookStatus.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const BookStatus = {
	create: createBookStatus,
	reconstruct: reconstructBookStatus,
} as const;
