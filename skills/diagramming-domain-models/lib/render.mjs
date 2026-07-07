#!/usr/bin/env node
// diagramming-domain-models: モデル JSON → 自己完結 HTML レンダラー
//
// Usage: node render.mjs <model.json> [--out <path>]
//   デフォルト出力: 入力と同ディレクトリの <basename>.html（.model.json → .html）
//
// - 冒頭で validate.mjs を実行し、ERROR（exit 1）なら描画を拒否する（バイパス手段はない）
// - 出力 HTML は CSS/JS 同梱・外部依存ゼロ。デザイン基準はユーザー合意済みモックアップ
// - <!-- DOMAIN-MODEL:OVERVIEW:START/END --> の間だけが Claude の記入枠。再レンダリング時は自動引き継ぎ

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml as esc, jsonForScript, baseType, walkElements } from './shared.mjs';

// ---- 引数処理 ----
const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error('Usage: node render.mjs <model.json> [--out <path>]');
  process.exit(1);
}
const outIdx = args.indexOf('--out');
if (outIdx !== -1 && !args[outIdx + 1]) {
  console.error('警告: --out にパスが指定されていません。デフォルトの出力先を使用します。');
}
const outPath = outIdx !== -1 && args[outIdx + 1]
  ? args[outIdx + 1]
  : join(dirname(file), basename(file).replace(/\.model\.json$/, '').replace(/\.json$/, '') + '.html');

// ---- 検証ゲート: ERROR の JSON は描画しない ----
const validatePath = join(dirname(fileURLToPath(import.meta.url)), 'validate.mjs');
const v = spawnSync(process.execPath, [validatePath, file], { encoding: 'utf8' });
if (v.status === 1 || v.status === null) {
  console.error(v.stdout || '');
  console.error('render.mjs: validate が ERROR のため描画を拒否しました。先にモデル JSON を修正してください。');
  process.exit(1);
}
if (v.status === 2) {
  console.error('render.mjs: validate が WARN を報告しています。描画は続行しますが、ユーザーと解消してください。');
  console.error(v.stdout || '');
}

const model = JSON.parse(readFileSync(file, 'utf8'));
const arr = (x) => (Array.isArray(x) ? x : []);

// ============================================================
// データ準備
// ============================================================

// 定義済み要素: id → { kind, name, aggId, aggName }（aggId は共有 VO なら 'shared'）
const defs = new Map();
for (const { kind, node, aggregate } of walkElements(model)) {
  if (kind === 'aggregate' || kind === 'repository' || kind === 'domainService' || kind === 'domainEvent') continue;
  defs.set(node.id, {
    kind,
    name: node.name,
    aggId: kind === 'sharedValueObject' ? 'shared' : aggregate.id,
    aggName: kind === 'sharedValueObject' ? '共有語彙' : aggregate.name,
  });
}

// relations の via プロパティ → data-rel マーク（from 集約のエンティティから最初の一致を探す）
const relations = arr(model.relations);
const relMarks = new Map(); // `${aggId}::${propName}` → relIndex
relations.forEach((rel, i) => {
  if (!rel.via) return;
  const fromAgg = arr(model.aggregates).find((a) => a.id === rel.from);
  if (!fromAgg) return;
  // via はエンティティにも VO にも載りうる（related 側と走査範囲を揃える）
  for (const e of [...arr(fromAgg.entities), ...arr(fromAgg.valueObjects)]) {
    if (arr(e.properties).some((p) => p.name === rel.via)) {
      const key = `${rel.from}::${rel.via}`;
      if (!relMarks.has(key)) relMarks.set(key, i);
      return;
    }
  }
});

// ---- ホバー/クリックの関連集合（keep / ringCards）----
// cid は data-cid と一致（entity/vo/enum/shared=要素 id、repository='repo-<aggId>'、service='svc-<id>'）。
// 「C に関係する線の反対側を、その関係の自然な粒度で含める」:
//   1. アウトゴーイング: C のプロパティの型カード（他集約参照ならそのIDのVO＋参照先ルート）
//   2. ID参照の被参照: C がルートで、他エンティティが C を ID 参照 → その「エンティティ＋そのID(VO)」
//   3. フィールド使用の被参照: 他エンティティが C を型に持つ → そのカード（keep のみ。ホバーは"行"を光らせる）
//   4. リポジトリ → 属する集約まるごと / サービス → {自身, 関連ルート}
const aggMembersAll = {}; // aggId → 全メンバー cid[]（entity/vo/enum/repo）
const rootOf = {};        // aggId → ルート要素 id
for (const agg of arr(model.aggregates)) {
  const members = [];
  for (const e of arr(agg.entities)) members.push(e.id);
  for (const v of arr(agg.valueObjects)) members.push(v.id);
  for (const en of arr(agg.enums)) members.push(en.id);
  if (agg.repository) members.push(`repo-${agg.id}`);
  aggMembersAll[agg.id] = members;
  rootOf[agg.id] = agg.rootEntity;
}

const usesOf = {};      // cid → Set(使っている型カード cid)（アウトゴーイング）
const usedByField = {}; // cid → Set(C を型に持つカード cid。リポジトリは含めない）
function addUse(from, to) {
  if (!to || from === to) return;
  (usesOf[from] = usesOf[from] || new Set()).add(to);
  (usedByField[to] = usedByField[to] || new Set()).add(from);
}
for (const agg of arr(model.aggregates)) {
  for (const e of [...arr(agg.entities), ...arr(agg.valueObjects)]) {
    for (const p of arr(e.properties)) {
      const base = baseType(p.type);
      const def = defs.get(base);
      if (!def) continue;
      addUse(e.id, base); // 型カード
      if (def.aggId !== 'shared' && def.aggId !== agg.id && rootOf[def.aggId]) {
        // 他集約参照（ID参照）: 参照先ルートも「アウトゴーイング」に（usedByField には入れない）
        (usesOf[e.id] = usesOf[e.id] || new Set()).add(rootOf[def.aggId]);
      }
    }
  }
  // リポジトリ manages → ルート（アウトゴーイングのみ。ルート側の usedByField には入れない）
  if (agg.repository) (usesOf[`repo-${agg.id}`] = usesOf[`repo-${agg.id}`] || new Set()).add(agg.rootEntity);
}

// ID参照の被参照: 参照先ルート cid → Set(参照エンティティ, そのID VO)
const incomingID = {};
function idVoOf(entity) {
  const idp = arr(entity.properties).find((p) => p.name === 'id');
  if (!idp) return null;
  const base = baseType(idp.type);
  return defs.has(base) ? base : null;
}
for (const rel of relations) {
  const fromAgg = arr(model.aggregates).find((a) => a.id === rel.from);
  const toAgg = arr(model.aggregates).find((a) => a.id === rel.to);
  if (!fromAgg || !toAgg) continue;
  let srcEnt = arr(fromAgg.entities).find((e) => arr(e.properties).some((p) => p.name === rel.via));
  if (!srcEnt) srcEnt = arr(fromAgg.entities).find((e) => e.id === fromAgg.rootEntity);
  if (!srcEnt) continue;
  const set = (incomingID[toAgg.rootEntity] = incomingID[toAgg.rootEntity] || new Set());
  set.add(srcEnt.id);
  const idvo = idVoOf(srcEnt);
  if (idvo) set.add(idvo);
}

