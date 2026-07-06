# ドメインモデル JSON スキーマ仕様

`<context>.model.json` はドメインモデル図の**唯一の情報源**であり、`lib/validate.mjs` が本仕様に従って機械検証する。本ファイルは仕様の正であり、validate.mjs の実装と常に一致させること。

## 設計原則

- **1ファイル = 1境界づけられたコンテキスト**。複数コンテキストは複数ファイルに分ける（コンテキストマップは v1 スコープ外）
- **キーは白リスト方式**。ここに記載のないキーが1つでもあれば検証エラー（ERROR）になる。これは「`useCases` や `controllers` といった非ドメイン要素を構造レベルで表現不可能にする」ための意図的な制約である
- 包含関係はネストで表現する（entities / valueObjects / enums / repository は aggregate の中に置く）
- メソッド一覧は持たせない。振る舞いの要点は `description` / `invariants` に自然言語で書く
- 要素の並び順は図の描画順にそのまま使われる。モデリング上の重要度順に並べること

## トップレベル

| キー | 必須 | 型 | 説明 |
|---|---|---|---|
| `version` | ✔ | number | 常に `1` |
| `boundedContext` | ✔ | object | コンテキストのメタデータ |
| `source` | ✔ | object | モデルの出所 |
| `aggregates` | ✔ | array | 集約（1件以上） |
| `sharedValueObjects` | | array | 集約を跨いで使われる共有語彙 VO |
| `domainServices` | | array | ドメインサービス |
| `domainEvents` | | array | ドメインイベント |
| `relations` | | array | 集約間の参照関係 |
| `purityExceptions` | | array | WARN 級の純度指摘の合意済み例外 |

**上記以外のトップレベルキーは ERROR**（DM-2）。

## 各オブジェクトのキー白リスト

「必須」のないキーは任意。**白リスト外のキーはすべて ERROR**（DM-4）。

### boundedContext
| キー | 必須 | 型 |
|---|---|---|
| `name` | ✔ | string |
| `description` | | string |

### source
| キー | 必須 | 型 | 説明 |
|---|---|---|---|
| `mode` | ✔ | `"code"` \| `"dialog"` | 逆生成 or 対話モデリング |
| `paths` | | string[] | mode=code のとき、読解したドメイン層ディレクトリ。再生成時の読解スコープの根拠になる |

### aggregate（aggregates[] の要素）
| キー | 必須 | 型 | 説明 |
|---|---|---|---|
| `id` | ✔ | string | ファイル内で種別横断一意 |
| `name` | ✔ | string | 表示名 |
| `description` | | string | 集約の責務・保証する整合性 |
| `rootEntity` | ✔ | string | 同一集約内 `entities[].id` への参照（DM-6） |
| `entities` | ✔ | array | エンティティ（1件以上、ルートを含む） |
| `valueObjects` | | array | この集約に閉じた VO（識別子 VO など） |
| `enums` | | array | 列挙型 |
| `repository` | | object | この集約のリポジトリ（集約ルート単位に最大1つ） |

### entity / valueObject / sharedValueObject
| キー | 必須 | 型 |
|---|---|---|
| `id` | ✔ | string |
| `name` | ✔ | string |
| `description` | | string |
| `properties` | | array |
| `invariants` | | string[]（不変条件を自然言語で） |

### enum
| キー | 必須 | 型 |
|---|---|---|
| `id` | ✔ | string |
| `name` | ✔ | string |
| `description` | | string |
| `values` | ✔ | string[] |

### repository
| キー | 必須 | 型 |
|---|---|---|
| `name` | ✔ | string |
| `description` | | string |

`id` を持たない（参照されることがないため）。

### property（properties[] の要素）
| キー | 必須 | 型 | 説明 |
|---|---|---|---|
| `name` | ✔ | string | |
| `type` | ✔ | string | 型名。`OrderLine[]` のような配列表記可 |
| `description` | | string | ID 参照であること等の注記 |

### domainService
| キー | 必須 | 型 | 説明 |
|---|---|---|---|
| `id` | ✔ | string | |
| `name` | ✔ | string | `〜Service` サフィックスはここでのみ許可される |
| `description` | | string | なぜ集約に置けないか（複数集約を跨ぐ等）を書く |
| `relatedAggregates` | | string[] | 関係する集約の `id`（DM-8） |

### domainEvent
| キー | 必須 | 型 | 説明 |
|---|---|---|---|
| `id` | ✔ | string | |
| `name` | ✔ | string | 過去形が慣例（例: OrderPlaced）。`〜Event` サフィックスはここでのみ許可 |
| `description` | | string | |
| `sourceAggregate` | ✔ | string | 発行元集約の `id`（DM-8） |
| `properties` | | array | イベントのペイロード |

### relation（relations[] の要素）
| キー | 必須 | 型 | 説明 |
|---|---|---|---|
| `from` | ✔ | string | 参照元集約の `id` |
| `to` | ✔ | string | 参照先集約の `id`（from ≠ to、DM-7） |
| `type` | ✔ | `"id-reference"` | v1 では ID 参照のみ。集約間はオブジェクト参照ではなく ID で参照するのが DDD の原則 |
| `via` | | string | 参照を保持するプロパティ名（例: `customerId`）。図の線ラベルと接続元に使われる |
| `description` | | string | 参照の設計意図 |

### purityException（purityExceptions[] の要素）
| キー | 必須 | 型 | 説明 |
|---|---|---|---|
| `name` | ✔ | string | 例外にする要素の `name`（完全一致） |
| `reason` | ✔ | string | ドメイン語彙として正当である理由。**ユーザーの合意を得てから追加する** |

抑止できるのは **WARN（P-2）のみ**。ERROR（P-1）は例外にできない。

## 参照の解決規則（レンダラーの挙動）

- `properties[].type` から末尾の `[]` を除いた文字列が、定義済み要素（entity / VO / 共有 VO / enum）の `id` に一致すれば「参照」とみなす
- 同一集約内の参照 → 参照線 + ホバー強調
- 共有 VO への参照 → 共有語彙帯への参照線 + `◇ 共有語彙` バッジ
- 他集約所有の要素への型参照 → 線は引かず `↗ <集約名>` バッジで定義元を示す（集約間の依存は `relations[]` の ID 参照線で表現する）
- `int` / `string` / `decimal` / `datetime` などプリミティブ型はどの `id` にも一致しないため、単なる表示になる

## 識別子の規約

- `id` はファイル内で**種別横断で一意**（DM-5）。集約 id は小文字ケバブ/スネーク（`order`）、型要素の id はクラス名そのまま（`OrderId`）を推奨
- `name` は図に表示される名前。通常はコード上のクラス名と一致させる
- **予約識別子・制御文字（DM-9）**: レンダラーが内部でカードを識別するため、次を禁止する。
  - 集約 `id` に `shared`（共有VOを表す内部予約語と衝突）
  - エンティティ/VO/enum/共有VO の `id` の `repo-` / `svc-` プレフィックス（リポジトリ `repo-<集約id>`・サービス `svc-<サービスid>` の合成 id と衝突）
  - `id` および `properties[].type` に制御文字（改行・タブ等。実行時の属性セレクタが壊れる）

## 完全なサンプル

[sample-model.json](sample-model.json) を参照。レンダラーの動作確認・evals の入力を兼ねる。
