# 完了の確認

`SKILL.md` の手順6で使うチェックリスト。確認するのは、対象のモデルに該当し、今回採用した規約で有効な項目だけである
（適用の考え方は `SKILL.md` の「完了の確認」）。

**項目は、書いたものの種類ごとのファイルに分けてある。** この文書の項目は常に確かめる。そのうえで、書いたものに当たるファイルの項目も上から通す。
当たらないファイルは読まなくてよい。読むファイルは `SKILL.md` の「読む計画」の表が正で、次の表はその写しである。

| 書いたもの | 項目のファイル |
|---|---|
| 値オブジェクト・エンティティ・業務操作・エラー・ドメインサービス | `references/checklist-model.md` |
| DTO、保存キー、リポジトリ実装、ドメインサービスの実装 | `references/checklist-infra.md` |
| JSDoc、`//` コメント、スキーマとエラーのメッセージ（コードを書いたら常に） | `references/checklist-docs.md` |
| テスト（テストを書いたら常に） | `references/checklist-tests.md` |

**〔check.mjs〕の印は、`scripts/check.mjs` が判定する項目である。** `SKILL.md` の手順5で走らせた結果の `false` を0件にしてから、この一覧を通す。
結果が `null` の規則と、項目のうち印の規則が見ていない部分は、自分で確かめる。
`true` には適用外も含む。`brand-symbol` は `.brand()` が1つも無ければ `true` になるので、`.brand()` の無い作業のためにこの規則を外す必要は無い。
付けるべき完成値にブランドを付けたかは印の規則が見ていない部分なので、`references/checklist-model.md` の項目で確かめる。

**既存の流儀を採用して既定を置き換えたときに外せる check.mjs の規則は、次の表のものだけである。** 置き換えた範囲に当たる規則の `false` だけを違反に数えず、外した規則と置き換えの出どころ（利用者の指示・プロジェクトの規則・既存のコード）を回答に書く。
表に無い規則は外さない。規約の優先順位（利用者の指示 → プロジェクトの規則 → 既存の流儀 → この指針の既定。`references/test-style.md` の「どの書き方に従うか」）で既存の側に従った項目に当たる規則は、この表に載せてある。`--tags`（判定する規則を絞る引数）は自己テストと evals の用途に限り、ここでは使わない。

| 置き換えた範囲 | 外せる規則 |
|---|---|
| テストの流儀（上の優先順位で、利用者の指示・プロジェクトの規則・既存の流儀に合わせたもの） | `test-not-it`・`test-file-place`・`test-order`・`test-describe-flat`・`test-name-prefix`・`test-name-predicate`・`test-name-error-class`・`gwt`・`gwt-sentence`・`gwt-adjacent`・`gwt-no-var-name`・`expected-in-then`・`table-for`・`table-name`・`strict-equal`・`no-not-tothrow`・`throw-concrete`・`caught-position`・`no-expect-in-catch`・`mock-name`・`type-test-file`・`type-test-config`・`type-test-single`・`helper-exclude`・`helper-no-test`・`helper-reconstruct` のうち、採用した流儀と食い違うもの |
| エラーの方式（`Result` を返す、プロジェクト独自のエラー規則など） | `no-raw-error`・`error-message-owned`・`error-message-form`・`error-fatal-shape`・`error-shared-no-model-import` のうち、採用した方式と食い違うもの（既存のエラー定義の置き場に合わせたときを含む） |
| フォルダ構成 | `test-file-place`（テストの置き場が既存の構成と食い違うとき） |
| 実装コードの区切り（セクションの区切り方） | `section-placement`（既存の区切りの流儀が既定の区切りと違うとき） |
| 関数の命名（既存のコードの命名の流儀） | `local-name`・`dto-local-name`・`impl-factory-name`・`impl-deps-name`（既存の命名が既定と違うとき） |

## どの成果物にも共通

- [ ] 未検証の入力からブランド付きの完成値を作っているのが `create` / `reconstruct` だけで、ドメイン層の外（インフラ・アプリケーション・UI）が完成値スキーマを直接呼んでいない（DTO の `to` の検査を除く）
- [ ] ドメイン層の外で、スプレッドやオブジェクトリテラル（型注釈・`satisfies Xxx` を含む）で完成値型の値を作っていない
- [ ] `reconstruct` を呼んでいるのが、保存先から読んだ値の復元（DTO の `from` など）とテスト（ダミー生成ヘルパーを含む）だけで、アプリケーション層と UI 層は `create` と業務操作だけを使っている（保存先の値から新しい値を作る採番などは `create`）
- [ ] 依頼にない項目・状態・操作・不変条件・導出値・業務上の数値を足していない。依頼に無い上限を置かず、要否を回答で確認している
- [ ] 依頼が明示した操作を、足りない仕様を理由に省いていない（決まらない部分だけを質問し、決まっている部分は実装している）
- [ ] 依頼の明示要件をどこで満たしたか、満たさないならその理由を、指針の規則番号や表の段に頼らず回答で説明している
- [ ] 既存データを読む要件があるとき、指針の既定を理由に受理範囲を狭めていない（狭まる値があれば回答で列挙している）
- [ ] 〔check.mjs〕型アサーションの `as`（`as const` を除く）が1つもない（名前空間の import の `import type * as z` は対象外）
- [ ] 〔check.mjs〕三項演算子がネストしていない（3つ以上に分かれる分岐が `switch` になっている）
- [ ] `switch` に `default` があり、判別子を `satisfies never` で検査してから `FatalUnreachableError` を投げている
- [ ] `unknown` を受ける境界で検証している
- [ ] そのプロジェクトの formatter と linter を通してあり、差分が残っていない
