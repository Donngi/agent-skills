# テストの書き方: クライアントのモック

`references/test-style.md` の規則（置き場と命名、Given / When / Then など）に加えて読む。**何を確かめるか**は `references/testing.md` にある。

---

## クライアントのモック

**リポジトリ実装とドメインサービス実装は、クライアントを `vi.fn()` のモックに差し替えて確かめる。** 本物のクライアントは使わない。

**`vi.fn()` に型引数を付けない。** 参照実装のクライアントの `send` は `<Output>(command: Command<Output>) => Promise<Output>` のジェネリックである。
`vi.fn<DynamoDBClient["send"]>()` で作ると、モックは `Promise<unknown>` を返す型になり、クライアントの型に代入できず TS2322 になる（実測）。
型引数を付けない `vi.fn()` はそのまま `{ client: { send: mockSend } }` に渡せる。モックに合わせるための `as` は書かない。

**モックの変数名は `mock` から始める。** `mockSend`、`mockNext`、`mockNow` のように書き、テストの中でどれがモックかを名前で分かるようにする。
依存に渡すときは `{ client: { send: mockSend } }` のように、依存の項目名を明示して渡す。

- モックは Given で作り、応答は `mockResolvedValueOnce`、失敗は `mockRejectedValueOnce` で与える
- クライアントの失敗がそのまま伝わることは、Given で作った失敗のオブジェクトを `mockRejectedValueOnce` に渡し、`await expect(pending).rejects.toBe(failure)` で同じ参照が届くことを確かめる。これは種別を確かめるテストではないので、`toThrow(具象の class)` の規則の対象外で、テスト名に class 名も入れない。SDK のエラー class を真似た class をテストのために作らない
- 1つのテストで確かめるのは、**送信したコマンド**か**応答から組み立てた結果**のどちらか一方にする。独立に変わりうる契約なので分ける
- 送信したコマンドは `mockSend.mock.calls[0]?.[0].input` を、仕様から書き下ろした値と `toStrictEqual` で比べる。期待する保存キーや DTO を、`toDynamoDBTaskItemDTOPKSK` や `toDynamoDBTaskItemDTO` の出力から作らない
- 応答に使う DTO は、テストの Given に仕様から書き下ろす
- モックを作る関数はヘルパーに置かない。どんな応答を返すかがテストの本質なので、テストの Given に書く

```ts
describe("TaskNumberIssuerImpl.next", () => {
	test("正常系: カウンタを1増やす Update を送信する", async () => {
		// Given: 最初の番号をカウンタ値として返すクライアントで
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({ Attributes: { seq: 1 } });
		const issuer = createTaskNumberIssuerImpl({ client: { send: mockSend }, tableName: "tasks" });

		// When: 採番すると
		await issuer.next(createDummyProjectId());

		// Then: 送信した Update の input がそのプロジェクトのカウンタのキーと加算の更新式を持つ
		expect(mockSend.mock.calls[0]?.[0].input).toStrictEqual({
			TableName: "tasks",
			Key: { PK: "COUNTER#PROJ", SK: "COUNTER" },
			UpdateExpression: "ADD #seq :one",
			ExpressionAttributeNames: { "#seq": "seq" },
			ExpressionAttributeValues: { ":one": 1 },
			ReturnValues: "UPDATED_NEW",
		});
	});

	test("異常系: カウンタ値が文字列なら InvalidTaskNumberResponseError が発生する", async () => {
		// Given: カウンタ値を文字列で返すクライアントと、それを使う採番の実装で
		const mockSend = vi.fn();
		mockSend.mockResolvedValueOnce({ Attributes: { seq: "1" } });
		const issuer = createTaskNumberIssuerImpl({ client: { send: mockSend }, tableName: "tasks" });

		// When: 採番を始めると
		const pending = issuer.next(createDummyProjectId());

		// Then: InvalidTaskNumberResponseError が発生する
		await expect(pending).rejects.toThrow(InvalidTaskNumberResponseError);
	});
});
```

本物のクライアントで実際の保存先に接続しないと確かめられないこと（条件式の評価、並び順、原子性）は、モックでは確かめられない。
`references/testing-infra.md` の「範囲外: 本物のクライアントで確かめる契約」に挙げ、統合テストの仕組みに任せる。
