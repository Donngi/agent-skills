// diagramming-domain-models スキル共通モジュール
// スキーマ定数・純度語彙リスト・ユーティリティ。
// 仕様の正は references/model-schema.md / references/purity-rules.md — 変更時は両者を同期させること。

// ---- スキーマ: キー白リスト（ここにないキーは validate が ERROR にする） ----

export const KEY_WHITELIST = {
  top: ['version', 'boundedContext', 'source', 'aggregates', 'sharedValueObjects',
    'domainServices', 'domainEvents', 'relations', 'purityExceptions'],
  boundedContext: ['name', 'description'],
  source: ['mode', 'paths'],
  aggregate: ['id', 'name', 'description', 'rootEntity', 'entities', 'valueObjects', 'enums', 'repository'],
  entity: ['id', 'name', 'description', 'properties', 'invariants'],
  valueObject: ['id', 'name', 'description', 'properties', 'invariants'],
  enum: ['id', 'name', 'description', 'values'],
  repository: ['name', 'description'],
  property: ['name', 'type', 'description'],
  domainService: ['id', 'name', 'description', 'relatedAggregates'],
  domainEvent: ['id', 'name', 'description', 'sourceAggregate', 'properties'],
  relation: ['from', 'to', 'type', 'via', 'description'],
  purityException: ['name', 'reason'],
};

export const RELATION_TYPES = ['id-reference'];
export const SOURCE_MODES = ['code', 'dialog'];

// ---- 純度チェック語彙 ----

// P-1 ERROR: ドメイン層に存在し得ない語（サフィックス一致・例外機構なし）
export const P1_SUFFIXES = [
  'usecase', 'interactor', 'controller', 'presenter', 'viewmodel', 'dto',
  'applicationservice', 'appservice', 'handler', 'listener', 'middleware',
  'endpoint', 'router', 'client', 'gateway', 'adapter', 'dao', 'mapper',
  'serializer', 'deserializer', 'request', 'response', 'impl',
  'config', 'configuration',
];

// P-1 ERROR: 日本語（部分一致）
export const P1_JA_TERMS = [
  'ユースケース', 'コントローラ', 'プレゼンタ', 'アプリケーションサービス',
  '画面', 'リクエスト', 'レスポンス',
];

// P-1 位置依存サフィックス: 指定スロットでのみ許可。他の場所に現れたら ERROR
export const POSITIONAL_SUFFIXES = {
  service: { allowedKind: 'domainService', hint: 'ドメインサービスなら domainServices[] へ移動、そうでなければ改名してください' },
  repository: { allowedKind: 'repository', hint: 'リポジトリなら aggregate の repository スロットへ移動、そうでなければ改名してください' },
  event: { allowedKind: 'domainEvent', hint: 'ドメインイベントなら domainEvents[] へ移動、そうでなければ改名してください' },
};

// P-2 WARN: ドメイン語彙の可能性が残る語（単語一致 or サフィックス一致。purityExceptions で抑止可）
export const P2_TERMS = [
  'factory', 'manager', 'helper', 'util', 'utils', 'command', 'query',
  'exception', 'error', 'validator', 'session', 'workflow',
];

// ---- ユーティリティ ----

// camelCase / PascalCase / snake_case / kebab-case を小文字の単語列に分解する
export function splitWords(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

// 型名から配列表記を除いた参照先候補を得る（"OrderLine[]" → "OrderLine"）
export function baseType(type) {
  return String(type).replace(/\[\]$/, '').trim();
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// <script type="application/json"> に埋め込んでも安全な JSON 文字列にする
export function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// モデル全要素を { kind, path, node } で列挙する（purity 走査・描画で共用）
export function* walkElements(model) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  const aggs = arr(model.aggregates);
  for (let ai = 0; ai < aggs.length; ai++) {
    const agg = aggs[ai];
    if (!isPlainObject(agg)) continue;
    yield { kind: 'aggregate', path: `aggregates[${ai}]`, node: agg };
    const lists = [
      ['entity', 'entities'],
      ['valueObject', 'valueObjects'],
      ['enum', 'enums'],
    ];
    for (const [kind, key] of lists) {
      const items = arr(agg[key]);
      for (let i = 0; i < items.length; i++) {
        if (isPlainObject(items[i])) {
          yield { kind, path: `aggregates[${ai}].${key}[${i}]`, node: items[i], aggregate: agg };
        }
      }
    }
    if (isPlainObject(agg.repository)) {
      yield { kind: 'repository', path: `aggregates[${ai}].repository`, node: agg.repository, aggregate: agg };
    }
  }
  const topLists = [
    ['sharedValueObject', 'sharedValueObjects'],
    ['domainService', 'domainServices'],
    ['domainEvent', 'domainEvents'],
  ];
  for (const [kind, key] of topLists) {
    const items = arr(model[key]);
    for (let i = 0; i < items.length; i++) {
      if (isPlainObject(items[i])) yield { kind, path: `${key}[${i}]`, node: items[i] };
    }
  }
}