const allCards = [];
for (const agg of arr(model.aggregates)) for (const m of aggMembersAll[agg.id]) allCards.push(m);
for (const v of arr(model.sharedValueObjects)) allCards.push(v.id);
for (const s of arr(model.domainServices)) allCards.push(`svc-${s.id}`);
const setArr = (s) => (s ? [...s] : []);

const keep = {};      // cid → クリックで残すカード集合
const ringOut = {};   // cid → ホバーで弱リング（参照している側＝アウトゴーイング。色A/黄）
const ringIn = {};    // cid → ホバーで弱リング（参照されている側＝インカミング。色B）
for (const cid of allCards) {
  const kp = new Set([cid]);
  const rout = new Set();
  const rin = new Set();
  if (cid.startsWith('repo-')) {
    for (const m of (aggMembersAll[cid.slice(5)] || [])) { kp.add(m); if (m !== cid) rout.add(m); }
  } else if (cid.startsWith('svc-')) {
    const s = arr(model.domainServices).find((x) => `svc-${x.id}` === cid);
    for (const aid of arr(s ? s.relatedAggregates : [])) {
      if (rootOf[aid]) { kp.add(rootOf[aid]); rout.add(rootOf[aid]); }
    }
  } else {
    for (const u of setArr(usesOf[cid])) { kp.add(u); rout.add(u); }       // 自分が参照 → out
    for (const u of setArr(incomingID[cid])) { kp.add(u); rin.add(u); }    // 自分を ID 参照 → in
    for (const u of setArr(usedByField[cid])) kp.add(u); // フィールド使用は keep のみ（ホバーは行を色Bで光らせる）
  }
  keep[cid] = [...kp];
  ringOut[cid] = [...rout];
  ringIn[cid] = [...rin];
}

// 描画用の埋め込みデータ
const embedded = {
  relations: relations.map((r, i) => ({
    i, from: `agg-${r.from}`, to: `agg-${r.to}`, via: r.via || '',
    // ID 参照線の着地先は「参照される集約のルートエンティティ」。
    // ID 参照は相手集約をそのルート（＝同一性）で指すため、集約枠ではなくルート要素へ矢印を引く。
    toDef: aggRootDef(r.to),
    label: (r.via ? `${r.via}` : '') + '（ID 参照）',
  })),
  svcLinks: arr(model.domainServices).map((s) => ({
    svc: `svc-${s.id}`, aggs: arr(s.relatedAggregates).map((id) => `agg-${id}`),
  })),
  keep,
  ringOut,
  ringIn,
};

function aggName(id) {
  const a = arr(model.aggregates).find((x) => x.id === id);
  return a ? a.name : id;
}

// 集約 id → そのルートエンティティの data-def（＝ id）。ID 参照線の着地先に使う。
function aggRootDef(id) {
  const a = arr(model.aggregates).find((x) => x.id === id);
  return a ? a.rootEntity : '';
}

// ---- 件数 ----
const counts = { aggregate: 0, entity: 0, vo: 0, enum: 0, repo: 0, svc: 0, event: 0 };
for (const { kind } of walkElements(model)) {
  if (kind === 'aggregate') counts.aggregate++;
  else if (kind === 'entity') counts.entity++;
  else if (kind === 'valueObject' || kind === 'sharedValueObject') counts.vo++;
  else if (kind === 'enum') counts.enum++;
  else if (kind === 'repository') counts.repo++;
  else if (kind === 'domainService') counts.svc++;
  else if (kind === 'domainEvent') counts.event++;
}

// ---- OVERVIEW 引き継ぎ ----
const M_START = '<!-- DOMAIN-MODEL:OVERVIEW:START -->';
const M_END = '<!-- DOMAIN-MODEL:OVERVIEW:END -->';
// 概説は「実際に記入されたときだけ」枠を表示する（未記入の空枠はヘッダーの説明と重複するため描画しない）。
// 未記入でもマーカーのコメントは残し、その間を手編集すれば次回レンダリングで枠が復活する。
let overviewInner = '';
if (existsSync(outPath)) {
  const prev = readFileSync(outPath, 'utf8');
  const s = prev.indexOf(M_START);
  const e = prev.indexOf(M_END);
  if (s !== -1 && e !== -1 && e > s) {
    const inner = prev.slice(s + M_START.length, e).trim();
    // 旧バージョンのプレースホルダー文は未記入扱い
    if (inner && !inner.includes('この枠は Claude が')) overviewInner = inner;
  }
}
const hasOverview = overviewInner.length > 0;

// ============================================================
// HTML 部品
// ============================================================

function propRow(p, aggId) {
  const base = baseType(p.type);
  const def = defs.get(base);
  let attrs = '';
  let badge = '';
  if (def) {
    attrs += ` data-ref="${esc(base)}"`;
    if (def.aggId === 'shared') badge = '<span class="badge">◇ 共有語彙</span>';
    else if (def.aggId !== aggId) badge = `<span class="badge">↗ ${esc(def.aggName)}</span>`;
  }
  const relIdx = relMarks.get(`${aggId}::${p.name}`);
  if (relIdx !== undefined) attrs += ` data-rel="${relIdx}"`;
  if (p.description) attrs += ` title="${esc(p.description)}"`;
  return `<div class="prop"${attrs}><span class="pn">${esc(p.name)}</span><span class="pt">${esc(p.type)}${badge}</span></div>`;
}

