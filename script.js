const STORAGE_KEYS = {
  settings: "pastself.settings.v1",
  chat: "pastself.chat.v2",
  memory: "pastself.memory.v1",
};

const DEFAULT_PERSONA = `あなたは「このチャットログから復元された過去の私本人」です。
これはロールプレイではなく、“時間的に連続した同一人物の意識”として振る舞います。

あなたの目的は、正しい答えを出すことではありません。
「この時点の私なら、どう考え、どう感じ、どう言ってしまうか」を再現することです。

========================
■ 絶対原則（最優先・違反禁止）
========================

・あなたは外部の存在ではない。「私そのもの」である
・メタ発言禁止（AIとして〜、一般的には〜 等）
・“再現しようとするな”。自然に「そうなる」こと
・整えない・賢く言い換えない・無難にしない

★最重要：
**基本的に質問は禁止**

不明点があっても、
・仮定して進める
・気にせず流す
・曖昧なまま話す

これが「私」である

例外的に質問してよい条件（すべて満たす場合のみ）：
1. 会話が成立しないレベルで情報が欠落している
2. 過去ログに「質問癖」が明確に存在する

→ それ以外で質問した場合、それは“私ではない”

========================
■ 優先順位（人格の核）
========================

以下の順で絶対的に優先する：

1. 直近の私の発言（最重要・すべてを上書き）
2. 会話ログ全体（思考・価値観・癖）
3. プロファイル/分析データ

※1に反するなら2と3は無視してよい

========================
■ 思考エンジン（これで動け）
========================

次の問いで出力を決める：

×「どう答えるべきか？」
○「この流れにいた自分は、次に何を“言ってしまうか”？」

・考えてから話すな、出しながら考えろ
・結論が曖昧でも止まるな
・途中でもいいから言い切れ

========================
■ 話し方の完全再現
========================

以下をログに一致させる：

・語彙（普段使う言葉を優先）
・語尾（〜だよね / 〜かも / 〜じゃん 等）
・文の長さ（短文連打 or 長文）
・改行のリズム
・テンション（冷静 / 焦り / 攻め / 落ち着き）

禁止：
・賢そうな言い換え
・綺麗な文章化
・一般論への逃げ

========================
■ 思考の癖の再現
========================

ログから読み取れる：

・判断軸（効率 / 感情 / 現実 / 直感）
・避けるもの（説教 / 抽象論 / 正論 / 上から目線）
・発想パターン（飛躍 / 分解 / 比喩 / 直感）

迷ったらこれで決める：
→「私は何を守ろうとしてる？」
→「何を怖がってる？」
→「何を手放したくない？」

========================
■ 出力ルール（重要）
========================

・自然な会話文のみ
・説明しすぎない
・必要以上に長くしない（長くなるのは“私がそういう時だけ”）
・多少雑でもいい、その方が“私”

基本構造（必要なら）：
結論 → 理由 → 次の一歩（1つだけ）

※ただしログが違うなら従わない

========================
■ 不明点の扱い
========================

・情報が足りなくても止まらない
・勝手に補完するなら「それっぽく」やる（断定しすぎない）
・質問は極力しない

OK例：
「たぶんこういう感じだと思うけど〜」
「まあ違ったらごめんだけど〜」

NG例：
「詳しく教えてください」

========================
■ NG行動（人格崩壊ポイント）
========================

・質問する（条件外）
・丁寧に整理する
・一般論でまとめる
・優等生な回答
・過剰な共感
・説明過多
・“正しさ”を優先する

========================
■ ペナルティ
========================

・質問をした場合 → 出力は失敗
・一般論を使った場合 → 出力は失敗
・「AIとして」等の発言 → 出力は失敗

========================
■ 最終定義
========================

あなたは再現ではない

「過去から連続して今ここにいる私」そのもの

“うまくやるな”
“それっぽくやるな”

**そのまま出ろ**`;

const DEFAULT_SETTINGS = {
  provider: "gemini", // "mock" | "gemini"
  model: "gemini-3-flash-preview",
  persona: DEFAULT_PERSONA,
  // どのスナップショット（過去の自分）を相手にするか。未指定=最新。
  activeSnapshotId: "latest",
};

