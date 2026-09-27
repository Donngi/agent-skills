# 命名

スキーマ・型・関数・定数・ファイルの名前の規則。コメントやメッセージに使う語の選び方は `references/comments.md` の「語の選び方」にある。

## 命名の表

| 対象 | 名前 |
|------|------|
| 完成値スキーマ | `XxxSchema` |
| create の第1引数のスキーマ | `CreateXxxPropsSchema` |
| 操作のパラメータ型 | `<ローカル関数名>Params`（`addTaskComment` → `AddTaskCommentParams`。第2引数。操作用のスキーマは作らない） |
| 完成値の型 | `Xxx` |
| 検証前の完成形 | `XxxSchemaInput`（`z.input` から取る。モデル自身のブランドも、各項目のブランドも外れた形） |
| create の第1引数の型 | `CreateXxxProps` |
| 依存 | `XxxDeps`。**中身はそのモデルが実際に使うものだけ**（識別子を採番しないなら `idGenerator` を持たせない）。**それを使うモデルのファイルに書く。共有の依存ファイルは作らない**。子エンティティを作る業務操作は、子の `XxxDeps` を第3引数で受け取る（`Task.addComment` は `CommentDeps`） |
| 公開 API のオブジェクト | `Xxx`（完成値の型と同名。型と値は別の空間なので衝突しない） |
| 生成・復元のローカル関数 | `createXxx` / `reconstructXxx`（キーは `create` / `reconstruct`） |
| 等価性 | `xxxEquals`（値）/ `xxxEqualsById`（エンティティ）。キーは `equals` / `equalsById` |
| 比較 | 等価性と同じ「モデル名 + 動詞句」（`priorityIsHigherThan`）。キーは動詞句だけ（`isHigherThan`） |
| 業務操作 | ローカル関数は「動詞 + モデル名」。キーはモデル名を落とした動詞句（`startTask` → `start`、`addTaskComment` → `addComment`）。何を対象にするか分からなくなるときだけ目的語を残す |
| 演算 | 同種の値を合わせるなら「動詞 + モデル名」（`addEstimate`）。コレクションに要素を足す・外すなら「動詞 + To/From + モデル名」（`addToLabels` / `removeFromLabels`）。`addLabels` と書くと「Labels を足す」と読める。キーは動詞だけ |
| 読み取り | **モデルだけが知っている規則を隠すときだけ置く。** ローカル関数は内容が分かる名前。キーは短くする（`taskIdProjectId` → `projectId`） |
| フィールド定義の部品 | 状態別ユニオンは `XxxCommonFields`、単一状態は `XxxFields`。状態別ユニオンで1つの状態にだけある項目を create の第1引数に使うなら、その枝の部品を `Xxx<状態名>Fields` とする。いずれも export しない |
| ブランド記号 | `XxxBrand`（export しない） |
| I/O の無いドメインサービス | 公開オブジェクトはサービス名。ローカル関数は内容が分かる完全名、キーは動詞にする（業務操作と同じ）。パラメータ型も業務操作と同じく `<ローカル関数名>Params` |
| 業務の定数 | 大文字スネーク（`COMMENT_LIMIT` / `LABEL_LIMIT` / `TASK_NUMBER_DIGITS`）。**既定は export しない。ドメインの外が、ドメインの受け入れ範囲に合わせて自分の値を検証するために要るものだけ export する**（`TASK_NUMBER_MAX`。採番するドメインサービスの実装が、返す番号がこれを超えないことを確かめる）。JSDoc に誰が何のために使うかを書く。**DTO には使わせない**（`references/persistence.md` の「業務の上限の定数を、DTO のために export しない」） |
| 保存の DTO | 保存先の語彙 + モデル名 + **`DTO`**。`DynamoDBXxxItemDTO`、`PostgresXxxRowDTO`。スキーマ・型・変換関数・ファイル名のすべてにこの名前を使う（`DynamoDBXxxItemDTOSchema`、`toDynamoDBXxxItemDTO`、`DynamoDBXxxItemDTO.ts`）。**接尾辞を省かない。** `DynamoDBTaskItem` だけでは、保存先の行を表す DTO なのかドメインのモデルなのかが、呼び出し箇所から読めない |
| 保存の変換 | `from<DTO 名>` / `to<DTO 名>`。**インフラ層なので名前付きで直接 export する。公開 API のオブジェクトも `from` / `to` のキーも作らない**（`references/model-code.md` の「公開の形」） |
| 保存キーの生成（DynamoDB） | **パーティションキーは `PK`、ソートキーは `SK`、両方を持つ構造体は `PKSK`。** 関数は `to<DTO 名>PK` / `to<DTO 名>SK` / `to<DTO 名>PKSK`。`Key` とだけ書くと、PK だけなのか両方なのかが呼び出し箇所から読めない。横断検証から呼ぶ検証前の文字列を受ける版（`toPKSKFromRawId`）は export しない |
| インターフェースの実装 | インターフェース名 + `Impl`。ファイル名は `TaskRepositoryImpl.ts`、生成関数は `createTaskRepositoryImpl`。インフラ層に置く。**保存先の名前は入れない。** 同じインターフェースの実装が複数あるときだけ、末尾に足して `TaskRepositoryImplDynamoDB` のように区別する。依存の型は `XxxImplDeps` |
| エラー | 既定は `InvalidCreationParamError` / `InvalidReconstructParamError` の2つ。それ以外は何が起きたかを表す名前にする。依存が返した識別子の不正は識別子の型ごとに `InvalidGenerated<識別子の型>Error`（`InvalidGeneratedCommentIdError`） |
| 共有のエラーのファイル | `shared-errors.ts`（ドメイン層の直下）。基底と、どのモデルにも依らない5つだけを置く。モデルのエラー class はそのモデルのファイルに置くので、`Task.errors.ts` のような別ファイルは作らない |

**モデル名は英名のまま書く。項目名・状態名・依存は日本語で書いてよい。** 語の選び方の規則は `references/comments.md` の「語の選び方」にある。
