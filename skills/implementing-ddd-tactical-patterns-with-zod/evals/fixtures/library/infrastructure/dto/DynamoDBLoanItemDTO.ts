import { z } from "zod";
import { Loan, LoanSchema } from "../../domain/entity/Loan";
import {
	FatalUnreachableError,
	InvalidReconstructParamError,
} from "../../domain/shared-errors";
import type { LibraryCode } from "../../domain/value-object/LibraryCode";
import type { LoanNumber } from "../../domain/value-object/LoanNumber";
import type { MemberId } from "../../domain/value-object/MemberId";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

// ドメインの LoanNumber が持つ桁数と同じ値だが共有しない。あちらは業務で許す連番の
// 上限、こちらは保存済みのキーの符号化幅で、変えてよいタイミングが違う。連動させると
// 連番の上限を広げただけで既存のキーが変わり、保存済みの貸出が取得できなくなる
/** ソートキーの連番の桁数。文字列比較で番号順に並ぶようにゼロ詰めする。 */
const SEQUENCE_DIGITS = 9;

const DynamoDBLoanCommonFields = {
	// 保存キーは templateLiteral ではなく string + regex で書く。
	// templateLiteral にすると出力型が `LIBRARY#${string}` になり、戻り値型を注釈していない
	// 中間オブジェクトをスプレッドして組み立てたときに as が要る。
	// regex は区切りの位置と連番の桁だけを見る。館コードの文字種と長さはドメインの制約なので
	// 写さない。写すとドメイン側を広げた瞬間に、有効な値の保存がここで落ちる
	/** パーティションキー */
	PK: z.string().regex(/^LIBRARY#[^#-]+$/),
	/** ソートキー */
	SK: z.string().regex(new RegExp(`^LOAN#[^#-]+-[0-9]{${SEQUENCE_DIGITS}}$`)),
	/** 利用者ごとの一覧に使うインデックスのパーティションキー */
	GSI1PK: z.string().regex(/^MEMBER#[^#]+$/),
	/** 利用者ごとの一覧に使うインデックスのソートキー */
	GSI1SK: z
		.string()
		.regex(new RegExp(`^LOAN#[^#-]+-[0-9]{${SEQUENCE_DIGITS}}$`)),
	/** 貸出番号 */
	id: z.string(),
	/** 借りる蔵書 */
	bookId: z.string(),
	/** 借りる利用者 */
	memberId: z.string(),
	/** 貸出時のメモ */
	memo: z.string(),
};

/**
 * DynamoDBLoanItemDTO
 * 貸出の DTO。
 */
// 状態別ユニオンにする。単一オブジェクトで状態ごとの項目を任意にすると、
// ドメインへ変換するときに as が要る
const DynamoDBLoanItemDTOSchema = z
	.discriminatedUnion("status", [
		z.strictObject({
			...DynamoDBLoanCommonFields,
			status: z.literal("reserved"),
			/** 取り置きの期限 */
			holdUntil: z.number(),
		}),
		z.strictObject({
			...DynamoDBLoanCommonFields,
			status: z.literal("lent"),
			/** 貸出日のタイムスタンプ */
			lentAt: z.number(),
			/** 返却期限のタイムスタンプ */
			dueAt: z.number(),
		}),
		z.strictObject({
			...DynamoDBLoanCommonFields,
			status: z.literal("returned"),
			/** 貸出日のタイムスタンプ */
			lentAt: z.number(),
			/** 返却期限のタイムスタンプ */
			dueAt: z.number(),
			/** 返却日のタイムスタンプ */
			returnedAt: z.number(),
		}),
	])
	.superRefine((v, ctx) => {
		const key = toPKSKFromRawId(v.id);
		if (v.PK !== key.PK) {
			ctx.addIssue({
				code: "custom",
				path: ["PK"],
				message: "パーティションキーは貸出番号から導出した値です",
			});
		}
		if (v.SK !== key.SK) {
			ctx.addIssue({
				code: "custom",
				path: ["SK"],
				message: "ソートキーは貸出番号から導出した値です",
			});
		}
		if (v.GSI1PK !== toMemberPKFromRawId(v.memberId)) {
			ctx.addIssue({
				code: "custom",
				path: ["GSI1PK"],
				message: "インデックスのパーティションキーは会員番号から導出した値です",
			});
		}
		if (v.GSI1SK !== key.SK) {
			ctx.addIssue({
				code: "custom",
				path: ["GSI1SK"],
				message: "インデックスのソートキーはソートキーと同じ値です",
			});
		}
	});

export type DynamoDBLoanItemDTO = z.output<typeof DynamoDBLoanItemDTOSchema>;

// -------------------------------------------------
// 変換
// -------------------------------------------------

function toPKFromRawLibraryCode(libraryCode: string): string {
	return `LIBRARY#${libraryCode}`;
}

export function toDynamoDBLoanItemDTOPK(libraryCode: LibraryCode): string {
	return toPKFromRawLibraryCode(libraryCode);
}

function toMemberPKFromRawId(memberId: string): string {
	return `MEMBER#${memberId}`;
}

export function toDynamoDBLoanItemDTOMemberPK(memberId: MemberId): string {
	return toMemberPKFromRawId(memberId);
}

function toSKFromRawId(id: string): string {
	const separator = id.indexOf("-");
	const libraryCode = id.slice(0, separator);
	const sequence = id.slice(separator + 1);
	return `LOAN#${libraryCode}-${sequence.padStart(SEQUENCE_DIGITS, "0")}`;
}

/** 横断検証からも呼ぶので、検証前の文字列を受ける。 */
function toPKSKFromRawId(id: string): Readonly<{ PK: string; SK: string }> {
	const separator = id.indexOf("-");
	return {
		PK: toPKFromRawLibraryCode(id.slice(0, separator)),
		SK: toSKFromRawId(id),
	};
}

export function toDynamoDBLoanItemDTOPKSK(
	id: LoanNumber,
): Readonly<{ PK: string; SK: string }> {
	return toPKSKFromRawId(id);
}

function toDynamoDBLoanCommonFields(loan: Loan) {
	const key = toDynamoDBLoanItemDTOPKSK(loan.id);
	return {
		...key,
		GSI1PK: toDynamoDBLoanItemDTOMemberPK(loan.memberId),
		GSI1SK: key.SK,
		id: loan.id,
		bookId: loan.bookId,
		memberId: loan.memberId,
		memo: loan.memo,
	};
}

function toDynamoDBLoanItemDTOFields(loan: Loan): DynamoDBLoanItemDTO {
	const common = toDynamoDBLoanCommonFields(loan);
	switch (loan.status) {
		case "reserved":
			return { ...common, status: "reserved", holdUntil: loan.holdUntil };
		case "lent":
			return {
				...common,
				status: "lent",
				lentAt: loan.lentAt,
				dueAt: loan.dueAt,
			};
		case "returned":
			return {
				...common,
				status: "returned",
				lentAt: loan.lentAt,
				dueAt: loan.dueAt,
				returnedAt: loan.returnedAt,
			};
		default:
			loan satisfies never;
			throw new FatalUnreachableError("DynamoDBLoanItemDTO.to");
	}
}

export function toDynamoDBLoanItemDTO(loan: Loan): DynamoDBLoanItemDTO {
	// Loan 型でも不変条件を満たすとは限らない。ブランドはスプレッドで引き継がれるので、
	// 規約に反してドメインの外でスプレッドして作った値も Loan 型になる。
	// 壊れた値を書き込むと以後の読み出しがすべて失敗するので、保存形式にする前に確かめる
	const checked = LoanSchema.safeParse(loan);
	if (!checked.success) {
		throw new FatalUnreachableError("DynamoDBLoanItemDTO.to", checked.error);
	}
	const item = toDynamoDBLoanItemDTOFields(checked.data);
	const result = DynamoDBLoanItemDTOSchema.safeParse(item);
	if (!result.success) {
		throw new FatalUnreachableError("DynamoDBLoanItemDTO.to", result.error);
	}
	return result.data;
}

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
export function fromDynamoDBLoanItemDTO(raw: unknown): Loan {
	const result = DynamoDBLoanItemDTOSchema.safeParse(raw);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"DynamoDBLoanItemDTO.from",
			result.error,
		);
	}
	const {
		PK: _pk,
		SK: _sk,
		GSI1PK: _gsi1pk,
		GSI1SK: _gsi1sk,
		...rest
	} = result.data;
	return Loan.reconstruct(rest);
}