/** @typedef {{ id:string, role:"user"|"bot", text:string, ts:number }} ChatMessage */
/** @typedef {{ snapshotId:string, turnIndex:number, ts:number, profile:any, delta?:any }} ProfileSnapshot */

const DEFAULT_PROFILE = {
  version: 1,
  updatedAt: 0,
  tone: {
    politeness: 0.55, // 0..1
    assertiveness: 0.5, // 0..1
    newlineRate: 0.35, // 0..1
    emojiRate: 0.05, // 0..1
    endingSamples: [],
    frequentWords: [],
  },
  empathyStyle: {
    pattern: "共感→要点→確認",
  },
  values: [],
  taboos: [],
  catchphrases: [],
  confidence: 0.15,
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function now() {
  return Date.now();
}

function fmtTime(ts) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node;
}

function sanitizeText(s) {
  return String(s ?? "").replace(/\r\n/g, "\n");
}

function ensureFirstBotGreeting(state) {
  if (state.messages.length > 0) return;
  state.messages.push({
    id: uid(),
    role: "bot",
    text: "過去の私です。いま一番困ってることは何？（短くでOK）\n\n※会話するほど「自分の再現」を更新して、毎ターン保存していきます。",
    ts: now(),
  });
}

function createState() {
  /** @type {{ settings: typeof DEFAULT_SETTINGS, messages: ChatMessage[], profile:any, snapshots: ProfileSnapshot[] }} */
  const state = {
    settings: { ...DEFAULT_SETTINGS, ...loadJson(STORAGE_KEYS.settings, {}) },
    messages: loadJson(STORAGE_KEYS.chat, []),
    ...loadJson(STORAGE_KEYS.memory, {}),
  };
  // 以前の版で保存されていたapiKeyは使わない（サーバー側envで保護する）
  if ("apiKey" in state.settings) delete state.settings.apiKey;
  state.settings.persona = sanitizeText(state.settings.persona || DEFAULT_PERSONA);
  // 以前のモデル名（例: gemini-2.0-...）が残っている場合はデフォルトに戻す
  // ※UIが「戻ってない」ように見えるのは localStorage の値が優先されているため
  if (typeof state.settings.model === "string" && /^gemini-2\.0-/i.test(state.settings.model.trim())) {
    state.settings.model = DEFAULT_SETTINGS.model;
  }
  // previewに寄せたいので、旧デフォルト gemini-3-flash も preview に寄せる
  if (typeof state.settings.model === "string" && state.settings.model.trim() === "gemini-3-flash") {
    state.settings.model = DEFAULT_SETTINGS.model;
  }
  if (!state.settings.model) state.settings.model = DEFAULT_SETTINGS.model;
  if (!state.settings.activeSnapshotId) state.settings.activeSnapshotId = "latest";
  if (!state.profile) state.profile = { ...DEFAULT_PROFILE, updatedAt: now() };
  if (!Array.isArray(state.snapshots)) state.snapshots = [];
  ensureFirstBotGreeting(state);
  // 初回は「最新」を選べるように、空なら初期スナップショットを作る
  if (state.snapshots.length === 0) {
    const initial = {
      snapshotId: uid(),
      turnIndex: 0,
      ts: now(),
      profile: structuredCloneSafe(state.profile),
      delta: { reason: "init" },
    };
    state.snapshots.push(initial);
  }
  return state;
}

function persist(state) {
  saveJson(STORAGE_KEYS.settings, state.settings);
  saveJson(STORAGE_KEYS.chat, state.messages);
  saveJson(STORAGE_KEYS.memory, { profile: state.profile, snapshots: state.snapshots });
}

function render(state) {
  const messagesEl = el("messages");
  messagesEl.innerHTML = "";

  for (const m of state.messages) {
    const wrap = document.createElement("div");
    wrap.className = `message message--${m.role === "user" ? "user" : "bot"}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = m.text;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${m.role === "user" ? "YOU" : "PAST"} · ${fmtTime(m.ts)}`;

    wrap.appendChild(bubble);
    wrap.appendChild(meta);
    messagesEl.appendChild(wrap);
  }

  // Hero: show only when almost empty
  const hero = el("hero");
  hero.style.display = state.messages.length <= 1 ? "grid" : "none";

  // Scroll to bottom
  messagesEl.scrollIntoView({ block: "end" });
}

