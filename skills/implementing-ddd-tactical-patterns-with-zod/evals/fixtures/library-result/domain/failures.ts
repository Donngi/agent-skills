import type * as z from "zod";

/**
 * ドメイン層が返す失敗の一覧。
 * class も throw も使わない。`kind` で分岐し、`issues` に検証の詳細を残す。
 */

export type InvalidCreationParam = Readonly<{
	kind: "invalidCreationParam";
	/** どの操作で失敗したか。`"PublisherCode.create"` のようにモデル名を含める。 */
	operation: string;
	issues: readonly z.core.$ZodIssue[];
}>;

export type InvalidReconstructParam = Readonly<{
	kind: "invalidReconstructParam";
	operation: string;
	issues: readonly z.core.$ZodIssue[];
}>;

export type DomainFailure = InvalidCreationParam | InvalidReconstructParam;

export function invalidCreationParam(
	operation: string,
	cause: z.ZodError,
): InvalidCreationParam {
	return {
		kind: "invalidCreationParam",
		operation,
		issues: cause.issues,
	};
}

export function invalidReconstructParam(
	operation: string,
	cause: z.ZodError,
): InvalidReconstructParam {
	return {
		kind: "invalidReconstructParam",
		operation,
		issues: cause.issues,
	};
}
