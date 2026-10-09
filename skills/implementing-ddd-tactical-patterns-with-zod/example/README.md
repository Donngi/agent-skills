# 参照実装

`references/patterns.md` が指す実装パターンの実物。題材はタスク管理ツール。

## 動かして確かめる

この階層だけで型検査とテストが走る。

```bash
cd example
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run（型のテストも同じ実行に含まれる）
npx vitest run --coverage   # 分岐網羅（C1）を確かめる
```

**`package.json` に書いてある版は、この参照実装を検証したときの実測値であって、
利用者のプロジェクトが使うべき版ではない。** ここに揃えに行く必要はない。
**スキルの対応範囲は zod 4.6 以上である。** 指針と references がこの範囲の版で確かめた挙動を前提にしている。
4.6 以上なら、自分のプロジェクトでは既に入っている版に合わせること。
版を固定することはこのスキルの規則ではない。

`package.json` / `tsconfig.json` / `vitest.config.ts` は、この参照実装を単独で
検証するためだけに置いてある。**スキルが教えている成果物ではない。**
ただし `vitest.config.ts` の `exclude` と `typecheck` の設定は、
`references/test-style.md`（`exclude`）と `references/test-style-type-tests.md`（`typecheck`）が説明しているとおりのもので、そのまま写して使える。

ドメイン層の値オブジェクトとエンティティのファイルは末尾に「公開 API」セクションを持つ。スキーマと型は直下から名前付きで export し、
関数の本体はローカルな `function` 宣言として書いて、末尾でモデル名のオブジェクトに集める。
型ガード（`value is Xxx` を返す関数）は置かない。未検証の入力からドメインの値を作る入口は `create` と `reconstruct` だけである。
**インフラ層（DTO・リポジトリ実装・ドメインサービス実装）はオブジェクトに集めず、必要なものを名前付きで export する。**

## 題材

プロジェクトの中にタスクがある。タスクは **backlog → inProgress → done** の3状態を持ち、
生成した直後は必ず backlog に入る。そこから着手すると inProgress、完了すると done になる。
done から再オープンすると inProgress に戻る。タスクにはコメントが付く。
タスクはプロジェクトの業務操作 `Project.createTask` で作り、アーカイブ済みのプロジェクトには作れない。
タスク番号はプロジェクトごとの連番で、採番はドメインサービスが `Project.createTask` の前に行う（失敗した番号は欠番になる）。

同じタスクの同時更新は、楽観ロックで検出すれば足りる（要件）。ただしこの参照実装はサンプルなので、
その検出を省き、保存は置き換えるだけにしてある（`TaskRepository.put` の JSDoc）。`Project.createTask` が確かめたあとにプロジェクトがアーカイブされる競合も、同じ要件のもとで防いでいない（`Project.createTask` の JSDoc）。
写すときは `references/persistence.md` の「同時更新」を読む。
クロックは、前に返した値より小さい値を返さない時刻源を注入する前提である。これを満たすのは、依存を組み立てる側の責任である。

## フォルダ構成

```
domain/
  shared-errors.ts         共有のエラー定義（基底と、どのモデルにも依らない5つ）。モデルのエラーはそのモデルのファイルに置く
  value-object/            値オブジェクト
  entity/                  エンティティ・集約
  repository/              永続層のインターフェース
  domain-service/          1つのモデルでは決められない処理。保存先に問い合わせるものはインターフェースを置く（I/O の無いものを作るなら実装をここに置く。この参照実装には無い）
infrastructure/
  dto/                     DTO と変換
  repository-impl/         永続層のインターフェースの実装
  domain-service-impl/     ドメインサービスのインターフェースの実装
```

## ファイルと実装パターン