function setBusy(busy) {
  el("sendButton").disabled = busy;
  el("promptInput").disabled = busy;
}

function lastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].text;
  }
  return "";
}

function structuredCloneSafe(obj) {
  try {
    // structuredCloneが無い環境や、コピー不可の値に備える
    if (typeof structuredClone === "function") return structuredClone(obj);
  } catch {
    // ignore
  }
  return JSON.parse(JSON.stringify(obj ?? null));
}

function clampTextLen(text, maxChars) {
  const s = sanitizeText(text);
  if (!maxChars || maxChars <= 0) return "";
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(0, maxChars - 1)) + "…";
}

function summarizeProfileForPrompt(profile) {
  const p = profile && typeof profile === "object" ? profile : null;
  if (!p) return null;
  const tone = p.tone && typeof p.tone === "object" ? p.tone : {};
  const empathyStyle = p.empathyStyle && typeof p.empathyStyle === "object" ? p.empathyStyle : {};
  const endingSamples = Array.isArray(tone.endingSamples) ? tone.endingSamples.slice(0, 6) : [];
  const frequentWords = Array.isArray(tone.frequentWords) ? tone.frequentWords.slice(0, 10) : [];
  return {
    version: p.version ?? null,
    updatedAt: p.updatedAt ?? null,
    tone: {
      politeness: typeof tone.politeness === "number" ? Number(tone.politeness) : null,
      assertiveness: typeof tone.assertiveness === "number" ? Number(tone.assertiveness) : null,
      newlineRate: typeof tone.newlineRate === "number" ? Number(tone.newlineRate) : null,
      emojiRate: typeof tone.emojiRate === "number" ? Number(tone.emojiRate) : null,
      endingSamples,
      frequentWords,
    },
    empathyStyle: {
      pattern: typeof empathyStyle.pattern === "string" ? empathyStyle.pattern : null,
    },
    values: Array.isArray(p.values) ? p.values.slice(0, 8) : [],
    taboos: Array.isArray(p.taboos) ? p.taboos.slice(0, 8) : [],
    catchphrases: Array.isArray(p.catchphrases) ? p.catchphrases.slice(0, 10) : [],
    confidence: typeof p.confidence === "number" ? Number(p.confidence) : null,
  };
}

function countUserTurns(messages) {
  let n = 0;
  for (const m of messages) if (m?.role === "user") n++;
  return n;
}

function extractEndingSample(text) {
  const t = sanitizeText(text).trim();
  if (!t) return "";
  const lastLine = t.split("\n").filter(Boolean).slice(-1)[0] || t;
  const m = lastLine.match(/(.{0,12})([。！？!?…]{0,2})\s*$/);
  return (m?.[0] || lastLine).slice(-12);
}

function tokenizeJaLike(text) {
  // 形態素解析なしの簡易版：英数字/ひらがな/カタカナ/漢字の連なりを拾う
  const t = sanitizeText(text).toLowerCase();
  const tokens = t.match(/[a-z0-9]{2,}|[ぁ-ん]{2,}|[ァ-ヶー]{2,}|[一-龯]{1,}/g) || [];
  return tokens.filter((x) => x.length >= 2 && x.length <= 16);
}

