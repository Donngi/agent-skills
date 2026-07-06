#!/usr/bin/env node
// diagramming-domain-models: モデル JSON の検証（構造 DM-1〜8 + 純度 P-1/P-2）
//
// Usage: node validate.mjs <model.json>
// Exit:  0 = 全 PASS / 1 = ERROR あり（描画不可） / 2 = WARN のみ（要ユーザー合意）
//
// 仕様の正: references/model-schema.md / references/purity-rules.md

import { readFileSync } from 'node:fs';
import {
  KEY_WHITELIST, RELATION_TYPES, SOURCE_MODES,
  P1_SUFFIXES, P1_JA_TERMS, POSITIONAL_SUFFIXES, P2_TERMS,
  splitWords, baseType, isPlainObject, walkElements,
} from './shared.mjs';

const errors = [];   // { check, path, message }
const warnings = [];
const passes = [];

function err(check, path, message) { errors.push({ check, path, message }); }
function warn(check, path, message) { warnings.push({ check, path, message }); }
function pass(check, message) { passes.push({ check, message }); }

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

// ---- キー白リスト検証 ----
function checkKeys(obj, kind, path, collect, checkId = 'DM-4') {
  const allowed = KEY_WHITELIST[kind];
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      collect(checkId, `${path}.${key}`,
        `未知のキー "${key}"（${kind} で許可されるのは: ${allowed.join(', ')}）。` +
        'ドメインモデルに存在しない概念はスキーマ上も表現できません');
    }
  }
}

function checkProperties(node, path, collect) {
  if (node.properties === undefined) return;
  if (!Array.isArray(node.properties)) {
    collect('DM-3', `${path}.properties`, 'properties は配列である必要があります');
    return;
  }
  node.properties.forEach((p, i) => {
    const ppath = `${path}.properties[${i}]`;
    if (!isPlainObject(p)) { collect('DM-3', ppath, 'property はオブジェクトである必要があります'); return; }
    checkKeys(p, 'property', ppath, collect);
    if (!isNonEmptyString(p.name)) collect('DM-3', `${ppath}.name`, 'property.name は必須の文字列です');
    if (!isNonEmptyString(p.type)) collect('DM-3', `${ppath}.type`, 'property.type は必須の文字列です');
  });
}

// ============================================================
// main
// ============================================================

const file = process.argv[2];
if (!file) {
  console.error('Usage: node validate.mjs <model.json>');
  process.exit(1);
}

// ---- DM-1: JSON としてパース可能 ----
let model;
try {
  model = JSON.parse(readFileSync(file, 'utf8'));
  if (!isPlainObject(model)) throw new Error('トップレベルはオブジェクトである必要があります');
  pass('DM-1', 'JSON として妥当');
} catch (e) {
  err('DM-1', '(file)', `JSON をパースできません: ${e.message}`);
  report();
}

// ---- DM-2: トップレベルキー白リスト ----
{
  const before = errors.length;
  checkKeys(model, 'top', '$', err, 'DM-2');
  if (errors.length === before) pass('DM-2', 'トップレベルキーは白リスト内');
}

