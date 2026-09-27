import { z } from "zod";
import {
	type DomainFailure,
	invalidCreationParam,
	invalidReconstructParam,
} from "../failures";
import { err, ok, type Result } from "../result";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const PublisherCodeBrand: unique symbol;

/**
 * PublisherCode
 * 出版社に割り当てた社内コード。
 */
export const PublisherCodeSchema = z
	.string()
	.regex(/^P[0-9]{4}$/, {
		error: "出版社コードは P0001 の形です",
	})
	.brand<typeof PublisherCodeBrand>();

export type PublisherCode = z.output<typeof PublisherCodeSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

function createPublisherCode(
	value: string,
): Result<PublisherCode, DomainFailure> {
	const result = PublisherCodeSchema.safeParse(value);
	if (!result.success) {
		return err(invalidCreationParam("PublisherCode.create", result.error));
	}
	return ok(result.data);
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

function reconstructPublisherCode(
	value: string,
): Result<PublisherCode, DomainFailure> {
	const result = PublisherCodeSchema.safeParse(value);
	if (!result.success) {
		return err(
			invalidReconstructParam("PublisherCode.reconstruct", result.error),
		);
	}
	return ok(result.data);
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const PublisherCode = {
	create: createPublisherCode,
	reconstruct: reconstructPublisherCode,
} as const;