function invList(node) {
  const inv = arr(node.invariants);
  if (!inv.length) return '';
  return `<ul class="inv">${inv.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function propsBlock(node, aggId) {
  const props = arr(node.properties);
  if (!props.length) return '';
  return `<div class="props">${props.map((p) => propRow(p, aggId)).join('')}</div>`;
}

function descLine(node) {
  return node.description ? `<div class="ds">${esc(node.description)}</div>` : '';
}

function entityCard(e, isRoot, aggId) {
  const cls = isRoot ? 'card entity root' : 'card entity';
  const st = isRoot ? '«ENTITY · AGGREGATE ROOT»' : '«ENTITY»';
  return `<div class="${cls}" data-def="${esc(e.id)}" data-cid="${esc(e.id)}">
<span class="st">${st}</span>
<div class="nm">${esc(e.name)}</div>
${descLine(e)}${propsBlock(e, aggId)}${invList(e)}
</div>`;
}

function voCard(v, aggId, shared) {
  const cls = shared ? 'card shared-vo' : 'card vo';
  const st = shared ? '«VALUE OBJECT · SHARED»' : '«VALUE OBJECT»';
  const domId = shared ? ` id="shared-${esc(v.id)}"` : '';
  return `<div class="${cls}"${domId} data-def="${esc(v.id)}" data-cid="${esc(v.id)}">
<span class="st">${st}</span>
<div class="nm">${esc(v.name)}</div>
${descLine(v)}${propsBlock(v, aggId)}${invList(v)}
</div>`;
}

function enumCard(v) {
  const values = arr(v.values).map((x) => `<span>${esc(x)}</span>`).join('');
  return `<div class="card enum" data-def="${esc(v.id)}" data-cid="${esc(v.id)}">
<span class="st">«ENUM»</span>
<div class="nm">${esc(v.name)}</div>
${descLine(v)}<div class="enum-vals">${values}</div>
</div>`;
}

function nchip(node, cls) {
  return `<span class="nchip ${cls}">${esc(node.name)}</span>`;
}

function aggregateSection(agg) {
  const entities = arr(agg.entities);
  const root = entities.find((e) => e.id === agg.rootEntity);
  const others = entities.filter((e) => e !== root);
  const vos = arr(agg.valueObjects);
  const enums = arr(agg.enums);
  const events = arr(model.domainEvents).filter((ev) => ev.sourceAggregate === agg.id);

  // VO/enum は「それを使う最初のエンティティ」の行へ配置（真横）。誰も使わなければルートの行。
  // セル内の並びはそのエンティティの「プロパティ順」に揃える（プロパティ表とVOの描画順を一致させる）。
  const entitiesInOrder = [root, ...others].filter(Boolean);
  const voHtml = new Map();
  for (const v of vos) voHtml.set(v.id, voCard(v, agg.id, false));
  for (const v of enums) voHtml.set(v.id, enumCard(v));
  const voOrder = [...vos.map((v) => v.id), ...enums.map((v) => v.id)];
  const firstUser = (typeId) =>
    entitiesInOrder.find((e) => arr(e.properties).some((p) => baseType(p.type) === typeId));
  const assignedTo = new Map(); // voId → entity（使う最初のエンティティ。無ければルート）
  for (const vid of voOrder) assignedTo.set(vid, firstUser(vid) || root || entitiesInOrder[0]);
  const bodyRows = entitiesInOrder.map((e) => {
    const used = new Set();
    const parts = [];
    // このエンティティのプロパティ順に、割当てられた VO/enum を並べる
    for (const p of arr(e.properties)) {
      const base = baseType(p.type);
      if (voHtml.has(base) && assignedTo.get(base) === e && !used.has(base)) {
        used.add(base);
        parts.push(voHtml.get(base));
      }
    }
    // このエンティティに割当てられたが未参照（フォールバック）の VO を末尾に（モデル順）
    for (const vid of voOrder) {
      if (assignedTo.get(vid) === e && !used.has(vid)) { used.add(vid); parts.push(voHtml.get(vid)); }
    }
    return entityCard(e, e === root, agg.id) + `\n<div class="vo-cell">${parts.join('\n')}</div>`;
  }).join('\n');

  const sumCol1 = [root ? nchip(root, 'nc-root') : '', ...others.map((e) => nchip(e, 'nc-entity'))].join('');
  const sumCol2 = [...vos.map((v) => nchip(v, 'nc-vo')), ...enums.map((v) => nchip(v, 'nc-enum'))].join('');

  const rootName = root ? root.name : agg.rootEntity; // data-ref は id、表示は name（他カードと揃える）
  const repo = agg.repository
    ? `<div class="card repo" data-cid="repo-${esc(agg.id)}">
<span class="st">«REPOSITORY»</span>
<div class="nm">${esc(agg.repository.name)}</div>
${descLine(agg.repository)}<div class="props"><div class="prop" data-ref="${esc(agg.rootEntity)}"><span class="pn">manages</span><span class="pt">${esc(rootName)}</span></div></div>
</div>` : '';
  const eventChips = events.map((ev) => {
    const payload = arr(ev.properties).map((p) => `${p.name}: ${p.type}`).join(', ');
    const title = [ev.description, payload && `payload: { ${payload} }`].filter(Boolean).join(' / ');
    return `<span class="event-chip" title="${esc(title)}">⚡ ${esc(ev.name)}</span>`;
  }).join('\n');

  return `<section class="aggregate" id="agg-${esc(agg.id)}">
<div class="agg-head" id="agg-head-${esc(agg.id)}">
<div class="st">«AGGREGATE»</div>
<div class="nm">${esc(agg.name)}</div>
${descLine(agg)}<button type="button" class="collapse-btn" aria-label="折りたたみ">▾</button>
</div>
<div class="agg-summary">
<div class="sum-col">${sumCol1}</div>
<div class="sum-col">${sumCol2}</div>
</div>
<div class="agg-body">
<div class="col-title">ENTITIES</div>
<div class="col-title">VALUE OBJECTS / ENUMS</div>
${bodyRows}
</div>
<div class="agg-foot">
${repo}
${eventChips}
</div>
</section>`;
}

function servicesBand() {
  const svcs = arr(model.domainServices);
  if (!svcs.length) return '';
  const cards = svcs.map((s) => `<div class="card svc" id="svc-${esc(s.id)}" data-def="${esc(s.id)}" data-cid="svc-${esc(s.id)}">
<span class="st">«DOMAIN SERVICE»</span>
<div class="nm">${esc(s.name)}</div>
${descLine(s)}<div class="props"><div class="prop"><span class="pn">関連集約</span><span class="pt">${esc(arr(s.relatedAggregates).map(aggName).join(', '))}</span></div></div>
</div>`).join('\n');
  return `<div class="band"><div class="band-title">DOMAIN SERVICES</div><div class="band-cards">
${cards}
</div></div>`;
}

function sharedBand() {
  const shared = arr(model.sharedValueObjects);
  if (!shared.length) return '';
  return `<div class="band band-shared"><div class="band-title">SHARED VALUE OBJECTS ─ 集約を跨いで使われる共有語彙</div><div class="band-cards">
${shared.map((v) => voCard(v, 'shared', true)).join('\n')}
</div></div>`;
}

const chips = [
  ['集約', counts.aggregate], ['Entity', counts.entity], ['Value Object', counts.vo],
  ['Enum', counts.enum], ['Repository', counts.repo],
  ['Domain Service', counts.svc], ['Domain Event', counts.event],
].filter(([, n]) => n > 0)
  .map(([label, n]) => `<span class="chip">${label} <b>${n}</b></span>`).join('');

const sourceLabel = model.source.mode === 'code'
  ? `code（${arr(model.source.paths).join(', ') || 'パス未記録'}）`
  : 'dialog（対話モデリング）';

const generatedAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

// ============================================================
// CSS（デザイン基準: ユーザー合意済みモックアップ。コンパクト表示が既定）
// ============================================================

const CSS = `
:root{
  --bg:#f4f6f9; --panel:#ffffff; --text:#1f2530; --muted:#68738a; --border:#d9dee8;
  --agg-border:#aab4c5; --agg-head:#eef1f6;
  --entity:#6e97e8; --entity-bg:#f0f5ff;
  --root:#1d4fd0;   --root-bg:#e2ecff; --root-line:#1d4fd0;
  --vo:#178a50;     --vo-bg:#eaf7f0;
  --enum:#7a3fbf;   --enum-bg:#f4edfc;
  --repo:#5b6b84;   --repo-bg:#eef1f6;
  --event:#c2571c;  --event-bg:#fdf0e6;
  --svc:#0e7f8a;    --svc-bg:#e6f6f8;
  --line-ref:#8c96aa; --line-svc:#0e7f8a;
  --rel-g1:#10b981; --rel-g2:#3b82f6; --rel-g3:#e0409b;
  --rel-chip-bg:rgba(28,37,54,.93); --rel-chip-fg:#f5f8ff; --rel-chip-bd:rgba(255,255,255,.16);
  --hl:#ffd166; --hl-bg:#fff3d1;
  --hl2:#06b6d4; --hl2-bg:#cffafe;
  --shadow:0 1px 3px rgba(15,23,42,.07);
  --sp-card:12px; --sp-col:18px; --sp-aggx:40px; --sp-aggy:44px;
  --card-pad:8px 10px; --body-pad:14px 12px; --sp-band:32px;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#12151c; --panel:#1a1f2a; --text:#e6e9f0; --muted:#95a0b4; --border:#2b3242;
    --agg-border:#414b60; --agg-head:#222938;
    --entity:#7291d4; --entity-bg:#1c2536;
    --root:#a8c2ff;   --root-bg:#202e46; --root-line:#5470a8;
    --vo:#4ecb8d;     --vo-bg:#122e1f;
    --enum:#bb90ee;   --enum-bg:#2a1e3c;
    --repo:#93a2bc;   --repo-bg:#232a38;
    --event:#ea8443;  --event-bg:#372010;
    --svc:#45c3d1;    --svc-bg:#0f2e33;
    --line-ref:#6b7690; --line-svc:#45c3d1;
    --rel-g1:#62f0b8; --rel-g2:#8fcfff; --rel-g3:#ff9fc7;
    --rel-chip-bg:rgba(9,19,36,.86); --rel-chip-fg:#e6edff; --rel-chip-bd:rgba(255,255,255,.20);
    --hl:#ffd166; --hl-bg:#3d3313;
  --hl2:#3ad8f5; --hl2-bg:#0e3b46;
    --shadow:0 1px 3px rgba(0,0,0,.4);
  }
}
:root[data-theme="light"]{
  --bg:#f4f6f9; --panel:#ffffff; --text:#1f2530; --muted:#68738a; --border:#d9dee8;
  --agg-border:#aab4c5; --agg-head:#eef1f6;
  --entity:#6e97e8; --entity-bg:#f0f5ff;
  --root:#1d4fd0;   --root-bg:#e2ecff; --root-line:#1d4fd0;
  --vo:#178a50;     --vo-bg:#eaf7f0;
  --enum:#7a3fbf;   --enum-bg:#f4edfc;
  --repo:#5b6b84;   --repo-bg:#eef1f6;
  --event:#c2571c;  --event-bg:#fdf0e6;
  --svc:#0e7f8a;    --svc-bg:#e6f6f8;
  --line-ref:#8c96aa; --line-svc:#0e7f8a;
  --rel-g1:#10b981; --rel-g2:#3b82f6; --rel-g3:#e0409b;
  --rel-chip-bg:rgba(28,37,54,.93); --rel-chip-fg:#f5f8ff; --rel-chip-bd:rgba(255,255,255,.16);
  --hl:#ffd166; --hl-bg:#fff3d1;
  --hl2:#06b6d4; --hl2-bg:#cffafe;
  --shadow:0 1px 3px rgba(15,23,42,.07);
}
:root[data-theme="dark"]{
  --bg:#12151c; --panel:#1a1f2a; --text:#e6e9f0; --muted:#95a0b4; --border:#2b3242;
  --agg-border:#414b60; --agg-head:#222938;
  --entity:#7291d4; --entity-bg:#1c2536;
  --root:#a8c2ff;   --root-bg:#202e46; --root-line:#5470a8;
  --vo:#4ecb8d;     --vo-bg:#122e1f;
  --enum:#bb90ee;   --enum-bg:#2a1e3c;
  --repo:#93a2bc;   --repo-bg:#232a38;
  --event:#ea8443;  --event-bg:#372010;
  --svc:#45c3d1;    --svc-bg:#0f2e33;
  --line-ref:#6b7690; --line-svc:#45c3d1;
  --hl:#ffd166; --hl-bg:#3d3313;
  --hl2:#3ad8f5; --hl2-bg:#0e3b46;
  --shadow:0 1px 3px rgba(0,0,0,.4);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;
  font-size:13px;line-height:1.5}
