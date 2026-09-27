import { z } from "zod";
import {
	FatalUnreachableError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
	LotLimitExceededError,
	PreconditionError,
} from "../errors";
import { type LotNumber, LotNumberSchema } from "../value-object/LotNumber";
import { Quantity, QuantitySchema } from "../value-object/Quantity";
import { SkuSchema } from "../value-object/Sku";
import { StockItemIdSchema } from "../value-object/StockItemId";
import { type Timestamp, TimestampSchema } from "../value-object/Timestamp";
import { WarehouseCodeSchema } from "../value-object/WarehouseCode";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const StockItemBrand: unique symbol;

/** 1つの在庫が抱えられるロットの上限。 */
const LOT_LIMIT = 50;

const StockItemFields = {
	/** 在庫の識別子 */
	id: StockItemIdSchema,
	/** 置いてある倉庫 */
	warehouseCode: WarehouseCodeSchema,
	/** 品番 */
	sku: SkuSchema,
	/** 数量。0以上9999以下。 */
	quantity: QuantitySchema,
	/** 抱えているロット。ロット番号の昇順に並ぶ。 */
	lots: z
		.array(LotNumberSchema)
		.max(LOT_LIMIT, { error: `ロットは${LOT_LIMIT}件までです` })
		.refine((ls) => new Set(ls).size === ls.length, {
			error: "ロット番号は一意です",
		})
		.refine(
			(ls) =>
				ls.every((l, i) => {
					const prev = ls[i - 1];
					return prev === undefined || prev <= l;
				}),
			{ error: "ロットは昇順です" },
		),
	/** 最後に動いたタイムスタンプ */
	updatedAt: TimestampSchema,
};

/**
 * StockItem
 * ある倉庫に置いてある1つの品番の在庫。
 * ロットは入荷の追跡の記録で、出庫では減らさない。そのため数量はロットの件数を下回れず、
 * 全量出庫はこのモデルの範囲外である（意図した制限）。
 */
export const StockItemSchema = z
	.strictObject(StockItemFields)
	.superRefine((v, ctx) => {
		// ロットに1つずつ割り当てたぶんを引いた余りを、Quantity として組み立てる。
		// 数量がロットの件数を下回っていれば負の数になる
		const spare = Quantity.create(v.quantity - v.lots.length);
		if (spare < 0) {
			ctx.addIssue({
				code: "custom",
				path: ["quantity"],
				message: "数量はロットの件数を下回れません",
			});
		}
	})
	.readonly()
	.brand<typeof StockItemBrand>();

export type StockItem = z.output<typeof StockItemSchema>;

export type StockItemSchemaInput = z.input<typeof StockItemSchema>;

// -------------------------------------------------
// ファクトリー関数
// -------------------------------------------------

export const CreateStockItemPropsSchema = z
	.strictObject(StockItemFields)
	.pick({ id: true, warehouseCode: true, sku: true, updatedAt: true });

export type CreateStockItemProps = z.output<typeof CreateStockItemPropsSchema>;

/** @throws InvalidCreationParamError 渡された値が不正なとき。 */
function createStockItem(props: CreateStockItemProps): StockItem {
	const input = CreateStockItemPropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("StockItem.create", input.error);
	}
	const result = StockItemSchema.safeParse({
		id: input.data.id,
		warehouseCode: input.data.warehouseCode,
		sku: input.data.sku,
		quantity: 0,
		lots: [],
		updatedAt: input.data.updatedAt,
	} satisfies StockItemSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("StockItem.create", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 再生成関数
// -------------------------------------------------

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function reconstructStockItem(props: StockItemSchemaInput): StockItem {
	const result = StockItemSchema.safeParse(props);
	if (!result.success) {
		throw new InvalidReconstructParamError(
			"StockItem.reconstruct",
			result.error,
		);
	}
	return result.data;
}

// -------------------------------------------------
// 等価性
// -------------------------------------------------

function stockItemEqualsById(a: StockItem, b: StockItem): boolean {
	return a.id === b.id;
}

// -------------------------------------------------
// 比較
// -------------------------------------------------

// 並べ替えは、lots の昇順の検査（`<=`）と同じ比較で行う
function compareLotNumbers(a: LotNumber, b: LotNumber): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}

// -------------------------------------------------
// 業務操作
// -------------------------------------------------

export type ReceiveStockItemParams = Readonly<{
	/** 入庫したロット */
	lot: LotNumber;
	/** 入庫した数量 */
	quantity: Quantity;
	/** 入庫のタイムスタンプ */
	at: Timestamp;
}>;

/**
 * 同じロットをもう一度入庫したときは、数量だけを足す。
 */
function receiveStockItem(
	item: StockItem,
	params: ReceiveStockItemParams,
): StockItem {
	if (!item.lots.includes(params.lot) && item.lots.length >= LOT_LIMIT) {
		throw new LotLimitExceededError("StockItem.receive", item.id, LOT_LIMIT);
	}
	const lots = item.lots.includes(params.lot)
		? item.lots
		: [...item.lots, params.lot].sort(compareLotNumbers);
	const result = StockItemSchema.safeParse({
		...item,
		quantity: Quantity.add(item.quantity, { addend: params.quantity }),
		lots,
		updatedAt: params.at,
	} satisfies StockItemSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("StockItem.receive", result.error);
	}
	return result.data;
}

const ShipStockItemParamsSchema = z.strictObject({
	quantity: QuantitySchema,
	at: TimestampSchema,
});

export type ShipStockItemParams = z.output<typeof ShipStockItemParamsSchema>;

/**
 * 抱えているロットは減らさない。
 * @throws InvalidCreationParamError 渡された値が不正なとき、在庫が足りないとき。
 */
function shipStockItem(
	item: StockItem,
	params: ShipStockItemParams,
): StockItem {
	const input = ShipStockItemParamsSchema.safeParse(params);
	if (!input.success) {
		throw new InvalidCreationParamError("StockItem.ship", input.error);
	}
	const result = StockItemSchema.safeParse({
		...item,
		quantity: item.quantity - input.data.quantity,
		updatedAt: input.data.at,
	} satisfies StockItemSchemaInput);
	if (!result.success) {
		throw new InvalidCreationParamError("StockItem.ship", result.error);
	}
	return result.data;
}

export type AdjustStockItemParams = Readonly<{
	/** 棚卸しで数えた数量 */
	quantity: Quantity;
	/** 棚卸しのタイムスタンプ */
	at: Timestamp;
}>;

/**
 * 棚卸しの結果で数量を置き換える。
 * @throws PreconditionError 数量がロットの件数を下回るとき。
 */
function adjustStockItem(
	item: StockItem,
	params: AdjustStockItemParams,
): StockItem {
	if (params.quantity < item.lots.length) {
		throw new PreconditionError(
			"StockItem.adjust",
			"数量をロットの件数より少なくすることはできません",
		);
	}
	const result = StockItemSchema.safeParse({
		...item,
		quantity: params.quantity,
		updatedAt: params.at,
	} satisfies StockItemSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("StockItem.adjust", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const StockItem = {
	create: createStockItem,
	reconstruct: reconstructStockItem,
	equalsById: stockItemEqualsById,
	receive: receiveStockItem,
	ship: shipStockItem,
	adjust: adjustStockItem,
} as const;
