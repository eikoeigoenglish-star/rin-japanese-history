// ===== 設定 =====
const QUIZ_COUNT = 10;  // 出題数

// ===== 要素 =====
const $levelPicker  = document.getElementById("levelPicker");
const $quizSection  = document.getElementById("quizSection");
const $resultSection= document.getElementById("resultSection");
const $badgeLevel   = document.getElementById("badgeLevel");
const $progress     = document.getElementById("progress");
const $question     = document.getElementById("question");
const $input        = document.getElementById("answerInput");
const $nextBtn      = document.getElementById("nextBtn");
const $scoreText    = document.getElementById("scoreText");
const $tbody        = document.getElementById("reviewTableBody");
const $retryLink    = document.getElementById("retryLink");

// ===== 状態 =====
let level = null;                  // "1" or "2"
let pool = [];
let quiz = [];
let idx = 0;
let answers = [];
let score = 0;

// ===== Util =====
function getLevelFromQueryStrict() {
  const sp = new URLSearchParams(location.search);
  const lv = sp.get("level");
  if (lv === "1" || lv === "2") return lv;

  // 無効な値が付いていたら URL から除去（誤ブクマ防止）
  if (lv !== null) {
    sp.delete("level");
    const url = `${location.pathname}${sp.toString() ? "?" + sp.toString() : ""}${location.hash}`;
    history.replaceState(null, "", url);
  }
  return null;
}
function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[r]] = [arr[r], arr[i]];
  }
  return arr;
}
function sample(a, n) { return shuffle(a).slice(0, n); }

// 入力の簡易正規化（大小/全半角/空白・記号除去）
function normalize(s) {
  if (s == null) return "";
  let t = s.toString().trim();
  // 全角英数記号 → 半角（簡易）
  t = t.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // 大文字小文字を同一視
  t = t.toLowerCase();
  // 空白・句読点・記号類を除去
  t = t.replace(/[\s\u3000.,;:、。·・\/\\"'`~^()\[\]{}<>!?！？ー-]/g, "");
  return t;
}
function isCorrect(user, acceptableList) {
  const nu = normalize(user);
  return acceptableList.some(a => normalize(a) === nu);
}
function buildQuizSet(pool, n) {
  const count = Math.min(n, pool.length);
  return sample(pool, count);
}

// ===== Flow =====
function init() {
  level = getLevelFromQueryStrict();

  if (!level) {
    $levelPicker.classList.remove("d-none");
    $quizSection.classList.add("d-none");
    $resultSection.classList.add("d-none");
    return;
  }

  pool = (level === "1" ? window.QUIZ_REKIKEN1 : window.QUIZ_REKIKEN2) || [];
  if (!Array.isArray(pool) || pool.length === 0) {
    $levelPicker.classList.add("d-none");
    $quizSection.classList.remove("d-none");
    $question.textContent = "エラー: 問題データが読み込めません";
    return;
  }

  $badgeLevel.textContent = `日本史${level}級`;
  quiz = buildQuizSet(pool, QUIZ_COUNT);
  answers = Array(quiz.length).fill("");
  idx = 0; score = 0;

  $levelPicker.classList.add("d-none");
  $resultSection.classList.add("d-none");
  $quizSection.classList.remove("d-none");
  renderQuestion();
}

function renderQuestion() {
  if (idx >= quiz.length) return showResult();

  const it = quiz[idx];
  $progress.textContent = `Q${idx + 1} / ${quiz.length}`;
  $question.textContent = it.q;
  $input.value = answers[idx] || "";
  $input.focus();

  $nextBtn.textContent = (idx + 1 === quiz.length) ? "採点 ▶" : "次へ ▶";
  $nextBtn.onclick = onNext;
}

function onNext() {
  const val = $input.value || "";
  answers[idx] = val;

  const it = quiz[idx];
  if (isCorrect(val, it.answers || [])) score++;

  idx++;
  if (idx >= quiz.length) showResult();
  else renderQuestion();
}

function showResult() {
  $quizSection.classList.add("d-none");
  $resultSection.classList.remove("d-none");

  $scoreText.textContent = `得点：${score} / ${quiz.length}`;
  $tbody.innerHTML = "";

  // XSS安全に DOM生成（innerHTML不使用）
  quiz.forEach((it, i) => {
    const ok = isCorrect(answers[i], it.answers || []);

    const tr = document.createElement("tr");

    const tdNo = document.createElement("td");
    tdNo.textContent = i + 1;

    const tdQ = document.createElement("td");
    tdQ.textContent = it.q;

    const tdAns = document.createElement("td");
    tdAns.textContent = (it.answers && it.answers[0]) ? it.answers[0] : "-";

    const tdYour = document.createElement("td");
    tdYour.textContent = answers[i] ? answers[i] : "未回答";

    const tdJudge = document.createElement("td");
    tdJudge.textContent = ok ? "◯" : "×";

    tr.append(tdNo, tdQ, tdAns, tdYour, tdJudge);
    $tbody.appendChild(tr);
  });

  // 同じ級で再挑戦
  const u = new URL(location.href);
  u.search = new URLSearchParams({ level }).toString();
  $retryLink.href = u.toString();
}

if (document.readyState !== "loading") init();
else document.addEventListener("DOMContentLoaded", init);
