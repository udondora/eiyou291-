// ===== グローバルエラーログ（不具合の早期発見用） =====
window.addEventListener('error', function(event){
  console.error('[APP ERROR]', { message:event.message, source:event.filename, line:event.lineno, col:event.colno, error:event.error });
});
window.addEventListener('unhandledrejection', function(event){
  console.error('[PROMISE ERROR]', event.reason);
});

(function(){
  "use strict";
  var APP_VERSION='v75'; // 版数はここだけ更新すればよい（ファイル名は固定）
  // ===== localStorage 安全ラッパー（失敗しても落とさず警告を出す） =====
  function safeLoad(key, fallback){
    try{ var raw=localStorage.getItem(key); return raw!=null ? JSON.parse(raw) : fallback; }
    catch(e){ console.warn('localStorage load failed:', key, e); return fallback; }
  }
  function safeSave(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }
    catch(e){ console.warn('localStorage save failed:', key, e); }
  }
  function safeGetRaw(key, fallback){
    try{ var v=localStorage.getItem(key); return v==null ? fallback : v; }
    catch(e){ console.warn('localStorage read failed:', key, e); return fallback; }
  }
  function safeSetRaw(key, value){
    try{ localStorage.setItem(key, String(value)); }
    catch(e){ console.warn('localStorage write failed:', key, e); }
  }
  function isObj(x){ return x && typeof x==='object' && !Array.isArray(x); }

  var KEY='eiyou291_v26_progress';
  function save(){ safeSave(KEY,S.progress); }
  function $(id){ return document.getElementById(id); }
  function setText(id,v){ var e=$(id); if(e) e.textContent=v; }

  // ★ブックマーク・続きから・文字サイズのキー
  var STAR_KEY='eiyou291_v29_stars', LAST_KEY='eiyou291_v29_last', FS_KEY='eiyou291_v27_fs';
  var SHUF_KEY='eiyou291_v44_shuf'; // シャッフル設定の保持（問題順 q / 選択肢 c）
  // ===== アプリの状態を1か所に集約（v40） =====
  var S = {
    progress: (function(){ var v=safeLoad(KEY,{}); return isObj(v)?v:{}; })(),
    stars:    (function(){ var v=safeLoad(STAR_KEY,{}); return isObj(v)?v:{}; })(),
    lastSeen: safeGetRaw(LAST_KEY,null) || null,
    mode:  'all',
    focus: { on:false, list:[], idx:0 },
    test:  { on:false, graded:false, list:[], answers:{} },
    cmapOpen: false,
    shufQ: false,   // 問題順シャッフル ON/OFF
    shufC: false,   // 選択肢シャッフル ON/OFF
    _qorder: null,  // 問題順シャッフルの固定された並び（再適用で崩れないよう保持）
    range: null     // 範囲表示 {from,to}（?range=40-85、出題順の通し番号。共有用）
  };
  function saveStars(){ safeSave(STAR_KEY,S.stars); }

  // ===== 午後問題をデータ(pm.js)から描画（既存の午前HTMLには触れない） =====
  // .qwrap に <article class="q"> として注入してから arts を集めるので、検索・絞込・
  // トラッカー・○✕マップなど既存機能がそのまま適用される。
  (function renderPM(){
    var data = window.EIYOU_PM; if(!data || !data.length) return;
    var wrap = document.querySelector('.qwrap'); if(!wrap) return;
    var subName = { cat6:'栄養教育論', cat7:'臨床栄養学', cat8:'公衆栄養学', cat9:'給食経営管理論', cat10:'応用力試験' };
    var diffName = { easy:'基礎', medium:'標準', hard:'難問' };
    function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function buildFig(f){
      if(!f||!f.type) return '';
      var MK='<span class="fig-mark">✓ 正解</span>';
      var h='';
      if(f.title) h+='<div class="fig-cap">📊 '+esc(f.title)+'</div>';
      if(f.type==='flow'){
        h+='<div class="fig-flow">';
        (f.steps||[]).forEach(function(s,i){
          if(i) h+='<div class="fig-arrow">▼</div>';
          h+='<div class="fig-step'+(s.hi?' hi':'')+'">'+(s.tag?'<span class="fig-tag">'+esc(s.tag)+'</span>':'')+'<span class="fig-stext">'+esc(s.t)+'</span>'+(s.hi?MK:'')+(s.note?'<span class="fig-note">'+esc(s.note)+'</span>':'')+'</div>';
        });
        h+='</div>';
      } else if(f.type==='levels'){
        h+='<div class="fig-levels">';
        (f.items||[]).forEach(function(s,i){
          h+='<div class="fig-level'+(s.hi?' hi':'')+'"><span class="fig-lvnum">'+(i+1)+'</span><span class="fig-stext">'+esc(s.t)+'</span>'+(s.hi?MK:'')+(s.note?'<span class="fig-note">'+esc(s.note)+'</span>':'')+'</div>';
        });
        h+='</div>';
      } else if(f.type==='compare'){
        var _rows=f.rows||[], _maxc=0; _rows.forEach(function(r){ if(r.length>_maxc) _maxc=r.length; });
        var _lead = f.head && f.head.length === (_maxc-1); // 先頭列が行見出しのとき空ヘッダを足す
        h+='<div class="fig-cwrap"><table class="fig-ctable">';
        if(f.head){ h+='<thead><tr>'; if(_lead) h+='<th></th>'; f.head.forEach(function(x){ h+='<th>'+esc(x)+'</th>'; }); h+='</tr></thead>'; }
        h+='<tbody>'; _rows.forEach(function(r){ h+='<tr>'; r.forEach(function(c,ci){ var tg=ci===0?'th':'td'; h+='<'+tg+'>'+esc(c)+'</'+tg+'>'; }); h+='</tr>'; }); h+='</tbody></table></div>';
      } else if(f.type==='bars'){
        h+='<div class="fig-bars">';
        (f.items||[]).forEach(function(s){
          var v=Math.max(0,Math.min(100,+s.v||0));
          h+='<div class="fig-barrow"><span class="fig-blabel">'+esc(s.t)+'</span><span class="fig-btrack"><span class="fig-bfill'+(s.hi?' hi':'')+'" style="width:'+v+'%"></span></span>'+(s.label?'<span class="fig-bval">'+esc(s.label)+'</span>':'')+(s.hi?MK:'')+'</div>';
        });
        h+='</div>';
      } else if(f.type==='scale'){
        var mn=+f.min, mx=+f.max, P=function(x){ return ((+x-mn)/(mx-mn)*100); };
        h+='<div class="fig-scale"><div class="fig-axis">';
        h+='<div class="fig-null" style="left:'+P(f.nul)+'%"></div>';
        h+='<div class="fig-ci" style="left:'+P(f.lo)+'%;width:'+(P(f.hi)-P(f.lo))+'%"></div>';
        if(f.point!=null) h+='<div class="fig-pt" style="left:'+P(f.point)+'%"></div>';
        h+='</div><div class="fig-axislabels"><span>'+esc(mn)+'</span><span>'+esc(f.nul)+'（差なし）</span><span>'+esc(mx)+'</span></div></div>';
      }
      if(f.note) h+='<div class="fig-foot">'+esc(f.note)+'</div>';
      return '<div class="dfig">'+h+'</div>';
    }
    window.__buildFig = buildFig; // 午前の静的問題にも図を挿入できるよう共有
    var html='';
    data.forEach(function(q){
      var qid='q'+q.y+'-'+q.n;
      var cls='q ex'+q.y+' '+(q.diff||'medium')+' '+q.sub;
      html+='<article class="'+cls+'" id="'+qid+'">';
      html+='<div class="meta"><span class="exam e'+q.y+'">第'+q.y+'回</span><span>問'+q.n+'</span><span>'+esc(subName[q.sub]||'')+'</span><span class="diff '+(q.diff||'medium')+'">'+(diffName[q.diff]||'標準')+'</span></div>';
      if(q.theme){ html+='<div class="themebox"><b>この問題のテーマ：</b>'+esc(q.theme)+(q.aim?'<span class="small"><b>狙い：</b>'+esc(q.aim)+'</span>':'')+'</div>'; }
      html+='<div class="qt">'+esc(q.stem)+'</div>';
      if(q.table){ var tb=q.table;
        html+='<div class="rsrc"><div class="rsrc-cap">'+esc(tb.caption||'資料')+'</div><div class="rsrc-scroll"><table class="rtable">';
        if(tb.headers){ html+='<thead><tr>'; tb.headers.forEach(function(h){ html+='<th>'+esc(h)+'</th>'; }); html+='</tr></thead>'; }
        html+='<tbody>'; (tb.rows||[]).forEach(function(r){ html+='<tr>'; r.forEach(function(c,ci){ var tg=(ci===0&&tb.rowHeader)?'th':'td'; html+='<'+tg+'>'+esc(c)+'</'+tg+'>'; }); html+='</tr>'; }); html+='</tbody></table></div>';
        if(tb.notes) tb.notes.forEach(function(nn){ html+='<div class="rsrc-note">'+esc(nn)+'</div>'; });
        html+='</div>';
      }
      html+='<div class="choices">';
      q.choices.forEach(function(c,i){
        var k=i+1, isC=(k===q.ans);
        html+='<input class="ans '+(isC?'correct':'wrong')+'" id="'+qid+'-'+k+'" name="'+qid+'" type="radio"/>';
        html+='<label class="choice'+(isC?' is-correct':'')+'" for="'+qid+'-'+k+'"><span class="num">'+k+'</span><span>'+esc(c.t)+'</span></label>';
        html+='<div class="why '+(isC?'why-ok':'why-ng')+'"><div class="whytitle">'+(isC?'✅ 正解：この文章が正解になる理由':'❌ 選択肢'+k+' は不正解です。')+'</div><div class="checkline"><b>なぜ：</b>'+esc(c.why||'')+'</div>'+((!isC&&c.fix)?'<div class="correctline"><b>正しくは：</b>'+esc(c.fix)+'</div>':'')+'</div>';
      });
      html+='<input class="ans clear" id="'+qid+'-clear" name="'+qid+'" type="radio"/><label class="clearbtn" for="'+qid+'-clear">選択をクリア</label>';
      html+='<div class="fb okfb">✅ 正解です。選択肢下の理由と、詳しい解説で確認してください。</div><div class="fb ngfb">❌ 違います。選んだ選択肢の下に「なぜ違うか」と正解文を表示しています。</div>';
      html+='</div>';
      html+='<details class="exp"><summary>答え・解説を見る</summary><div><p class="ansline"><strong>正解：'+q.ans+'</strong>　'+esc(q.ansText||'')+'</p>';
      var _fig=q.fig||(window.EIYOU_FIG&&window.EIYOU_FIG[q.y+'-'+q.n]); if(_fig) html+=buildFig(_fig);
      if(q.point) html+='<p class="point"><strong>ポイント：</strong>'+esc(q.point)+'</p>';
      if(q.trap) html+='<p class="trap"><strong>注意：</strong>'+esc(q.trap)+'</p>';
      if(q.memory) html+='<p class="memoryline"><strong>一言暗記：</strong>'+esc(q.memory)+'</p>';
      html+='</div></details>';
      html+='<div class="qnav"><a class="menu" href="#top">↑ メニュー</a></div>';
      html+='</article>';
    });
    wrap.insertAdjacentHTML('beforeend', html);
  })();

  // 午前（静的HTML）の問題にも図マップから図を挿入する
  (function injectStaticFigs(){
    if(!window.EIYOU_FIG || !window.__buildFig) return;
    Object.keys(window.EIYOU_FIG).forEach(function(key){
      var art=document.getElementById('q'+key); if(!art) return;
      if(art.querySelector('.dfig')) return; // 午後は renderPM で挿入済み
      var ans=art.querySelector('.exp .ansline'); if(!ans) return;
      ans.insertAdjacentHTML('afterend', window.__buildFig(window.EIYOU_FIG[key]));
    });
  })();

  // 午前（静的HTML）の選択肢解説を、汎用テンプレートから具体解説へ置換する
  (function injectStaticExp(){
    if(!window.EIYOU_EXP) return;
    Object.keys(window.EIYOU_EXP).forEach(function(key){
      var art=document.getElementById('q'+key); if(!art) return;
      var map=window.EIYOU_EXP[key];
      // 重複・汎用テンプレ由来の冗長ブロックを除去（重点解説・詳しい正解解説・間違い選択肢の見抜き方・一言暗記）。
      // 残すのは 正解→講師メモ（なぜ正解）→落とし穴→不正解チェック（選択肢ごと）のみ。
      [].forEach.call(art.querySelectorAll('.exp .v4deep, .exp .deepbox, .exp .memoryline'),function(el){ el.remove(); });
      if(map.ok && map.ok.why){
        var okblk=art.querySelector('.why.why-ok');
        if(okblk){
          var v4=okblk.querySelector('.v4pick'); if(v4) v4.remove();
          var okchk=okblk.querySelector('.checkline'); if(okchk) okchk.innerHTML='<b>なぜ：</b>'+map.ok.why;
        }
      }
      [].forEach.call(art.querySelectorAll('.why.why-ng'),function(blk){
        var ttl=blk.querySelector('.whytitle'); if(!ttl) return;
        var m=/選択肢\s*(\d+)/.exec(ttl.textContent||''); if(!m) return;
        var ent=map[m[1]]; if(!ent) return;
        var miss=blk.querySelector('.misstype'); if(miss) miss.remove();
        var chk=blk.querySelector('.checkline');
        if(chk && ent.why) chk.innerHTML='<b>なぜ：</b>'+ent.why;
        var cor=blk.querySelector('.correctline');
        if(ent.fix){ if(cor) cor.innerHTML='<b>正しくは：</b>'+ent.fix; }
        else if(cor){ cor.remove(); }
      });
      // 解説内の「不正解チェック」リストも具体解説へ置換
      [].forEach.call(art.querySelectorAll('.wrongcheck li'),function(li){
        var b=li.querySelector('b'); if(!b) return;
        var m=/×\s*(\d+)/.exec(b.textContent||''); if(!m) return;
        var ent=map[m[1]]; if(!ent||!ent.why) return;
        var cw=li.querySelector('.choiceword');
        var cwHtml=cw?cw.outerHTML:'';
        var fixHtml=ent.fix?'<span class="fixline"><b>正しくは：</b>'+ent.fix+'</span>':'';
        li.innerHTML='<b>×'+m[1]+'</b> '+cwHtml+'：'+ent.why+fixHtml;
      });
    });
  })();

  var arts=[].slice.call(document.querySelectorAll('article.q'));
  var TOTAL=arts.length;
  console.info('[EIYOU291]', { appVersion: APP_VERSION, totalQuestions: TOTAL, startUrl: './' });
  var origOrder=arts.slice();
  // 出題順の通し番号(1..291)。共有リンクの範囲指定はシャッフルに依らず固定にしたいので元の順で確定。
  origOrder.forEach(function(a,i){ a._pos=i+1; });
  var qwrapEl=TOTAL?arts[0].parentNode:null;
  var CATS=[{k:'cat1',name:'社会・環境と健康'},{k:'cat2',name:'人体・疾病'},{k:'cat3',name:'食べ物と健康'},{k:'cat4',name:'基礎栄養学'},{k:'cat5',name:'応用栄養学'},
            {k:'cat6',name:'栄養教育論'},{k:'cat7',name:'臨床栄養学'},{k:'cat8',name:'公衆栄養学'},{k:'cat9',name:'給食経営管理論'},{k:'cat10',name:'応用力試験'}];
  // 弱点分析は「その科目の問題が1問でもあるとき」だけ表示（午後を段階的に追加するため）
  CATS = CATS.filter(function(c){ return document.querySelector('article.q.'+c.k); });
  setText('prog-total',TOTAL); setText('fab-total',TOTAL); setText('st-todo',TOTAL);

  // JSが動く環境なので、トラッカーUIを表示（JS無効時は純CSS問題集のまま動く）
  [].forEach.call(document.querySelectorAll('.no-js-hide'),function(el){ el.classList.remove('no-js-hide'); });
  (function(){ var p=$('ver-pill'); if(p) p.textContent=APP_VERSION+' ・ '+TOTAL+'問 ・ 図解＋学習トラッカー ・ iPad対応'; })();
  (function(){ var h=$('hcount'); if(h) h.textContent=TOTAL; })();

  function applyStatus(a,s){
    a.classList.remove('st-correct','st-wrong');
    var b=a._badge;
    if(s==='correct'){ a.classList.add('st-correct'); if(b) b.textContent='✓ 正解'; }
    else if(s==='wrong'){ a.classList.add('st-wrong'); if(b) b.textContent='× 不正解'; }
    else if(b){ b.textContent=''; }
  }

  function applyStar(a){
    var on=!!S.stars[a.id];
    a.classList.toggle('st-star',on);
    if(a._star) a._star.textContent = on ? '★ 見直し中' : '☆ 見直し';
  }
  function toggleStar(a){
    if(S.stars[a.id]) delete S.stars[a.id]; else S.stars[a.id]=1;
    saveStars(); applyStar(a);
    if(document.body.classList.contains('rev-star')) updateVisible();
  }

  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // 問題文の整形：文の途中の強制改行(PDF由来)はつなぎ、文末(。等)と表/資料の区切りは残す
  function normalizeQt(qt){
    var hs=qt.innerHTML;
    if(!/<br/i.test(hs)) return;
    var segs=hs.split(/<br\s*\/?>/i).map(function(x){return x.trim();})
               .filter(function(x){ return x.replace(/<[^>]+>/g,'').trim()!==''; });
    var lines=[], inData=false;
    for(var i=0;i<segs.length;i++){
      var seg=segs[i], txt=seg.replace(/<[^>]+>/g,'').trim();
      if(/【資料】|^[表図][　 ]/.test(txt)) inData=true;
      if(!lines.length){ lines.push(seg); continue; }
      var prevTxt=lines[lines.length-1].replace(/<[^>]+>/g,'').trim();
      if(inData || /[。．？！」』）)：…]$/.test(prevTxt)) lines.push(seg);
      else lines[lines.length-1]=lines[lines.length-1]+seg;
    }
    qt.innerHTML=lines.join('<br>');
  }

  // 各問に「選択肢○✕マップ」（既存の解説データから自動生成）を追加
  function buildCmap(a){
    var cw=a.querySelector('.choices'); if(!cw) return;
    var labels=cw.querySelectorAll('label.choice'); if(!labels.length) return;
    var det=document.createElement('details'); det.className='cmap';
    var sum=document.createElement('summary'); sum.textContent='選択肢マップ（○✕で整理）'; det.appendChild(sum);
    var body=document.createElement('div'); body.className='cmapbody';
    [].forEach.call(labels,function(lab){
      var numEl=lab.querySelector('.num'); var num=numEl?numEl.textContent.trim():'';
      var txt='', spans=lab.querySelectorAll('span');
      for(var i=0;i<spans.length;i++){ if(!spans[i].classList.contains('num')){ txt=spans[i].textContent.trim(); break; } }
      if(!txt) txt=lab.textContent.replace(num,'').trim();
      var isOk=lab.classList.contains('is-correct');
      var fix='';
      if(!isOk){
        var why=lab.nextElementSibling;
        var cl=why?why.querySelector('.correctline'):null;
        if(cl){ var t=cl.textContent.replace(/^[\s\S]*?正しくは：?/,'').trim(); if(t) fix='<span class="cmfix"><b>正しくは：</b>'+escapeHtml(t)+'</span>'; }
      }
      var row=document.createElement('div'); row.className='cmaprow'+(isOk?'':' cmrow-ng');
      row.innerHTML='<span class="cmark '+(isOk?'ok">○':'ng">✕')+'</span><span class="cmtext"><span class="ctxt">'+escapeHtml(num+'．'+txt)+'</span>'+fix+'</span>';
      body.appendChild(row);
    });
    det.appendChild(body);
    cw.parentNode.insertBefore(det, cw.nextSibling);
  }

  // ===== 【資料】表の表組み化（既存データの並べ替えのみ。数値は原文どおり） =====
  // 元データが完全に揃っている問題だけを対象に、縦羅列を正しい表に変換する。
  var TABLES = {
    'q40-3': { caption:'ある年の人口動態統計の出生数と死亡数等', headers:['区分','実数'], rowHeader:true,
      rows:[['出生（人）','770,759'],['死産（胎）','15,179'],['妊娠満22週以後の死産（胎）','2,061'],['早期新生児死亡（人）','466'],['新生児死亡（人）','609'],['乳児死亡（人）','1,356']] },
    'q40-67': { caption:'牛リブロース100g当たりの鉄量と調理による重量変化率', headers:['食品名','鉄（mg）','重量変化率（％）'], rowHeader:true,
      rows:[['リブロース 脂身つき 生','1.0','－'],['リブロース 脂身つき 焼き','1.4','70※']],
      notes:['※調理方法（概要）：厚さ0.2cm薄切り、焼き（電気ロースター）','日本食品標準成分表2020年版（八訂）からの抜粋'] },
    'q40-91': { caption:'男子Ａと女子Ｂの身長（cm）', headers:['','９歳','10歳','11歳','12歳','13歳','14歳'], rowHeader:true,
      rows:[['男子Ａ（４月生まれ）','132.0','137.0','142.5','149.0','157.5','164.0'],['女子Ｂ（４月生まれ）','133.5','138.0','145.5','150.5','154.5','156.0']] },
    'q40-5': { caption:'あるコホート研究による喫煙者と非喫煙者における疾病の罹患率（10万人年に対する罹患率）', headers:['','肺がん','脳卒中','虚血性心疾患','COPD'], rowHeader:true,
      rows:[['喫煙者','130','1500','2500','30'],['非喫煙者','10','750','1000','4']] },
    'q40-66': { caption:'ある食品の可食部100g当たりの成分値（記号A〜I）', headers:['成分','記号'], rowHeader:true,
      rows:[['エネルギー（kcal）','A'],['アミノ酸組成によるたんぱく質','B'],['たんぱく質','C'],['脂肪酸のトリアシルグリセロール当量','D'],['脂質','E'],['利用可能炭水化物（単糖当量）','F'],['差引き法による利用可能炭水化物','G'],['食物繊維総量','H'],['炭水化物','I']],
      notes:['※利用可能炭水化物を計算に含める場合にはFを用いる。','エネルギー換算係数：たんぱく質・アミノ酸組成によるたんぱく質＝4／脂質・脂肪酸のトリアシルグリセロール当量＝9／利用可能炭水化物（単糖当量）＝3.75／差引き法による利用可能炭水化物・炭水化物＝4／食物繊維総量＝2（kcal/g）','日本食品標準成分表2020年版（八訂）を基に作成'] },
    'q40-95': { caption:'女性が行った一連の身体活動', headers:['活動内容','メッツ','時間（分）'], rowHeader:true,
      rows:[['ゆっくりとした歩行（ウォーミングアップ）','2.0','10'],['速歩','4.0','30'],['ランニング','8.0','15'],['ゆっくりとした歩行（クールダウン）','2.0','5']] },
    'q40-97': { caption:'発生当日と発生2日目に提供された食事内容（成人1人当たり）', headers:['発生当日','発生2日目'], rowHeader:false,
      rows:[['おにぎり ２個（100g/個）','おにぎり ２個（100g/個）'],['','ロールパン ２個（30g/個）'],['','魚肉ソーセージ １本（75g/本）'],['','野菜ジュース（200mL）'],['','牛乳（200mL）']],
      notes:['両日とも、水分は十分に提供されている。'] },
    'q39-66': { caption:'オレンジピーマン（果実・生）可食部100g当たりのビタミンA量（µg）', headers:['レチノール','α-カロテン','β-カロテン','β-クリプトキサンチン'], rowHeader:false,
      rows:[['－','150','420','290']], notes:['日本食品標準成分表2020年版（八訂）からの抜粋'] },
    'q38-3': { caption:'A地域とB地域における年齢3区分別人口構成割合（％）', headers:['地域','総数','年少人口','生産年齢人口','老年人口'], rowHeader:true,
      rows:[['A','100.0','12.5','62.5','25.0'],['B','100.0','10.0','60.0','30.0']] },
    'q38-67': { caption:'うどん100g当たりに含まれる食塩相当量および調理による重量変化率※1', headers:['食品名','食塩相当量（g）','重量変化率（％）'], rowHeader:true,
      rows:[['うどん 生','2.5','-'],['うどん ゆで','0.3','180※2']],
      notes:['※1 日本食品標準成分表2020年版（八訂）からの抜粋','※2 調理方法（概要）：10倍量の湯を用いてゆで→湯切り'] },
    'q38-85': { caption:'成長に伴う組織増加分のエネルギー（エネルギー蓄積量）　女子（12〜14歳）', headers:['項目','値'], rowHeader:true,
      rows:[['参照体重（kg）','47.5'],['基礎代謝基準値（kcal/kg体重/日）','29.6'],['体重増加量（kg/年）','3.0'],['エネルギー密度（kcal/g）','3.0'],['エネルギー蓄積量（kcal/日）','ａ']],
      notes:['日本人の食事摂取基準（2020年版）を一部改変'] },
    'q38-5': { caption:'前向きコホート研究における要因Aの曝露の有無別の観察人年と疾病Bの罹患者数', headers:['曝露','観察人年','罹患者数（人）'], rowHeader:true,
      rows:[['有','10,000','100'],['無','10,000','50']] },
    'q39-4': { caption:'A地域およびB地域の年齢階級別人口、基準集団の年齢階級別死亡率', headers:['年齢階級','A地域 人口（人）','B地域 人口（人）','基準集団 死亡率（人口1万対）'], rowHeader:true,
      rows:[['0〜14歳','240,000','90,000','2'],['15〜64歳','900,000','500,000','20'],['65歳以上','300,000','400,000','300'],['合計','1,440,000','990,000','－']],
      notes:['A地域の死亡数12,000人、B地域の死亡数12,000人。標準化死亡比は基準集団を100とする。'] },
    'q39-5': { caption:'集団Aと集団Bのスクリーニング結果と疾病状況', headers:['','集団A 疾病あり（人）','集団A 疾病なし（人）','集団B 疾病あり（人）','集団B 疾病なし（人）'], rowHeader:true,
      rows:[['陽性','25','50','250','50'],['陰性','5','450','50','450']] },
    'q39-67': { caption:'可食部100g当たりのエネルギー値および調理による重量変化率', headers:['食品名','エネルギー（kcal）','重量変化率（％）'], rowHeader:true,
      rows:[['なす 果実 生','18','－'],['なす 果実 油いため','73','76'],['なたね油','887','－']],
      notes:['日本食品標準成分表2020年版（八訂）からの抜粋'] },
    'q39-93': { caption:'対象者の1週間の身体活動状況', headers:['活動内容','強度（メッツ）','時間（分）','頻度（日/週）'], rowHeader:true,
      rows:[['自転車（通勤）','4.0','15','5'],['デスクワーク（座位）','1.3','300','5'],['打ち合わせ、会話、電話','1.5','120','5'],['食事','1.5','60','7'],['身支度','2.0','20','7'],['スクワット','5.0','6','4'],['子どもの世話','3.0','30','7']] },
    'q38-92': { caption:'ある男子の身長・体重の測定値および標準体重', headers:['年齢（歳）','7','8','9','10','11','12'], rowHeader:true,
      rows:[['身長（cm）','122','129','135','140','145','153'],['体重（kg）','24','29','36','44','50','57'],['標準体重（kg）','24','28','31','35','38','44']] },
    'q38-57': { caption:'あるトマトジュースの表示（栄養成分表示／1本＝200mL当たり）', headers:['栄養成分','含有量'], rowHeader:true,
      rows:[['エネルギー','ａ kcal'],['たんぱく質','2 g'],['脂質','0 g'],['炭水化物','9 g'],['　─糖質','ｂ g'],['　─食物繊維','2 g'],['ナトリウム','70 mg'],['（食塩相当量）','ｃ g']],
      notes:['品名：トマトジュース（濃縮トマト還元）／原材料名：トマト（輸入又は国産）／内容量：200mL','●食塩は使用しておりません。','a・b・cが設問で問われる数値です。'] }
  };
  function renderTables(){
    for(var qid in TABLES){
      if(!TABLES.hasOwnProperty(qid)) continue;
      var art=document.getElementById(qid); if(!art) continue;
      var qt=art.querySelector('.qt'); if(!qt) continue;
      var html=qt.innerHTML, idx=html.indexOf('【資料】');
      var stem = idx>=0 ? html.slice(0,idx) : html;
      var sp=TABLES[qid];
      var t='<div class="rsrc"><div class="rsrc-cap">【資料】'+escapeHtml(sp.caption)+'</div><div class="rsrc-scroll"><table class="rtable">';
      if(sp.headers){ t+='<thead><tr>'; sp.headers.forEach(function(h){ t+='<th>'+escapeHtml(h)+'</th>'; }); t+='</tr></thead>'; }
      t+='<tbody>';
      sp.rows.forEach(function(r){ t+='<tr>'; r.forEach(function(c,ci){ var tg=(ci===0&&sp.rowHeader)?'th':'td'; t+='<'+tg+'>'+escapeHtml(c)+'</'+tg+'>'; }); t+='</tr>'; });
      t+='</tbody></table></div>';
      if(sp.notes) sp.notes.forEach(function(n){ t+='<div class="rsrc-note">'+escapeHtml(n)+'</div>'; });
      t+='</div>';
      qt.innerHTML = stem + t;
    }
  }

  arts.forEach(function(a){
    // 検索用テキスト（設問＋テーマ＋選択肢）
    var parts=[];
    var qt=a.querySelector('.qt'); if(qt){ parts.push(qt.textContent); normalizeQt(qt); }
    var th=a.querySelector('.themebox'); if(th) parts.push(th.textContent);
    [].forEach.call(a.querySelectorAll('.choices .choice'),function(c){ parts.push(c.textContent); });
    a.setAttribute('data-search',parts.join(' ').toLowerCase());
    // ステータスバッジ
    var meta=a.querySelector('.meta');
    if(meta){
      var b=document.createElement('span'); b.className='qstat'; meta.appendChild(b); a._badge=b;
      var sb=document.createElement('span'); sb.className='star-btn'; sb.setAttribute('role','button'); sb.title='後で見直す（★）';
      sb.addEventListener('click',function(){ toggleStar(a); });
      meta.appendChild(sb); a._star=sb;
    }
    applyStar(a);
    buildCmap(a);
    // 保存済み記録を復元（選んだ選択肢も復元して解説を再現）
    var rec=S.progress[a.id];
    if(rec){
      if(rec.c){ var ri=document.getElementById(rec.c); if(ri){ ri.checked=true; a._sel=ri; } }
      applyStatus(a,rec.s);
    }
    // 解答の監視
    [].forEach.call(a.querySelectorAll('input.ans'),function(inp){
      // 同じ選択肢をもう一度押したら、解除して解説を閉じ、問題へ戻る（トグル）
      inp.addEventListener('click',function(){
        if(inp.classList.contains('clear')) return;
        if(a._sel===inp){
          inp.checked=false; a._sel=null;
          if(S.test.on){ delete S.test.answers[a.id]; updateTestBar(); }
          else { setStatus(a,null,null); a.scrollIntoView({block:'start'}); }
        }
      });
      inp.addEventListener('change',function(){
        if(S.test.on){
          if(inp.classList.contains('clear')){ delete S.test.answers[a.id]; a._sel=null; }
          else if(inp.checked){ S.test.answers[a.id]=inp.id; a._sel=inp; }
          updateTestBar(); return;
        }
        if(inp.classList.contains('clear')){ a._sel=null; setStatus(a,null,null); return; }
        if(inp.checked){
          a._sel=inp;
          setStatus(a, inp.classList.contains('correct')?'correct':'wrong', inp.id);
          if(autoExp){ var ex=a.querySelector('details.exp'); if(ex) ex.open=true; }
        }
      });
    });
    // 「次の問題へ」ボタン
    var nb=document.createElement('button'); nb.type='button'; nb.className='nextq-btn'; nb.textContent='次の問題へ →';
    nb.addEventListener('click',function(){
      if(S.focus.on){ if(S.focus.idx<S.focus.list.length-1){ S.focus.idx++; showFocus(); } return; }
      var nx=nextAfter(a); if(nx){ nx.scrollIntoView({block:'start'}); } else { alert('最後の問題です。'); }
    });
    a.appendChild(nb);
  });

  renderTables(); // 【資料】の縦羅列を正しい表に変換（データが揃っている問題のみ）

  function setStatus(a,s,cid){
    if(s){ S.progress[a.id]={s:s,c:cid}; recordLast(a.id); } else { delete S.progress[a.id]; }
    applyStatus(a,s); save(); render();
  }

  function longestCorrect(){
    var best=0,cur=0;
    for(var i=0;i<arts.length;i++){
      var r=S.progress[arts[i].id];
      if(r&&r.s==='correct'){ cur++; if(cur>best) best=cur; } else { cur=0; }
    }
    return best;
  }

  function renderCats(){
    var body=$('catstats-body'); if(!body) return;
    var html='';
    CATS.forEach(function(c){
      var tot=0,ok=0,done=0,wrong=0;
      for(var i=0;i<arts.length;i++){
        if(arts[i].classList.contains(c.k)){
          tot++; var r=S.progress[arts[i].id];
          if(r){ done++; if(r.s==='correct') ok++; else if(r.s==='wrong') wrong++; }
        }
      }
      var todo=tot-done;
      var rate=done?Math.round(ok/done*100):0;
      var barCls, barW, rateLabel, rowCls='';
      if(!done){ barCls='none'; barW=100; rateLabel='未挑戦'; rowCls=' is-none'; }
      else { barCls=((done>=3 && rate<60)?'low':''); barW=rate; rateLabel=rate+'%'; }
      // タップ時の導線（弱点直結）：間違い＞未挑戦＞全問の順で促す
      var cta = wrong>0 ? ('🔁 弱点 '+wrong+'問を復習 →')
              : (todo>0 ? ('▶ 未挑戦 '+todo+'問を解く →')
              : (done>0 ? '✓ 全問正解（見直す →）' : '▶ 解く →'));
      var ctaCls = wrong>0 ? ' has-weak' : '';
      html+='<div class="catrow'+rowCls+ctaCls+'" data-k="'+c.k+'" role="button" tabindex="0">'
          +'<div class="ct"><span>'+c.name+'</span><span><b>'+rateLabel+'</b> （'+ok+'/'+done+'・全'+tot+'）</span></div>'
          +'<div class="catbar"><i class="'+barCls+'" style="width:'+barW+'%"></i></div>'
          +'<div class="catcta">'+cta+'</div></div>';
    });
    body.innerHTML=html;
  }

  function render(){
    var ok=0,ng=0;
    for(var i=0;i<arts.length;i++){ var r=S.progress[arts[i].id]; if(r){ if(r.s==='correct') ok++; else if(r.s==='wrong') ng++; } }
    var done=ok+ng, rate=done?Math.round(ok/done*100):0;
    setText('prog-rate',rate); setText('prog-done',done);
    setText('st-ok',ok); setText('st-ng',ng); setText('st-todo',TOTAL-done); setText('st-streak',longestCorrect());
    var bo=$('bar-ok'), bn=$('bar-ng');
    if(bo) bo.style.width=(ok/TOTAL*100)+'%';
    if(bn) bn.style.width=(ng/TOTAL*100)+'%';
    setText('fab-done',done);
    var fb=$('fab-bar'); if(fb) fb.style.width=(done/TOTAL*100)+'%';
    renderCats();
    updateVisible();
  }

  // ===== 検索・表示モード =====
  function updateVisible(){
    var anyVisible=false;
    for(var i=0;i<arts.length;i++){ if(arts[i].offsetParent!==null){ anyVisible=true; break; } }
    document.body.classList.toggle('no-hits',!anyVisible);
  }
  function doSearch(q){
    q=(q||'').trim().toLowerCase();
    for(var i=0;i<arts.length;i++){
      var hit = !q || arts[i].getAttribute('data-search').indexOf(q)!==-1;
      arts[i].classList.toggle('hide-search',!hit);
    }
    updateVisible();
  }
  var search=$('q-search'), st;
  if(search){
    search.addEventListener('input',function(){ if(S.focus.on) exitFocus(); if(S.test.on||S.test.graded) exitTest(); clearTimeout(st); st=setTimeout(function(){ doSearch(search.value); },120); });
  }
  var sx=$('q-search-x');
  if(sx) sx.addEventListener('click',function(){ if(search){ search.value=''; doSearch(''); search.focus(); } });

  var modeBtns={ all:$('mode-all'), wrong:$('mode-wrong'), todo:$('mode-todo'), star:$('mode-star') };
  function setMode(m){
    S.mode=m;
    if(S.focus.on) exitFocus();
    if(S.test.on||S.test.graded) exitTest();
    document.body.classList.remove('rev-wrong','rev-todo','rev-star');
    if(m==='wrong') document.body.classList.add('rev-wrong');
    else if(m==='todo') document.body.classList.add('rev-todo');
    else if(m==='star') document.body.classList.add('rev-star');
    for(var k in modeBtns){ if(modeBtns[k]) modeBtns[k].classList.toggle('on',k===m); }
    updateVisible();
  }
  if(modeBtns.all) modeBtns.all.addEventListener('click',function(){ setMode('all'); });
  if(modeBtns.wrong) modeBtns.wrong.addEventListener('click',function(){ setMode('wrong'); });
  if(modeBtns.todo) modeBtns.todo.addEventListener('click',function(){ setMode('todo'); });
  if(modeBtns.star) modeBtns.star.addEventListener('click',function(){ setMode('star'); });

  // ===== 弱点克服：科目別バーをタップ→その科目の「間違いだけ」へ（無ければ未挑戦/全問） =====
  function drillSubject(k){
    if(S.focus.on) exitFocus(); if(S.test.on||S.test.graded) exitTest();
    if(S.range) clearRange();
    var setRadio=function(id){ var r=$(id); if(r){ r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true})); } };
    setRadio('f-all'); setRadio('f-dall'); setRadio('f-'+k); // 回=全・難易度=全・科目=k
    var wrong=0,todo=0;
    for(var i=0;i<arts.length;i++){ if(arts[i].classList.contains(k)){ var r=S.progress[arts[i].id]; if(!r) todo++; else if(r.s==='wrong') wrong++; } }
    if(wrong>0) setMode('wrong'); else if(todo>0) setMode('todo'); else setMode('all');
    var first=null; for(var j=0;j<arts.length;j++){ if(arts[j].offsetParent!==null){ first=arts[j]; break; } }
    if(first) setTimeout(function(){ first.scrollIntoView({block:'start'}); },60);
  }
  (function(){
    var cb=$('catstats-body'); if(!cb) return;
    var rowOf=function(t){ return t&&t.closest?t.closest('.catrow'):null; };
    cb.addEventListener('click',function(e){ var row=rowOf(e.target); if(row&&row.getAttribute('data-k')) drillSubject(row.getAttribute('data-k')); });
    cb.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ var row=rowOf(e.target); if(row&&row.getAttribute('data-k')){ e.preventDefault(); drillSubject(row.getAttribute('data-k')); } } });
  })();

  function doResetProgress(){
    if(!confirm('学習の進捗記録（正解・不正解）をすべて消去します。よろしいですか？')) return;
    S.progress={}; save();
    arts.forEach(function(a){
      a._sel=null;
      applyStatus(a,null);
      [].forEach.call(a.querySelectorAll('input.ans'),function(inp){ inp.checked=false; });
    });
    setMode('all'); render();
  }
  var resetBtn=$('mode-reset');
  if(resetBtn) resetBtn.addEventListener('click',doResetProgress);
  var clearTop=$('btn-clear');
  if(clearTop) clearTop.addEventListener('click',doResetProgress);

  var fab=$('fab-prog');
  if(fab) fab.addEventListener('click',function(){
    var t=$('appbar'); if(t) t.scrollIntoView({behavior:'smooth',block:'start'});
  });

  // ===== 文字サイズ（A- / A+） =====
  var fsNames={1:'小',2:'標準',3:'大',4:'特大'};
  var fs=parseInt(safeGetRaw(FS_KEY,'2'),10); if([1,2,3,4].indexOf(fs)<0) fs=2;
  function applyFs(){
    document.body.classList.remove('fs-1','fs-3','fs-4');
    if(fs!==2) document.body.classList.add('fs-'+fs);
    setText('fs-label',fsNames[fs]);
    safeSetRaw(FS_KEY,fs);
  }
  var fsm=$('fs-minus'), fsp=$('fs-plus');
  if(fsm) fsm.addEventListener('click',function(){ if(fs>1){ fs--; applyFs(); } });
  if(fsp) fsp.addEventListener('click',function(){ if(fs<4){ fs++; applyFs(); } });
  applyFs();

  // ===== シャッフル（問題順 / 選択肢） / 順番に戻す =====
  function reorder(list){
    if(!qwrapEl) return;
    var frag=document.createDocumentFragment();
    list.forEach(function(a){ frag.appendChild(a); });
    qwrapEl.appendChild(frag);
  }

  // --- 問題順 ---
  function buildQOrder(){
    var pool=origOrder.slice();
    for(var i=pool.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
    S._qorder=pool;
  }
  function applyQuestionOrder(){
    if(S.shufQ){ if(!S._qorder||S._qorder.length!==origOrder.length) buildQOrder(); reorder(S._qorder); }
    else reorder(origOrder);
  }

  // --- 選択肢（各問の選択肢の「並び順」だけ入れ替える。番号や解説テキストは原文のまま）---
  // 1選択肢＝[input.ans, label.choice, div.why?] の組。クリア/フィードバックは末尾に固定。
  function collectChoiceInfo(a){
    if(a._cinfo!==undefined) return a._cinfo;
    var cw=a.querySelector('.choices'); if(!cw){ a._cinfo=null; return null; }
    var groups=[], cur=null;
    [].forEach.call(cw.children,function(node){
      if(node.tagName==='INPUT' && node.classList.contains('ans')){
        if(node.classList.contains('clear')){ cur=null; return; }
        cur=[node]; groups.push(cur);
      } else if(cur && (node.classList.contains('choice')||node.classList.contains('why'))){
        cur.push(node);
      } else { cur=null; }
    });
    a._cinfo = groups.length>=2 ? { cw:cw, groups:groups, anchor:(cw.querySelector('input.ans.clear')||null) } : null;
    return a._cinfo;
  }
  function applyChoiceOrder(a, order){
    var info=collectChoiceInfo(a); if(!info) return;
    order.forEach(function(gi){
      var g=info.groups[gi]; if(!g) return;
      g.forEach(function(n){ info.cw.insertBefore(n, info.anchor); });
    });
  }
  function shuffleOneChoices(a){
    var info=collectChoiceInfo(a); if(!info) return;
    var n=info.groups.length, order=[],i;
    for(i=0;i<n;i++) order.push(i);
    for(i=n-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=order[i]; order[i]=order[j]; order[j]=t; }
    applyChoiceOrder(a, order);
  }
  function restoreOneChoices(a){
    var info=collectChoiceInfo(a); if(!info) return;
    var order=[]; for(var i=0;i<info.groups.length;i++) order.push(i);
    applyChoiceOrder(a, order);
  }
  function shuffleAllChoices(){ arts.forEach(shuffleOneChoices); }
  function restoreAllChoices(){ arts.forEach(restoreOneChoices); }

  // --- 共通：UI同期・保存 ---
  function updateShuffleUI(){
    var sq=$('sh-q'), sc=$('sh-c'), bs=$('btn-shuffle'), bq=$('btn-seq');
    if(sq){ sq.classList.toggle('on',S.shufQ); sq.setAttribute('aria-pressed',S.shufQ?'true':'false'); }
    if(sc){ sc.classList.toggle('on',S.shufC); sc.setAttribute('aria-pressed',S.shufC?'true':'false'); }
    if(bs) bs.classList.toggle('on',S.shufQ);
    if(bq) bq.classList.toggle('on',!S.shufQ && !S.shufC);
  }
  function persistShuf(){ safeSave(SHUF_KEY,{ q:S.shufQ?1:0, c:S.shufC?1:0 }); }

  function setShuffleQ(on){
    if(S.focus.on) exitFocus(); if(S.test.on||S.test.graded) exitTest();
    S.shufQ=!!on; if(S.shufQ) buildQOrder();
    applyQuestionOrder(); persistShuf(); updateShuffleUI(); updateVisible();
  }
  function setShuffleC(on){
    if(S.focus.on) exitFocus(); if(S.test.on||S.test.graded) exitTest();
    S.shufC=!!on;
    if(S.shufC) shuffleAllChoices(); else restoreAllChoices();
    persistShuf(); updateShuffleUI();
  }
  function shuffleResetAll(){
    if(S.focus.on) exitFocus(); if(S.test.on||S.test.graded) exitTest();
    S.shufQ=false; S.shufC=false;
    applyQuestionOrder(); restoreAllChoices();
    persistShuf(); updateShuffleUI(); updateVisible();
  }

  // 既存（⚙ツール内）ボタン：後方互換のため維持しつつ新仕組みに接続
  var btnShuffle=$('btn-shuffle'), btnSeq=$('btn-seq');
  if(btnShuffle) btnShuffle.addEventListener('click',function(){ setShuffleQ(true); });
  if(btnSeq) btnSeq.addEventListener('click',shuffleResetAll);
  // 新（目立つ）トグル
  var shQ=$('sh-q'), shC=$('sh-c'), shHon=$('sh-honban');
  if(shQ) shQ.addEventListener('click',function(){ setShuffleQ(!S.shufQ); });
  if(shC) shC.addEventListener('click',function(){ setShuffleC(!S.shufC); });

  // ===== 範囲表示（?range=40-85：出題順の通し番号で絞り込み・共有用） =====
  function parseRangeParam(){
    var m=/(?:^|[?&])range=(\d+)(?:-(\d+))?(?:&|$)/.exec(location.search);
    if(!m) return null;
    var a=parseInt(m[1],10), b=(m[2]!=null && m[2]!=='')?parseInt(m[2],10):a;
    if(!isFinite(a)||!isFinite(b)) return null;
    var from=Math.max(1,Math.min(a,b)), to=Math.min(TOTAL,Math.max(a,b));
    if(from>TOTAL||to<1) return null;
    return { from:from, to:to };
  }
  function stripRange(search){
    var s=String(search||'').replace(/^\?/,'');
    var parts=s.split('&').filter(function(kv){ return kv && kv.indexOf('range=')!==0; });
    return parts.length?('?'+parts.join('&')):'';
  }
  function applyRange(){
    arts.forEach(function(a){
      var out = !!(S.range && (a._pos<S.range.from || a._pos>S.range.to));
      a.classList.toggle('out-of-range', out);
    });
    document.body.classList.toggle('range-mode', !!S.range);
    var bar=$('range-bar');
    if(bar){
      if(S.range){
        var lab=$('range-label');
        if(lab) lab.textContent='出題順 '+S.range.from+'〜'+S.range.to+' 問を表示中（全'+TOTAL+'問）';
        bar.style.display='';
      } else bar.style.display='none';
    }
    updateVisible();
  }
  function setRangeFromUrl(){
    S.range=parseRangeParam();
    applyRange();
    if(S.range){
      var first=null;
      for(var i=0;i<origOrder.length;i++){ if(origOrder[i]._pos>=S.range.from){ first=origOrder[i]; break; } }
      if(first) setTimeout(function(){ first.scrollIntoView({block:'start'}); },80);
    }
  }
  function clearRange(){
    if(S.focus.on) exitFocus(); if(S.test.on||S.test.graded) exitTest();
    S.range=null;
    try{ history.replaceState(null,'',location.pathname+stripRange(location.search)+location.hash); }catch(e){}
    applyRange();
  }
  var rangeClear=$('range-clear');
  if(rangeClear) rangeClear.addEventListener('click',clearRange);

  // ===== 選択肢マップ 一括開閉 =====
  var btnCmap=$('btn-cmap');
  if(btnCmap) btnCmap.addEventListener('click',function(){
    S.cmapOpen=!S.cmapOpen;
    [].forEach.call(document.querySelectorAll('details.cmap'),function(d){ d.open=S.cmapOpen; });
    btnCmap.classList.toggle('on',S.cmapOpen);
    var sm=btnCmap.querySelector('small'); if(sm) sm.textContent=S.cmapOpen?'一括で閉じる':'一括で開く';
  });

  // ===== 印刷 / PDF =====
  var btnPrint=$('btn-print');
  if(btnPrint) btnPrint.addEventListener('click',function(){ window.print(); });

  // ===== 続きから（前回見ていた問題） =====
  var btnResume=$('btn-resume');
  function qLabel(a){
    var m=a.querySelector('.meta'); if(!m) return a.id;
    var sp=m.querySelectorAll('span'); var ex=sp[0]?sp[0].textContent:''; var no=sp[1]?sp[1].textContent:'';
    return (ex+' '+no).trim()||a.id;
  }
  function updateResume(){
    if(!btnResume) return;
    var el=S.lastSeen&&document.getElementById(S.lastSeen);
    if(el){ btnResume.style.display='block'; setText('resume-sub', qLabel(el)); }
    else { btnResume.style.display='none'; }
  }
  function recordLast(id){
    if(id===S.lastSeen) return;
    S.lastSeen=id; safeSetRaw(LAST_KEY,id);
    updateResume();
  }
  if(btnResume) btnResume.addEventListener('click',function(){
    var el=S.lastSeen&&document.getElementById(S.lastSeen);
    if(el){ if(S.focus.on) exitFocus(); el.scrollIntoView({block:'start'}); }
  });
  // 「続きから」は最後に解答した／集中モードで見ていた問題を対象にする
  // （recordLast は setStatus・showFocus から呼ばれる。スクロール追従はしない＝再読込でも安定）

  // ===== 1問ずつ集中モード =====
  var btnFocus=$('btn-focus');
  function filtRadio(name){ var r=document.querySelector('input.filter[name="'+name+'"]:checked'); return r?r.id:null; }
  function isEligible(a){
    if(a.classList.contains('hide-search')) return false;
    if(S.range && (a._pos<S.range.from || a._pos>S.range.to)) return false;
    var cl=a.classList, b=document.body.classList;
    if(b.contains('rev-wrong') && !cl.contains('st-wrong')) return false;
    if(b.contains('rev-todo') && (cl.contains('st-correct')||cl.contains('st-wrong'))) return false;
    if(b.contains('rev-star') && !cl.contains('st-star')) return false;
    var ex=filtRadio('ex');
    if(ex==='f-40'&&!cl.contains('ex40')) return false;
    if(ex==='f-39'&&!cl.contains('ex39')) return false;
    if(ex==='f-38'&&!cl.contains('ex38')) return false;
    var df=filtRadio('diff');
    if(df==='f-easy'&&!cl.contains('easy')) return false;
    if(df==='f-medium'&&!cl.contains('medium')) return false;
    if(df==='f-hard'&&!cl.contains('hard')) return false;
    var ct=filtRadio('cat');
    if(ct&&/^f-cat[1-5]$/.test(ct)&&!cl.contains(ct.replace('f-',''))) return false;
    return true;
  }
  function indexOfId(list,id){ for(var i=0;i<list.length;i++){ if(list[i].id===id) return i; } return -1; }
  function showFocus(){
    arts.forEach(function(a){ a.classList.remove('focus-current'); });
    var cur=S.focus.list[S.focus.idx]; if(!cur) return;
    cur.classList.add('focus-current');
    setText('focus-count',(S.focus.idx+1)+' / '+S.focus.list.length);
    var pv=$('focus-prev'), nx=$('focus-next');
    if(pv) pv.disabled=S.focus.idx<=0;
    if(nx) nx.disabled=S.focus.idx>=S.focus.list.length-1;
    cur.scrollIntoView({block:'start'});
    recordLast(cur.id);
  }
  function enterFocus(startId){
    S.focus.list=[].slice.call(qwrapEl.querySelectorAll('article.q')).filter(isEligible);
    if(!S.focus.list.length){ alert('表示できる問題がありません。フィルタや表示モードを確認してください。'); return; }
    S.focus.on=true; document.body.classList.add('focus-mode');
    if(btnFocus){ btnFocus.classList.add('on'); var sm=btnFocus.querySelector('small'); if(sm) sm.textContent='タップで一覧に戻る'; }
    S.focus.idx=0;
    if(startId){ var ix=indexOfId(S.focus.list,startId); if(ix>=0) S.focus.idx=ix; }
    showFocus();
  }
  function exitFocus(){
    S.focus.on=false; document.body.classList.remove('focus-mode');
    arts.forEach(function(a){ a.classList.remove('focus-current'); });
    if(btnFocus){ btnFocus.classList.remove('on'); var sm=btnFocus.querySelector('small'); if(sm) sm.textContent='1問だけ大きく表示'; }
  }
  if(btnFocus) btnFocus.addEventListener('click',function(){ S.focus.on?exitFocus():enterFocus(S.lastSeen); });
  var fp=$('focus-prev'), fn=$('focus-next'), fc=$('focus-close');
  if(fp) fp.addEventListener('click',function(){ if(S.focus.idx>0){ S.focus.idx--; showFocus(); } });
  if(fn) fn.addEventListener('click',function(){ if(S.focus.idx<S.focus.list.length-1){ S.focus.idx++; showFocus(); } });
  if(fc) fc.addEventListener('click',exitFocus);
  [].forEach.call(document.querySelectorAll('input.filter'),function(r){ r.addEventListener('change',function(){ if(S.focus.on) exitFocus(); if(S.test.on||S.test.graded) exitTest(); }); });

  // ===== 進捗データ バックアップ / 復元 =====
  var btnExport=$('btn-export'), btnImport=$('btn-import'), importFile=$('import-file');
  if(btnExport) btnExport.addEventListener('click',function(){
    var data={ app:'eiyou291', v:29, progress:S.progress, stars:S.stars, fs:fs, last:S.lastSeen, exported:new Date().toISOString() };
    var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a'); a.href=url; a.download='eiyou291-progress.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },1000);
  });
  if(btnImport) btnImport.addEventListener('click',function(){ if(importFile) importFile.click(); });
  if(importFile) importFile.addEventListener('change',function(){
    var f=importFile.files&&importFile.files[0]; if(!f){ return; }
    var rd=new FileReader();
    rd.onload=function(){
      try{
        var d=JSON.parse(rd.result);
        if(!isObj(d)||(!isObj(d.progress)&&!isObj(d.stars))) throw 0;
        if(!confirm('読み込むと、この端末の進捗・★・設定が上書きされます。よろしいですか？')){ importFile.value=''; return; }
        if(isObj(d.progress)) safeSave(KEY,d.progress);
        if(isObj(d.stars)) safeSave(STAR_KEY,d.stars);
        if([1,2,3,4].indexOf(d.fs)>=0) safeSetRaw(FS_KEY,d.fs);
        if(typeof d.last==='string') safeSetRaw(LAST_KEY,d.last);
        alert('進捗を読み込みました。画面を更新します。');
        location.reload();
      }catch(e){ alert('ファイルを読み込めませんでした。「書き出す」で保存した JSON を選んでください。'); }
      importFile.value='';
    };
    rd.readAsText(f);
  });

  // ===== 強制最新版取得（古いSW/キャッシュを掃除。学習記録(localStorage)は消さない） =====
  function hardRefreshApp(){
    return (async function(){
      try{
        if('serviceWorker' in navigator){
          var regs=await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(function(reg){ return reg.unregister(); }));
        }
        if('caches' in window){
          var keys=await caches.keys();
          await Promise.all(keys.filter(function(k){ return k.indexOf('eiyou291-')===0; }).map(function(k){ return caches.delete(k); }));
        }
        location.replace('./?fresh='+Date.now());
      }catch(e){ console.warn('hard refresh failed:', e); location.reload(); }
    })();
  }
  var btnHard=$('btn-hardrefresh');
  if(btnHard) btnHard.addEventListener('click',function(){
    if(confirm('最新版を取り直します（学習記録は消えません）。よろしいですか？')) hardRefreshApp();
  });

  // ===== 解説の自動表示トグル =====
  var AE_KEY='eiyou291_autoexp';
  var autoExp = safeGetRaw(AE_KEY,'1')!=='0';
  var btnAuto=$('btn-autoexp');
  function applyAuto(){ if(btnAuto){ btnAuto.classList.toggle('on',autoExp); var sm=btnAuto.querySelector('small'); if(sm) sm.textContent=autoExp?'解答後に開く':'自動で開かない'; } }
  if(btnAuto) btnAuto.addEventListener('click',function(){ autoExp=!autoExp; safeSetRaw(AE_KEY,autoExp?'1':'0'); applyAuto(); });
  applyAuto();

  // ===== 次の問題へ／前後ナビ共通 =====
  function nextAfter(a){
    var all=[].slice.call(qwrapEl.querySelectorAll('article.q')); var idx=all.indexOf(a);
    for(var i=idx+1;i<all.length;i++){ if(isEligible(all[i])) return all[i]; } return null;
  }
  function prevBefore(a){
    var all=[].slice.call(qwrapEl.querySelectorAll('article.q')); var idx=all.indexOf(a);
    for(var i=idx-1;i>=0;i--){ if(isEligible(all[i])) return all[i]; } return null;
  }
  function currentArticle(){
    if(S.focus.on) return S.focus.list[S.focus.idx];
    var all=[].slice.call(qwrapEl.querySelectorAll('article.q'));
    for(var i=0;i<all.length;i++){ var a=all[i]; if(a.offsetParent===null) continue; if(a.getBoundingClientRect().bottom>120) return a; }
    return null;
  }

  // ===== テスト（模試）モード =====
  var btnTest=$('btn-test'), testSetup=$('test-setup'), testBar=$('test-bar');
  if(btnTest) btnTest.addEventListener('click',function(){
    if(S.test.on||S.test.graded){ exitTest(); return; }
    var show = testSetup.style.display==='none';
    testSetup.style.display = show?'block':'none';
    btnTest.classList.toggle('on',show);
  });
  [].forEach.call(document.querySelectorAll('.tcount'),function(b){
    b.addEventListener('click',function(){ startTest(parseInt(b.getAttribute('data-n'),10)); });
  });
  // 本番モード：問題順＋選択肢を両方シャッフルして、表示対象から模試（全問）を開始
  function startHonban(){
    S.shufC=true; shuffleAllChoices();
    S.shufQ=true; buildQOrder();
    persistShuf(); updateShuffleUI();
    startTest(0);
  }
  if(shHon) shHon.addEventListener('click',startHonban);
  function eligiblePool(){ return [].slice.call(qwrapEl.querySelectorAll('article.q')).filter(isEligible); }
  function startTest(n){
    if(S.focus.on) exitFocus();
    var pool=eligiblePool();
    if(!pool.length){ alert('出題できる問題がありません。フィルタや表示モードを確認してください。'); return; }
    for(var i=pool.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
    if(n>0) pool=pool.slice(0,n);
    S.test.list=pool; S.test.answers={};
    arts.forEach(function(a){ a.classList.remove('in-test'); });
    S.test.list.forEach(function(a){ a.classList.add('in-test'); a._sel=null; [].forEach.call(a.querySelectorAll('input.ans'),function(inp){ inp.checked=false; }); });
    var rest=arts.filter(function(a){ return S.test.list.indexOf(a)<0; });
    reorder(S.test.list.concat(rest));
    S.test.on=true; S.test.graded=false;
    document.body.classList.add('test-mode'); document.body.classList.remove('test-graded','rev-wrong','rev-todo','rev-star');
    if(testSetup) testSetup.style.display='none'; if(btnTest) btnTest.classList.remove('on');
    buildTestBar();
    window.scrollTo(0,0); S.test.list[0].scrollIntoView({block:'start'});
    updateTestBar();
  }
  function buildTestBar(){
    if(!testBar) return;
    testBar.innerHTML='<span class="ti">未回答 <b id="t-remain">0</b> / <span id="t-total">'+S.test.list.length+'</span> 問</span>'
      +'<button id="t-grade" class="primary" type="button">採点する</button>'
      +'<button id="t-quit" type="button">終了</button>';
    var g=$('t-grade'), q=$('t-quit');
    if(g) g.onclick=gradeTest; if(q) q.onclick=exitTest;
  }
  function updateTestBar(){
    if(!S.test.on||S.test.graded) return;
    var ans=0; S.test.list.forEach(function(a){ if(S.test.answers[a.id]) ans++; });
    setText('t-remain', S.test.list.length-ans);
  }
  function gradeTest(){
    var ok=0;
    S.test.list.forEach(function(a){
      var chosen=S.test.answers[a.id]||null; var ce=a.querySelector('input.ans.correct');
      var corr = !!(chosen && ce && chosen===ce.id);
      if(corr) ok++;
      if(chosen){
        S.progress[a.id]={s:corr?'correct':'wrong',c:chosen};
      } else {
        // 未回答は「不正解」として復習対象に残す。ただし既に正解済みの実績は壊さない
        var prev=S.progress[a.id];
        if(!(prev && prev.s==='correct')) S.progress[a.id]={s:'wrong',c:''};
      }
      applyStatus(a, (S.progress[a.id]||{}).s || null);
    });
    if(S.test.list[0]) recordLast(S.test.list[0].id);
    save(); render();
    S.test.on=false; S.test.graded=true;
    document.body.classList.remove('test-mode'); document.body.classList.add('test-graded');
    var rate=S.test.list.length?Math.round(ok/S.test.list.length*100):0;
    if(testBar){
      testBar.innerHTML='<span class="tg">結果：'+ok+' / '+S.test.list.length+' 正解（'+rate+'%）</span>'
        +'<button id="t-review" type="button">間違いだけ復習</button>'
        +'<button id="t-quit2" class="primary" type="button">終了</button>';
      var rv=$('t-review'), q2=$('t-quit2');
      if(rv) rv.onclick=function(){ exitTest(); setMode('wrong'); };
      if(q2) q2.onclick=exitTest;
    }
    window.scrollTo(0,0); if(S.test.list[0]) S.test.list[0].scrollIntoView({block:'start'});
  }
  function exitTest(){
    S.test.on=false; S.test.graded=false;
    document.body.classList.remove('test-mode','test-graded');
    arts.forEach(function(a){ a.classList.remove('in-test'); });
    S.test.answers={};
    if(btnTest) btnTest.classList.remove('on');
    if(testSetup) testSetup.style.display='none';
    applyQuestionOrder(); // 模試前のシャッフル設定（問題順）を保ったまま戻す
    updateVisible();
  }

  // ===== キーボード操作（1〜5で解答、←→で移動） =====
  document.addEventListener('keydown',function(e){
    var ae=document.activeElement;
    if(ae && ((ae.tagName==='INPUT' && ae.type!=='radio') || ae.tagName==='TEXTAREA' || ae.isContentEditable)) return;
    if(e.metaKey||e.ctrlKey||e.altKey) return;
    if(S.test.graded) return; // 採点結果の表示中はキー操作を無効化
    if(e.key>='1'&&e.key<='5'){
      var a=currentArticle(); if(!a) return;
      var labs=a.querySelectorAll('.choices label.choice');
      var lab=labs[parseInt(e.key,10)-1]; if(!lab) return;
      var inp=document.getElementById(lab.getAttribute('for'));
      if(inp){ inp.checked=true; inp.dispatchEvent(new Event('change',{bubbles:true})); e.preventDefault(); }
    } else if(e.key==='ArrowRight'){
      if(S.test.on) return;
      if(S.focus.on){ if(S.focus.idx<S.focus.list.length-1){ S.focus.idx++; showFocus(); e.preventDefault(); } }
      else { var a2=currentArticle(); if(a2){ var nx=nextAfter(a2); if(nx){ nx.scrollIntoView({block:'start'}); e.preventDefault(); } } }
    } else if(e.key==='ArrowLeft'){
      if(S.test.on) return;
      if(S.focus.on){ if(S.focus.idx>0){ S.focus.idx--; showFocus(); e.preventDefault(); } }
      else { var a3=currentArticle(); if(a3){ var pv=prevBefore(a3); if(pv){ pv.scrollIntoView({block:'start'}); e.preventDefault(); } } }
    }
  });

  updateResume();
  render();

  // ===== 保存済みシャッフル設定の復元（リロード後も並びをランダムに保つ） =====
  (function(){
    var sp=safeLoad(SHUF_KEY,null);
    if(isObj(sp)){
      if(sp.c){ S.shufC=true; shuffleAllChoices(); }
      if(sp.q){ S.shufQ=true; buildQOrder(); applyQuestionOrder(); }
    }
    updateShuffleUI();
  })();

  // ===== 範囲表示の適用（?range=…） =====
  setRangeFromUrl();

  // ===== 診断オーバーレイ（?debug=1 のときだけ表示） =====
  if(location.search.indexOf('debug=1')!==-1){
    (async function(){
      var names=[]; try{ if('caches' in window) names=await caches.keys(); }catch(e){}
      var box=document.createElement('div');
      box.style.cssText='position:fixed;right:8px;bottom:8px;z-index:99999;font-size:11px;background:#111827;color:#fff;padding:6px 8px;border-radius:8px;opacity:.8;max-width:90vw;word-break:break-all';
      box.textContent='app='+APP_VERSION+' / q='+TOTAL+' / sw='+((navigator.serviceWorker&&navigator.serviceWorker.controller)?'on':'off')+' / cache='+names.join(',');
      document.body.appendChild(box);
    })();
  }

  // ===== PWA（オフライン・ホーム画面追加・更新通知） =====
  if('serviceWorker' in navigator && (window.isSecureContext || location.hostname==='localhost')){
    try{
      navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(function(reg){
        var doUpdate=function(){ try{ var pr=reg.update(); if(pr&&pr.catch) pr.catch(function(){}); }catch(e){} };
        doUpdate();
        setInterval(doUpdate, 60*60*1000); // 1時間ごとに更新確認（失敗は無視）
        function showUpdateBar(){
          var bar=$('updbar'); if(bar) bar.classList.add('show');
          var btn=$('upd-btn'); if(btn) btn.onclick=function(){ if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'}); };
        }
        // 既に新SWが待機中（updatefoundを取り逃すケース）でも更新バーを出す
        if(reg.waiting && navigator.serviceWorker.controller){ showUpdateBar(); }
        reg.addEventListener('updatefound',function(){
          var nw=reg.installing;
          if(!nw) return;
          nw.addEventListener('statechange',function(){
            if(nw.state==='installed' && navigator.serviceWorker.controller){ showUpdateBar(); }
          });
        });
      }).catch(function(e){ console.warn('SW register failed:', e); });
      var refreshing=false;
      navigator.serviceWorker.addEventListener('controllerchange',function(){
        if(refreshing) return; refreshing=true; location.reload();
      });
    }catch(e){ console.warn('SW setup error:', e); }
  }
})();
