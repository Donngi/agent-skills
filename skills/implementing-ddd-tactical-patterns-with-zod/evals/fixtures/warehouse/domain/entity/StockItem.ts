import { z } from "zod";
import {
	DomainError,
	FatalUnreachableError,
	InvalidClockValueError,
	InvalidCreationParamError,
	InvalidReconstructParamError,
} from "../shared-errors";
import type { ShipmentNumber } from "../value-object/ShipmentNumber";
import { ShipmentNumberSchema } from "../value-object/ShipmentNumber";
import { SkuSchema } from "../value-object/Sku";
import {
	type StockItemId,
	StockItemIdSchema,
} from "../value-object/StockItemId";
import { type Timestamp, TimestampSchema } from "../value-object/Timestamp";
import { WarehouseCodeSchema } from "../value-object/WarehouseCode";

// -------------------------------------------------
// スキーマ・型定義
// -------------------------------------------------

declare const StockItemBrand: unique symbol;

/** 1つの在庫が持てる数量の上限。棚1つに置ける箱数から決めている。 */
export const QUANTITY_MAX = 9999;

const StockItemCommonFields = {
	/** 在庫の識別子 */
	id: StockItemIdSchema,
	/** 置いてある倉庫 */
	warehouseCode: WarehouseCodeSchema,
	/** 品番 */
	sku: SkuSchema,
	/** 置いてある数量 */
	quantity: z
		.int()
		.nonnegative({ error: "数量は0以上です" })
		.max(QUANTITY_MAX, { error: `数量は${QUANTITY_MAX}までです` }),
	/** 最後に動いたタイムスタンプ */
	updatedAt: TimestampSchema,
};

/**
 * StockItem
 * ある倉庫に置いてある1つの品番の在庫。出荷指示に引き当てると held になる。
 */
