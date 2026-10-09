# 参照実装

`SKILL.md` の「手順の型」が指すユースケースの実物。題材はタスク管理ツール。

## 構成

```
domain/    ドメイン層。ユースケースが呼び出す相手
usecase/   このスキルの実物
```

**`domain/` は、ユースケースが呼び出す相手として置いてある。このスキルが書き方を教える対象ではない。** ドメイン層の書き方は `implementing-ddd-tactical-patterns-with-zod` スキルが扱う。`domain/` はそのスキルの example の複製なので、ここで直接編集しない。開発リポジトリでは、リポジトリ直下の `scripts/sync-skill-examples.mjs` が一致を確かめる（`--fix` で正本から上書きする）。

## ファイルと手順の型

| ファイル | 手順の型 |
|---|---|
| `usecase/CreateTaskUseCase.ts` | 集約を作る（採番してから生成する側の集約のメソッドで作る） |
| `usecase/StartTaskUseCase.ts` | 集約を更新する（時刻を clock から渡す） |
| `usecase/AddTaskCommentUseCase.ts` | 子エンティティを足す（deps を集約ルートのメソッドに渡す） |
| `usecase/GetTaskUseCase.ts` | 参照する（状態で分かれる Result DTO にマッピングする） |
| `usecase/shared-errors.ts` | `UseCaseError` と、複数のユースケースに共通のエラー（`TaskNotFoundError`、入力の形の不正を詰め替える `InvalidInputError`） |
| `usecase/CreateTaskUseCase.ts` の「エラー」セクション | 1つのユースケースだけが投げるエラー（`ProjectNotFoundError`）と、ドメインのエラーから詰め替えるエラー（`ProjectArchivedError`・`TaskNumberUnavailableError`） |
| `usecase/StartTaskUseCase.ts`・`usecase/AddTaskCommentUseCase.ts` の「エラー」セクション | ドメインのエラーから詰め替えるエラー（`TaskNotStartableError`・`CommentNotAddableError`） |

## 動かして確かめる

```bash
cd example
npm install
npm run typecheck   # tsc
npm test            # vitest run（domain/ のテストも含む）
```

`package.json` / `tsconfig.json` / `vitest.config.ts` は、この参照実装を単独で検証するためだけに置いてある。スキルが教えている成果物ではない。
`package.json` に書いてある版は、検証したときの実測値であって、利用者のプロジェクトが使うべき版ではない。