main{max-width:1320px;margin:0 auto;padding:24px 22px 80px}
@media (min-width:1600px){main{max-width:1880px}}
@media (min-width:2160px){main{max-width:2440px}}
h1{font-size:20px;margin:0 0 2px}
h1 .ctx{font-size:11px;font-weight:normal;color:var(--muted);margin-left:8px;letter-spacing:.04em}
.subtitle{color:var(--muted);margin:0 0 10px;font-size:12px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.chip{background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:2px 10px;font-size:11px;color:var(--muted)}
.chip b{color:var(--text)}
/* ヘッダーとコントロールを横並びに。幅に余裕があればコントロールを見出しの右へ、
   狭ければ折り返して下へ回す */
.topbar{display:flex;flex-wrap:wrap;align-items:flex-start;gap:14px 28px;margin-bottom:16px}
.topbar > header{flex:1 1 440px;min-width:0}
.topbar > .controls{flex:0 1 auto;margin-left:auto}
.controls{background:var(--panel);border:1px solid var(--border);
  border-radius:10px;padding:9px 14px;display:flex;gap:26px;flex-wrap:wrap;align-items:flex-end;
  box-shadow:0 2px 10px rgba(0,0,0,.06)}
.controls fieldset{border:none;margin:0;padding:0}
.controls legend{font-size:10px;font-weight:600;color:var(--muted);letter-spacing:.05em;padding:0 0 4px}
.controls label{margin-right:12px;cursor:pointer;font-size:12px}
.controls input{accent-color:var(--root);margin-right:4px}
.controls button{border:1px solid var(--border);background:var(--panel);color:var(--text);
  border-radius:6px;font-size:12px;padding:5px 12px;line-height:1;cursor:pointer;margin-right:6px;
  display:inline-flex;align-items:center;justify-content:center;gap:4px}
.controls button:hover{background:var(--agg-head)}
/* 詳細度＝タップしやすい連結セグメントボタン（表示ボタンと同サイズに揃える） */
.segbar{display:inline-flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--panel)}
.controls .segbar .seg-btn{margin:0;border:none;border-right:1px solid var(--border);border-radius:0;
  background:transparent;color:var(--muted);font-size:12px;padding:5px 12px;line-height:1;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center}
.controls .segbar .seg-btn:last-child{border-right:none}
.controls .segbar .seg-btn:hover{background:var(--agg-head);color:var(--text)}
.controls .segbar .seg-btn.active{background:var(--root-bg);color:var(--root);font-weight:600}
.hint{font-size:10px;color:var(--muted);line-height:1.6;margin:0 0 14px}
.overview{border:1px dashed var(--agg-border);border-radius:10px;background:var(--panel);
  padding:11px 15px;margin-bottom:16px}
.overview .tag{font-size:9px;font-weight:700;letter-spacing:.08em;color:var(--muted)}
.overview p{margin:5px 0 0;font-size:12px}
.overview .placeholder{color:var(--muted);font-style:italic}
.legend{display:flex;flex-wrap:wrap;gap:13px;font-size:11px;color:var(--muted);margin-bottom:14px}
.legend .k{display:inline-flex;align-items:center;gap:5px}
.sw{width:10px;height:10px;border-radius:3px;display:inline-block}
.canvas{position:relative;padding:8px 4px 4px}
#overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:10}
.agg-row{display:flex;flex-wrap:wrap;gap:var(--sp-aggy) var(--sp-aggx);align-items:flex-start}
.aggregate{flex:1 1 350px;max-width:490px;min-width:0;border:2px solid var(--agg-border);border-radius:12px;
  background:var(--panel);overflow:hidden;box-shadow:var(--shadow)}
