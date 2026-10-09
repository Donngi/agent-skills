import { z } from "zod";
import {
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const PullRequestUrlBrand: unique symbol;

/**
 * PullRequestUrl
 * 実装のプルリクエストの URL。
 */
export const PullRequestUrlSchema = z
	.string()
	.max(2048, { error: "URL は2048文字までです" })
	// z.url() は前後の空白と途中の改行・タブ・CR を取り除いて値を書き換える。制御文字・\・途中の空白は、
	// 解析では読み飛ばすか / と読んで通し、値はそのまま返す。どちらも url に渡す前に拒否する。
	// 後ろに置くと、除去後の値しか見えない
	.refine((v) => /^[\x21-\x5b\x5d-\x7e]*$/.test(v), {
		error:
			"URL に使える文字は、空白とバックスラッシュを除く印字可能な ASCII 文字です",
	})
	// protocol の判定は大文字小文字を区別せず、// の無い https:host も通すので、書き出しを文字どおりに見る
	.refine((v) => v.startsWith("https://"), {
		error: "URL は https:// で始まる形です",
	})
	.refine((v) => !/^https:\/\/[^/?#]*@/.test(v), {
		error: "URL に認証情報を含めることはできません",
	})
	// ホスト名の大文字小文字の揺れだけを止める。既定のポートや .. を含むパスなど、同じ先を指す別の表記までは止めない
	.refine(
		(v) => {
			const host = /^https:\/\/([^/?#]*)/.exec(v)?.[1];
			return host === undefined || host === host.toLowerCase();
		},
		{ error: "URL のホスト名は小文字です" },
	)
	.pipe(z.url({ protocol: /^https$/, hostname: z.regexes.domain }))
	.brand<typeof PullRequestUrlBrand>();

export type PullRequestUrl = z.output<typeof PullRequestUrlSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createPullRequestUrl(value: string): PullRequestUrl {
	const result = PullRequestUrlSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidCreationParamError("PullRequestUrl.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructPullRequestUrl(value: string): PullRequestUrl {
	const result = PullRequestUrlSchema.safeParse(value);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"PullRequestUrl.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const PullRequestUrl = {
	create: createPullRequestUrl,
	reconstruct: reconstructPullRequestUrl,
} as const;