// ---- DM-3: 必須フィールド・型 ----
{
  const before = errors.length;
  if (model.version !== 1) err('DM-3', '$.version', `version は 1 である必要があります（現在: ${JSON.stringify(model.version)}）`);
  if (!isPlainObject(model.boundedContext)) {
    err('DM-3', '$.boundedContext', 'boundedContext は必須のオブジェクトです');
  } else {
    checkKeys(model.boundedContext, 'boundedContext', '$.boundedContext', err);
    if (!isNonEmptyString(model.boundedContext.name)) err('DM-3', '$.boundedContext.name', 'boundedContext.name は必須の文字列です');
  }
  if (!isPlainObject(model.source)) {
    err('DM-3', '$.source', 'source は必須のオブジェクトです');
  } else {
    checkKeys(model.source, 'source', '$.source', err);
    if (!SOURCE_MODES.includes(model.source.mode)) {
      err('DM-3', '$.source.mode', `source.mode は ${SOURCE_MODES.join(' | ')} のいずれかです`);
    }
    if (model.source.paths !== undefined &&
        (!Array.isArray(model.source.paths) || model.source.paths.some((p) => !isNonEmptyString(p)))) {
      err('DM-3', '$.source.paths', 'source.paths は文字列の配列です');
    }
  }
  if (!Array.isArray(model.aggregates) || model.aggregates.length === 0) {
    err('DM-3', '$.aggregates', 'aggregates は1件以上の配列である必要があります');
  }
  for (const key of ['sharedValueObjects', 'domainServices', 'domainEvents', 'relations', 'purityExceptions']) {
    if (model[key] !== undefined && !Array.isArray(model[key])) {
      err('DM-3', `$.${key}`, `${key} は配列である必要があります`);
    }
  }
  // 配列要素・repository がオブジェクトであることを検証する。
  // これを怠ると、配列にプリミティブ（例: "FooController"）を混ぜたとき walkElements が
  // その要素を巡回せず、キー検証も純度チェックも丸ごとすり抜けてしまう。
  const eachIsObject = (arr, label) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((el, i) => {
      if (!isPlainObject(el)) {
        err('DM-3', `${label}[${i}]`, 'この要素はオブジェクトである必要があります（プリミティブ値は不可）');
      }
    });
  };
  eachIsObject(model.aggregates, '$.aggregates');
  eachIsObject(model.sharedValueObjects, '$.sharedValueObjects');
  eachIsObject(model.domainServices, '$.domainServices');
  eachIsObject(model.domainEvents, '$.domainEvents');
  (Array.isArray(model.aggregates) ? model.aggregates : []).forEach((agg, ai) => {
    if (!isPlainObject(agg)) return;
    eachIsObject(agg.entities, `aggregates[${ai}].entities`);
    eachIsObject(agg.valueObjects, `aggregates[${ai}].valueObjects`);
    eachIsObject(agg.enums, `aggregates[${ai}].enums`);
    if (agg.repository !== undefined && !isPlainObject(agg.repository)) {
      err('DM-3', `aggregates[${ai}].repository`, 'repository はオブジェクトである必要があります');
    }
  });
  if (errors.length === before) pass('DM-3', '必須フィールド・型が妥当');
}

// ---- DM-4: 各オブジェクトのキー白リスト + 要素レベル必須フィールド ----
{
  const before = errors.length;
  const kindToWhitelistKey = {
    aggregate: 'aggregate', entity: 'entity', valueObject: 'valueObject',
    sharedValueObject: 'valueObject', enum: 'enum', repository: 'repository',
    domainService: 'domainService', domainEvent: 'domainEvent',
  };
  for (const { kind, path, node } of walkElements(model)) {
    checkKeys(node, kindToWhitelistKey[kind], path, err);
    if (kind === 'repository') {
      if (!isNonEmptyString(node.name)) err('DM-3', `${path}.name`, 'repository.name は必須の文字列です');
    } else {
      if (!isNonEmptyString(node.id)) err('DM-3', `${path}.id`, `${kind}.id は必須の文字列です`);
      if (!isNonEmptyString(node.name)) err('DM-3', `${path}.name`, `${kind}.name は必須の文字列です`);
    }
    if (kind === 'aggregate') {
      if (!isNonEmptyString(node.rootEntity)) err('DM-3', `${path}.rootEntity`, 'aggregate.rootEntity は必須の文字列です');
      if (!Array.isArray(node.entities) || node.entities.length === 0) {
        err('DM-3', `${path}.entities`, 'aggregate.entities は1件以上の配列である必要があります');
      }
    }
    if (kind === 'enum') {
      if (!Array.isArray(node.values) || node.values.length === 0 || node.values.some((v) => !isNonEmptyString(v))) {
        err('DM-3', `${path}.values`, 'enum.values は1件以上の文字列配列である必要があります');
      }
    }
    if (kind === 'domainEvent' && !isNonEmptyString(node.sourceAggregate)) {
      err('DM-3', `${path}.sourceAggregate`, 'domainEvent.sourceAggregate は必須の文字列です');
    }
    if (['entity', 'valueObject', 'sharedValueObject', 'domainEvent'].includes(kind)) {
      checkProperties(node, path, err);
      if (node.invariants !== undefined &&
          (!Array.isArray(node.invariants) || node.invariants.some((v) => !isNonEmptyString(v)))) {
        err('DM-3', `${path}.invariants`, 'invariants は文字列の配列である必要があります');
      }
    }
  }
  (Array.isArray(model.relations) ? model.relations : []).forEach((r, i) => {
    if (isPlainObject(r)) checkKeys(r, 'relation', `relations[${i}]`, err);
  });
  (Array.isArray(model.purityExceptions) ? model.purityExceptions : []).forEach((x, i) => {
    const p = `purityExceptions[${i}]`;
    if (!isPlainObject(x)) { err('DM-3', p, 'purityException はオブジェクトである必要があります'); return; }
    checkKeys(x, 'purityException', p, err);
    if (!isNonEmptyString(x.name)) err('DM-3', `${p}.name`, 'purityException.name は必須です');
    if (!isNonEmptyString(x.reason)) err('DM-3', `${p}.reason`, 'purityException.reason は必須です（ユーザー合意の記録）');
  });
  if (errors.length === before) pass('DM-4', '全要素のキーが白リスト内で必須フィールドも妥当');
}

