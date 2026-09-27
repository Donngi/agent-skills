import { z } from "zod";
import {
	OverdueCharge,
	OverdueChargeSchema,
} from "../../domain/entity/OverdueCharge";
import {
	FatalUnreachableError,
	InvalidReconstructParamError,
} from "../../domain/shared-errors";
import type { ChargeId } from "../../domain/value-object/ChargeId";
import type { MemberId } from "../../domain/value-object/MemberId";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

/**
 * DynamoDBOverdueChargeItemDTO
 * 延滞請求の DTO。
 */
const DynamoDBOverdueChargeItemDTOSchema = z
	.strictObject({
		// 保存キーは templateLiteral ではなく string + regex で書く。
		// templateLiteral にすると出力型が `MEMBER#${string}` になり、戻り値型を注釈していない
		// 中間オブジェクトをスプレッドして組み立てたときに as が要る。
		// regex は接頭辞と区切りだけを見る。会員番号と識別子の形式はドメインの制約なので
		// 写さない。写すとドメイン側を広げた瞬間に、有効な値の保存がここで落ちる
		/** パーティションキー */
		PK: z.string().regex(/^MEMBER#[^#]+$/),
		/** ソートキー */
		SK: z.string().regex(/^CHARGE#[^#]+$/),
		/** 請求の識別子 */
		id: z.string(),
		/** 請求先の利用者 */
		memberId: z.string(),
		/** 明細 */
		lines: z.array(
			z.strictObject({
				/** 明細の金額 */
				amount: z.number(),
			}),
		),
		/** 割引額 */
		discountAmount: z.number(),
		/** 請求額 */
		chargeAmount: z.number(),
		/** 作成のタイムスタンプ */
		createdAt: z.number(),
		/** 備考。無ければ属性ごと無い。 */
		note: z.string().exactOptional(),
	})
	.superRefine((v, ctx) => {
		const key = toPKSKFromRaw(v.memberId, v.id);
		if (v.PK !== key.PK) {
			ctx.addIssue({
				code: "custom",
				path: ["PK"],
				message: "パーティションキーは会員番号から導出した値です",
			});
		}
		if (v.SK !== key.SK) {
			ctx.addIssue({
				code: "custom",
				path: ["SK"],
				message: "ソートキーは請求の識別子から導出した値です",
			});
		}
	});

export type DynamoDBOverdueChargeItemDTO = z.output<
	typeof DynamoDBOverdueChargeItemDTOSchema
>;

// -------------------------------------------------
// 変換
// -------------------------------------------------

function toPKFromRawMemberId(memberId: string): string {
	return `MEMBER#${memberId}`;
}

export function toDynamoDBOverdueChargeItemDTOPK(memberId: MemberId): string {
	return toPKFromRawMemberId(memberId);
}

function toSKFromRawId(id: string): string {
	return `CHARGE#${id}`;
}

/** 横断検証からも呼ぶので、検証前の文字列を受ける。 */
function toPKSKFromRaw(
	memberId: string,
	id: string,
): Readonly<{ PK: string; SK: string }> {
	return {
		PK: toPKFromRawMemberId(memberId),
		SK: toSKFromRawId(id),
	};
}

export function toDynamoDBOverdueChargeItemDTOPKSK(
	memberId: MemberId,
	id: ChargeId,
): Readonly<{ PK: string; SK: string }> {
	return toPKSKFromRaw(memberId, id);
}

function toDynamoDBOverdueChargeItemDTOFields(
	charge: OverdueCharge,
): DynamoDBOverdueChargeItemDTO {
	return {
		...toDynamoDBOverdueChargeItemDTOPKSK(charge.memberId, charge.id),
		id: charge.id,
		memberId: charge.memberId,
		lines: charge.lines.map((line) => ({ amount: line.amount })),
		discountAmount: charge.discountAmount,
		chargeAmount: charge.chargeAmount,
		createdAt: charge.createdAt,
		// undefined を代入すると属性が残る。値があるときだけ項目を置く
		...(charge.note !== undefined ? { note: charge.note } : {}),
	};
}

export function toDynamoDBOverdueChargeItemDTO(
	charge: OverdueCharge,
): DynamoDBOverdueChargeItemDTO {
	// OverdueCharge 型でも不変条件を満たすとは限らない。ブランドはスプレッドで引き継がれるので、
	// 規約に反してドメインの外でスプレッドして作った値も OverdueCharge 型になる。
	// 壊れた値を書き込むと以後の読み出しがすべて失敗するので、保存形式にする前に確かめる
	const checked = OverdueChargeSchema.safeParse(charge);
	if (!checked.success) {
		throw new FatalUnreachableError(
			"DynamoDBOverdueChargeItemDTO.to",
			checked.error,
		);
	}
	const item = toDynamoDBOverdueChargeItemDTOFields(checked.data);
	const result = DynamoDBOverdueChargeItemDTOSchema.safeParse(item);
	if (!result.success) {
		throw new FatalUnreachableError(
			"DynamoDBOverdueChargeItemDTO.to",
			result.error,
		);
	}
	return result.data;
}

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
export function fromDynamoDBOverdueChargeItemDTO(raw: unknown): OverdueCharge {
	const result = DynamoDBOverdueChargeItemDTOSchema.safeParse(raw);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"DynamoDBOverdueChargeItemDTO.from",
			result.error,
		);
	}
	const { PK: _pk, SK: _sk, ...rest } = result.data;
	return OverdueCharge.reconstruct(rest);
}
