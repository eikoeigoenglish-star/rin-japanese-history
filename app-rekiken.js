/* app-rekiken.js  —  GitHub Pages / CSP(strict) 対応・レンジラジオ版
   - 1級/2級の問題配列は window.QUIZ_REKIKEN1 / window.QUIZ_REKIKEN2 を使用
   - 出題数は QUIZ_COUNT 固定
   - ?level=1|2 / ?range=0-20 等でディープリンク可能
   - すべてのUIは本ファイルで生成（インライン禁止対応）
*/

(() => {
  "use strict";

  // ====== 設定 ======
  const QUIZ_COUNT = 10;

  // 出題レンジの定義（末尾=新規）
  const SEGMENTS = [
    { key: "all",     label: "全範囲から出題する",          range: null },
    { key: "0-20",    label: "問題セットの0-20%から出題",   range: [0, 20] },
    { key: "20-40",   label: "問題セットの20-40%から出題",  range: [20, 40] },
    { key: "40-60",   label: "問題セットの40-60%から出題",  range: [40, 60] },
    { key: "60-80",   label: "問題セットの60-80%から出題",  range: [60, 80] },
    { key: "80-100",  label: "問題セットの80-100%から出題", range: [80, 100] },
  ];
  const DEFAULT_SEGMENT_KEY = "all";

  // ====== ユーティリティ ======

  // URL Param 取得/設定
  function getParams() {
    const p = new URLSearchParams(location.search);
    return {
      level: p.get("level") || "",
      range: (p.get("range") || "").toLowerCase()
    };
  }
  function setParam(key, value) {
    const p = new URLSearchParams(location.search);
    if (value == null || value === "" || (key === "range" && value === DEFAULT_SEGMENT_KEY)) {
      p.delete(key);
    } else {
      p.set(key, value);
    }
    history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
  }

  function getSelectedSegmentKeyFromURL() {
    const k = getParams().range;
    return SEGMENTS.some(s => s.key === k) ? k : DEFAULT_SEGMENT_KEY;
  }

  // 配列を%レンジでスライス（古→新の配列前提、末尾が最新）
  function sliceByPercentRange(arr, range /* [start,end] or null */) {
    if (!Array.isArray(arr) || arr.length === 0 || !range) return (arr || []).slice();
    const [startPct, endPct] = range;
    const n = arr.length;
    const startIdx = clamp(Math.floor(n * (startPct / 100)), 0, Math.max(0, n - 1));
    const endIdxEx = clamp(Math.ceil(n * (endPct / 100)), Math.min(startIdx + 1, n), n);
    return arr.slice(startIdx, endIdxEx);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // シャッフル
  function shuffleInPlace(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 正規化：全角→半角/NFKC、記号・空白除去、かな長音ゆらぎを軽減、旧字体の軽対応
  function normalize(s) {
    if (typeof s !== "string") return "";
    // 全角半角/互換分解
    let t = s.normalize("NFKC").toLowerCase();

    // 記号・空白除去（漢字・かな・英数のみ残す）
    t = t.replace(/[\u0020-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u00bf\u2000-\u206F\u3000-\u303F]/g, "");

    // 長音ゆらぎ（かな→長音削除）
    t = t.replace(/ー/g, "");

    // 旧字体→新字体のごく一部（頻出のみ）
    const oldToNew = {
      "龍":"竜","龜":"亀","國":"国","體":"体","舊":"旧","德":"徳","邊":"辺","濱":"浜","齋":"斎","穗":"穂",
      "冨":"富","權":"権","歷":"歴","豫":"予","專":"専","圓":"円","樂":"楽","齡":"齢","勳":"勲"
    };
    t = t.replace(/./g, ch => oldToNew[ch] || ch);

    return t;
  }

  function isCorrect(input, answers) {
    const a = normalize(input);
    for (const ans of (answers || [])) {
      if (normalize(ans) === a) return true;
    }
    return false;
  }

  // ====== 状態 ======
  const state = {
    level: null,          // "1" | "2"
    rangeKey: DEFAULT_SEGMENT_KEY,
    pool: [],
    quiz: [],
    idx: 0,
    score: 0
  };

  // ====== DOM構築 ======
  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        if (k === "className") node.className = props[k];
        else if (k === "text") node.textContent = props[k];
        else node.setAttribute(k, props[k]);
      }
    }
    for (const c of children) {
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    }
    return node;
  }

  let $root, $controls, $rangeFieldset, $levelWrap, $stage, $qText, $progress, $input, $submit, $next, $result, $footer;

  function buildUI() {
    $root = el("div", { className: "quiz-root" });

    // ヘッダ
    const $h1 = el("h1", { text: "日本史 記述式クイズ" });
    $controls = el("div", { className: "controls", id: "top-controls" });

    // レベル選択（1級/2級）
    $levelWrap = el("div", { className: "level-wrap" },
      el("span", { text: "級：" }),
      (() => {
        const $btn1 = el("button", { type: "button", className: "btn btn-level", id: "btn-lv1" }, "1級");
        const $btn2 = el("button", { type: "button", className: "btn btn-level", id: "btn-lv2" }, "2級");
        $btn1.addEventListener("click", () => setLevel("1"));
        $btn2.addEventListener("click", () => setLevel("2"));
        return el("span", null, $btn1, el("span", { text: " " }), $btn2);
      })()
    );

    // レンジ（ラジオ）
    $rangeFieldset = renderRangeRadios();

    // ステージ（問題表示）
    $stage = el("div", { className: "stage" });
    $progress = el("div", { className: "progress" });
    $qText = el("div", { id: "question" });
    const $answerWrap = el("div", { className: "answer-wrap" });
    $input = el("input", { type: "text", id: "answer", placeholder: "解答を入力" });
    $submit = el("button", { type: "button", className: "btn btn-submit" }, "判定");
    $next = el("button", { type: "button", className: "btn btn-next" }, "次へ");
    $result = el("div", { className: "result" });

    $submit.addEventListener("click", onSubmit);
    $next.addEventListener("click", onNext);

    $answerWrap.appendChild($input);
    $answerWrap.appendChild(el("span", { text: " " }));
    $answerWrap.appendChild($submit);
    $answerWrap.appendChild(el("span", { text: " " }));
    $answerWrap.appendChild($next);

    $stage.appendChild($progress);
    $stage.appendChild($qText);
    $stage.appendChild($answerWrap);
    $stage.appendChild($result);

    // フッター（再挑戦など）
    $footer = el("div", { className: "footer" }, buildRetryLinks());

    // まとめて追加
    $controls.appendChild($levelWrap);
    $controls.appendChild($rangeFieldset);
    $root.appendChild($h1);
    $root.appendChild($controls);
    $root.appendChild($stage);
    $root.appendChild($footer);

    document.body.appendChild($root);
  }

  function renderRangeRadios() {
    const fieldset = el("fieldset", { className: "quiz-range fieldset" });
    const legend = el("legend", { text: "出題範囲" });
    fieldset.appendChild(legend);

    const currentKey = getSelectedSegmentKeyFromURL();
    SEGMENTS.forEach(seg => {
      const id = `range-${seg.key}`;
      const label = el("label", { for: id });
      label.style.display = "block";

      const input = el("input", { type: "radio", id, name: "quiz-range", value: seg.key });
      if (seg.key === currentKey) input.checked = true;
      input.addEventListener("change", () => {
        setParam("range", seg.key === DEFAULT_SEGMENT_KEY ? "" : seg.key);
        updateRetryLinksWithRange(seg.key);
        // レンジだけの変更なら、現在のレベルが選ばれていればプールを再生成
        if (state.level) {
          prepareQuiz(); // レンジに応じて pool/quiz を再構築
          state.idx = 0;
          state.score = 0;
          renderQuestion();
        }
      });

      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + seg.label));
      fieldset.appendChild(label);
    });

    return fieldset;
  }

  function currentRangeLabel() {
    const k = getSelectedSegmentKeyFromURL();
    const seg = SEGMENTS.find(s => s.key === k);
    return seg ? seg.label : SEGMENTS[0].label;
  }

  function buildRetryLinks() {
    const wrap = el("div", { className: "retry-links" });
    const a1 = el("a", { href: "#", className: "retry", "data-role": "retry-lv1" }, "1級で再挑戦");
    const a2 = el("a", { href: "#", className: "retry", "data-role": "retry-lv2" }, "2級で再挑戦");
    a1.addEventListener("click", (e) => { e.preventDefault(); setLevel("1", true); });
    a2.addEventListener("click", (e) => { e.preventDefault(); setLevel("2", true); });
    wrap.appendChild(a1);
    wrap.appendChild(el("span", { text: " " }));
    wrap.appendChild(a2);
    updateRetryLinksWithRange(getSelectedSegmentKeyFromURL());
    return wrap;
  }

  function updateRetryLinksWithRange(key) {
    const links = document.querySelectorAll('a.retry, a[data-role="retry-lv1"], a[data-role="retry-lv2"]');
    links.forEach(a => {
      const role = a.getAttribute("data-role") || "";
      const u = new URL(location.href);
      if (role === "retry-lv1") u.searchParams.set("level", "1");
      if (role === "retry-lv2") u.searchParams.set("level", "2");
      if (key && key !== DEFAULT_SEGMENT_KEY) u.searchParams.set("range", key);
      else u.searchParams.delete("range");
      a.setAttribute("href", `${u.pathname}?${u.searchParams.toString()}`);
    });
  }

  // ====== 動作 ======

  function setLevel(lv, andStart) {
    state.level = lv;
    setParam("level", lv);
    prepareQuiz();
    if (andStart) {
      state.idx = 0;
      state.score = 0;
      renderQuestion();
    } else {
      // 最初の選択時も即開始
      state.idx = 0;
      state.score = 0;
      renderQuestion();
    }
  }

  function prepareQuiz() {
    const params = getParams();
    state.rangeKey = getSelectedSegmentKeyFromURL();
    const seg = SEGMENTS.find(s => s.key === state.rangeKey) || SEGMENTS[0];

    const base = (state.level === "1") ? (window.QUIZ_REKIKEN1 || []) :
                 (state.level === "2") ? (window.QUIZ_REKIKEN2 || []) : [];

    let pool = sliceByPercentRange(base, seg.range);

    if (!pool || pool.length === 0) {
      // フォールバック：全範囲
      pool = base.slice();
      console.warn("選択レンジに問題がないため全範囲へフォールバックしました");
    }

    shuffleInPlace(pool);
    state.pool = pool;

    // QUIZ_COUNT分を抽出（足りなければ全件）
    state.quiz = pool.slice(0, Math.min(QUIZ_COUNT, pool.length));
  }

  function renderQuestion() {
    // UI可視
    $input.disabled = false;
    $submit.disabled = false;
    $next.disabled = true;
    $result.textContent = "";

    // 問題がなければ終了画面
    if (state.idx >= state.quiz.length || state.quiz.length === 0) {
      const total = state.quiz.length;
      $progress.textContent = `終了：得点 ${state.score} / ${total}`;
      $qText.textContent = "おつかれさまでした。再挑戦リンクから続けられます。";
      return;
    }

    const qObj = state.quiz[state.idx];
    const total = state.quiz.length;
    $progress.textContent = `第 ${state.idx + 1} 問 / 全 ${total} 問（${currentRangeLabel()}）`;
    $qText.textContent = qObj.q || "";
    $input.value = "";
    $input.focus();
  }

  function onSubmit() {
    if (state.idx >= state.quiz.length) return;
    const qObj = state.quiz[state.idx];
    const val = $input.value || "";

    const ok = isCorrect(val, qObj.answers || []);
    if (ok) {
      state.score += 1;
      $result.textContent = "正解！";
    } else {
      // 正解の主表記と代替表記を提示
      const ans = (qObj.answers || []).join(" / ");
      $result.textContent = `不正解。正解：${ans}`;
    }
    $input.disabled = true;
    $submit.disabled = true;
    $next.disabled = false;
    $next.focus();
  }

  function onNext() {
    state.idx += 1;
    renderQuestion();
  }

  // ====== Dev ユーティリティ（作問用・Consoleから使用可） ======
  window.QUIZ_DEV = window.QUIZ_DEV || {};
  window.QUIZ_DEV.validate = (arr) => {
    if (!Array.isArray(arr)) throw new Error("配列ではありません");
    const bad = arr.filter(it => !it || typeof it.q !== "string" || !Array.isArray(it.answers) || it.answers.some(a => typeof a !== "string"));
    if (bad.length) console.error("不正エントリ:", bad);
    else console.log("配列フォーマットOK / length=", arr.length);
    return bad.length === 0;
  };
  window.QUIZ_DEV.lenCheck = (items) => {
    const pickLen = (s) => {
      const m1 = s.match(/漢字(\d+)文字/);
      const m2 = s.match(/カタカナ(\d+)文字/);
      return m1 ? { kind: "kanji", n: parseInt(m1[1],10) } :
             m2 ? { kind: "kata",  n: parseInt(m2[1],10) } : null;
    };
    const justKanji = (s) => (s || "").replace(/[^\p{Script=Han}]/gu, "");
    const justKata  = (s) => (s || "").replace(/[^ァ-ヶ]/g, "");
    const res = [];
    (items || []).forEach((it, i) => {
      const need = pickLen(it.q || "");
      if (!need) return;
      const main = (it.answers && it.answers[0]) || "";
      const count = need.kind === "kanji" ? justKanji(main).length : justKata(main).length;
      if (count !== need.n) res.push({ index: i, q: it.q, main, count, required: need.n, kind: need.kind });
    });
    if (res.length) console.warn("文字数警告:", res);
    else console.log("文字数チェックOK");
    return res;
  };

  // ====== 初期化 ======
  document.addEventListener("DOMContentLoaded", () => {
    buildUI();

    // URLに level があればそれで開始、なければ未選択
    const p = getParams();
    const lv = (p.level === "1" || p.level === "2") ? p.level : null;
    if (lv) setLevel(lv, true);
  });
})();