// ---- DM-5: id の種別横断一意性 ----
{
  const before = errors.length;
  const seen = new Map();
  for (const { kind, path, node } of walkElements(model)) {
    if (kind === 'repository' || !isNonEmptyString(node.id)) continue;
    if (seen.has(node.id)) {
      err('DM-5', `${path}.id`, `id "${node.id}" が重複しています（既出: ${seen.get(node.id)}）。id はファイル内で種別横断一意です`);
    } else {
      seen.set(node.id, path);
    }
  }
  if (errors.length === before) pass('DM-5', 'id は種別横断で一意');
}

const aggregateIds = new Set(
  (Array.isArray(model.aggregates) ? model.aggregates : [])
    .filter((a) => isPlainObject(a) && isNonEmptyString(a.id)).map((a) => a.id),
);

// ---- DM-6: rootEntity の解決 ----
{
  const before = errors.length;
  (Array.isArray(model.aggregates) ? model.aggregates : []).forEach((agg, ai) => {
    if (!isPlainObject(agg) || !isNonEmptyString(agg.rootEntity)) return;
    const entityIds = (Array.isArray(agg.entities) ? agg.entities : [])
      .filter((e) => isPlainObject(e)).map((e) => e.id);
    if (!entityIds.includes(agg.rootEntity)) {
      err('DM-6', `aggregates[${ai}].rootEntity`,
        `rootEntity "${agg.rootEntity}" が同一集約の entities[].id に見つかりません（候補: ${entityIds.join(', ') || 'なし'}）`);
    }
  });
  if (errors.length === before) pass('DM-6', 'rootEntity はすべて解決可能');
}

// ---- DM-7: relations の整合 ----
{
  const before = errors.length;
  (Array.isArray(model.relations) ? model.relations : []).forEach((r, i) => {
    const p = `relations[${i}]`;
    if (!isPlainObject(r)) { err('DM-7', p, 'relation はオブジェクトである必要があります'); return; }
    if (!aggregateIds.has(r.from)) err('DM-7', `${p}.from`, `from "${r.from}" は集約 id に解決できません`);
    if (!aggregateIds.has(r.to)) err('DM-7', `${p}.to`, `to "${r.to}" は集約 id に解決できません`);
    if (r.from === r.to) err('DM-7', p, 'from と to が同一です（集約内の参照は relations に書かず properties の型で表現します）');
    if (!RELATION_TYPES.includes(r.type)) {
      err('DM-7', `${p}.type`, `type は ${RELATION_TYPES.join(' | ')} のいずれかです（集約間はオブジェクト参照ではなく ID 参照が原則）`);
    }
  });
  if (errors.length === before) pass('DM-7', 'relations は妥当');
}

