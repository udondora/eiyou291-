/* 回帰テスト（Playwright）
 * 使い方:
 *   npm i playwright-core   # または playwright
 *   node tests/regression.mjs [path-to-html]
 * 既定では同階層の最新HTMLを file:// で開く。CHROME 環境変数で Chrome のパスを指定可。
 *
 * 機能が多く「組み合わせ」でバグが出やすいので、下記の重点シナリオを自動確認する。
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
// 既定対象はルートのアプリ本体 index.html（v41でルート＝アプリに統一）。
// 互換のため eiyou291_v*.html が残っていればそれも対象に取れる。
function latest() {
  if (existsSync(resolve(root, 'index.html'))) return resolve(root, 'index.html');
  const f = readdirSync(root).filter(n => /^eiyou291_v\d+\.html$/.test(n))
    .sort((a, b) => (+a.match(/\d+/)[0]) - (+b.match(/\d+/)[0]));
  return f.length ? resolve(root, f[f.length - 1]) : null;
}
const target = process.argv[2] ? resolve(process.argv[2]) : latest();
if (!target || !existsSync(target)) { console.error('target html not found:', target); process.exit(2); }
const fileUrl = 'file://' + target;
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const results = [];
const ok = (name, cond, extra) => { results.push({ name, pass: !!cond, extra }); };

const b = await chromium.launch({ executablePath: exe });
const ctx = await b.newContext({ viewport: { width: 430, height: 1100 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });

const pick = (id) => page.evaluate(i => { const e = document.getElementById(i); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }, id);
const clickChoice = (qid, n) => page.evaluate(([q, i]) => { document.getElementById(q).querySelectorAll('.choices label.choice')[i - 1].click(); }, [qid, n]);
const visCount = () => page.evaluate(() => [...document.querySelectorAll('article.q')].filter(a => a.offsetParent !== null).length);
const txt = (id) => page.evaluate(i => (document.getElementById(i) || {}).textContent, id);
const openTools = () => page.evaluate(() => { const t = document.getElementById('tools-acc'); if (t) t.open = true; });

await page.goto(fileUrl, { waitUntil: 'load' });
await page.waitForTimeout(400);
// 総問数は動的に取得（午後追加で増えるため固定値にしない）
const TOTAL_Q = await page.evaluate(() => document.querySelectorAll('article.q').length);

// 0) 外部CSS/JSが効いている（トラッカー表示＝JS実行、見出し色＝CSS適用）
ok('css+js loaded (appbar visible)', await page.isVisible('#appbar'));

// 1) 解答と永続化
await pick('q40-1-4'); // correct
await pick(await page.evaluate(() => document.getElementById('q40-2').querySelector('input.ans.wrong').id)); // wrong
ok('answer counts', (await txt('st-ok')) === '1' && (await txt('st-ng')) === '1' && (await txt('prog-done')) === '2');

// 2) 選択肢トグル解除で数が戻る
await clickChoice('q40-1', 4); // re-tap selected correct -> toggle off
await page.waitForTimeout(120);
ok('toggle off reverts count', (await txt('st-ok')) === '0' && (await txt('prog-done')) === '1');
await pick('q40-1-4'); // restore

// 3) 検索 + 不正解だけ
await page.fill('#q-search', 'インスリン'); await page.waitForTimeout(250);
const searchN = await visCount();
await page.click('#mode-wrong'); await page.waitForTimeout(120);
const searchWrongN = await visCount();
ok('search + wrong combine', searchN > 0 && searchWrongN <= searchN, { searchN, searchWrongN });
await page.click('#mode-all'); await page.fill('#q-search', ''); await page.waitForTimeout(150);
ok('reset shows all (dynamic total)', (await visCount()) === TOTAL_Q, { TOTAL_Q });

// 4) 科目フィルタ + 模試（対象外が出ない）
await page.evaluate(() => document.getElementById('filt').open = true);
await page.evaluate(() => document.getElementById('f-cat1').click()); await page.waitForTimeout(120);
await openTools();
await page.click('#btn-test'); await page.waitForTimeout(50); await page.click('.tcount[data-n="10"]'); await page.waitForTimeout(150);
const testAllCat1 = await page.evaluate(() => [...document.querySelectorAll('article.q.in-test')].every(a => a.classList.contains('cat1')));
ok('test pool respects subject filter', testAllCat1);

// 5) 模試中にキーボードで解答しても通常進捗を汚さない（採点までstateは変わらない）
const doneBeforeKey = await txt('prog-done');
await page.evaluate(() => document.querySelector('article.q.in-test').scrollIntoView({ block: 'start' }));
await page.waitForTimeout(300);
await page.keyboard.press('1'); await page.waitForTimeout(80);
ok('test keyboard does not pollute progress', (await txt('prog-done')) === doneBeforeKey, { doneBeforeKey, after: await txt('prog-done') });
// 採点
await page.click('#t-grade'); await page.waitForTimeout(150);
ok('grade reveals result', /結果/.test(await page.evaluate(() => (document.querySelector('#test-bar .tg') || {}).textContent || '')));
// 採点後キーで進捗が変わらない
const doneAfterGrade = await txt('prog-done');
await page.keyboard.press('2'); await page.waitForTimeout(80);
ok('keys disabled after grading', (await txt('prog-done')) === doneAfterGrade);
await page.click('#t-quit2'); await page.waitForTimeout(120);
// 終了直後はフィルタ(cat1=48問)が残った状態に戻る
ok('exit test returns to filtered list (cat1=48)', (await visCount()) === 48, { n: await visCount() });
// フィルタ解除で全件に戻る
await page.evaluate(() => document.getElementById('f-catall').click()); await page.waitForTimeout(120);
ok('clear filter shows all (dynamic total)', (await visCount()) === TOTAL_Q, { TOTAL_Q });

// 6) 集中モード + シャッフルで崩れない（シャッフルで集中終了）
await page.click('#btn-focus'); await page.waitForTimeout(150);
const inFocus = await page.evaluate(() => document.body.classList.contains('focus-mode'));
await openTools();
await page.click('#btn-shuffle'); await page.waitForTimeout(120);
ok('shuffle exits focus (no stale list)', inFocus && !(await page.evaluate(() => document.body.classList.contains('focus-mode'))));
await page.click('#btn-seq'); await page.waitForTimeout(80);

// 7) 永続化（リロード後も進捗・選択が残る）
await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
ok('progress persists after reload', (await txt('prog-done')) !== '0' && (await page.evaluate(() => !!document.querySelector('#q40-1-4:checked'))));

// 8) バックアップ書き出し→クリア→読み込みで復元
const ctx2 = await b.newContext({ viewport: { width: 430, height: 1100 }, acceptDownloads: true });
const p2 = await ctx2.newPage();
p2.on('dialog', d => d.accept());
await p2.goto(fileUrl, { waitUntil: 'load' }); await p2.waitForTimeout(300);
await p2.evaluate(() => { const e = document.getElementById('q40-1-4'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); });
await p2.evaluate(() => document.getElementById('tools-acc').open = true);
const [dl] = await Promise.all([p2.waitForEvent('download'), p2.click('#btn-export')]);
const path = await dl.path();
await p2.evaluate(() => localStorage.clear());
await p2.reload({ waitUntil: 'load' }); await p2.waitForTimeout(300);
await p2.evaluate(() => document.getElementById('tools-acc').open = true);
await p2.setInputFiles('#import-file', path);
await p2.waitForTimeout(800);
await p2.reload({ waitUntil: 'load' }); await p2.waitForTimeout(400);
ok('backup export/import roundtrip', (await p2.evaluate(() => document.getElementById('prog-done').textContent)) !== '0');
await ctx2.close();

// 9) _sel 残留バグ: 通常学習で選んだ選択肢が、模試開始後に「再タップ＝解除」と誤判定されない
{
  const ctx3 = await b.newContext({ viewport: { width: 430, height: 1100 } });
  const p3 = await ctx3.newPage();
  p3.on('dialog', d => d.accept());
  await p3.goto(fileUrl, { waitUntil: 'load' }); await p3.waitForTimeout(300);
  // 通常学習で q40-3 の選択肢3を選ぶ（a._sel に残る）
  await p3.evaluate(() => document.getElementById('q40-3').querySelectorAll('.choices label.choice')[2].click());
  await p3.waitForTimeout(80);
  // 模試（全問）を開始
  await p3.evaluate(() => document.getElementById('tools-acc').open = true);
  await p3.click('#btn-test'); await p3.waitForTimeout(50);
  await p3.click('.tcount[data-n="0"]'); await p3.waitForTimeout(200);
  const remainBefore = await p3.evaluate(() => +document.getElementById('t-remain').textContent);
  // 模試中に q40-3 の選択肢3をタップ → 「選択」されるべき（解除されない）
  await p3.evaluate(() => document.getElementById('q40-3').querySelectorAll('.choices label.choice')[2].click());
  await p3.waitForTimeout(120);
  const remainAfter = await p3.evaluate(() => +document.getElementById('t-remain').textContent);
  const selected = await p3.evaluate(() => !!document.querySelector('#q40-3 input.ans:checked'));
  ok('test start clears _sel (re-tap selects, not toggles off)', selected && remainAfter === remainBefore - 1, { remainBefore, remainAfter, selected });
  await ctx3.close();
}

// 10) 模試の未回答は「不正解」として進捗（復習対象）に残る
{
  const ctx4 = await b.newContext({ viewport: { width: 430, height: 1100 } });
  const p4 = await ctx4.newPage();
  p4.on('dialog', d => d.accept());
  await p4.goto(fileUrl, { waitUntil: 'load' }); await p4.waitForTimeout(300);
  await p4.evaluate(() => document.getElementById('tools-acc').open = true);
  await p4.click('#btn-test'); await p4.waitForTimeout(50);
  await p4.click('.tcount[data-n="10"]'); await p4.waitForTimeout(200);
  // 1問だけ正解して、残り9問は未回答のまま採点
  const firstId = await p4.evaluate(() => {
    const a = document.querySelector('article.q.in-test');
    const ce = a.querySelector('input.ans.correct'); ce.checked = true; ce.dispatchEvent(new Event('change', { bubbles: true }));
    return a.id;
  });
  await p4.waitForTimeout(60);
  await p4.click('#t-grade'); await p4.waitForTimeout(150);
  const ng = await p4.evaluate(() => +document.getElementById('st-ng').textContent);
  ok('unanswered test questions become wrong (reviewable)', ng >= 9, { ng });
  await ctx4.close();
}

// 11) 選択肢シャッフル：並びは変わるが、正解判定（class）と番号→解説の対応は壊れない
{
  const ctx5 = await b.newContext({ viewport: { width: 430, height: 1100 } });
  const p5 = await ctx5.newPage();
  await p5.goto(fileUrl, { waitUntil: 'load' }); await p5.waitForTimeout(300);
  const before = await p5.evaluate(() => [...document.querySelectorAll('#q40-1 .choices label.choice .num')].map(n => n.textContent.trim()).join(''));
  await p5.click('#sh-c'); await p5.waitForTimeout(150);
  const after = await p5.evaluate(() => [...document.querySelectorAll('#q40-1 .choices label.choice .num')].map(n => n.textContent.trim()).join(''));
  // 全291問のうち1問でも見た目順が変われば成功（全問そのままの確率は極小）
  const anyChanged = await p5.evaluate(() => [...document.querySelectorAll('article.q')].some(a => {
    const nums = [...a.querySelectorAll('.choices label.choice .num')].map(n => +n.textContent.trim());
    return nums.some((v, i) => v !== i + 1);
  }));
  ok('choice shuffle reorders options', anyChanged, { before, after });
  // 正解の選択肢を選ぶと「正解」になる（class基準なので並び替えても壊れない）
  await p5.evaluate(() => { const e = document.querySelector('#q40-1 input.ans.correct'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await p5.waitForTimeout(120);
  ok('correct still correct after choice shuffle', (await p5.evaluate(() => document.getElementById('st-ok').textContent)) === '1');
  // シャッフル設定が保存され、リロード後も維持される
  await p5.reload({ waitUntil: 'load' }); await p5.waitForTimeout(400);
  ok('choice shuffle persists after reload', await p5.evaluate(() => document.getElementById('sh-c').classList.contains('on')));
  await ctx5.close();
}

// 12) 選択肢シャッフルOFFで元の順（1,2,3,4,5）に戻る
{
  const ctx6 = await b.newContext({ viewport: { width: 430, height: 1100 } });
  const p6 = await ctx6.newPage();
  await p6.goto(fileUrl, { waitUntil: 'load' }); await p6.waitForTimeout(300);
  await p6.click('#sh-c'); await p6.waitForTimeout(150);       // ON
  await p6.click('#sh-c'); await p6.waitForTimeout(150);       // OFF
  const restored = await p6.evaluate(() => [...document.querySelectorAll('article.q')].every(a => {
    const nums = [...a.querySelectorAll('.choices label.choice .num')].map(n => +n.textContent.trim());
    return nums.every((v, i) => v === i + 1);
  }));
  ok('choice shuffle OFF restores original order', restored);
  await ctx6.close();
}

// 13) 範囲表示 ?range=3-5：出題順3〜5問目だけ表示、解除で全件
{
  const ctx7 = await b.newContext({ viewport: { width: 430, height: 1100 } });
  const p7 = await ctx7.newPage();
  await p7.goto(fileUrl + '?range=3-5', { waitUntil: 'load' }); await p7.waitForTimeout(400);
  const visN = await p7.evaluate(() => [...document.querySelectorAll('article.q')].filter(a => a.offsetParent !== null).length);
  const visIds = await p7.evaluate(() => [...document.querySelectorAll('article.q')].filter(a => a.offsetParent !== null).map(a => a.id));
  ok('range shows only positions 3-5', visN === 3 && visIds.join(',') === 'q40-3,q40-4,q40-5', { visN, visIds });
  const barShown = await p7.evaluate(() => { const e = document.getElementById('range-bar'); return e && e.style.display !== 'none'; });
  ok('range bar visible', barShown);
  // 解除で全291件
  await p7.click('#range-clear'); await p7.waitForTimeout(200);
  ok('range clear shows all', (await p7.evaluate(() => [...document.querySelectorAll('article.q')].filter(a => a.offsetParent !== null).length)) === TOTAL_Q);
  await ctx7.close();
}

// 14) 範囲表示は検索と合成される（範囲内かつ一致のみ）
{
  const ctx8 = await b.newContext({ viewport: { width: 430, height: 1100 } });
  const p8 = await ctx8.newPage();
  await p8.goto(fileUrl + '?range=1-50', { waitUntil: 'load' }); await p8.waitForTimeout(400);
  const beforeN = await p8.evaluate(() => [...document.querySelectorAll('article.q')].filter(a => a.offsetParent !== null).length);
  await p8.fill('#q-search', 'インスリン'); await p8.waitForTimeout(300);
  const afterN = await p8.evaluate(() => [...document.querySelectorAll('article.q')].filter(a => a.offsetParent !== null).length);
  ok('range composes with search', beforeN === 50 && afterN <= beforeN, { beforeN, afterN });
  await ctx8.close();
}

ok('no console/page errors', errors.length === 0, errors);

await b.close();

let failed = 0;
for (const r of results) { if (!r.pass) failed++; console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.extra && !r.pass ? '  ' + JSON.stringify(r.extra) : '')); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
