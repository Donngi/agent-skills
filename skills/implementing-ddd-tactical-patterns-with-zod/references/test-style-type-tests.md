# テストの書き方: 型のテスト

`references/test-style.md` の規則（置き場と命名、Given / When / Then など）に加えて読む。**何を確かめるか**は `references/testing.md` にある。

---

## 型のテスト

**どのモデルのどの項目に、何を渡せないテストを置くかは、`testing.md` の「型のテストを置くモデル」だけで決める。**
この節は書き方だけを扱う。対象は、生の値・別種の識別子・任意項目の `undefined`・列挙の外の値の4種類で、
項目ごとに当てはまるものを1テストずつ書く。
別種の値を渡すテストは識別子どうしだけで、`Timestamp` と金額のような識別子以外のブランド付きの値どうしの取り違えは書かない（`testing.md` の同じ節）。
任意項目の `undefined` は、`exactOptionalPropertyTypes` を有効にしたプロジェクトでだけ止まる（実測）。無効なら書かない。

ブランドを外す、`CreateXxxProps` を `z.output` から `z.input` に変える、といった退行は、
実行時の値が同じなので実行時のテストでは検出できない。型のテストだけが検出する。

**型のテストでは、公開している関数を実際に呼んで確かめる。** `CreateTaskProps` のような型に値を代入するだけだと、
確かめているのはその型の定義であって、関数が受け付ける型ではない。関数の引数の型だけが緩んでも
（`createTask(props: z.input<typeof CreateTaskPropsSchema>, …)` に変えても）、型の定義は変わらないのでテストは通り続ける（実測）。
関数を呼べば、呼び出し側が実際に受ける検査を確かめられる。create の第1引数は `Xxx.create(…)`、
業務操作のパラメータは `Xxx.start(task, …)` のように呼び、エラーのコンストラクタ引数は `new XxxError(…)` で呼ぶ。
依存やパラメータの残りの項目は、ダミーのヘルパーで埋める。`Xxx.test-d.ts` は型検査だけで実行されないので、呼んでも生成器や保存先は動かない。

**余剰キーの型のテストは書かない。** リテラルの余剰プロパティ検査は TypeScript 自体の挙動で、
実行時は `strictObject` が拒否する。その拒否は実行時のテストで確かめる。

**型のテストは `Xxx.test-d.ts` に置き、Vitest の型検査モードで確かめる。** 実行時のテストファイルに混ぜない。
`Xxx.test.ts` の中に `@ts-expect-error` を置くと、Vitest は実行時のテストとして走らせるだけで型検査をしないので、型が壊れていても結果には成功と出る。

1つのテストに1つの `@ts-expect-error` で書き、右に何を止めているかを書く。
型のテストは実行されず、結果を見る段が無いので、`// When:` と `// Then:` は隣接させる。

```ts
// Task.test-d.ts
import { describe, test } from "vitest";
import { Task } from "./Task";
import {
	createDummyCreateTaskProps,
	createDummyTaskDeps,
} from "./Task.helper.test";

describe("Task.create の型", () => {
	test("型: creatorId に生の文字列を渡せない", () => {
		// Given: 制約を満たす入力と、ブランドの無い UserId の文字列と、クロックがあるとき
		const base = createDummyCreateTaskProps();
		const raw = "0b6f5f5e-1b5e-4f1e-9f1e-1b5e4f1e9f1e";
		const deps = createDummyTaskDeps();

		// When: creatorId にその生の文字列を入れて Task.create を呼ぶと
		// Then: 型検査で拒否される
		Task.create(
			{
				...base,
				// @ts-expect-error 生の文字列は UserId に代入できない
				creatorId: raw,
			},
			deps,
		);
	});
});
```

`@ts-expect-error` は、型エラーが報告される行の直前に置く。項目の型が合わないときは、その項目の行に報告される。
スプレッドで組み立てた引数の任意項目に `undefined` を入れたときは、引数のオブジェクトの `{` の行に報告されるので、
その直前に置く（実測。実物は `example/domain/entity/Task.test-d.ts` の「任意項目の型」）。

**`vitest.config.ts` で型検査を有効にし、`vitest run` だけで型のテストの成否まで確かめる。**
Vitest の設定がまだ無いプロジェクトでは、下の内容で `vitest.config.ts` を確認せずに新しく作り、作ったことを回答に書く。既存の設定に足すときは、変える内容を示して利用者に確認する（`SKILL.md` の「書いたコードを check.mjs で確かめる」）。

```ts
// vitest.config.ts
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, "**/*.helper.test.ts"],
		typecheck: {
			// 有効にしないと Xxx.test-d.ts は収集されず、型のテストが1件も走らない
			enabled: true,
			include: ["**/*.test-d.ts"],
		},
		coverage: {
			provider: "v8",
			// ソースの置き場に合わせる。SKILL.md の既定の構成なら domain/ と infrastructure/。
			// 実在しない場所を書くと計測対象が0件になり、率だけ見て確かめたつもりになる
			include: ["domain/**/*.ts", "infrastructure/**/*.ts"],
			// 型のテストのファイルは実行されないので、外さないと0%として混ざる
			exclude: ["**/*.test.ts", "**/*.test-d.ts"],
		},
	},
});
```

型検査モードの挙動（Vitest 5.0.1 で実測）。

- **`Xxx.test-d.ts` は実行されず、`tsc` で静的に解析される。** 効いていない `@ts-expect-error` は、そのテストの失敗（`TypeCheckError: Unused '@ts-expect-error' directive`）として結果に出る。実行時のテストも同じ実行で走る
- **型検査を有効にしないと、`Xxx.test-d.ts` は収集されない。** 設定が抜けると型のテストが1件も走らないまま成功するので、結果の一覧に型のテストが出ていることを確かめる
- **製品コードのどこかに型エラーがあると、「Unhandled Source Error」で実行全体が落ちる。** 型の誤りをテストのコマンドで止めるため、`typecheck.ignoreSourceErrors` は付けない
- **カバレッジから `**/*.test-d.ts` を外す。** 外さないと、実行されない型のテストのファイルが0%として計測に混ざる（実測）
- **`Xxx.test-d.ts` ではテーブル駆動にしない。** 静的に解析されるだけなので、`test.for` のテスト名は展開されない
- 型検査は `tsc` を走らせるぶん遅い。別に `tsc --noEmit` を回しているプロジェクトでも、型のテストの成否を Vitest の結果に出すためにこの設定を使う
