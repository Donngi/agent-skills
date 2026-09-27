import type { StockItem } from "../../domain/entity/StockItem";
import type { StockItemRepository } from "../../domain/repository/StockItemRepository";
import type { Sku } from "../../domain/value-object/Sku";
import type { WarehouseCode } from "../../domain/value-object/WarehouseCode";
import {
	fromDynamoDBStockItemDTO,
	toDynamoDBStockItemDTO,
	toDynamoDBStockItemDTOPK,
	toDynamoDBStockItemDTOPKSK,
} from "../dto/DynamoDBStockItemDTO";

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
// インターフェースの実装
// -------------------------------------------------

export type StockItemRepositoryImplDeps = Readonly<{
	client: DynamoDBClient;
	tableName: string;
}>;

export function createStockItemRepositoryImpl(
	deps: StockItemRepositoryImplDeps,
): StockItemRepository {
	const documentClient = DynamoDBDocumentClient.from(deps.client);

	return {
		/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
		get: async (
			warehouseCode: WarehouseCode,
			sku: Sku,
		): Promise<StockItem | undefined> => {
			const result = await documentClient.send(
				new GetCommand({
					TableName: deps.tableName,
					Key: toDynamoDBStockItemDTOPKSK(warehouseCode, sku),
				}),
			);
			if (result.Item === undefined) {
				return undefined;
			}
			return fromDynamoDBStockItemDTO(result.Item);
		},

		/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
		listByWarehouse: async (
			warehouseCode: WarehouseCode,
			limit: number,
		): Promise<readonly StockItem[]> => {
			const result = await documentClient.send(
				new QueryCommand({
					TableName: deps.tableName,
					KeyConditionExpression: "PK = :pk",
					ExpressionAttributeValues: {
						":pk": toDynamoDBStockItemDTOPK(warehouseCode),
					},
					Limit: limit,
					ScanIndexForward: true,
				}),
			);
			return (result.Items ?? []).map((item) => fromDynamoDBStockItemDTO(item));
		},

		put: async (item: StockItem): Promise<void> => {
			await documentClient.send(
				new PutCommand({
					TableName: deps.tableName,
					Item: toDynamoDBStockItemDTO(item),
				}),
			);
		},
	};
}
