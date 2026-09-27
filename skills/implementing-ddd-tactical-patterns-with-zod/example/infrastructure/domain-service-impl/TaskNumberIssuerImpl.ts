import { z } from "zod";
import {
	InvalidTaskNumberResponseError,
	TaskNumberExhaustedError,
	type TaskNumberIssuer,
} from "../../domain/domain-service/TaskNumberIssuer";
import { FatalUnreachableError } from "../../domain/shared-errors";
import type { ProjectId } from "../../domain/value-object/ProjectId";
import { TASK_NUMBER_MAX, TaskId } from "../../domain/value-object/TaskId";

// -------------------------------------------------
// AWS SDK のスタブ
// -------------------------------------------------

/**
 * 参照実装を AWS SDK に依存させないため、SDK と同じ名前・同じ呼び出し方の型を
 * ここに置いている。実物ではこのセクションを消して次の import を書けばよい。
 * 下の実装はそのまま動く。
 *
 * import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
 * import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
 */
type Command<Output> = Readonly<{ __output: Output }>;

export type DynamoDBClient = Readonly<{
	send: <Output>(command: Command<Output>) => Promise<Output>;
}>;

const DynamoDBDocumentClient = {
	from: (client: DynamoDBClient): DynamoDBClient => client,
};

class UpdateCommand {
	declare readonly __output: Readonly<{
		Attributes?: Readonly<Record<string, unknown>>;
	}>;
	constructor(
		readonly input: Readonly<{
			TableName: string;
			Key: Readonly<Record<string, string>>;
			UpdateExpression: string;
			ExpressionAttributeNames: Readonly<Record<string, string>>;
			ExpressionAttributeValues: Readonly<Record<string, number>>;
			ReturnValues: "UPDATED_NEW";
		}>,
	) {}
}

// -------------------------------------------------
// インターフェースの実装
// -------------------------------------------------

export type TaskNumberIssuerImplDeps = Readonly<{
	client: DynamoDBClient;
	tableName: string;
}>;

export function createTaskNumberIssuerImpl(
	deps: TaskNumberIssuerImplDeps,
): TaskNumberIssuer {
	const documentClient = DynamoDBDocumentClient.from(deps.client);

	return {
		/**
		 * @throws InvalidTaskNumberResponseError 保存先の採番結果が番号として不正なとき。
		 * @throws TaskNumberExhaustedError 番号が上限を超え、これ以上採番できないとき。
		 */
		next: async (projectId: ProjectId): Promise<TaskId> => {
			const result = await documentClient.send(
				new UpdateCommand({
					TableName: deps.tableName,
					Key: { PK: `COUNTER#${projectId}`, SK: "COUNTER" },
					// ADD は加算と書き込みを1回の呼び出しで行うので、同じ番号を2度返さない
					UpdateExpression: "ADD #seq :one",
					ExpressionAttributeNames: { "#seq": "seq" },
					ExpressionAttributeValues: { ":one": 1 },
					ReturnValues: "UPDATED_NEW",
				}),
			);
			// 文字列に埋め込む前に型を確かめる。"1" や [1] でも `PROJ-1` になってしまう
			const seq = z.int().positive().safeParse(result.Attributes?.seq);
			if (!seq.success) {
				throw new InvalidTaskNumberResponseError(
					"TaskNumberIssuer.next",
					projectId,
					seq.error,
				);
			}
			// 正しい番号でも上限を超えたら、以後の採番もすべて超える。応答の不正とは打つ手が違うので分ける
			if (seq.data > TASK_NUMBER_MAX) {
				throw new TaskNumberExhaustedError(
					"TaskNumberIssuer.next",
					projectId,
					seq.data,
				);
			}
			// 検証済みの ProjectId と、上で範囲を確かめた番号から組むので、ここは失敗しない
			try {
				return TaskId.create(`${projectId}-${seq.data}`);
			} catch (error) {
				throw new FatalUnreachableError("TaskNumberIssuer.next", error);
			}
		},
	};
}
