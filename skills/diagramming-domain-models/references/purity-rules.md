# 純度ルール — ドメイン層に閉じるための語彙チェック仕様

このスキルの最重要要件は「ドメインモデル図にドメイン層以外の要素を混入させない」こと。`lib/validate.mjs` が本仕様に基づいて機械的に検査する。**本ファイルと `lib/shared.mjs` の語彙リストは常に一致させること**（実装が正、本ファイルは解説）。

## 走査対象

全要素（entities / valueObjects / sharedValueObjects / enums / repository / domainServices / domainEvents / aggregates）の `name` と `id`、および `properties[].type`（末尾の `[]` を除去して判定）。

**`description` は走査対象外**。「Controller から呼ばれる」のような自然言語の言及は正当であり、禁止するとモデルの説明力が下がる。

## P-1: ERROR（例外登録不可）

ドメイン層に存在し得ない語。検出されたら**モデルから削除するか、ドメイン概念として正しい名前に改名する**以外の解消手段はない。purityExceptions にも登録できない。

### サフィックス一致（大文字小文字無視）

```
usecase, interactor, controller, presenter, viewmodel, dto,
applicationservice, appservice, handler, listener, middleware,
endpoint, router, client, gateway, adapter, dao, mapper,
serializer, deserializer, request, response, impl,
config, configuration
```

サフィックス一致なので `CustomerService` は検出されるが `ServicePlan`（通信サービスのプラン等、ドメイン語彙）は検出されない。

### 日本語（部分一致）

```
ユースケース, コントローラ, プレゼンタ, アプリケーションサービス,
画面, リクエスト, レスポンス
```

### 位置依存サフィックス

同じ語でも「置かれた場所」で判定が変わる。正当な戦術パターンの誤検知を防ぐための仕組み。

| サフィックス | 許可される場所 | 他の場所に現れたら |
|---|---|---|
| `service` | `domainServices[].name` | ERROR — ドメインサービスなら domainServices へ移動、そうでなければ改名 |
| `repository` | `aggregates[].repository.name` | ERROR — リポジトリなら repository スロットへ移動、そうでなければ改名 |
| `event` | `domainEvents[].name` | ERROR — ドメインイベントなら domainEvents へ移動、そうでなければ改名 |

例: `MoneyTransferService` が `domainServices[]` にあれば PASS、`entities[]` にあれば ERROR。

## P-2: WARN（purityExceptions で抑止可）

ドメイン語彙の可能性が残る汎用語。単語一致（camelCase / snake_case を分かち書きして比較）またはサフィックス一致。

```
factory, manager, helper, util, utils, command, query,
exception, error, validator, session, workflow
```

### WARN の解消手順（SKILL.md のワークフローが強制する）

WARN が出たら、ユーザーに次の選択肢を提示して合意を得る:

1. **ドメインの言葉に改名する**（推奨）— 汎用語はドメイン概念を隠していることが多い
2. **適切なカテゴリへ移動する**
3. **ドメイン語彙として正当** — 例: 建機レンタル業の `RentalManager`（現場管理者という役職名）。この場合のみ、ユーザー合意の上で `purityExceptions` に理由付きで登録する:

```json
"purityExceptions": [
  { "name": "RentalManager", "reason": "建機レンタル業の役職名（現場管理者）でありドメイン語彙。YYYY-MM-DD ユーザー合意" }
]
```

- 例外は `name` の**完全一致**で適用される
- どの WARN にも一致しない不要な例外は WARN として報告される（古い例外の放置は純度を緩めるため削除する）

## 意図的にリストへ入れていない語

- `Policy` / `Specification` — DDD の正統な戦術パターン語
- `Transaction` — 銀行・会計ドメインでは第一級のドメイン概念

## 稀な誤検知（P-1）への対処

P-1 は意図的に例外機構を持たない。ごく稀に正当なドメイン語が弾かれる場合（例: 医療ドメインの `Response` = 治療反応）は、**改名する**（例: `TreatmentResponse` も `response` サフィックスに一致するため `TreatmentOutcome` 等へ）か、`description` に本来の語を補足して別名を使う。それでも不合理な場合は語彙リスト自体の変更を検討する — それは**このスキル自体の改修**として扱い、`lib/shared.mjs` と本ファイルを同時に更新する。
