(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const els = {
    appShell: $("#appShell"), sidebar: $("#sidebar"), outlinePanel: $("#outlinePanel"),
    fileInput: $("#fileInput"), importButton: $("#importButton"), welcomeImportButton: $("#welcomeImportButton"),
    demoButton: $("#demoButton"), dropZone: $("#dropZone"), conversationSearch: $("#conversationSearch"),
    conversationList: $("#conversationList"), conversationCount: $("#conversationCount"), sidebarMeta: $("#sidebarMeta"),
    clearDataButton: $("#clearDataButton"), welcomeView: $("#welcomeView"), readerView: $("#readerView"),
    conversationHeader: $("#conversationHeader"), messages: $("#messages"), topbarTitle: $("#topbarTitle"),
    exportButton: $("#exportButton"), outlineButton: $("#outlineButton"), outlineSearch: $("#outlineSearch"),
    outlineList: $("#outlineList"), outlineFooter: $("#outlineFooter"), openSidebar: $("#openSidebar"),
    closeSidebar: $("#closeSidebar"), closeOutline: $("#closeOutline"), mobileScrim: $("#mobileScrim"),
    themeButton: $("#themeButton"), loadingOverlay: $("#loadingOverlay"), loadingText: $("#loadingText"),
    toastRegion: $("#toastRegion"), reader: $("#readerView"), searchHint: $("#searchHint")
  };

  const state = {
    conversations: [], filtered: [], selectedId: null, outline: [], activeTurn: 0,
    observer: null, sourceName: "", outlineResults: []
  };

  const icons = {
    calendar: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4m8-4v4M3.5 9.5h17"/></svg>',
    message: '<svg viewBox="0 0 24 24"><path d="M20 15a3 3 0 0 1-3 3H8l-4 3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>'
  };

  init();

  function init() {
    const savedTheme = localStorage.getItem("gpt-reader-theme");
    if (savedTheme === "dark" || (!savedTheme && matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.dataset.theme = "dark";
    }
    els.searchHint.textContent = navigator.platform.toLowerCase().includes("mac") ? "⌘ K" : "Ctrl K";
    bindEvents();
  }

  function bindEvents() {
    const openPicker = () => { els.fileInput.value = ""; els.fileInput.click(); };
    els.importButton.addEventListener("click", openPicker);
    els.welcomeImportButton.addEventListener("click", openPicker);
    els.fileInput.addEventListener("change", () => els.fileInput.files[0] && importFile(els.fileInput.files[0]));
    els.demoButton.addEventListener("click", loadDemo);
    els.exportButton.addEventListener("click", exportCurrentMarkdown);
    els.clearDataButton.addEventListener("click", clearData);
    els.conversationSearch.addEventListener("input", renderConversationList);
    els.outlineSearch.addEventListener("input", renderOutline);
    els.outlineSearch.addEventListener("keydown", handleOutlineKeys);
    els.themeButton.addEventListener("click", toggleTheme);
    els.openSidebar.addEventListener("click", () => openDrawer("sidebar"));
    els.closeSidebar.addEventListener("click", closeDrawers);
    els.outlineButton.addEventListener("click", () => openDrawer("outline"));
    els.closeOutline.addEventListener("click", closeDrawers);
    els.mobileScrim.addEventListener("click", closeDrawers);
    document.addEventListener("keydown", handleGlobalKeys);
    document.addEventListener("click", (event) => {
      const button = event.target.closest(".copy-code");
      if (button) copyCode(button);
    });
    ["dragenter", "dragover"].forEach(type => document.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach(type => document.addEventListener(type, (event) => {
      event.preventDefault();
      if (type === "dragleave" && event.relatedTarget) return;
      els.dropZone.classList.remove("dragging");
    }));
    document.addEventListener("drop", (event) => {
      const file = event.dataTransfer.files[0];
      if (file) importFile(file);
    });
  }

  async function importFile(file) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".json") && !lower.endsWith(".zip")) {
      toast("请选择 ChatGPT 导出的 ZIP 或 conversations.json");
      return;
    }
    setLoading(true, lower.endsWith(".zip") ? "正在解压导出包…" : "正在读取对话…");
    try {
      let jsonText;
      if (lower.endsWith(".zip")) jsonText = await extractConversationsFromZip(file);
      else jsonText = await file.text();
      await yieldToUI();
      const raw = JSON.parse(jsonText.replace(/^\uFEFF/, ""));
      const list = Array.isArray(raw) ? raw : raw.conversations;
      if (!Array.isArray(list)) throw new Error("文件里没有找到对话数组");
      const normalized = list.map(normalizeConversation).filter(c => c.messages.length);
      if (!normalized.length) throw new Error("没有找到可阅读的用户/助手消息");
      normalized.sort((a, b) => b.updateTime - a.updateTime);
      state.conversations = normalized;
      state.filtered = normalized;
      state.sourceName = file.name;
      els.conversationSearch.value = "";
      els.sidebarMeta.hidden = false;
      els.conversationCount.textContent = `${normalized.length.toLocaleString("zh-CN")} 个对话`;
      renderConversationList();
      selectConversation(normalized[0].id);
      toast(`已载入 ${normalized.length.toLocaleString("zh-CN")} 个对话`);
    } catch (error) {
      console.error(error);
      toast(`导入失败：${friendlyError(error)}`, 4800);
    } finally {
      setLoading(false);
    }
  }

  async function extractConversationsFromZip(file) {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const min = Math.max(0, buffer.byteLength - 65557);
    let eocd = -1;
    for (let i = buffer.byteLength - 22; i >= min; i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("无法识别这个 ZIP 文件");
    const entryCount = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    let target = null;
    const decoder = new TextDecoder("utf-8");
    for (let i = 0; i < entryCount && offset + 46 <= buffer.byteLength; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
      if (/(^|\/)conversations\.json$/i.test(name)) {
        target = { method, compressedSize, uncompressedSize, localOffset, name };
        break;
      }
      offset += 46 + nameLength + extraLength + commentLength;
    }
    if (!target) throw new Error("ZIP 中没有 conversations.json");
    if (view.getUint32(target.localOffset, true) !== 0x04034b50) throw new Error("ZIP 条目已损坏");
    const localNameLength = view.getUint16(target.localOffset + 26, true);
    const localExtraLength = view.getUint16(target.localOffset + 28, true);
    const start = target.localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(start, start + target.compressedSize);
    let output;
    if (target.method === 0) output = compressed;
    else if (target.method === 8) {
      if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持 ZIP 解压，请改选 conversations.json");
      try {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        output = new Uint8Array(await new Response(stream).arrayBuffer());
      } catch {
        throw new Error("ZIP 解压失败，请解压后选择 conversations.json");
      }
    } else throw new Error(`暂不支持 ZIP 压缩方式 ${target.method}`);
    return decoder.decode(output);
  }

  function normalizeConversation(raw, index) {
    const mapping = raw.mapping || {};
    const path = getConversationPath(mapping, raw.current_node);
    const messages = [];
    for (const node of path) {
      const msg = node && node.message;
      if (!msg || !msg.author) continue;
      const role = msg.author.role;
      if (role !== "user" && role !== "assistant") continue;
      const text = extractContent(msg.content);
      if (!text.trim()) continue;
      messages.push({
        id: msg.id || node.id || `${index}-${messages.length}`,
        role, text, time: Number(msg.create_time || 0),
        authorName: msg.author.name || ""
      });
    }
    const createTime = Number(raw.create_time || messages[0]?.time || 0);
    const updateTime = Number(raw.update_time || messages.at(-1)?.time || createTime);
    const title = String(raw.title || firstUserText(messages) || "未命名对话").trim();
    const turns = buildTurns(messages);
    return {
      id: raw.id || raw.conversation_id || `conversation-${index}`,
      title, createTime, updateTime, messages, turns,
      preview: truncate(firstUserText(messages) || messages[0]?.text || "", 80)
    };
  }

  function getConversationPath(mapping, currentNodeId) {
    const nodes = Object.values(mapping);
    if (!nodes.length) return [];
    if (currentNodeId && mapping[currentNodeId]) {
      const reverse = [];
      const seen = new Set();
      let node = mapping[currentNodeId];
      while (node && !seen.has(node.id)) {
        reverse.push(node); seen.add(node.id);
        node = node.parent ? mapping[node.parent] : null;
      }
      return reverse.reverse();
    }
    const withMessage = nodes.filter(n => n.message).sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0));
    return withMessage;
  }

  function extractContent(content) {
    if (!content) return "";
    if (typeof content === "string") return content;
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const output = [];
    for (const part of parts) {
      if (typeof part === "string") output.push(part);
      else if (!part) continue;
      else if (part.content_type === "image_asset_pointer" || part.asset_pointer) output.push("[图片附件]");
      else if (part.content_type === "audio_transcription" && part.text) output.push(part.text);
      else if (part.text) output.push(String(part.text));
      else if (part.name) output.push(`[附件：${part.name}]`);
    }
    if (!output.length && typeof content.text === "string") output.push(content.text);
    if (!output.length && content.result) output.push(String(content.result));
    return output.join("\n\n");
  }

  function buildTurns(messages) {
    const turns = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (message.role !== "user") continue;
      const answers = [];
      for (let j = i + 1; j < messages.length && messages[j].role !== "user"; j++) {
        if (messages[j].role === "assistant") answers.push(messages[j]);
      }
      turns.push({ index: turns.length, messageIndex: i, question: message, answers });
    }
    return turns;
  }

  function renderConversationList() {
    const query = els.conversationSearch.value.trim().toLocaleLowerCase();
    state.filtered = query ? state.conversations.filter(c => {
      if (c.title.toLocaleLowerCase().includes(query)) return true;
      return c.messages.some(m => m.text.toLocaleLowerCase().includes(query));
    }) : state.conversations;
    els.conversationList.innerHTML = "";
    if (!state.filtered.length) {
      els.conversationList.innerHTML = `<div class="empty-search">没有找到相关对话<br>试试更短的关键词</div>`;
      return;
    }
    let lastGroup = "";
    const fragment = document.createDocumentFragment();
    for (const conversation of state.filtered) {
      const group = dateGroup(conversation.updateTime);
      if (group !== lastGroup) {
        const label = document.createElement("div");
        label.className = "date-group";
        label.textContent = group;
        fragment.appendChild(label);
        lastGroup = group;
      }
      const button = document.createElement("button");
      button.className = `conversation-item${conversation.id === state.selectedId ? " active" : ""}`;
      button.dataset.id = conversation.id;
      button.innerHTML = `<div class="conversation-title">${escapeHtml(conversation.title)}</div><div class="conversation-preview">${escapeHtml(conversation.preview)}</div>`;
      button.addEventListener("click", () => selectConversation(conversation.id));
      fragment.appendChild(button);
    }
    els.conversationList.appendChild(fragment);
  }

  function selectConversation(id) {
    const conversation = state.conversations.find(c => c.id === id);
    if (!conversation) return;
    state.selectedId = id;
    state.activeTurn = 0;
    els.welcomeView.hidden = true;
    els.readerView.hidden = false;
    els.exportButton.disabled = false;
    els.outlineButton.hidden = false;
    els.topbarTitle.textContent = conversation.title;
    renderConversationList();
    renderConversation(conversation);
    renderOutline();
    els.reader.scrollTop = 0;
    closeDrawers();
  }

  function renderConversation(conversation) {
    const wordCount = conversation.messages.reduce((sum, m) => sum + countChars(m.text), 0);
    const minutes = Math.max(1, Math.round(wordCount / 450));
    els.conversationHeader.innerHTML = `
      <span class="eyebrow">CHATGPT CONVERSATION</span>
      <h1>${escapeHtml(conversation.title)}</h1>
      <div class="conversation-stats">
        <span>${icons.calendar}${formatDate(conversation.createTime, true)}</span>
        <span>${icons.message}${conversation.turns.length} 轮问答 · ${conversation.messages.length} 条消息</span>
        <span>${icons.clock}约 ${minutes} 分钟阅读</span>
      </div>`;
    els.messages.innerHTML = "";
    const turnByMessage = new Map(conversation.turns.map(t => [t.messageIndex, t.index]));
    const fragment = document.createDocumentFragment();
    conversation.messages.forEach((message, messageIndex) => {
      const section = document.createElement("section");
      const turnIndex = turnByMessage.has(messageIndex) ? turnByMessage.get(messageIndex) : null;
      section.className = `message ${message.role}`;
      section.id = turnIndex !== null ? `turn-${turnIndex}` : `message-${messageIndex}`;
      if (turnIndex !== null) section.dataset.turn = String(turnIndex);
      const roleName = message.role === "user" ? "你" : "ChatGPT";
      const roleInitial = message.role === "user" ? "你" : "G";
      section.innerHTML = `
        <div class="message-role">
          <span class="role-avatar">${roleInitial}</span>
          <strong>${roleName}</strong>
          ${message.time ? `<time class="message-time">${formatTime(message.time)}</time>` : ""}
        </div>
        <div class="message-body">${renderMarkdown(message.text)}</div>`;
      fragment.appendChild(section);
    });
    els.messages.appendChild(fragment);
    observeTurns();
  }

  function renderOutline() {
    const conversation = currentConversation();
    if (!conversation) return;
    const query = els.outlineSearch.value.trim().toLocaleLowerCase();
    state.outlineResults = conversation.turns.filter(turn => !query ||
      turn.question.text.toLocaleLowerCase().includes(query) ||
      turn.answers.some(a => a.text.toLocaleLowerCase().includes(query))
    );
    els.outlineList.innerHTML = "";
    if (!state.outlineResults.length) {
      els.outlineList.innerHTML = `<div class="empty-search">本对话中没有匹配内容</div>`;
      return;
    }
    const fragment = document.createDocumentFragment();
    state.outlineResults.forEach(turn => {
      const button = document.createElement("button");
      button.className = `outline-item${turn.index === state.activeTurn ? " active" : ""}`;
      button.dataset.turn = String(turn.index);
      button.innerHTML = `<span class="outline-number">${String(turn.index + 1).padStart(2, "0")}</span><span class="outline-title">${escapeHtml(cleanPreview(turn.question.text, 74))}</span>${turn.answers[0] ? `<span class="outline-answer">${escapeHtml(cleanPreview(turn.answers[0].text, 80))}</span>` : ""}`;
      button.addEventListener("click", () => jumpToTurn(turn.index));
      fragment.appendChild(button);
    });
    els.outlineList.appendChild(fragment);
  }

  function jumpToTurn(index) {
    const target = document.getElementById(`turn-${index}`);
    if (!target) return;
    state.activeTurn = index;
    updateOutlineActive();
    const readerRect = els.reader.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetScrollTop = els.reader.scrollTop + targetRect.top - readerRect.top - 18;
    els.reader.scrollTo({ top: Math.max(0, targetScrollTop), behavior: "smooth" });
    closeDrawers();
  }

  function observeTurns() {
    if (state.observer) state.observer.disconnect();
    state.observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
      if (!visible.length) return;
      state.activeTurn = Number(visible[0].target.dataset.turn);
      updateOutlineActive();
    }, { root: els.reader, rootMargin: "-8% 0px -76% 0px", threshold: 0 });
    document.querySelectorAll(".message[data-turn]").forEach(el => state.observer.observe(el));
  }

  function updateOutlineActive() {
    els.outlineList.querySelectorAll(".outline-item").forEach(el => {
      el.classList.toggle("active", Number(el.dataset.turn) === state.activeTurn);
    });
    const active = els.outlineList.querySelector(".outline-item.active");
    if (active) keepOutlineItemVisible(active);
  }

  function keepOutlineItemVisible(item) {
    const listRect = els.outlineList.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const margin = 8;
    if (itemRect.top < listRect.top + margin) {
      els.outlineList.scrollTop += itemRect.top - listRect.top - margin;
    } else if (itemRect.bottom > listRect.bottom - margin) {
      els.outlineList.scrollTop += itemRect.bottom - listRect.bottom + margin;
    }
  }

  function renderMarkdown(text) {
    const codeBlocks = [];
    let working = String(text).replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, language, code) => {
      const token = `\u0000CODE${codeBlocks.length}\u0000`;
      codeBlocks.push({ language: language.trim() || "code", code: code.replace(/\n$/, "") });
      return `\n${token}\n`;
    });
    const lines = working.replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let listType = null;
    const closeList = () => { if (listType) { html.push(`</${listType}>`); listType = null; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const codeMatch = line.match(/^\u0000CODE(\d+)\u0000$/);
      if (codeMatch) {
        closeList();
        const block = codeBlocks[Number(codeMatch[1])];
        html.push(`<div class="code-block"><div class="code-head"><span>${escapeHtml(block.language)}</span><button class="copy-code" type="button">复制</button></div><pre><code>${escapeHtml(block.code)}</code></pre></div>`);
        continue;
      }
      if (!line.trim()) { closeList(); continue; }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) { closeList(); const level = heading[1].length; html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue; }
      if (/^\s*[-*_]{3,}\s*$/.test(line)) { closeList(); html.push("<hr>"); continue; }
      const quote = line.match(/^>\s?(.*)$/);
      if (quote) { closeList(); html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`); continue; }
      const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        const type = unordered ? "ul" : "ol";
        if (listType !== type) { closeList(); listType = type; html.push(`<${type}>`); }
        html.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
        continue;
      }
      closeList();
      if (/^\[(图片|附件)[^\]]*\]$/.test(line.trim())) html.push(`<div class="message-attachment">${inlineMarkdown(line)}</div>`);
      else html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
    closeList();
    return html.join("");
  }

  function inlineMarkdown(text) {
    let safe = escapeHtml(text);
    safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    safe = safe.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return safe;
  }

  function exportCurrentMarkdown() {
    const conversation = currentConversation();
    if (!conversation) return;
    const lines = [
      `# ${conversation.title}`,
      "",
      `> 导出自 GPT Reader · ${formatDate(conversation.createTime, true)} · ${conversation.turns.length} 轮问答`,
      "",
      "---",
      ""
    ];
    conversation.messages.forEach(message => {
      lines.push(`## ${message.role === "user" ? "用户" : "ChatGPT"}`);
      if (message.time) lines.push(`*${formatDateTime(message.time)}*`);
      lines.push("", message.text.trim(), "", "---", "");
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(conversation.title)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Markdown 已导出");
  }

  function loadDemo() {
    const now = Date.now() / 1000;
    const demo = [
      {
        id: "demo-1", title: "怎样建立一个真正可坚持的阅读习惯？", create_time: now - 86400 * 2, update_time: now - 86400 * 2,
        mapping: makeDemoMapping([
          ["user", "我总是买很多书，但真正读完的很少。能不能帮我建立一个不靠意志力的阅读习惯？"],
          ["assistant", "可以。关键不是把目标定得更大，而是让开始阅读这件事**足够轻**。\n\n### 一个可执行的最小系统\n\n1. 每天只承诺读 **两页**，读得下去可以继续，读不下去就停。\n2. 把书放在固定触发物旁边，例如咖啡杯或枕头。\n3. 只记录「今天是否翻开」，不要记录页数。\n\n> 习惯的第一目标不是产量，而是让行为稳定出现。"],
          ["user", "如果同时有好几本想读，应该怎么选？"],
          ["assistant", "保留一个「正在读」书位和一个「随手翻」书位就够了。主书连续读 7 天后仍然没有兴趣，可以放心换书。放弃一本不合适的书，不等于放弃阅读。"],
          ["user", "能给我一个每天晚上使用的简短清单吗？"],
          ["assistant", "当然：\n\n- [ ] 手机放到够不着的地方\n- [ ] 坐到固定位置\n- [ ] 打开书，读两页\n- [ ] 在日历上画一个点\n\n整个流程的目标是控制在 10 分钟以内。"]
        ], now - 86400 * 2)
      },
      {
        id: "demo-2", title: "给周末城市散步设计一条路线", create_time: now - 86400 * 12, update_time: now - 86400 * 12,
        mapping: makeDemoMapping([
          ["user", "我想设计一条两小时的城市散步路线，有哪些原则？"],
          ["assistant", "一条舒服的城市散步路线，最好有明确的节奏：**进入、探索、停留、收束**。\n\n可以用 4:3:2:1 的比例安排街巷、开放空间、休息与回程，并确保中途至少有一个可以随时缩短路线的出口。"]
        ], now - 86400 * 12)
      }
    ];
    const normalized = demo.map(normalizeConversation);
    normalized.sort((a, b) => b.updateTime - a.updateTime);
    state.conversations = normalized;
    state.sourceName = "示例数据";
    els.sidebarMeta.hidden = false;
    els.conversationCount.textContent = `${normalized.length} 个示例对话`;
    renderConversationList();
    selectConversation(normalized[0].id);
    toast("示例已载入；你可以随时导入自己的数据");
  }

  function makeDemoMapping(messages, start) {
    const mapping = {};
    let parent = null;
    messages.forEach(([role, text], index) => {
      const id = `demo-node-${Math.random().toString(36).slice(2)}-${index}`;
      mapping[id] = { id, parent, children: [], message: { id, author: { role }, create_time: start + index * 180, content: { content_type: "text", parts: [text] } } };
      if (parent) mapping[parent].children.push(id);
      parent = id;
    });
    return mapping;
  }

  function clearData() {
    state.conversations = [];
    state.filtered = [];
    state.selectedId = null;
    if (state.observer) state.observer.disconnect();
    els.sidebarMeta.hidden = true;
    els.conversationList.innerHTML = "";
    els.messages.innerHTML = "";
    els.outlineList.innerHTML = "";
    els.readerView.hidden = true;
    els.welcomeView.hidden = false;
    els.exportButton.disabled = true;
    els.outlineButton.hidden = true;
    els.topbarTitle.textContent = "GPT Reader";
    closeDrawers();
    toast("数据已从内存中清除");
  }

  function handleGlobalKeys(event) {
    const modifier = navigator.platform.toLowerCase().includes("mac") ? event.metaKey : event.ctrlKey;
    if (modifier && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (innerWidth <= 760) openDrawer("sidebar");
      els.conversationSearch.focus();
    }
    if (event.key === "Escape") closeDrawers();
  }

  function handleOutlineKeys(event) {
    if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key) || !state.outlineResults.length) return;
    event.preventDefault();
    let pos = state.outlineResults.findIndex(t => t.index === state.activeTurn);
    if (event.key === "ArrowDown") pos = Math.min(state.outlineResults.length - 1, pos + 1);
    if (event.key === "ArrowUp") pos = Math.max(0, pos - 1);
    if (pos < 0) pos = 0;
    state.activeTurn = state.outlineResults[pos].index;
    updateOutlineActive();
    if (event.key === "Enter") jumpToTurn(state.activeTurn);
  }

  function openDrawer(which) {
    closeDrawers();
    (which === "sidebar" ? els.sidebar : els.outlinePanel).classList.add("open");
    els.mobileScrim.classList.add("show");
  }

  function closeDrawers() {
    els.sidebar.classList.remove("open");
    els.outlinePanel.classList.remove("open");
    els.mobileScrim.classList.remove("show");
  }

  function toggleTheme() {
    const dark = document.documentElement.dataset.theme === "dark";
    if (dark) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = "dark";
    localStorage.setItem("gpt-reader-theme", dark ? "light" : "dark");
  }

  async function copyCode(button) {
    const code = button.closest(".code-block").querySelector("code").textContent;
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = "已复制";
      setTimeout(() => button.textContent = "复制", 1200);
    } catch { toast("复制失败，请手动选择代码"); }
  }

  function currentConversation() { return state.conversations.find(c => c.id === state.selectedId); }
  function firstUserText(messages) { return messages.find(m => m.role === "user")?.text || ""; }
  function truncate(text, length) { return text.length > length ? text.slice(0, length - 1) + "…" : text; }
  function cleanPreview(text, length) { return truncate(text.replace(/```[\s\S]*?```/g, "[代码]").replace(/[#>*_`\[\]]/g, "").replace(/\s+/g, " ").trim(), length); }
  function countChars(text) { return text.replace(/\s/g, "").length; }
  function safeFilename(name) { return (name || "ChatGPT 对话").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/[. ]+$/, "").slice(0, 100) || "ChatGPT 对话"; }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]); }
  function timestampToDate(value) { const n = Number(value || 0); return new Date(n < 1e12 ? n * 1000 : n); }
  function formatDate(value, full = false) { const d = timestampToDate(value); if (Number.isNaN(d.getTime())) return "日期未知"; return new Intl.DateTimeFormat("zh-CN", full ? { year: "numeric", month: "long", day: "numeric" } : { month: "short", day: "numeric" }).format(d); }
  function formatTime(value) { const d = timestampToDate(value); return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(d); }
  function formatDateTime(value) { const d = timestampToDate(value); return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d); }

  function dateGroup(value) {
    const date = timestampToDate(value);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.floor((today - target) / 86400000);
    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    if (days < 7) return "最近 7 天";
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return "本月";
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(date);
  }

  function friendlyError(error) {
    if (error instanceof SyntaxError) return "JSON 格式无法解析，请确认选择了 conversations.json";
    return error?.message || "无法读取文件";
  }

  function setLoading(show, text = "正在读取对话…") {
    els.loadingText.textContent = text;
    els.loadingOverlay.hidden = !show;
  }

  function toast(message, duration = 2600) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    els.toastRegion.appendChild(node);
    setTimeout(() => node.remove(), duration);
  }

  function yieldToUI() { return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))); }
})();