export const StockItemSchema = z
	.discriminatedUnion("status", [
		z.strictObject({
			...StockItemCommonFields,
			status: z.literal("available"),
		}),
		z.strictObject({
			...StockItemCommonFields,
			status: z.literal("held"),
			/** 引き当てた出荷指示 */
			heldFor: ShipmentNumberSchema,
			/** 引き当てた数量 */
			heldQuantity: z
				.int()
				.positive({ error: "引き当てる数量は1以上です" }),
			/** 引き当てのタイムスタンプ */
			heldAt: TimestampSchema,
		}),
	])
	.superRefine((v, ctx) => {
		// この中から例外を投げる関数を呼ばない。safeParse は例外を捕まえないので、
		// safeParse を呼んだ場所すべてで意図しない例外になる
		if (v.status === "held" && v.heldQuantity > v.quantity) {
			ctx.addIssue({
				code: "custom",
				path: ["heldQuantity"],
				message: "引き当てた数量は置いてある数量を超えることはできません",
			});
		}
		if (v.status === "held" && v.heldAt > v.updatedAt) {
			ctx.addIssue({
				code: "custom",
				path: ["heldAt"],
				message: "引き当てのタイムスタンプは最終更新より後にはできません",
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

export type StockItemDeps = Readonly<{
	clock: Readonly<{
		/** Unix epoch ミリ秒を返す。前に返した値より小さい値を返さない。 */
		now: () => number;
	}>;
}>;

export const CreateStockItemPropsSchema = z
	.strictObject(StockItemCommonFields)
	.pick({
		id: true,
		warehouseCode: true,
		sku: true,
		quantity: true,
	})
	.readonly();

export type CreateStockItemProps = z.output<typeof CreateStockItemPropsSchema>;

/**
 * @throws InvalidCreationParamError 渡された値が不正なとき。
 * @throws InvalidClockValueError クロックがタイムスタンプとして不正な値を返したとき。
 */
function createStockItem(
	props: CreateStockItemProps,
	deps: StockItemDeps,
): StockItem {
	const input = CreateStockItemPropsSchema.safeParse(props);
	if (!input.success) {
		throw new InvalidCreationParamError("StockItem.create", input.error);
	}
	const updatedAt = TimestampSchema.safeParse(deps.clock.now());
	if (!updatedAt.success) {
		throw new InvalidClockValueError("StockItem.create", updatedAt.error);
	}
	const result = StockItemSchema.safeParse({
		id: input.data.id,
		warehouseCode: input.data.warehouseCode,
		sku: input.data.sku,
		quantity: input.data.quantity,
		updatedAt: updatedAt.data,
		status: "available",
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
// 業務操作
// -------------------------------------------------

export type HoldStockItemParams = Readonly<{
	/** 引き当てる出荷指示 */
	shipmentNumber: ShipmentNumber;
	/** 引き当てる数量 */
	quantity: number;
	/** 引き当てのタイムスタンプ */
	at: Timestamp;
}>;

/**
 * 引き当てていない在庫だけ引き当てられる。
 * @throws StockItemStatusMismatchError すでに引き当てられているとき。
 * @throws HoldQuantityOutOfRangeError 1以上の整数でない数量を渡したとき。
 * @throws StockQuantityShortageError 置いてある数量を超えて引き当てようとしたとき。
 * @throws StockItemHeldBeforeLastUpdateError 最終更新より前のタイムスタンプを渡したとき。
 */
function holdStockItem(
	item: StockItem,
	params: HoldStockItemParams,
): StockItem {
	if (item.status !== "available") {
		throw new StockItemStatusMismatchError(
			"StockItem.hold",
			item.id,
			"available",
			item.status,
		);
	}
	if (!Number.isInteger(params.quantity) || params.quantity < 1) {
		throw new HoldQuantityOutOfRangeError(
			"StockItem.hold",
			item.id,
			params.quantity,
		);
	}
	if (params.quantity > item.quantity) {
		throw new StockQuantityShortageError(
			"StockItem.hold",
			item.id,
			params.quantity,
			item.quantity,
		);
	}
	if (params.at < item.updatedAt) {
		throw new StockItemHeldBeforeLastUpdateError(
			"StockItem.hold",
			item.id,
			params.at,
			item.updatedAt,
		);
	}
	const result = StockItemSchema.safeParse({
		...item,
		status: "held",
		heldFor: params.shipmentNumber,
		heldQuantity: params.quantity,
		heldAt: params.at,
		updatedAt: params.at,
	} satisfies StockItemSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("StockItem.hold", result.error);
	}
	return result.data;
}

export type ReleaseStockItemParams = Readonly<{
	/** 引き当てを外すタイムスタンプ */
	at: Timestamp;
}>;

/**
 * 引き当て済みの在庫だけ外せる。
 * @throws StockItemStatusMismatchError 引き当てられていないとき。
 * @throws StockItemReleasedBeforeLastUpdateError 最終更新より前のタイムスタンプを渡したとき。
 */
function releaseStockItem(
	item: StockItem,
	params: ReleaseStockItemParams,
): StockItem {
	if (item.status !== "held") {
		throw new StockItemStatusMismatchError(
			"StockItem.release",
			item.id,
			"held",
			item.status,
		);
	}
	if (params.at < item.updatedAt) {
		throw new StockItemReleasedBeforeLastUpdateError(
			"StockItem.release",
			item.id,
			params.at,
			item.updatedAt,
		);
	}
	const {
		heldFor: _heldFor,
		heldQuantity: _heldQuantity,
		heldAt: _heldAt,
		...rest
	} = item;
	const result = StockItemSchema.safeParse({
		...rest,
		status: "available",
		updatedAt: params.at,
	} satisfies StockItemSchemaInput);
	if (!result.success) {
		throw new FatalUnreachableError("StockItem.release", result.error);
	}
	return result.data;
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** その操作を許さない状態の在庫に対して処理を実行しようとした。 */
export class StockItemStatusMismatchError extends DomainError {
	override readonly name: string = "StockItemStatusMismatchError";

	/** 失敗した在庫の識別子 */
	readonly stockItemId: StockItemId;
	/** その操作ができる状態 */
	readonly expected: StockItem["status"];
	/** 渡された在庫の状態 */
	readonly actual: StockItem["status"];

	constructor(
		operation: string,
		stockItemId: StockItemId,
		expected: StockItem["status"],
		actual: StockItem["status"],
	) {
		super(
			operation,
			`${expected} の在庫だけが対象です。渡された在庫は ${actual} です`,
		);
		this.stockItemId = stockItemId;
		this.expected = expected;
		this.actual = actual;
	}
}

/** 引き当てようとした数量が、置いてある数量を超えていた。 */
export class StockQuantityShortageError extends DomainError {
	override readonly name: string = "StockQuantityShortageError";

	/** 失敗した在庫の識別子 */
	readonly stockItemId: StockItemId;
	/** 引き当てようとした数量 */
	readonly requested: number;
	/** 置いてある数量 */
	readonly available: number;

	constructor(
		operation: string,
		stockItemId: StockItemId,
		requested: number,
		available: number,
	) {
		super(operation, "引き当てた数量は置いてある数量を超えることはできません");
		this.stockItemId = stockItemId;
		this.requested = requested;
		this.available = available;
	}
}

/** 引き当てる数量に、1以上の整数でない値が渡された。 */
export class HoldQuantityOutOfRangeError extends DomainError {
	override readonly name: string = "HoldQuantityOutOfRangeError";

	/** 失敗した在庫の識別子 */
	readonly stockItemId: StockItemId;
	/** 渡された数量 */
	readonly requested: number;

	constructor(operation: string, stockItemId: StockItemId, requested: number) {
		super(
			operation,
			`引き当てる数量は1以上の整数です。渡された数量は ${requested} です`,
		);
		this.stockItemId = stockItemId;
		this.requested = requested;
	}
}

/** 引き当てのタイムスタンプに、最終更新より前の値を渡した。 */
export class StockItemHeldBeforeLastUpdateError extends DomainError {
	override readonly name: string = "StockItemHeldBeforeLastUpdateError";

	/** 失敗した在庫の識別子 */
	readonly stockItemId: StockItemId;
	/** 渡された引き当てのタイムスタンプ */
	readonly heldAt: Timestamp;
	/** 在庫の最終更新のタイムスタンプ */
	readonly updatedAt: Timestamp;

	constructor(
		operation: string,
		stockItemId: StockItemId,
		heldAt: Timestamp,
		updatedAt: Timestamp,
	) {
		super(
			operation,
			"引き当てのタイムスタンプを最終更新より前にすることはできません",
		);
		this.stockItemId = stockItemId;
		this.heldAt = heldAt;
		this.updatedAt = updatedAt;
	}
}

/** 引き当てを外すタイムスタンプに、最終更新より前の値を渡した。 */
export class StockItemReleasedBeforeLastUpdateError extends DomainError {
	override readonly name: string = "StockItemReleasedBeforeLastUpdateError";

	/** 失敗した在庫の識別子 */
	readonly stockItemId: StockItemId;
	/** 渡された引き当てを外すタイムスタンプ */
	readonly releasedAt: Timestamp;
	/** 在庫の最終更新のタイムスタンプ */
	readonly updatedAt: Timestamp;

	constructor(
		operation: string,
		stockItemId: StockItemId,
		releasedAt: Timestamp,
		updatedAt: Timestamp,
	) {
		super(
			operation,
			"引き当てを外すタイムスタンプを最終更新より前にすることはできません",
		);
		this.stockItemId = stockItemId;
		this.releasedAt = releasedAt;
		this.updatedAt = updatedAt;
	}
}

// -------------------------------------------------
// 公開 API
// -------------------------------------------------

export const StockItem = {
	create: createStockItem,
	reconstruct: reconstructStockItem,
	equalsById: stockItemEqualsById,
	hold: holdStockItem,
	release: releaseStockItem,
} as const;