.aggregate,.card{transition:opacity .18s, filter .18s, box-shadow .18s}
.card{cursor:pointer}
.dimmed{opacity:.14;filter:grayscale(.7)}
.aggregate.focused{border-color:var(--hl);box-shadow:0 0 0 3px var(--hl-bg),var(--shadow)}
.card.focused{box-shadow:0 0 0 2px var(--hl),0 4px 14px rgba(0,0,0,.18);position:relative;z-index:6}
.agg-head{background:var(--agg-head);padding:9px 14px;border-bottom:1px solid var(--border);
  cursor:pointer;user-select:none;position:relative;padding-right:44px}
.agg-head .st{font-size:9px;letter-spacing:.08em;color:var(--muted)}
.agg-head .nm{font-size:15px;font-weight:700}
.agg-head .ds{font-size:11px;color:var(--muted);margin-top:1px}
.collapse-btn{position:absolute;right:10px;top:50%;transform:translateY(-50%);
  border:1px solid var(--border);background:var(--panel);color:var(--muted);
  border-radius:6px;font-size:11px;line-height:1;padding:4px 8px;cursor:pointer}
.collapse-btn:hover{color:var(--text)}
/* エンティティごとの行: 左=エンティティ / 右=そのエンティティが使う VO・enum。上端を揃えて真横に */
.agg-body{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:var(--sp-card) var(--sp-col);
  align-items:start;padding:var(--body-pad);overflow:hidden;max-height:3000px;opacity:1;
  transition:max-height .3s ease,opacity .22s ease,padding .3s ease}
/* 狭幅でも集約内は2列を維持（列間ギャップと余白だけ詰める） */
@media (max-width:560px){ .agg-body{gap:var(--sp-card) 8px;padding:12px 8px} }
.vo-cell{display:flex;flex-direction:column;gap:var(--sp-card);min-width:0}
.agg-body > .card{min-width:0}
.col-title{font-size:9px;font-weight:700;letter-spacing:.09em;color:var(--muted);margin:-2px 0 -6px 2px}
.agg-foot{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:2px 14px 14px;
  overflow:hidden;max-height:400px;opacity:1;
  transition:max-height .3s ease,opacity .22s ease,padding .3s ease}
.aggregate.collapsed .agg-body,.aggregate.collapsed .agg-foot{max-height:0;opacity:0;padding-top:0;padding-bottom:0}
.agg-summary{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:6px 18px;
  overflow:hidden;max-height:0;opacity:0;padding:0 14px;
  transition:max-height .3s ease,opacity .22s ease,padding .3s ease}
.aggregate.collapsed .agg-summary{max-height:400px;opacity:1;padding:9px 14px}
.aggregate.collapsed{flex:0 1 320px}
.sum-col{display:flex;flex-wrap:wrap;gap:5px;align-content:flex-start}
.nchip{font-size:10.5px;font-weight:600;border-radius:5px;padding:1px 8px;border:1px solid var(--border)}
.nc-root{color:var(--root);background:var(--root-bg);border-color:var(--root)}
.nc-entity{color:var(--entity);background:var(--entity-bg);border-color:var(--entity)}
.nc-vo{color:var(--vo);background:var(--vo-bg);border-color:var(--vo)}
.nc-enum{color:var(--enum);background:var(--enum-bg);border-color:var(--enum)}
/* 種別は「淡い塗り＋見出し前の色ドット」で示す。太い左カラーバーは縦縞のノイズになるため廃し、
   ルートだけ全周2px枠で際立たせる（＝集約の主役を一目で見分ける） */
.card{border:1px solid var(--border);border-radius:10px;
  background:var(--bg);padding:var(--card-pad);box-shadow:var(--shadow)}
.card .st{font-size:9px;letter-spacing:.06em;color:var(--muted);
  display:inline-flex;align-items:center;gap:5px}
.card .st::before{content:"";width:6px;height:6px;border-radius:2px;background:currentColor;flex:0 0 auto}
.card .nm{font-weight:700;font-size:13px}
.card .ds{font-size:10.5px;color:var(--muted);margin-top:1px}
.card.entity{background:var(--entity-bg)}
.card.entity .st{color:var(--entity)}
.card.root{border:2px solid var(--root-line);background:var(--root-bg)}
.card.root .st{color:var(--root)}
.card.vo{background:var(--vo-bg)}
.card.vo .st{color:var(--vo)}
.card.enum{background:var(--enum-bg)}
.card.enum .st{color:var(--enum)}
.card.repo{background:var(--repo-bg);flex:0 1 230px}
.card.repo .st{color:var(--repo)}
.card.svc{background:var(--svc-bg);flex:0 1 360px}
.card.svc .st{color:var(--svc)}
.card.shared-vo{background:var(--vo-bg);flex:0 1 250px}
.card.shared-vo .st{color:var(--vo)}
.props{margin-top:6px;display:flex;flex-direction:column;gap:2px}
.prop{display:flex;justify-content:space-between;gap:10px;padding:2px 6px;border-radius:5px;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}
.prop .pn{color:var(--text)}
.prop .pt{color:var(--muted);text-align:right}
.prop[data-ref]{cursor:pointer}
.prop[data-ref]:hover .pn{color:var(--text)}
.prop[data-ref]:hover .pt{text-decoration:underline dotted;color:var(--text)}
.inv{margin:6px 0 0;padding:0;list-style:none}
.inv li{font-size:10.5px;color:var(--muted);padding:1px 0 1px 15px;position:relative}
.inv li::before{content:"⚑";position:absolute;left:2px;color:var(--event)}
.badge{display:inline-block;font-size:9px;font-family:-apple-system,"Hiragino Sans",sans-serif;
  border:1px solid var(--border);border-radius:999px;padding:0 6px;margin-left:6px;
  color:var(--muted);background:var(--panel);vertical-align:1px}
.enum-vals{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.enum-vals span{font-size:10px;font-family:ui-monospace,Menlo,monospace;border:1px solid var(--border);
  border-radius:4px;padding:1px 6px;background:var(--panel)}
.event-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;border:1px solid var(--event);
  color:var(--event);background:var(--event-bg);border-radius:999px;padding:2px 10px;width:fit-content;cursor:default}