| ファイル | パターン |
|---------|---------|
| `domain/shared-errors.ts` | 共有のエラー定義 |
| `domain/entity/Task.ts` の「エラー」セクション | モデルのエラー |
| `domain/repository/TaskRepository.ts`・`domain/domain-service/TaskNumberIssuer.ts` の「エラー」セクション | インターフェースが宣言するエラー |
| `domain/value-object/ProjectId.ts` | 値オブジェクト: プリミティブ型 |
| `domain/value-object/Timestamp.ts` | 値オブジェクト: プリミティブ型（タイムスタンプ） |
| `domain/value-object/UserId.ts` | 値オブジェクト: プリミティブ型（UUID） |
| `domain/value-object/CommentId.ts` | 値オブジェクト: プリミティブ型（集約内の識別子） |
| `domain/value-object/Label.ts` | 値オブジェクト: プリミティブ型 |
| `domain/value-object/TaskId.ts` | 値オブジェクト: 接頭辞付き識別子 |
| `domain/value-object/Priority.ts` | 値オブジェクト: 列挙 |
| `domain/value-object/PullRequestUrl.ts` | 値オブジェクト: URL |
| `domain/value-object/Estimate.ts` | 値オブジェクト: 複数値かつ各値はプリミティブ型 |
| `domain/value-object/WorkPeriod.ts` | 値オブジェクト: 複数値かつ各値が別の値オブジェクト |
| `domain/value-object/Labels.ts` | 値オブジェクト: コレクション |
| `domain/entity/Project.ts` | エンティティ: 単一状態（集約ルート） |
| `domain/entity/Project.ts` の `Project.createTask` | エンティティ: 別の集約を生成する（生成する側の集約の操作） |
| `domain/entity/Task.ts` | エンティティ: 複数状態（集約ルート） |
| `domain/entity/Comment.ts` | エンティティ: エンティティがエンティティを内包する（子エンティティ） |
| `domain/repository/TaskRepository.ts` | インフラ: 永続層のインターフェース |
| `domain/repository/ProjectRepository.ts` | インフラ: 永続層のインターフェース（エラー class を持たない最小の形） |
| `domain/domain-service/TaskNumberIssuer.ts` | インフラ: ドメインサービスのインターフェース |
| `infrastructure/dto/DynamoDBTaskItemDTO.ts` | インフラ: DTO と変換 |
| `infrastructure/repository-impl/TaskRepositoryImpl.ts` | インフラ: インターフェースの実装 |
| `infrastructure/domain-service-impl/TaskNumberIssuerImpl.ts` | インフラ: ドメインサービスの実装 |

## テスト

値オブジェクト・エンティティ・DTO・`shared-errors.ts`・エラー class を持つインターフェース・インターフェースの実装のすべてに、横に `Xxx.test.ts` を置いている。モデルのエラー class のテストは、そのモデルの `Xxx.test.ts` の末尾に class ごとの `describe` で置いている。
インターフェースの実装のテストは、クライアントを `vi.fn` のモックに差し替えて確かめる。
値オブジェクトとエンティティには、ダミー生成ヘルパー `Xxx.helper.test.ts` も置いている。DTO は、ヘルパーにせず各テストに書き下ろしている。

型のテスト `Xxx.test-d.ts` は、**型で止める項目があるものにだけ**置いている
（`Estimate` / `Labels` / `WorkPeriod` / `Comment` / `Project` / `Task`、エラー class を持つインターフェースの `TaskRepository` / `TaskNumberIssuer`）。
単一の値の値オブジェクトと列挙には、生の値と取り違えうるブランド付きの項目が無いので置いていない。
`shared-errors.ts` の class も、ブランド付きの項目を持たないので置いていない。
何を確かめるかは `references/testing.md` の「型のテストを置くモデル」、書き方は `references/test-style-type-tests.md` にある。

インターフェースのファイル（`domain/repository/TaskRepository.ts`・`domain/domain-service/TaskNumberIssuer.ts`）のテストが確かめるのは、そこに置いたエラー class だけである。
インターフェースの型そのものは実行時の振る舞いを持たないので、テストしない。振る舞いは実装のテスト（`TaskRepositoryImpl.test.ts`・`TaskNumberIssuerImpl.test.ts`）で確かめる。
`domain/repository/ProjectRepository.ts` は、エラー class を持たないインターフェースの最小の形である。別のスキルの example がこのドメイン層を複製して `ProjectRepository` の取得だけを呼ぶので、`get` だけを置いている。消さない。この example に実装は無く、テストも置かない。