// ---- DM-8: sourceAggregate / relatedAggregates の解決 ----
{
  const before = errors.length;
  (Array.isArray(model.domainEvents) ? model.domainEvents : []).forEach((ev, i) => {
    if (isPlainObject(ev) && isNonEmptyString(ev.sourceAggregate) && !aggregateIds.has(ev.sourceAggregate)) {
      err('DM-8', `domainEvents[${i}].sourceAggregate`, `"${ev.sourceAggregate}" は集約 id に解決できません`);
    }
  });
  (Array.isArray(model.domainServices) ? model.domainServices : []).forEach((sv, i) => {
    if (!isPlainObject(sv) || sv.relatedAggregates === undefined) return;
    if (!Array.isArray(sv.relatedAggregates)) {
      err('DM-8', `domainServices[${i}].relatedAggregates`, 'relatedAggregates は文字列の配列です');
      return;
    }
    sv.relatedAggregates.forEach((id, j) => {
      if (!aggregateIds.has(id)) {
        err('DM-8', `domainServices[${i}].relatedAggregates[${j}]`, `"${id}" は集約 id に解決できません`);
      }
    });
  });
  if (errors.length === before) pass('DM-8', 'sourceAggregate / relatedAggregates はすべて解決可能');
}

// ---- DM-9: 予約識別子・制御文字（render の合成 cid / セレクタ安全性を守る）----
// render.mjs はカードを data-cid で識別し、リポジトリを `repo-<集約id>`、サービスを
// `svc-<サービスid>`、共有VOの所属を内部センチネル 'shared' で表す。要素 id や集約 id が
// これらと衝突すると強調/フォーカスが壊れる。また id・型は実行時に属性セレクタへ渡すため
// 制御文字（改行等）が入ると querySelector が壊れる。ここで前段の入力契約として弾く。
{
  const before = errors.length;
  const CTRL = new RegExp('[' + '\\u0000-\\u001F\\u007F' + ']');
  const RESERVED_CID = /^(repo-|svc-)/;
  const CID_KINDS = new Set(['entity', 'valueObject', 'enum', 'sharedValueObject']);
  (Array.isArray(model.aggregates) ? model.aggregates : []).forEach((agg, ai) => {
    if (isPlainObject(agg) && agg.id === 'shared') {
      err('DM-9', `aggregates[${ai}].id`,
        'aggregate.id に "shared" は使えません（共有VOを表す内部予約語と衝突します）。別の id にしてください');
    }
  });
  for (const { kind, path, node } of walkElements(model)) {
    if (CID_KINDS.has(kind) && isNonEmptyString(node.id) && RESERVED_CID.test(node.id)) {
      err('DM-9', `${path}.id`,
        `id "${node.id}" は予約プレフィックス（repo- / svc-）で始められません（描画の内部識別子と衝突します）`);
    }
    if (isNonEmptyString(node.id) && CTRL.test(node.id)) {
      err('DM-9', `${path}.id`, 'id に制御文字（改行・タブ等）を含めることはできません');
    }
    (Array.isArray(node.properties) ? node.properties : []).forEach((p, i) => {
      if (isPlainObject(p) && isNonEmptyString(p.type) && CTRL.test(p.type)) {
        err('DM-9', `${path}.properties[${i}].type`, 'property.type に制御文字（改行・タブ等）を含めることはできません');
      }
    });
  }
  if (errors.length === before) pass('DM-9', '予約識別子・制御文字の衝突なし');
}

// ============================================================
// 純度チェック（P-1 ERROR / P-2 WARN）
// 走査対象: 全要素の name・id と properties[].type。description は対象外
// ============================================================

const exceptions = new Map(
  (Array.isArray(model.purityExceptions) ? model.purityExceptions : [])
    .filter((x) => isPlainObject(x) && isNonEmptyString(x.name))
    .map((x) => [x.name, x.reason]),
);
const usedExceptions = new Set();

