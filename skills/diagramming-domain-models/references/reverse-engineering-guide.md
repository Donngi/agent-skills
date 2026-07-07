# コード逆生成ガイド — 既存コードからドメインモデルを起こす

既存コードベースのドメイン層を読解して `<context>.model.json` を作るときの手順とヒューリスティクス。

## 0. 大原則: 読解スコープを閉じる

ユースケースやプレゼンテーション層が図に混入する根本原因は「読んだものを書いてしまう」ことにある。だから**入口で遮断する**:

- モデル要素の根拠にしてよいのは、**ユーザーと合意したドメイン層パス配下のコードだけ**
- 次のディレクトリは**開かない**（ディレクトリ構成の把握のための一覧表示は可）:
  `application/`, `usecase(s)/`, `controller(s)/`, `presentation/`, `handler(s)/`,
  `infrastructure/`, `infra/`, `adapter(s)/`, `api/`, `web/`, `ui/`, `dto(s)/`
- ドメイン層のクラスがドメイン層外を import していても**追跡しない**。その import の存在自体が層違反の兆候だが、図には載せない（気づいたら別途ユーザーに伝えるのは良い）

## 1. ドメイン層の特定

候補をワイルドカードで探し、**必ずユーザーに選択肢で確認**してから読む:

- よくある場所: `**/domain/**`, `**/model/**`, `**/core/**`, `src/<context>/domain/**`
- モジュラモノリスでは `src/<module>/domain/` が複数あり、それぞれが境界づけられたコンテキスト候補
- 確定したパスは `source.paths` に記録する（更新時の読解スコープの根拠になる）

## 2. 分類ヒューリスティクス

| 判定 | 手がかり |
|---|---|
| **Entity** | 識別子フィールド（id 等）で同一性を判定する / ライフサイクル・状態遷移を持つ / setter・状態変更メソッド、または **id を持つ immutable な型 + 新しい状態を返す状態遷移関数**（`placeOrder(order): Order` 等）がある |
| **Value Object** | 等価性が全フィールドの値で決まる / 不変（final / readonly / frozen）/ id を持たない / equals・hashCode を値で実装、または **readonly な型 + バリデーション付きファクトリ関数**（`money(...): Money` 等。equals は無くてよい） |
| **集約ルート** | その Entity 用の Repository が存在する / 他の Entity がそのクラス経由でのみ操作される / トランザクション境界の単位 |
| **集約の境界** | ルートからオブジェクト参照（コンポジション）で辿れる範囲が同一集約。**他の集約は ID 型（CustomerId 等）で参照している**のが境界のサイン |
| **Repository** | 集約ルートの取得・保存を担うインターフェース。**ドメイン層に置かれたインターフェースのみ**を載せる（infrastructure の実装クラスは載せない） |
| **Domain Service** | 複数の集約を跨ぐ計算・判断で、どの集約にも自然に置けない手続き。状態を持たない。集約を引数に取るトップレベル純関数（`moneyTransferService(from, to, amount)` 等）もこれ |
| **Domain Event** | 過去形の名前（OrderPlaced, PaymentCompleted）/ 発生時刻を持つ / immutable |
| **Enum** | 言語の enum 構文 / 定数集合クラス / **string リテラル union 型**（`type OrderStatus = 'DRAFT' \| 'PLACED' \| ...`）|
| **共有 VO** | 複数の集約から使われる汎用語彙（Money, Quantity, EmailAddress 等）→ `sharedValueObjects` へ。集約固有の識別子 VO（OrderId 等）は所属集約内へ |

### 迷ったときの既定値

- Entity か VO か迷う → 「同じ属性値のインスタンスが2つあったとき、区別する必要があるか？」で判断。区別が必要なら Entity
- どの集約に属すか迷う → 「一緒に変更され、トランザクションで整合性を保つべきか？」で判断。保たなくてよいなら別集約 + ID 参照
- 分類の判断根拠は要素の `description` に一言残す（後からレビューしやすくなる）

## 3. 言語別の目印

| 言語 | Entity/VO の目印 | Repository の目印 |
|---|---|---|
| TypeScript | **class スタイル**: `readonly` フィールドだけなら VO 候補、`equals()` 実装 / branded type は VO。**関数型スタイル**: `type` + `readonly` + バリデーション付きファクトリ関数は VO、id を持つ immutable な `type` + 新状態を返す遷移関数は Entity、`enum` の代わりの string リテラル union 型は Enum、集約を引数に取るトップレベル純関数は Domain Service | `interface XxxRepository`（class/関数型どちらでも同じ） |
| Java/Kotlin | JPA なし前提。`record` / `@Value`（lombok）/ `data class`（val のみ）は VO | `interface XxxRepository`（domain パッケージ内） |
| Go | 値レシーバ中心・小さな struct は VO 候補。ポインタレシーバで状態変更するなら Entity | `type XxxRepository interface` |
| Python | `@dataclass(frozen=True)` は VO。`__eq__` を id で実装なら Entity | `class XxxRepository(Protocol/ABC)` |

## 4. JSON に落とすときの注意

- プロパティは**ドメイン上意味のあるものだけ**載せる（created_at / updated_at のような監査カラムは省いてよい。載せるなら理由がある時だけ）
- メソッドは載せない。重要な振る舞い・ビジネスルールは `invariants` / `description` に自然言語で書く
- コード内のガード節・assert・バリデーションから `invariants` を抽出する（これが図の価値の大半を占める）
- 他集約への参照が ID 型なら `relations[]` に `{ from, to, type: "id-reference", via: <プロパティ名> }` を追加する
- **コードに存在しても UseCase / DTO / Controller / 実装クラスは絶対に JSON に書かない**。書いても validate が拒否する