本物の DynamoDB に接続するテストも置いていない。このスキルのテストの範囲外で、統合テストの仕組みで確かめる。

## 検証

このディレクトリのコードはビルド対象ではない。写して使うための参照。
テストは、このリポジトリの設定に依存しない独立したプロジェクトに写して確かめた。

| パッケージ | 版 |
|---|---|
| vitest / @vitest/coverage-v8 | 5.0.1 |
| zod | 4.6.5（4.6.0 でも型検査とテストが通る） |
| typescript | 6.0.3 |
| @types/node | 26.6.1 |

`tsconfig.json` は `strict`・`noUncheckedIndexedAccess`・`exactOptionalPropertyTypes`・`noImplicitReturns`・`noImplicitOverride`・`verbatimModuleSyntax` を有効にした。
**`verbatimModuleSyntax` は必須である。** エラー class を置いたインターフェースのファイル（`TaskRepository.ts`）は、モデルの型を型としてだけ参照している。
`type` を書き忘れると、実行時にモデルを読み込む依存が増える。`type` の書き忘れを型検査で止めるために要る。
`vitest.config.ts` には、ヘルパーを収集から外す設定、型のテスト（`Xxx.test-d.ts`）を確かめる型検査モード、カバレッジの設定を置いた。

```ts
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		root: import.meta.dirname,
		// ヘルパーはテストを登録しないので、収集すると No test suite found で落ちる
		exclude: [...configDefaults.exclude, "**/*.helper.test.ts"],
		typecheck: {
			// 有効にしないと Xxx.test-d.ts は収集されず、型のテストが1件も走らない
			enabled: true,
			include: ["**/*.test-d.ts"],
		},
		coverage: {
			provider: "v8",
			include: ["**/*.ts"],
			// テスト・ヘルパー・型のテストを数えない。数えると率が実態とずれる
			exclude: ["**/*.test.ts", "**/*.test-d.ts", "*.config.ts"],
		},
	},
});
```

`root` はこの階層だけで動かすための設定である。`root` が `example/` を指すので、
`coverage.include` は `["**/*.ts"]` でよい（`["example/**/*.ts"]` と書くと何も計測されない）。

カバレッジには `@vitest/coverage-v8` を使う。`vitest` と同じメジャー版を `devDependencies` に入れてある。

```sh
npm test
npx vitest run --coverage
```

カバレッジで未到達として残るのは、`references/testing.md`「到達しない分岐」の表の3区分に当たる分岐だけである。
この参照実装での実物は次のとおり。

| 区分 | 実物 |
|---|---|
| `FatalUnreachableError` を投げる分岐 | `Estimate` / `Project` / `Task` / `Comment` の `create` の末尾 / `Labels.add` / `Labels.remove` / `Project.archive` / `Task` の各業務操作（`start` / `complete` / `reopen` / `addComment` / `rename` / `changePriority` / `addLabel` / `removeLabel` / `linkPullRequest`） / `TaskId.projectId` / `TaskNumberIssuerImpl.next` / `toDynamoDBTaskItemDTO` の `safeParse` |
| 判別子を網羅した `switch` の `default` | `DynamoDBTaskItemDTO` の `to` |
| ハック無しではテストできない分岐 | `Labels` の `create` の1段目 |

`create` の末尾は、入力を1段目で、クロックと IDジェネレーターの戻り値を取った直後に確かめるので、
完成値スキーマに入力の値だけで違反しうる検査が無ければ着く原因が残らず、`FatalUnreachableError` になる。
`Labels` と `WorkPeriod` は、件数・重複や項目をまたぐ `refine` が入力だけで違反しうるので、
末尾が `InvalidCreationParamError` を投げ、テストで到達する。
3つ目の区分の `Labels` は、第1引数の要素がすべてブランド付きの `Label` なので、型の付いた呼び出しでは
1段目の検査が必ず通る。到達させるには型アサーションが要る。
1段目を消してよいという意味ではない。型アサーションや `any` を経由した呼び出しを、境界で止める役割がある。
判定条件は `references/testing.md` の「到達しない分岐」にある。
