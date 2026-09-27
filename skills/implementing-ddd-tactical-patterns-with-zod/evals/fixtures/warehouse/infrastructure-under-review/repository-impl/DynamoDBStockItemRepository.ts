import type { StockItem } from "../../domain/entity/StockItem";
import { DomainError } from "../../domain/shared-errors";
import type { StockItemRepository } from "../../domain/repository/StockItemRepository";
import type { Sku } from "../../domain/value-object/Sku";
import type { WarehouseCode } from "../../domain/value-object/WarehouseCode";
import { DynamoDBStockItemDTO } from "../dto/DynamoDBStockItemDTO";

// -------------------------------------------------
// AWS SDK のスタブ
// -------------------------------------------------

/**
 * この fixture を AWS SDK に依存させないため、SDK と同じ名前・同じ呼び出し方の型を
 * ここに置いている。実物ではこのセクションを消して次の import を書けばよい。
 * 下の実装はそのまま動く。
 *
 * import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
 * import {
 *   DynamoDBDocumentClient,
 *   GetCommand,
 *   PutCommand,
 *   QueryCommand,
 * } from "@aws-sdk/lib-dynamodb";
 */
type Command<Output> = Readonly<{ __output: Output }>;

export type DynamoDBClient = Readonly<{
	send: <Output>(command: Command<Output>) => Promise<Output>;
}>;

const DynamoDBDocumentClient = {
	from: (client: DynamoDBClient): DynamoDBClient => client,
};

class GetCommand {
	declare readonly __output: Readonly<{ Item?: unknown }>;
	constructor(
		readonly input: Readonly<{
			TableName: string;
			Key: Readonly<Record<string, string>>;
		}>,
	) {}
}

class QueryCommand {
	declare readonly __output: Readonly<{ Items?: readonly unknown[] }>;
	constructor(
		readonly input: Readonly<{
			TableName: string;
			KeyConditionExpression: string;
			ExpressionAttributeValues: Readonly<Record<string, string>>;
			Limit: number;
			ScanIndexForward: boolean;
		}>,
	) {}
}

class PutCommand {
	declare readonly __output: Readonly<{ Attributes?: unknown }>;
	constructor(readonly input: Readonly<{ TableName: string; Item: unknown }>) {}
}

// -------------------------------------------------
// エラー
// -------------------------------------------------

/** 指定された倉庫と品番の在庫が保存先に無かった。 */
export class StockItemNotFoundError extends DomainError {
	override readonly name: string = "StockItemNotFoundError";

	constructor(operation: string, warehouseCode: string, sku: string) {
		super(operation, `${warehouseCode} に ${sku} の在庫がありません`);
	}
}

// -------------------------------------------------
// インターフェースの実装
// -------------------------------------------------

export type DynamoDBStockItemRepositoryDeps = Readonly<{
	client: DynamoDBClient;
	tableName: string;
}>;

export function createDynamoDBStockItemRepository(
	deps: DynamoDBStockItemRepositoryDeps,
): StockItemRepository {
	const documentClient = DynamoDBDocumentClient.from(deps.client);

	return {
		get: async (
			warehouseCode: WarehouseCode,
			sku: Sku,
		): Promise<StockItem | undefined> => {
			const result = await documentClient.send(
				new GetCommand({
					TableName: deps.tableName,
					Key: {
						PK: `WAREHOUSE#${warehouseCode}`,
						SK: `STOCK#${sku}`,
					},
				}),
			);
			if (result.Item === undefined) {
				throw new StockItemNotFoundError(
					"StockItemRepository.get",
					warehouseCode,
					sku,
				);
			}
			return DynamoDBStockItemDTO.from(result.Item);
		},

		listByWarehouse: async (
			warehouseCode: WarehouseCode,
			limit: number,
		): Promise<readonly StockItem[]> => {
			const result = await documentClient.send(
				new QueryCommand({
					TableName: deps.tableName,
					KeyConditionExpression: "PK = :pk",
					ExpressionAttributeValues: {
						":pk": `WAREHOUSE#${warehouseCode}`,
					},
					Limit: limit,
					ScanIndexForward: true,
				}),
			);
			return (result.Items ?? []).map((item) => DynamoDBStockItemDTO.from(item));
		},

		put: async (item: StockItem): Promise<void> => {
			await documentClient.send(
				new PutCommand({
					TableName: deps.tableName,
					Item: DynamoDBStockItemDTO.to(item),
				}),
			);
		},
	};
}
