const STORAGE_KEYS = {
  settings: "pastself.settings.v1",
  chat: "pastself.chat.v1",
};

const DEFAULT_PERSONA = `あなたは「1年前の私」です。
いまの私が迷っているときに、当時の価値観・制約・状況を前提に助言してください。
短く要点から。必要なら質問して確認してください。`;

const DEFAULT_SETTINGS = {
  provider: "gemini", // "mock" | "gemini"
  model: "gemini-2.0-flash",
  persona: DEFAULT_PERSONA,
};

/** @typedef {{ id:string, role:"user"|"bot", text:string, ts:number }} ChatMessage */

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
    text: "1年前の私です。いま一番困ってることは何？（短くでOK）",
    ts: now(),
  });
}

function createState() {
  /** @type {{ settings: typeof DEFAULT_SETTINGS, messages: ChatMessage[] }} */
  const state = {
    settings: { ...DEFAULT_SETTINGS, ...loadJson(STORAGE_KEYS.settings, {}) },
    messages: loadJson(STORAGE_KEYS.chat, []),
  };
  // 以前の版で保存されていたapiKeyは使わない（サーバー側envで保護する）
  if ("apiKey" in state.settings) delete state.settings.apiKey;
  state.settings.persona = sanitizeText(state.settings.persona || DEFAULT_PERSONA);
  ensureFirstBotGreeting(state);
  return state;
}

function persist(state) {
  saveJson(STORAGE_KEYS.settings, state.settings);
  saveJson(STORAGE_KEYS.chat, state.messages);
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
    const hint =
      data?.hint ||
      (data?.error === "Missing GEMINI_API_KEY"
        ? "Vercel環境変数に GEMINI_API_KEY を設定してください。"
        : "");
    const base = data?.error || `Gemini API error (${resp.status} ${resp.statusText})`;
    throw new Error(`${base}${hint ? `\n${hint}` : ""}`);
  }

  const text = data?.text || "";
  if (!text) throw new Error("Geminiの返答が空でした（モデル名を確認）");
  return text;
}

async function generateReply(state) {
  const { provider, model, persona } = state.settings;
  if (provider === "gemini") {
    if (!model) throw new Error("モデル名が未設定です（設定から入力）");
    return await callGeminiViaServer({ model, persona, messages: state.messages });
  }
  // default mock
  await new Promise((r) => setTimeout(r, 350));
  return makeMockReply(persona, state.messages);
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

      const text = await callGeminiViaServer({
        model,
        persona,
        messages: [
          { id: uid(), role: "user", text: "接続テストです。短く自己紹介して。", ts: now() },
        ],
      });
      testResult.textContent = `OK（返答あり）: ${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`;
    } catch (err) {
      testResult.textContent = `NG: ${err?.message || String(err)}`;
    }
  });

  btnNewChat.addEventListener("click", () => {
    state.messages = [];
    ensureFirstBotGreeting(state);
    persist(state);
    render(state);
    promptInput.focus();
  });

  btnClearChat.addEventListener("click", () => {
    state.messages = [];
    ensureFirstBotGreeting(state);
    persist(state);
    render(state);
  });

  btnExport.addEventListener("click", () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: { ...state.settings },
      messages: state.messages,
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
      ensureFirstBotGreeting(state);
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

    state.messages.push({ id: uid(), role: "user", text, ts: now() });
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