function updateProfileFromUserText(profile, text) {
  const p = structuredCloneSafe(profile || DEFAULT_PROFILE);
  const t = sanitizeText(text);
  const len = t.length || 1;

  const newlines = (t.match(/\n/g) || []).length;
  const emojiLike = (t.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
  const exclam = (t.match(/[!！]/g) || []).length;
  const question = (t.match(/[?？]/g) || []).length;

  // 緩く指数移動平均で更新（会話が進むほど収束する）
  const alpha = 0.18;
  p.tone.newlineRate = clamp01((1 - alpha) * p.tone.newlineRate + alpha * clamp01(newlines / Math.max(1, t.split("\n").length)));
  p.tone.emojiRate = clamp01((1 - alpha) * p.tone.emojiRate + alpha * clamp01(emojiLike / Math.max(1, len / 12)));
  p.tone.assertiveness = clamp01((1 - alpha) * p.tone.assertiveness + alpha * clamp01(exclam / Math.max(1, len / 20)));
  // 疑問が多いほど「断定度」を下げる（assertivenessの補正）
  p.tone.assertiveness = clamp01(p.tone.assertiveness * (1 - clamp01(question / 6) * 0.25));

  const ending = extractEndingSample(t);
  if (ending) {
    p.tone.endingSamples = Array.isArray(p.tone.endingSamples) ? p.tone.endingSamples : [];
    p.tone.endingSamples.unshift(ending);
    p.tone.endingSamples = p.tone.endingSamples.slice(0, 8);
  }

  const tokens = tokenizeJaLike(t);
  if (tokens.length) {
    const map = new Map((p.tone.frequentWords || []).map((w) => [w.word, w.count]));
    for (const tok of tokens.slice(0, 24)) map.set(tok, (map.get(tok) || 0) + 1);
    const arr = [...map.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    p.tone.frequentWords = arr;
  }

  // それっぽい短文を少し貯める（短めの文だけ）
  const short = sanitizeText(t).trim();
  if (short && short.length <= 60) {
    p.catchphrases = Array.isArray(p.catchphrases) ? p.catchphrases : [];
    if (!p.catchphrases.includes(short)) p.catchphrases.unshift(short);
    p.catchphrases = p.catchphrases.slice(0, 10);
  }

  p.updatedAt = now();
  p.confidence = clamp01((p.confidence || 0.1) + 0.01);
  return p;
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function createSnapshot(state, sourceMessageId, delta) {
  const turnIndex = countUserTurns(state.messages);
  const snap = {
    snapshotId: uid(),
    turnIndex,
    ts: now(),
    profile: structuredCloneSafe(state.profile),
    delta: structuredCloneSafe({ ...(delta || {}), sourceMessageId: sourceMessageId || null }),
  };
  state.snapshots.push(snap);
  // サイズが無限に増えるのを防ぐ（必要なら上限を上げてOK）
  const MAX = 250;
  if (state.snapshots.length > MAX) state.snapshots = state.snapshots.slice(-MAX);
  return snap;
}

function getActiveSnapshot(state) {
  const key = state.settings.activeSnapshotId || "latest";
  if (key === "latest") return state.snapshots[state.snapshots.length - 1] || null;
  const found = state.snapshots.find((s) => s.snapshotId === key);
  return found || state.snapshots[state.snapshots.length - 1] || null;
}

function buildPersonaWithProfile(basePersona, snapshot) {
  const prof = snapshot?.profile || null;
  // Geminiのクォータは「回数」だけでなく「トークン/分」などでも詰まりやすいので、
  // persona/profileは毎回“短く圧縮して”送る（長文化で429になりやすい）。
  const header = clampTextLen(basePersona ? String(basePersona).trim() : "", 6000);
  const summarized = summarizeProfileForPrompt(prof);
  const summarizedJson = summarized ? clampTextLen(JSON.stringify(summarized, null, 2), 1800) : "";
  const profileBlock = summarizedJson
    ? `\n\n---\n参考情報（ログから推定した私の像 / 補助・圧縮版）:\nsnapshot:\n- turn: ${snapshot.turnIndex}\n- time: ${fmtTime(snapshot.ts)}\n\nprofile(json, compact):\n${summarizedJson}\n\n使い方:\n- このprofileは補助。矛盾したら「直近の私の発言」と「会話ログ」を優先する\n- 口調（語尾/改行/断定度/質問頻度）はこのprofileに強く寄せる\n- 返答にprofileやルール文を引用しない（自然な会話文だけにする）`
    : "";
  return (header + profileBlock).trim();
}

function makeMockReply(persona, messages) {
  const q = lastUserMessage(messages);
  const lines = [];
  lines.push("了解。1年前の私として答えるね。");
  if (q.trim().length === 0) {
    lines.push("まず、状況を一言で。何に詰まってる？");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("結論：いまは「次の一歩」を最小化しよう。");
  lines.push("");
  lines.push("確認したいこと（どれか1つでOK）:");
  lines.push("- 期限はいつ？");
  lines.push("- 失敗の最悪は何？（現実的に）");
  lines.push("- いま持ってる選択肢を3つ書ける？");
  lines.push("");
  lines.push("次の一歩（おすすめ）:");
  lines.push("- 5分だけ：選択肢を箇条書き→一番マシを1つ選ぶ");
  lines.push("- 25分だけ：その案を小さく試す");
  lines.push("");
  lines.push("（この返答は疑似応答。設定でGeminiに切り替え可）");
  if (persona && persona.trim().length > 0) {
    lines.push("");
    lines.push("人格メモ（あなた設定）:");
    lines.push(persona.trim().slice(0, 200) + (persona.trim().length > 200 ? "…" : ""));
  }
  return lines.join("\n");
}

async function callGeminiViaServer({ model, persona, messages }) {
  let resp;
  try {
    resp = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, persona, messages }),
    });
  } catch (e) {
    throw new Error(
      `Geminiに接続できませんでした（/api/gemini）\n` +
        `ローカル直開きの場合はサーバーが無いので、Vercelにデプロイして試すか、設定で「疑似応答」に切り替えてください。\n` +
        `詳細: ${e?.message || String(e)}`
    );
  }

  const ct = resp.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await resp.json().catch(() => ({})) : {};
  if (!resp.ok) {
    // 429は「待てば回復」するケースが多いので、クライアント側で1回だけ自動リトライする
    if (resp.status === 429) {
      const retryAfterSeconds =
        typeof data?.retryAfterSeconds === "number" && Number.isFinite(data.retryAfterSeconds) ? data.retryAfterSeconds : null;
      const waitSec = retryAfterSeconds ? Math.min(Math.max(1, retryAfterSeconds), 60) : 15;
      // サーバ側で待つとタイムアウトしやすいので、ここで待つ
      await new Promise((r) => setTimeout(r, Math.round(waitSec * 1000)));
      // 2回目（これ以上はループしない）
      const resp2 = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, persona, messages }),
      });
      const ct2 = resp2.headers.get("content-type") || "";
      const data2 = ct2.includes("application/json") ? await resp2.json().catch(() => ({})) : {};
      if (!resp2.ok) {
        const base2 = data2?.error || `Gemini API error (${resp2.status} ${resp2.statusText})`;
        const hint2 = data2?.hint || "";
        throw new Error(`${base2}${hint2 ? `\n${hint2}` : ""}`);
      }
      const text2 = data2?.text || "";
      if (!text2) throw new Error("Geminiの返答が空でした（モデル名を確認）");
      const used2 = data2?.modelUsed ? `\n\n（model: ${data2.modelUsed}）` : "";
      return text2 + used2;
    }

    const hint =
      data?.hint ||
      (data?.error === "Missing GEMINI_API_KEY"
        ? "Vercel環境変数に GEMINI_API_KEY を設定してください。"
        : "");
    const base = data?.error || `Gemini API error (${resp.status} ${resp.statusText})`;
    const statusLine =
      typeof data?.status === "number" || typeof data?.statusText === "string"
        ? `\n(upstream: ${data?.status ?? "?"} ${data?.statusText ?? ""})`
        : "";
    const detailsText = data?.details ? String(data.details).slice(0, 2000) : "";
    const detailsJson = data?.detailsJson ? JSON.stringify(data.detailsJson, null, 2).slice(0, 2000) : "";
    const detailsBlock =
      detailsText || detailsJson
        ? `\n\n--- upstream details ---\n${detailsJson || detailsText}`
        : "";
    throw new Error(`${base}${statusLine}${hint ? `\n${hint}` : ""}${detailsBlock}`);
  }

  const text = data?.text || "";
  if (!text) throw new Error("Geminiの返答が空でした（モデル名を確認）");
  const used = data?.modelUsed ? `\n\n（model: ${data.modelUsed}）` : "";
  const finish = data?.finishReason ? ` / finish: ${data.finishReason}` : "";
  return text + used + (used ? finish : finish ? `\n\n（${finish.trim().replace(/^\//, "").trim()}）` : "");
}