// exemptName: この要素の name。purityExceptions は要素の name で登録されるため、
// id（集約ならケバブ）を走査するときも同じ要素の name で例外を引けるようにする。
function purityScanName(value, kind, path, exemptName) {
  if (!isNonEmptyString(value)) return;
  const lower = value.toLowerCase();
  const words = splitWords(value);

  // P-1: 固定サフィックス（例外なし）
  for (const suffix of P1_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      err('P-1', path,
        `"${value}" は禁止語彙 "${suffix}" で終わっています。ドメイン層に存在しない要素です — ` +
        'モデルから削除するか、ドメイン概念として正しい名前に改名してください（例外登録はできません）');
      return;
    }
  }
  // P-1: 日本語（部分一致）
  for (const term of P1_JA_TERMS) {
    if (value.includes(term)) {
      err('P-1', path,
        `"${value}" は禁止語彙 "${term}" を含んでいます。ドメイン層に存在しない要素です — ` +
        'モデルから削除するか、ドメイン概念として正しい名前に改名してください（例外登録はできません）');
      return;
    }
  }
  // P-1: 位置依存サフィックス（許可スロット外なら ERROR）
  for (const [suffix, rule] of Object.entries(POSITIONAL_SUFFIXES)) {
    if (lower.endsWith(suffix) && kind !== rule.allowedKind) {
      err('P-1', path,
        `"${value}" は "${suffix}" サフィックスを持ちますが、${rule.allowedKind} 以外の場所に置かれています。${rule.hint}`);
      return;
    }
  }
  // P-2: WARN 語彙（単語一致 or サフィックス一致。例外で抑止可）
  for (const term of P2_TERMS) {
    if (words.includes(term) || lower.endsWith(term)) {
      const exemptKey = exceptions.has(value) ? value : (exemptName && exceptions.has(exemptName) ? exemptName : null);
      if (exemptKey) {
        usedExceptions.add(exemptKey);
        pass('P-2', `"${value}" は語彙 "${term}" を含むが purityExceptions に合意済み（理由: ${exceptions.get(exemptKey)}）`);
      } else {
        warn('P-2', path,
          `"${value}" は語彙 "${term}" を含んでいます。汎用的・技術的な名前はドメイン概念を隠すことがあります — ` +
          '(1) ドメインの言葉に改名 / (2) 適切なカテゴリへ移動 / (3) ドメイン語彙として正当ならユーザー合意の上 purityExceptions に理由付きで登録、のいずれかで解消してください');
      }
      return;
    }
  }
}

{
  const beforeE = errors.length;
  const beforeW = warnings.length;
  for (const { kind, path, node } of walkElements(model)) {
    purityScanName(node.name, kind, `${path}.name`, node.name);
    if (kind !== 'repository' && node.id !== node.name) purityScanName(node.id, kind, `${path}.id`, node.name);
    (Array.isArray(node.properties) ? node.properties : []).forEach((p, i) => {
      if (isPlainObject(p)) purityScanName(baseType(p.type), 'propertyType', `${path}.properties[${i}].type`);
    });
  }
  // 使われていない purityExceptions は WARN（古い例外が残ると純度が緩むため）
  for (const [name] of exceptions) {
    if (!usedExceptions.has(name)) {
      warn('P-2', '$.purityExceptions',
        `例外 "${name}" はどの WARN にも一致しませんでした。不要なら削除してください`);
    }
  }
  if (errors.length === beforeE && warnings.length === beforeW) pass('P-1/P-2', '純度チェックに違反なし');
}

report();

// ============================================================

function report() {
  console.log(`== diagramming-domain-models validate: ${file} ==`);
  for (const p of passes) console.log(`[PASS] ${p.check}: ${p.message}`);
  for (const w of warnings) console.log(`[WARN] ${w.check} ${w.path}: ${w.message}`);
  for (const e of errors) console.log(`[FAIL] ${e.check} ${e.path}: ${e.message}`);
  console.log('--');
  console.log(`Summary: ${passes.length} passed / ${errors.length} error(s) / ${warnings.length} warning(s)`);
  if (errors.length > 0) {
    console.log('結果: ERROR — この JSON は描画できません。上記をすべて修正してください。');
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.log('結果: WARN — 描画は可能ですが、ユーザーと解消するか purityExceptions への合意登録が必要です。');
    process.exit(2);
  }
  console.log('結果: PASS');
  process.exit(0);
}
