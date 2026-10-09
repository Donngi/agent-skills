import { Loan, type LoanSchemaInput } from "../../domain/entity/Loan";
import type { LoanRepository } from "../../domain/repository/LoanRepository";
import type { LibraryCode } from "../../domain/value-object/LibraryCode";
import { LoanNumber } from "../../domain/value-object/LoanNumber";
import type { MemberId } from "../../domain/value-object/MemberId";

// -------------------------------------------------
// AWS SDK のスタブ
// -------------------------------------------------

/**
 * fixture を AWS SDK に依存させないため、SDK と同じ名前・同じ呼び出し方の型を
 * ここに置いている。実物ではこのセクションを消して次の import を書けばよい。
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
	declare readonly __output: Readonly<{ Item?: Record<string, unknown> }>;
	constructor(
		readonly input: Readonly<{
			TableName: string;
			Key: Readonly<Record<string, string>>;
		}>,
	) {}
}

type DynamoDBKey = Readonly<Record<string, unknown>>;

type QueryCommandOutput = Readonly<{
	Items?: readonly Record<string, unknown>[];
	LastEvaluatedKey?: DynamoDBKey;
}>;

class QueryCommand {
	declare readonly __output: QueryCommandOutput;
	constructor(
		readonly input: Readonly<{
			TableName: string;
			IndexName: string;
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
	constructor(
		readonly input: Readonly<{
			TableName: string;
			Item: Readonly<Record<string, unknown>>;
		}>,
	) {}
}

// -------------------------------------------------
// アイテムとの変換
// -------------------------------------------------

const KEY_ATTRIBUTES = ["PK", "SK", "GSI1PK", "GSI2PK", "GSISK"] as const;

function toLoanKey(id: LoanNumber): Readonly<Record<string, string>> {
	return { PK: `LOAN#${id}`, SK: "LOAN" };
}

function toLoanItem(loan: Loan): Readonly<Record<string, unknown>> {
	return {
		...toLoanKey(loan.id),
		GSI1PK: `LIBRARY#${LoanNumber.libraryCode(loan.id)}`,
		GSI2PK: `MEMBER#${loan.memberId}`,
		// 文字列の比較で LIB-10 が LIB-2 より前にならないよう、連番を桁埋めして並びのキーにする
		GSISK: (loan.id.split("-")[1] ?? "").padStart(9, "0"),
		...loan,
	};
}

/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
function fromLoanItem(item: Readonly<Record<string, unknown>>): Loan {
	const attributes = Object.fromEntries(
		Object.entries(item).filter(
			([name]) => !(KEY_ATTRIBUTES as readonly string[]).includes(name),
		),
	);
	// 形の検証は Loan.reconstruct が行う
	return Loan.reconstruct(attributes as LoanSchemaInput);
}

// -------------------------------------------------
// インターフェースの実装
// -------------------------------------------------

export type DynamoDBLoanRepositoryDeps = Readonly<{
	client: DynamoDBClient;
	tableName: string;
}>;

export function createDynamoDBLoanRepository(
	deps: DynamoDBLoanRepositoryDeps,
): LoanRepository {
	const documentClient = DynamoDBDocumentClient.from(deps.client);

	/** @throws InvalidReconstructParamError 保存されている値が壊れているとき。 */
	const queryLoans = async (
		indexName: string,
		partitionKey: string,
		limit: number,
	): Promise<readonly Loan[]> => {
		if (limit <= 0) {
			return [];
		}
		// DynamoDB は Limit に達していなくても 1MB で結果を区切るので、limit 件に達するまで取り続ける
		const loans: Loan[] = [];
		let startKey: QueryCommandOutput["LastEvaluatedKey"];
		do {
			const result = await documentClient.send(
				new QueryCommand({
					TableName: deps.tableName,
					IndexName: indexName,
					KeyConditionExpression: `${indexName}PK = :pk`,
					ExpressionAttributeValues: { ":pk": partitionKey },
					Limit: limit - loans.length,
					ScanIndexForward: true,
					...(startKey !== undefined ? { ExclusiveStartKey: startKey } : {}),
				}),
			);
			for (const item of result.Items ?? []) {
				loans.push(fromLoanItem(item));
			}
			startKey = result.LastEvaluatedKey;
		} while (startKey !== undefined && loans.length < limit);
		return loans;
	};

	return {
		get: async (id: LoanNumber): Promise<Loan | undefined> => {
			const result = await documentClient.send(
				new GetCommand({ TableName: deps.tableName, Key: toLoanKey(id) }),
			);
			if (result.Item === undefined) {
				return undefined;
			}
			return fromLoanItem(result.Item);
		},

		listByLibrary: (
			libraryCode: LibraryCode,
			limit: number,
		): Promise<readonly Loan[]> =>
			queryLoans("GSI1", `LIBRARY#${libraryCode}`, limit),

		listByMember: (
			memberId: MemberId,
			limit: number,
		): Promise<readonly Loan[]> =>
			queryLoans("GSI2", `MEMBER#${memberId}`, limit),

		put: async (loan: Loan): Promise<void> => {
			await documentClient.send(
				new PutCommand({ TableName: deps.tableName, Item: toLoanItem(loan) }),
			);
		},
	};
}
