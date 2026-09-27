import type { Task } from "../../domain/entity/Task";
import {
	ListLimitOutOfRangeError,
	type TaskRepository,
} from "../../domain/repository/TaskRepository";
import type { ProjectId } from "../../domain/value-object/ProjectId";
import type { TaskId } from "../../domain/value-object/TaskId";
import {
	fromDynamoDBTaskItemDTO,
	toDynamoDBTaskItemDTO,
	toDynamoDBTaskItemDTOPK,
	toDynamoDBTaskItemDTOPKSK,
} from "../dto/DynamoDBTaskItemDTO";

// -------------------------------------------------
// AWS SDK のスタブ
// -------------------------------------------------

/**
 * 参照実装を AWS SDK に依存させないため、SDK と同じ名前・同じ呼び出し方の型を
 * ここに置いている。実物ではこのセクションを消して次の import を書けばよい。
 * 下の実装はそのまま動く。
 *
 * import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
 * import {
 *   DynamoDBDocumentClient,
 *   GetCommand,
 *   PutCommand,
 *   QueryCommand,
 *   type QueryCommandOutput,
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

type DynamoDBKey = Readonly<Record<string, unknown>>;

type QueryCommandOutput = Readonly<{
	Items?: readonly unknown[];
	LastEvaluatedKey?: DynamoDBKey;
}>;

class QueryCommand {
	declare readonly __output: QueryCommandOutput;
	constructor(
		readonly input: Readonly<{
			TableName: string;
			KeyConditionExpression: string;
			ExpressionAttributeValues: Readonly<Record<string, string>>;
			Limit: number;
			ScanIndexForward: boolean;
			ExclusiveStartKey?: DynamoDBKey;
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

export type TaskRepositoryImplDeps = Readonly<{
	client: DynamoDBClient;
	tableName: string;
}>;

export function createTaskRepositoryImpl(
	deps: TaskRepositoryImplDeps,
): TaskRepository {
	const documentClient = DynamoDBDocumentClient.from(deps.client);

	return {
		/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
		get: async (id: TaskId): Promise<Task | undefined> => {
			const result = await documentClient.send(
				new GetCommand({
					TableName: deps.tableName,
					Key: toDynamoDBTaskItemDTOPKSK(id),
				}),
			);
			if (result.Item === undefined) {
				return undefined;
			}
			return fromDynamoDBTaskItemDTO(result.Item);
		},

		/**
		 * @throws ListLimitOutOfRangeError limit が0以上の整数でないとき。
		 * @throws InvalidReconstructParamError 保存されている値が壊れているとき。
		 */
		listByProject: async (
			projectId: ProjectId,
			limit: number,
		): Promise<readonly Task[]> => {
			// DynamoDB の Limit は1以上の整数でなければならず、それ以外は保存先の検証エラーになる。
			// 呼び出し側の誤りは送る前に名前の付いたエラーにし、0件の要求は問い合わせずに空で返す
			if (!Number.isInteger(limit) || limit < 0) {
				throw new ListLimitOutOfRangeError(
					"TaskRepository.listByProject",
					projectId,
					limit,
				);
			}
			if (limit === 0) {
				return [];
			}
			// DynamoDB は Limit に達していなくても 1MB で結果を区切り、続きのキーを返す。
			// 1回で打ち切ると件数が足りないまま返すので、limit 件に達するか終わりまで取り続ける
			const tasks: Task[] = [];
			// 続きのキーの型は SDK の応答の型から取る。スタブの型を本体で使うと、
			// スタブを消して SDK に差し替えたときに型が見つからなくなる
			let startKey: QueryCommandOutput["LastEvaluatedKey"];
			do {
				const result = await documentClient.send(
					new QueryCommand({
						TableName: deps.tableName,
						KeyConditionExpression: "PK = :pk",
						ExpressionAttributeValues: {
							":pk": toDynamoDBTaskItemDTOPK(projectId),
						},
						Limit: limit - tasks.length,
						ScanIndexForward: false,
						...(startKey !== undefined ? { ExclusiveStartKey: startKey } : {}),
					}),
				);
				for (const item of result.Items ?? []) {
					tasks.push(fromDynamoDBTaskItemDTO(item));
				}
				startKey = result.LastEvaluatedKey;
			} while (startKey !== undefined && tasks.length < limit);
			return tasks;
		},

		put: async (task: Task): Promise<void> => {
			await documentClient.send(
				new PutCommand({
					TableName: deps.tableName,
					Item: toDynamoDBTaskItemDTO(task),
				}),
			);
		},
	};
}