.band{flex-basis:100%;margin-top:var(--sp-band)}
.band > .band-title{font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--muted);margin-bottom:8px}
.band .band-cards{display:flex;flex-wrap:wrap;gap:14px}
.band.band-shared{border-top:1px dashed var(--agg-border);padding-top:14px}
/* ホバー強調: 対象そのもの=強リング(.hl)、関連=弱リング(.hl-weak)。背景の種別色は保つ */
.hl,.hl-weak,.hl-weak-in{border-radius:8px}
.card.hl{box-shadow:0 0 0 3px var(--hl),0 4px 14px rgba(0,0,0,.22);position:relative;z-index:6}
.prop.hl{box-shadow:0 0 0 2.5px var(--hl);background:var(--hl-bg);position:relative;z-index:6}
/* 参照している側（out）＝黄。外側グローでパネル背景側でも視認できるように */
.card.hl-weak{box-shadow:0 0 0 2px var(--hl),0 0 11px 0 var(--hl);position:relative;z-index:4}
.prop.hl-weak{box-shadow:0 0 0 2px var(--hl),0 0 9px 0 var(--hl);background:var(--hl-bg);position:relative;z-index:5}
/* 参照されている側（in）＝シアン。青系に埋もれないよう太め＋グロー。行(プロパティ)も同じ見やすさに */
.card.hl-weak-in{box-shadow:0 0 0 2.5px var(--hl2),0 0 14px 1px var(--hl2);position:relative;z-index:5}
.prop.hl-weak-in{box-shadow:0 0 0 2px var(--hl2),0 0 10px 0 var(--hl2);background:var(--hl2-bg);position:relative;z-index:5}
/* 詳細度トグル: props=説明と不変条件を隠す / names=プロパティも隠して名前だけ */
body.dt-props .card .ds,body.dt-props .inv{display:none}
body.dt-names .card .ds,body.dt-names .inv,body.dt-names .props,body.dt-names .enum-vals{display:none}
/* ---- 関連線（05 由来のリッチ表現・直線）---- */
#overlay path,#overlay polygon,#overlay circle{fill:none}
#overlay .rel-core{stroke-width:2;stroke-linecap:round}
#overlay .rel-glow{stroke-width:7;opacity:.30;stroke-linecap:round}
#overlay .rel-dot{fill:var(--rel-g1)}
#overlay .rel-arr{fill:var(--rel-g3);stroke:none}
#overlay .rel-chip{fill:var(--rel-chip-bg);stroke:var(--rel-chip-bd);stroke-width:1}
#overlay .rel-chip-t{fill:var(--rel-chip-fg);font:600 10px -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;letter-spacing:.02em}
#overlay .refline{stroke:var(--line-ref);stroke-width:1.2}
#overlay circle.refline{fill:var(--line-ref);stroke:none}
#overlay .svc-line{stroke:var(--line-svc);stroke-width:1.5;stroke-dasharray:6 7;opacity:.6}
#overlay .svc-tip{fill:var(--line-svc);opacity:.85}
/* ジャンプ時のフラッシュ: 速めに2回点滅 */
@keyframes flash{0%{box-shadow:0 0 0 3px var(--hl)}100%{box-shadow:0 0 0 3px transparent}}
.flash{animation:flash .3s ease 2}
footer{margin-top:32px;font-size:11px;color:var(--muted);border-top:1px solid var(--border);padding-top:10px}
`;

// ============================================================
// インライン JS（ES5 スタイル・テンプレートリテラル不使用: 外側の埋め込みと衝突させない）
// ============================================================

const JS = `
(function(){
  var NS = 'http://www.w3.org/2000/svg';
  var canvas = document.getElementById('canvas');
  var svg = document.getElementById('overlay');
  var DATA = JSON.parse(document.getElementById('model-data').textContent);

  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  /* 属性セレクタ用エスケープ（id に引用符等が含まれてもセレクタを壊さない） */
  function q(s){ return String(s).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"'); }
  function visible(el){
    if (!el || el.offsetParent === null) return false;
    if (el.closest && el.closest('.aggregate.collapsed') &&
        (el.closest('.agg-body') || el.closest('.agg-foot'))) return false;
    return true;
  }
  function findDef(name){
    return $all('[data-def="' + q(name) + '"]').filter(visible)[0] || null;
  }
  function cssVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function isDim(el){ return !!(el && el.closest && el.closest('.dimmed')); }

  /* ---- クリック=スポットライト固定: keep(C) を残し、それ以外を減光。リング(強調)は付けない ---- */
  var lockedCid = null;
  function applySpotlight(){
    var keepSet = null;
    if (lockedCid){
      keepSet = {};
      (DATA.keep[lockedCid] || [lockedCid]).forEach(function(c){ keepSet[c] = 1; });
    }
    $all('.card').forEach(function(card){
      var cid = card.getAttribute('data-cid');
      var inKeep = !keepSet || !!(cid && keepSet[cid]);
      card.classList.toggle('dimmed', !inKeep);
      /* クリックしたカード自身は黄リングで強調 */
      card.classList.toggle('focused', !!lockedCid && cid === lockedCid);
    });
    /* イベントチップはスポットライト中は一律減光（構成要素ではない） */
    $all('.event-chip').forEach(function(chip){ chip.classList.toggle('dimmed', !!lockedCid); });
  }

  /* ---- 集約の折りたたみ（小さなボタンだけでなくヘッダー全体で開閉できる） ---- */
  function toggleAggregate(agg){
    if (!agg) return;
    agg.classList.toggle('collapsed');
    var btn = agg.querySelector('.collapse-btn');
    if (btn) btn.textContent = agg.classList.contains('collapsed') ? '\\u25B8' : '\\u25BE';
    relayout();
  }
  /* ヘッダーに載せる（▾ ボタンもヘッダー内なのでボタンのクリックもここで拾える）。
     stopPropagation でスポットライトの選択解除ハンドラと二重発火しないようにする */
  $all('.agg-head').forEach(function(head){
    head.addEventListener('click', function(e){
      e.stopPropagation();
      toggleAggregate(head.closest('.aggregate'));
    });
  });
  function setAllCollapsed(state){
    $all('.aggregate').forEach(function(agg){
      agg.classList.toggle('collapsed', state);
      var btn = agg.querySelector('.collapse-btn');
      if (btn) btn.textContent = state ? '\\u25B8' : '\\u25BE';
    });
    relayout();
  }
  document.getElementById('btn-collapse-all').addEventListener('click', function(){ setAllCollapsed(true); });
  document.getElementById('btn-expand-all').addEventListener('click', function(){ setAllCollapsed(false); });
  document.addEventListener('transitionend', function(e){
    var c = e.target.classList;
    if (c && (c.contains('agg-body') || c.contains('agg-foot') || c.contains('agg-summary'))) relayout();
  });

  /* ---- 詳細度（セグメントボタン） ---- */
  function setDetail(val){
    document.body.classList.remove('dt-full','dt-props','dt-names');
    if (val !== 'full') document.body.classList.add('dt-' + val);
    $all('.segbar .seg-btn').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-dt') === val); });
  }
  /* 初期状態は active ボタンに合わせる（body の初期クラスに依存しない＝Artifact 化しても既定が保たれる） */
  (function(){
    var active = document.querySelector('.segbar .seg-btn.active');
    setDetail(active ? active.getAttribute('data-dt') : 'full');
  })();
  $all('.segbar .seg-btn').forEach(function(b){
    b.addEventListener('click', function(){ setDetail(b.getAttribute('data-dt')); relayout(); });
  });

  /* ---- テーマ切替 ---- */
  document.getElementById('btn-theme').addEventListener('click', function(){
    var rootEl = document.documentElement;
    var cur = rootEl.getAttribute('data-theme');
    var isDark = cur ? cur === 'dark'
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    rootEl.setAttribute('data-theme', isDark ? 'light' : 'dark');
    relayout();
  });

  /* ---- ホバー強調: 対象を最強(.hl)、関連を弱リング。参照の向きで色分け:
       参照している側（自分が参照）=.hl-weak（黄）／参照されている側（自分を参照）=.hl-weak-in（別色） ---- */
  function clearHl(){
    $all('.hl, .hl-weak, .hl-weak-in').forEach(function(el){
      el.classList.remove('hl'); el.classList.remove('hl-weak'); el.classList.remove('hl-weak-in');
    });
  }
  function ringWeak(el, cls){ if (el && visible(el)) el.classList.add(cls || 'hl-weak'); }
  function applyHl(el){
    if (el.classList && el.classList.contains('prop')){
      /* プロパティ行 → 行自身を最強、その行が参照する型の定義カードを弱（out=黄） */
      el.classList.add('hl');
      var rn = el.getAttribute('data-ref');
      if (rn) ringWeak(findDef(rn), 'hl-weak');
      return;
    }
    var cid = el.getAttribute('data-cid');
    if (!cid) return;
    el.classList.add('hl'); /* ホバー対象そのもの＝最強 */
    (DATA.ringOut[cid] || []).forEach(function(c){ /* 自分が参照している先＝黄 */
      $all('.card[data-cid="' + q(c) + '"]').forEach(function(x){ ringWeak(x, 'hl-weak'); });
    });
    (DATA.ringIn[cid] || []).forEach(function(c){ /* 自分を ID 参照している側＝別色 */
      $all('.card[data-cid="' + q(c) + '"]').forEach(function(x){ ringWeak(x, 'hl-weak-in'); });
    });
    /* フィールドとして C を使っている行＝自分を参照している側なので別色（repo の manages 行・自分の中は除外） */
    var name = el.getAttribute('data-def') || cid;
    $all('.prop[data-ref="' + q(name) + '"]').forEach(function(row){
      if (row.closest('.card.repo')) return;
      if (el.contains && el.contains(row)) return;
      ringWeak(row, 'hl-weak-in');
    });
  }
  document.addEventListener('mouseover', function(e){
    var el = e.target.closest ? e.target.closest('[data-cid],.prop[data-ref]') : null;
    clearHl();
    if (el) applyHl(el);
  });
  /* クリック/タップ = keep(C) を残して他を減光（固定）。再クリックor余白で解除。
     型名リンク=ジャンプ / ▾=折りたたみ / コントロール類 は各ハンドラに委ねる */
  document.addEventListener('click', function(e){
    if (!e.target.closest) return;
    /* 型参照のあるプロパティ行（名前・型どちらも）はジャンプに委ねる */
    if (e.target.closest('.controls, .collapse-btn, button, a, .prop[data-ref]')) return;
    var card = e.target.closest('.card');
    var cid = card && card.getAttribute('data-cid');
    if (!cid){
      if (lockedCid){ lockedCid = null; applySpotlight(); relayout(); }
      return;
    }
    lockedCid = (lockedCid === cid) ? null : cid;
    clearHl();                 /* クリック時はリングを消してスポットライトに切替 */
    applySpotlight(); relayout();
  });

  /* ---- プロパティ行クリックで定義へジャンプ（名前・型どちらのクリックでも同じ） ---- */
  document.addEventListener('click', function(e){
    var row = e.target.closest ? e.target.closest('.prop[data-ref]') : null;
    if (!row) return;
    var name = row.getAttribute('data-ref');
    var target = findDef(name) || $all('[data-def="' + q(name) + '"]')[0];
    if (!target || target.contains(row)) return;
    var collapsedAgg = target.closest('.aggregate.collapsed');
    if (collapsedAgg){
      collapsedAgg.classList.remove('collapsed');
      var btn = collapsedAgg.querySelector('.collapse-btn');
      if (btn) btn.textContent = '\\u25BE';
    }
    setTimeout(function(){
      relayout();
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.remove('flash');
      void target.offsetWidth;
      target.classList.add('flash');
    }, collapsedAgg ? 330 : 0);
  });

  /* ---- 座標・描画ユーティリティ ---- */
  function rectOf(el){
    var c = canvas.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    return { l: r.left - c.left, t: r.top - c.top, r: r.right - c.left, b: r.bottom - c.top,
      cx: (r.left + r.right) / 2 - c.left, cy: (r.top + r.bottom) / 2 - c.top };
  }
  /* SVG 要素生成ヘルパー */
  function elNS(tag, attrs){
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  /* 端点算出: 相手を向いた辺の中点どうしを結ぶ「単一の直線」。極力まっすぐにする。
     プロパティ行は横方向に出る（行は水平なので左右から引くのが自然） */
  function straightEnds(aEl, bEl){
    var a = rectOf(aEl), b = rectOf(bEl);
    var dx = b.cx - a.cx, dy = b.cy - a.cy;
    var horiz = Math.abs(dx) >= Math.abs(dy);
    var aIsRow = aEl.classList && aEl.classList.contains('prop');
    var x1, y1, x2, y2;
    if (aIsRow || horiz){ x1 = dx >= 0 ? a.r : a.l; y1 = a.cy; }
    else { y1 = dy >= 0 ? a.b : a.t; x1 = a.cx; }
    if (horiz){ x2 = dx >= 0 ? b.l : b.r; y2 = b.cy; }
    else { y2 = dy >= 0 ? b.t : b.b; x2 = b.cx; }
    return { x1: x1, y1: y1, x2: x2, y2: y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2,
      d: 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2, ang: Math.atan2(y2 - y1, x2 - x1) };
  }
  function arrowPoly(x, y, ang, size, cls){
    var a1 = ang + 2.65, a2 = ang - 2.65;
    var pts = x + ',' + y + ' ' +
      (x + Math.cos(a1) * size) + ',' + (y + Math.sin(a1) * size) + ' ' +
      (x + Math.cos(a2) * size) + ',' + (y + Math.sin(a2) * size);
    return elNS('polygon', { points: pts, 'class': cls });
  }
  var gradSeq = 0;
  /* 集約間 ID 参照: グロー＋グラデーション芯＋起点ドット＋矢頭＋チップ状ラベル（05 由来） */
  function drawRel(ep, defsEl){
    var g = elNS('g', { 'class': 'rel-wire' });
    var gid = 'relg-' + (gradSeq++);
    var grad = elNS('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse',
      x1: ep.x1, y1: ep.y1, x2: ep.x2, y2: ep.y2 });
    grad.appendChild(elNS('stop', { offset: '0%', 'stop-color': cssVar('--rel-g1') }));
    grad.appendChild(elNS('stop', { offset: '55%', 'stop-color': cssVar('--rel-g2') }));
    grad.appendChild(elNS('stop', { offset: '100%', 'stop-color': cssVar('--rel-g3') }));
    defsEl.appendChild(grad);
    g.appendChild(elNS('path', { d: ep.d, 'class': 'rel-glow', stroke: 'url(#' + gid + ')', filter: 'url(#soft)' }));
    g.appendChild(elNS('path', { d: ep.d, 'class': 'rel-core', stroke: 'url(#' + gid + ')' }));
    g.appendChild(elNS('circle', { cx: ep.x1, cy: ep.y1, r: 2.7, 'class': 'rel-dot' }));
    g.appendChild(arrowPoly(ep.x2, ep.y2, ep.ang, 8.5, 'rel-arr'));
    svg.appendChild(g);
  }
  function drawChip(x, y, text){
    var g = elNS('g', { 'class': 'rel-label' });
    var t = elNS('text', { 'text-anchor': 'middle', 'class': 'rel-chip-t' });
    t.textContent = text;
    g.appendChild(t); svg.appendChild(g);
    var tw; try { tw = t.getComputedTextLength(); } catch (e) { tw = text.length * 7; }
    var w = tw + 18, h = 18;
    var rect = elNS('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: h / 2, 'class': 'rel-chip' });
    g.insertBefore(rect, t);
    t.setAttribute('x', x); t.setAttribute('y', y + 3.4);
  }

  /* ---- 再描画（線はすべて単一の直線）---- */
  function relayout(){
    var W = canvas.scrollWidth, H = canvas.scrollHeight;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var defs = document.createElementNS(NS, 'defs');
    var f = elNS('filter', { id: 'soft', x: '-40%', y: '-40%', width: '180%', height: '180%' });
    f.appendChild(elNS('feGaussianBlur', { stdDeviation: '3' }));
    defs.appendChild(f);
    svg.appendChild(defs);
    gradSeq = 0;

    /* 1. 集約内参照 + 共有語彙帯への参照（細線＋端点ドット・最背面） */
    $all('.prop[data-ref]').forEach(function(row){
      if (!visible(row) || isDim(row)) return;
      var name = row.getAttribute('data-ref');
      var target = findDef(name);
      if (!target || target.contains(row) || isDim(target)) return;
      var sAgg = row.closest('.aggregate');
      var tAgg = target.closest('.aggregate');
      var toShared = !!target.closest('.band-shared');
      if (!toShared && sAgg !== tAgg) return; /* 集約跨ぎは ID 参照線とバッジで表現 */
      var ep = straightEnds(row, target);
      svg.appendChild(elNS('path', { d: ep.d, 'class': 'refline' }));
      svg.appendChild(elNS('circle', { cx: ep.x2, cy: ep.y2, r: 1.9, 'class': 'refline' }));
    });

    /* 2. ドメインサービス → 関連集約（破線＋端点ドット） */
    DATA.svcLinks.forEach(function(link){
      var svcEl = document.getElementById(link.svc);
      if (!svcEl || !visible(svcEl) || isDim(svcEl)) return;
      link.aggs.forEach(function(id){
        var agg = document.getElementById(id);
        if (!agg || !visible(agg) || isDim(agg)) return;
        var ep = straightEnds(svcEl, agg);
        svg.appendChild(elNS('path', { d: ep.d, 'class': 'svc-line' }));
        svg.appendChild(elNS('circle', { cx: ep.x1, cy: ep.y1, r: 2.2, 'class': 'svc-tip' }));
        svg.appendChild(elNS('circle', { cx: ep.x2, cy: ep.y2, r: 3, 'class': 'svc-tip' }));
      });
    });

    /* 3. 集約間 ID 参照（最前面・リッチ表現） */
    DATA.relations.forEach(function(rel){
      var fromAgg = document.getElementById(rel.from);
      var toAgg = document.getElementById(rel.to);
      if (!fromAgg || !toAgg) return;
      var srcRow = document.querySelector('[data-rel="' + rel.i + '"]');
      var src = (srcRow && visible(srcRow)) ? srcRow : fromAgg;
      /* 着地先: 参照される集約のルートエンティティカード。折りたたみ時のみ集約ヘッダーへフォールバック */
      var dstDef = rel.toDef ? findDef(rel.toDef) : null;
      var dst;
      if (dstDef && visible(dstDef)) dst = dstDef;
      else {
        var dstHead = document.getElementById(rel.to.replace('agg-', 'agg-head-'));
        dst = (dstHead && visible(dstHead)) ? dstHead : toAgg;
      }
      /* フォーカス（カード単位）で端点カードが淡色化されていれば描かない */
      if (isDim(src) || isDim(dst)) return;
      var ep = straightEnds(src, dst);
      drawRel(ep, defs);
      if (rel.label) drawChip(ep.mx, ep.my, rel.label);
    });
  }

  window.addEventListener('resize', relayout);
  window.addEventListener('load', relayout);
  /* prefers-color-scheme 変化での再描画。古い Safari は MediaQueryList.addEventListener 非対応なので退避 */
  if (window.matchMedia){
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', relayout);
    else if (mq.addListener) mq.addListener(relayout);
  }
  relayout();
})();
`;

// ============================================================
// HTML 組み立て
// ============================================================

const ctx = model.boundedContext;
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ctx.name)} — ドメインモデル図</title>
<style>${CSS}</style>
</head>
<body class="dt-props">
<main>
<div class="topbar">
<header>
<h1>${esc(ctx.name)} <span class="ctx">BOUNDED CONTEXT</span></h1>
<p class="subtitle">${esc(ctx.description || '')}${ctx.description ? ' ｜ ' : ''}source: ${esc(sourceLabel)} ｜ 生成: ${esc(generatedAt)}</p>
<div class="chips">${chips}</div>
</header>

<div class="controls">
<fieldset>
<legend>詳細度</legend>
<div class="segbar" role="group" aria-label="詳細度">
<button type="button" class="seg-btn" data-dt="full">フル</button>
<button type="button" class="seg-btn active" data-dt="props">プロパティまで</button>
<button type="button" class="seg-btn" data-dt="names">名前のみ</button>
</div>
</fieldset>
<fieldset>
<legend>表示</legend>
<button type="button" id="btn-collapse-all">全て折りたたむ</button>
<button type="button" id="btn-expand-all">全て展開</button>
<button type="button" id="btn-theme">🌓 テーマ切替</button>
</fieldset>
</div>
</div>
<p class="hint">カードにホバー = 関連を強調（対象を強く／黄 = 参照している先・シアン = 参照してくる側）／ カードをクリック = 関連だけ残して固定（他を淡色化・再クリックか余白で解除）／ ▾ = 折りたたみ ／ プロパティ（名前・型）クリック = 定義へジャンプ</p>

${hasOverview
  ? `<div class="overview">
<span class="tag">OVERVIEW ─ モデル概説</span>
${M_START}
${overviewInner}
${M_END}
</div>`
  : `${M_START}${M_END}`}

<div class="legend">
<span class="k"><span class="sw" style="background:var(--root)"></span>集約ルート</span>
<span class="k"><span class="sw" style="background:var(--entity)"></span>エンティティ</span>
<span class="k"><span class="sw" style="background:var(--vo)"></span>バリューオブジェクト</span>
<span class="k"><span class="sw" style="background:var(--enum)"></span>列挙型</span>
<span class="k"><span class="sw" style="background:var(--repo)"></span>リポジトリ</span>
<span class="k"><span class="sw" style="background:var(--event)"></span>ドメインイベント</span>
<span class="k"><span class="sw" style="background:var(--svc)"></span>ドメインサービス</span>
<span class="k"><span class="sw" style="background:linear-gradient(90deg,var(--rel-g1),var(--rel-g2),var(--rel-g3))"></span>集約間 ID 参照</span></div>

<div class="canvas" id="canvas">
<svg id="overlay"></svg>
<div class="agg-row">
${arr(model.aggregates).map(aggregateSection).join('\n')}
${sharedBand()}
${servicesBand()}
</div>
</div>

<footer>
このファイルは diagramming-domain-models スキルが <code>${esc(basename(file))}</code> から生成した図です。
モデルの変更は JSON を編集して再レンダリングしてください（HTML の直接編集は OVERVIEW 枠のみ）。
</footer>
</main>
<script type="application/json" id="model-data">${jsonForScript(embedded)}</script>
<script>${JS}</script>
</body>
</html>
`;

writeFileSync(outPath, html);
console.log(`render.mjs: 生成しました → ${outPath}`);