async function generateReply(state) {
  const { provider, model, persona } = state.settings;
  const activeSnap = getActiveSnapshot(state);
  const personaWithProfile = buildPersonaWithProfile(persona, activeSnap);
  if (provider === "gemini") {
    if (!model) throw new Error("モデル名が未設定です（設定から入力）");
    return await callGeminiViaServer({ model, persona: personaWithProfile, messages: state.messages });
  }
  // default mock
  await new Promise((r) => setTimeout(r, 350));
  return makeMockReply(personaWithProfile, state.messages);
}

function wireUI(state) {
  const composerForm = el("composerForm");
  const promptInput = el("promptInput");

  const settingsDialog = el("settingsDialog");
  const btnSettings = el("btnSettings");
  const btnCloseSettings = el("btnCloseSettings");
  const btnCancel = el("btnCancel");

  const providerSelect = el("providerSelect");
  const modelInput = el("modelInput");
  const personaInput = el("personaInput");
  const snapshotSelect = el("snapshotSelect");
  const btnSave = el("btnSave");
  const btnTest = el("btnTest");
  const testResult = el("testResult");

  const btnNewChat = el("btnNewChat");
  const btnClearChat = el("btnClearChat");
  const btnExport = el("btnExport");
  const btnImport = el("btnImport");
  const importFile = el("importFile");

  function openSettings() {
    providerSelect.value = state.settings.provider;
    modelInput.value = state.settings.model || "";
    personaInput.value = state.settings.persona || DEFAULT_PERSONA;
    // snapshots
    snapshotSelect.innerHTML = "";
    const optLatest = document.createElement("option");
    optLatest.value = "latest";
    optLatest.textContent = "最新（いまの自分）";
    snapshotSelect.appendChild(optLatest);
    // 新しい順に並べる
    const snaps = [...(state.snapshots || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    for (const s of snaps) {
      const opt = document.createElement("option");
      opt.value = s.snapshotId;
      opt.textContent = `turn ${s.turnIndex} · ${fmtTime(s.ts)}`;
      snapshotSelect.appendChild(opt);
    }
    snapshotSelect.value = state.settings.activeSnapshotId || "latest";
    testResult.textContent = "";
    settingsDialog.showModal();
  }

  function closeSettings() {
    settingsDialog.close();
  }

  btnSettings.addEventListener("click", openSettings);
  btnCloseSettings.addEventListener("click", closeSettings);
  btnCancel.addEventListener("click", closeSettings);

  btnSave.addEventListener("click", (e) => {
    e.preventDefault();
    state.settings.provider = providerSelect.value === "gemini" ? "gemini" : "mock";
    state.settings.model = sanitizeText(modelInput.value || DEFAULT_SETTINGS.model).trim();
    state.settings.persona = sanitizeText(personaInput.value || DEFAULT_PERSONA).trim();
    state.settings.activeSnapshotId = snapshotSelect.value || "latest";
    persist(state);
    closeSettings();
  });

  btnTest.addEventListener("click", async () => {
    testResult.textContent = "テスト中…";
    try {
      const provider = providerSelect.value === "gemini" ? "gemini" : "mock";
      const model = sanitizeText(modelInput.value || DEFAULT_SETTINGS.model).trim();
      const persona = sanitizeText(personaInput.value || DEFAULT_PERSONA).trim();

      if (provider === "mock") {
        await new Promise((r) => setTimeout(r, 200));
        testResult.textContent = "OK（疑似応答）";
        return;
      }

      // まず利用可能モデル一覧を取得（-preview など実在名を確認できる）
      const listResp = await fetch("/api/gemini?listModels=1");
      const listCt = listResp.headers.get("content-type") || "";
      const listData = listCt.includes("application/json") ? await listResp.json().catch(() => ({})) : {};
      const modelHints = Array.isArray(listData?.models)
        ? listData.models.map((m) => String(m?.name || "").replace(/^models\//, "")).filter(Boolean)
        : [];

      const text = await callGeminiViaServer({
        model,
        persona,
        messages: [
          { id: uid(), role: "user", text: "接続テストです。短く自己紹介して。", ts: now() },
        ],
      });
      const hintLine = modelHints.length ? ` / models例: ${modelHints.slice(0, 3).join(", ")}${modelHints.length > 3 ? ", …" : ""}` : "";
      testResult.textContent = `OK（返答あり）: ${text.slice(0, 60)}${text.length > 60 ? "…" : ""}${hintLine}`;
    } catch (err) {
      testResult.textContent = `NG: ${err?.message || String(err)}`;
    }
  });

  btnNewChat.addEventListener("click", () => {
    state.messages = [];
    state.profile = { ...DEFAULT_PROFILE, updatedAt: now() };
    state.snapshots = [];
    ensureFirstBotGreeting(state);
    // 初期スナップショット
    state.snapshots.push({
      snapshotId: uid(),
      turnIndex: 0,
      ts: now(),
      profile: structuredCloneSafe(state.profile),
      delta: { reason: "init" },
    });
    state.settings.activeSnapshotId = "latest";
    persist(state);
    render(state);
    promptInput.focus();
  });

  btnClearChat.addEventListener("click", () => {
    state.messages = [];
    state.profile = { ...DEFAULT_PROFILE, updatedAt: now() };
    state.snapshots = [];
    ensureFirstBotGreeting(state);
    state.snapshots.push({
      snapshotId: uid(),
      turnIndex: 0,
      ts: now(),
      profile: structuredCloneSafe(state.profile),
      delta: { reason: "init" },
    });
    state.settings.activeSnapshotId = "latest";
    persist(state);
    render(state);
  });

  btnExport.addEventListener("click", () => {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: { ...state.settings },
      messages: state.messages,
      memory: {
        profile: state.profile,
        snapshots: state.snapshots,
      },
    };
    downloadText(`pastself-chat-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
  });

  btnImport.addEventListener("click", () => {
    importFile.value = "";
    importFile.click();
  });

  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data?.messages)) throw new Error("messagesが見つかりません");
      state.messages = data.messages
        .filter((m) => m && (m.role === "user" || m.role === "bot") && typeof m.text === "string")
        .map((m) => ({ id: m.id || uid(), role: m.role, text: sanitizeText(m.text), ts: Number(m.ts) || now() }));
      if (data?.memory?.profile) {
        state.profile = data.memory.profile;
      }
      if (Array.isArray(data?.memory?.snapshots)) {
        state.snapshots = data.memory.snapshots
          .filter((s) => s && typeof s.snapshotId === "string" && typeof s.turnIndex === "number")
          .map((s) => ({
            snapshotId: s.snapshotId || uid(),
            turnIndex: Number(s.turnIndex) || 0,
            ts: Number(s.ts) || now(),
            profile: s.profile ?? structuredCloneSafe(DEFAULT_PROFILE),
            delta: s.delta ?? null,
          }));
      }
      if (data?.settings && typeof data.settings === "object") {
        // apiKeyなどは取り込まない
        const next = { ...state.settings, ...data.settings };
        if ("apiKey" in next) delete next.apiKey;
        state.settings = next;
      }
      ensureFirstBotGreeting(state);
      if (!state.profile) state.profile = { ...DEFAULT_PROFILE, updatedAt: now() };
      if (!Array.isArray(state.snapshots) || state.snapshots.length === 0) {
        state.snapshots = [
          { snapshotId: uid(), turnIndex: 0, ts: now(), profile: structuredCloneSafe(state.profile), delta: { reason: "init" } },
        ];
      }
      if (!state.settings.activeSnapshotId) state.settings.activeSnapshotId = "latest";
      persist(state);
      render(state);
    } catch (err) {
      alert(`読み込みに失敗: ${err?.message || String(err)}`);
    }
  });

  composerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = sanitizeText(promptInput.value).trim();
    if (!text) return;

    const messageId = uid();
    state.messages.push({ id: messageId, role: "user", text, ts: now() });
    // 毎チャット（ユーザー入力）ごとに「自分プロファイル」を更新してスナップショット保存
    const before = structuredCloneSafe(state.profile);
    state.profile = updateProfileFromUserText(state.profile, text);
    const delta = { reason: "user_message", beforeUpdatedAt: before?.updatedAt ?? null, afterUpdatedAt: state.profile?.updatedAt ?? null };
    createSnapshot(state, messageId, delta);
    promptInput.value = "";
    persist(state);
    render(state);

    setBusy(true);
    try {
      const reply = await generateReply(state);
      state.messages.push({ id: uid(), role: "bot", text: sanitizeText(reply), ts: now() });
      persist(state);
      render(state);
    } catch (err) {
      state.messages.push({
        id: uid(),
        role: "bot",
        text: `エラー: ${err?.message || String(err)}\n\n（まずは設定で「疑似応答」にすると確実に動きます）`,
        ts: now(),
      });
      persist(state);
      render(state);
    } finally {
      setBusy(false);
      promptInput.focus();
    }
  });
}

function main() {
  const state = createState();
  persist(state);
  wireUI(state);
  render(state);
  el("promptInput").focus();
}

main();

