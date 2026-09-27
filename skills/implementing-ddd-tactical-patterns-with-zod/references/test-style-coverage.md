# テストの書き方: カバレッジ

`references/test-style.md` の規則（置き場と命名、Given / When / Then など）に加えて読む。**何を確かめるか**は `references/testing.md` にある。

---

## カバレッジ

**C1（判定網羅）を満たす。C2（条件網羅）は求めない。** 除外してよい分岐は、`testing.md`「到達しない分岐」の表の3区分だけである。
閾値の数字は設定しない。除外する分岐を1つずつ見て、理由を確かめるためである。

C1 は、判定の結果が真になるテストと偽になるテストの両方があることである。`vitest run --coverage` の Branches だけでは C1 にならないので、2つの手段を合わせて確かめる。

| 判定の場所 | 確かめ方 |
|---|---|
| `if`、三項演算子、`switch`、引数の既定値 | `vitest run --coverage` の Branches の列と、未到達として出る行。これらの真と偽の枝は Branches が数える |
| `if` の外にある判定（`return` や代入の真偽式、`refine` / `every` / `some` / `filter` に渡す判定関数） | Branches は数えない。判定ごとに、結果が真になるテストと偽になるテストがあるかを読んで確かめる。迷ったら、判定を `true` と `false` に固定した誤実装を1つずつ入れ、どちらもテストが落ちるかを見る |

**Branches は Vitest 固有の指標ではなく、Istanbul の形式である。** Jest、nyc、c8、Vitest（`istanbul` と `v8` のどちらの provider でも）がこの形式で出す。
`&&` `||` `??` の各項は「評価されたか」だけを数え、真だったか偽だったかは記録しない。`return a || b` のように `if` の外にある判定は、全体の真偽を数えない。
Java の JaCoCo のように条件ごとの真偽まで数えるツールもあるので、ほかの言語の「分岐カバレッジ」と同じ意味だと思わない。

**C2 は求めない。** 複合条件を作る個々の条件が真と偽の両方を取ることは Istanbul 形式では測れず、確かめるにはミューテーションテストの依存が要る。
`if (A && B)` を「A 真・B 真」と「A 偽」でテストすると Branches も C1 も満たすが、「B 偽」は確かめていない。この穴は受け入れる。

**除外してよい分岐の区分は、`testing.md`「到達しない分岐」の表だけで決める。** ここでは区分を並べ直さない。
到達しない分岐は、テストのために到達させない。型を `as` で偽る、モジュールを差し替える、ブランドを偽造する、
といった手段でしか通せない分岐を通すと、テストが実装の内部に縛られる。

除外した分岐は、ファイルと行と理由を回答に書く。それ以外の未到達は観点の漏れとして扱い、`testing.md` と `testing-*.md` のどの観点に当たるかを確かめてテストを足す。

- **数値を上げるためだけのテストを書かない。** 呼んだだけで結果を確かめないテストは、到達しても誤実装を落とせない
- **`/* v8 ignore next */` のような除外コメントを製品コードに書かない。** 未到達を隠すと、次に見る人が漏れに気づけない

```ts
// vitest.config.ts
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, "**/*.helper.test.ts"],
		coverage: {
			provider: "v8",
			// ソースの置き場に合わせる。SKILL.md の既定の構成なら domain/ と infrastructure/。
			// 実在しない場所を書くと計測対象が0件になり、率だけ見て確かめたつもりになる
			include: ["domain/**/*.ts", "infrastructure/**/*.ts"],
			// テスト・ヘルパー・型のテストを数えない。数えると率が実態とずれる
			exclude: ["**/*.test.ts", "**/*.test-d.ts"],
		},
	},
});
```

`@vitest/coverage-v8` を、`vitest` と同じ版で入れる。`**/*.test.ts` は `*.helper.test.ts` も含む。
`include` を変えたら、一度 `vitest run --coverage` を走らせて、表に対象のファイルが並ぶことを確かめる。
型だけのファイル（インターフェース）は実行時のコードを持たないので、未到達として出ても見なくてよい。
