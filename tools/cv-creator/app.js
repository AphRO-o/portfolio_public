const STORAGE_KEY = "aphro-cv-creator-state-v1";
const MIN_FIT_SCALE = 0.82;
const FIT_SAFETY_PX = 32;
const PRINT_SAFETY_PX = 44;
const FONT_PRESETS = {
  song: {
    body: '"Times New Roman", "Songti SC", SimSun, serif',
    heading: 'SimHei, "Microsoft YaHei", Arial, sans-serif'
  },
  yahei: {
    body: '"Segoe UI", "Microsoft YaHei", Arial, sans-serif',
    heading: '"Segoe UI", "Microsoft YaHei", Arial, sans-serif'
  },
  kaiti: {
    body: 'Georgia, KaiTi, STKaiti, serif',
    heading: 'Georgia, KaiTi, STKaiti, serif'
  }
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

const demoState = () => ({
  personal: {
    name: "你的姓名",
    headerLines: [
      { text: "所在城市｜138-0000-0000｜hello@example.com" },
      { text: "求职方向｜专业领域" },
      { text: "[Portfolio](https://example.com)" }
    ]
  },
  settings: {
    spacing: 1, fontFamily: "song", bodySize: 10.5, nameSize: 22,
    sectionTitleSize: 12, sectionGap: 8.5, entryGap: 4.2, bulletGap: 0.7
  },
  sections: [
    {
      id: uid(), title: "教育背景", visible: true, collapsed: false, entries: [
        { id: uid(), title: "示例大学", subtitle: "专业名称 · 学位", date: "2022.09–2026.06", bullets: ["填写相关课程、研究方向或学术成果。", "用简明的数据或事实展示你的学习经历。"], visible: true }
      ]
    },
    {
      id: uid(), title: "工作与实习经历", visible: true, collapsed: false, entries: [
        { id: uid(), title: "公司或组织名称", subtitle: "岗位名称", date: "2025.06–2025.09", bullets: ["说明你负责的任务、采取的方法与实际结果。", "优先写可以验证的成果，避免堆砌职责描述。"], visible: true }
      ]
    },
    {
      id: uid(), title: "项目经历", visible: true, collapsed: false, entries: [
        { id: uid(), title: "项目名称", subtitle: "你的角色", date: "2025.03–2025.06", bullets: ["介绍项目解决的问题，以及你承担的具体工作。", "补充技术、作品链接或量化结果。"], visible: true }
      ]
    },
    {
      id: uid(), title: "技能与语言", visible: true, collapsed: false, entries: [
        { id: uid(), title: "", subtitle: "", date: "", bullets: ["专业技能：填写与你的目标岗位有关的工具和能力。", "语言能力：填写语言及相应熟练程度。"], visible: true }
      ]
    }
  ]
});

let state = loadState();
let fitResult = { fits: true, scale: 1 };
let saveTimer;
let toastTimer;
let draggedEntry = null;
let dragPlacement = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));

function safeLinkHref(value = "") {
  const href = String(value).trim();
  if (!href || /^(?:javascript|data|vbscript|file):/i.test(href)) return "";
  return href;
}

function renderInlineText(value = "") {
  const source = String(value);
  const linkPattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  let html = "";
  let cursor = 0;
  let match;
  while ((match = linkPattern.exec(source))) {
    html += escapeHTML(source.slice(cursor, match.index));
    const href = safeLinkHref(match[2]);
    html += href
      ? `<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(match[1])}</a>`
      : escapeHTML(match[0]);
    cursor = match.index + match[0].length;
  }
  return html + escapeHTML(source.slice(cursor));
}

function plainText(value = "") {
  return String(value).replace(/\[([^\]\n]+)\]\([^)\n]+\)/g, "$1");
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && parsed.personal && Array.isArray(parsed.sections)) return normalizeState(parsed);
  } catch (_) {}
  return demoState();
}

function normalizeState(candidate) {
  const fallback = demoState();
  const safeId = value => /^[A-Za-z0-9_-]+$/.test(String(value || "")) ? String(value) : uid();
  const candidateSettings = { ...fallback.settings, ...(candidate.settings || {}) };
  const candidatePersonal = candidate.personal || {};
  const legacyContact = [candidatePersonal.location, candidatePersonal.phone, candidatePersonal.email].filter(Boolean).join("｜");
  const headerLines = Array.isArray(candidatePersonal.headerLines)
    ? [0, 1, 2].map(index => {
        const sourceLine = candidatePersonal.headerLines[index];
        const text = typeof sourceLine === "string" ? sourceLine : String(sourceLine?.text || "");
        const legacyUrl = typeof sourceLine === "object" ? String(sourceLine?.url || "").trim() : "";
        return { text: legacyUrl && text ? `[${text}](${legacyUrl})` : text };
      })
    : [
        { text: legacyContact },
        { text: String(candidatePersonal.target || "") },
        { text: "" }
      ];
  const numberBetween = (value, minimum, maximum, fallbackValue) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallbackValue;
  };
  return {
    personal: {
      name: candidatePersonal.name === undefined ? fallback.personal.name : String(candidatePersonal.name),
      headerLines
    },
    settings: {
      spacing: numberBetween(candidateSettings.spacing, 0, 2, 1),
      fontFamily: FONT_PRESETS[candidateSettings.fontFamily] ? candidateSettings.fontFamily : "song",
      bodySize: numberBetween(candidateSettings.bodySize, 9, 12, 10.5),
      nameSize: numberBetween(candidateSettings.nameSize, 18, 28, 22),
      sectionTitleSize: numberBetween(candidateSettings.sectionTitleSize, 10, 16, 12),
      sectionGap: numberBetween(candidateSettings.sectionGap, 4, 16, 8.5),
      entryGap: numberBetween(candidateSettings.entryGap, 1, 10, 4.2),
      bulletGap: numberBetween(candidateSettings.bulletGap, 0, 3, 0.7)
    },
    sections: (candidate.sections || []).map(section => ({
      id: safeId(section.id),
      title: String(section.title || "未命名模块"),
      visible: section.visible !== false,
      collapsed: section.collapsed === true,
      entries: Array.isArray(section.entries) ? section.entries.map(entry => ({
        id: safeId(entry.id),
        title: String(entry.title || ""),
        subtitle: String(entry.subtitle || ""),
        date: String(entry.date || ""),
        bullets: Array.isArray(entry.bullets) ? entry.bullets.map(String) : [],
        visible: entry.visible !== false
      })) : []
    }))
  };
}

function queueSave() {
  const saveState = $("#saveState");
  saveState.classList.add("is-saving");
  saveState.lastChild.textContent = "保存中";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveState.classList.remove("is-saving");
    saveState.lastChild.textContent = "已保存";
  }, 260);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function renderAll() {
  renderPersonalEditor();
  renderSectionsEditor();
  renderPreview();
}

function renderPersonalEditor() {
  $$('[data-personal-field]').forEach(input => { input.value = state.personal[input.dataset.personalField] || ""; });
  $$('[data-header-line-index]').forEach(input => {
    const line = state.personal.headerLines[Number(input.dataset.headerLineIndex)];
    input.value = line?.[input.dataset.headerLineField] || "";
  });
  $("#spacingRange").value = state.settings.spacing;
  $("#fontFamilySelect").value = state.settings.fontFamily;
  $("#bodySizeRange").value = state.settings.bodySize;
  $("#bodySizeOutput").textContent = `${state.settings.bodySize} pt`;
  $("#nameSizeRange").value = state.settings.nameSize;
  $("#nameSizeOutput").textContent = `${state.settings.nameSize} pt`;
  $("#sectionTitleSizeRange").value = state.settings.sectionTitleSize;
  $("#sectionTitleSizeOutput").textContent = `${state.settings.sectionTitleSize} pt`;
  $("#sectionGapRange").value = state.settings.sectionGap;
  $("#sectionGapOutput").textContent = `${state.settings.sectionGap} pt`;
  $("#entryGapRange").value = state.settings.entryGap;
  $("#entryGapOutput").textContent = `${state.settings.entryGap} pt`;
  $("#bulletGapRange").value = state.settings.bulletGap;
  $("#bulletGapOutput").textContent = `${state.settings.bulletGap} pt`;
}

function renderSectionsEditor() {
  const container = $("#sectionsEditor");
  $("#sectionCount").textContent = state.sections.length;
  const allCollapsed = state.sections.length > 0 && state.sections.every(section => section.collapsed);
  $("#collapseAllButton").textContent = allCollapsed ? "全部展开" : "全部折叠";
  container.innerHTML = state.sections.map((section, sectionIndex) => `
    <article class="section-card ${section.visible ? "" : "is-hidden"} ${section.collapsed ? "is-collapsed" : ""}" data-section-id="${section.id}">
      <header class="section-card-header">
        <button class="collapse-button" data-action="toggle-section-collapse" type="button" title="${section.collapsed ? "展开模块" : "折叠模块"}" aria-label="${section.collapsed ? "展开" : "折叠"}${escapeHTML(section.title)}">${section.collapsed ? "›" : "⌄"}</button>
        <span class="section-index-badge" aria-hidden="true">${String(sectionIndex + 1).padStart(2, "0")}</span>
        <input class="section-title-input" value="${escapeHTML(section.title)}" data-field="section-title" aria-label="模块标题">
        <div class="card-actions">
          <button class="mini-button" data-action="move-section-up" title="上移" ${sectionIndex === 0 ? "disabled" : ""}>↑</button>
          <button class="mini-button" data-action="move-section-down" title="下移" ${sectionIndex === state.sections.length - 1 ? "disabled" : ""}>↓</button>
          <button class="mini-button" data-action="toggle-section" title="${section.visible ? "隐藏模块" : "显示模块"}">${section.visible ? "◉" : "○"}</button>
          <button class="mini-button danger" data-action="delete-section" title="删除模块">×</button>
        </div>
      </header>
      <div class="section-card-body">
        <div class="entries-list">
          ${section.entries.map((entry, entryIndex) => renderEntryEditor(entry, entryIndex, section.entries.length)).join("")}
        </div>
        <button class="add-entry-button" data-action="add-entry" type="button">＋ 在“${escapeHTML(section.title)}”中添加条目</button>
      </div>
    </article>
  `).join("");
}

function renderEntryEditor(entry, entryIndex, totalEntries) {
  const summary = plainText(entry.title || entry.bullets[0] || "空白条目");
  return `
    <article class="entry-card ${entry.visible ? "" : "is-hidden"}" data-entry-id="${entry.id}">
      <div class="entry-summary" data-action="toggle-entry-open" role="button" tabindex="0">
        <span class="entry-drag-handle" draggable="true" data-drag-handle role="button" aria-label="拖拽移动${escapeHTML(summary)}" title="拖拽排序或移到其他模块">⋮⋮</span>
        <span class="entry-toggle">⌄</span>
        <div class="entry-summary-copy"><strong>${escapeHTML(summary)}</strong><span>${escapeHTML(plainText(entry.date || "未填写时间"))}</span></div>
        <button class="mini-button" data-action="toggle-entry-visible" title="${entry.visible ? "隐藏条目" : "显示条目"}">${entry.visible ? "◉" : "○"}</button>
      </div>
      <div class="entry-form">
        <div class="form-grid">
          <label class="field field-wide"><span>标题 / 单位</span><input data-field="entry-title" value="${escapeHTML(entry.title)}" placeholder="公司、学校或项目名称"></label>
          <label class="field"><span>身份 / 专业</span><input data-field="entry-subtitle" value="${escapeHTML(entry.subtitle)}" placeholder="职位、专业或项目类型"></label>
          <label class="field"><span>时间</span><input data-field="entry-date" value="${escapeHTML(entry.date)}" placeholder="2024.01–2025.06"></label>
          <label class="field field-wide"><span>要点（每行一条）</span><textarea data-field="entry-bullets" placeholder="描述成果、职责或技能">${escapeHTML(entry.bullets.join("\n"))}</textarea></label>
        </div>
        <div class="entry-footer">
          <div>
            <button class="text-action" data-action="move-entry-up" ${entryIndex === 0 ? "disabled" : ""}>↑ 上移</button>
            <button class="text-action" data-action="move-entry-down" ${entryIndex === totalEntries - 1 ? "disabled" : ""}>↓ 下移</button>
          </div>
          <button class="text-action danger" data-action="delete-entry">删除条目</button>
        </div>
      </div>
    </article>
  `;
}

function autoResizeTextarea(textarea) {
  if (!textarea?.matches('textarea[data-field="entry-bullets"]')) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(82, textarea.scrollHeight + 2)}px`;
}

function autoResizeVisibleTextareas(root = document) {
  $$('textarea[data-field="entry-bullets"]', root)
    .filter(textarea => textarea.offsetParent !== null)
    .forEach(autoResizeTextarea);
}

function renderPreview() {
  const headerLines = state.personal.headerLines
    .filter(line => line.text.trim())
    .map(line => `<p class="resume-personal-line">${renderInlineText(line.text.trim())}</p>`)
    .join("");
  const sections = state.sections.filter(section => section.visible).map(section => {
    const entries = section.entries.filter(entry => entry.visible).map(entry => {
      const heading = entry.title || entry.subtitle || entry.date;
      return `<div class="resume-entry">
        ${heading ? `<div class="entry-heading"><div class="entry-heading-main">${entry.title ? `<span class="entry-title">${renderInlineText(entry.title)}</span>` : ""}${entry.subtitle ? `<span class="entry-subtitle">${renderInlineText(entry.subtitle)}</span>` : ""}</div>${entry.date ? `<span class="entry-date">${renderInlineText(entry.date)}</span>` : ""}</div>` : ""}
        ${entry.bullets.length ? `<ul class="resume-bullets">${entry.bullets.filter(Boolean).map(bullet => `<li>${renderInlineText(bullet)}</li>`).join("")}</ul>` : ""}
      </div>`;
    }).join("");
    return `<section class="resume-section"><h2 class="resume-section-title">${renderInlineText(section.title)}</h2><div>${entries}</div></section>`;
  }).join("");

  const content = $("#resumeContent");
  const fontPreset = FONT_PRESETS[state.settings.fontFamily] || FONT_PRESETS.song;
  content.dataset.spacing = state.settings.spacing;
  content.style.setProperty("--resume-font", fontPreset.body);
  content.style.setProperty("--heading-font", fontPreset.heading);
  content.style.setProperty("--body-size", `${state.settings.bodySize}pt`);
  content.style.setProperty("--name-size", `${state.settings.nameSize}pt`);
  content.style.setProperty("--section-title-size", `${state.settings.sectionTitleSize}pt`);
  content.style.setProperty("--section-gap", `${state.settings.sectionGap}pt`);
  content.style.setProperty("--entry-gap", `${state.settings.entryGap}pt`);
  content.style.setProperty("--bullet-gap", `${state.settings.bulletGap}pt`);
  content.innerHTML = `<header class="resume-header">
      <h1 class="resume-name">${renderInlineText(state.personal.name || "你的姓名")}</h1>
      ${headerLines}
    </header>${sections}`;

  document.title = `${plainText(state.personal.name || "我的")}简历`;
  scheduleFit();
}

let fitFrame;
function scheduleFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    fitContent(FIT_SAFETY_PX, true);
    scalePreviewPage();
  });
}

function measureAtScale(content, scale) {
  content.style.setProperty("--fit-scale", scale.toFixed(5));
  return content.getBoundingClientRect().height;
}

function fitContent(safetyPixels, updateBadge) {
  const content = $("#resumeContent");
  const inner = $(".resume-page-inner");
  if (!content || !inner) return fitResult;

  const targetHeight = Math.max(1, inner.clientHeight - safetyPixels);
  let low = MIN_FIT_SCALE;
  let high = 1;
  let scale = 1;
  const fullHeight = measureAtScale(content, 1);

  if (fullHeight > targetHeight) {
    const minimumHeight = measureAtScale(content, MIN_FIT_SCALE);
    if (minimumHeight > targetHeight) {
      scale = MIN_FIT_SCALE;
    } else {
      for (let iteration = 0; iteration < 16; iteration += 1) {
        const midpoint = (low + high) / 2;
        const midpointHeight = measureAtScale(content, midpoint);
        if (midpointHeight <= targetHeight) low = midpoint;
        else high = midpoint;
      }
      scale = Math.max(MIN_FIT_SCALE, low - 0.001);
    }
  }

  const finalHeight = measureAtScale(content, scale);
  const contentRect = content.getBoundingClientRect();
  const innerRect = inner.getBoundingClientRect();
  const fits = finalHeight <= targetHeight + 0.5 && contentRect.bottom <= innerRect.bottom - safetyPixels + 0.5;
  const result = { fits, scale, finalHeight, targetHeight };
  if (updateBadge) {
    fitResult = result;
    updateFitBadge();
  }
  return result;
}

function updateFitBadge() {
  const badge = $("#fitBadge");
  badge.classList.toggle("is-fit", fitResult.fits);
  badge.classList.toggle("is-overflow", !fitResult.fits);
  badge.lastChild.textContent = fitResult.fits ? `已排入一页 · ${Math.round(fitResult.scale * 100)}%` : "内容过多，请精简";
}

function scalePreviewPage() {
  const viewport = $("#previewViewport");
  const page = $("#resumePage");
  const stage = $("#paperStage");
  if (!viewport || !page) return;
  const scale = Math.min(1, Math.max(.32, (viewport.clientWidth - 18) / page.offsetWidth));
  page.style.transform = `scale(${scale})`;
  stage.style.width = `${page.offsetWidth * scale}px`;
  stage.style.height = `${page.offsetHeight * scale}px`;
}

function getContext(target) {
  const sectionElement = target.closest("[data-section-id]");
  const entryElement = target.closest("[data-entry-id]");
  const section = sectionElement ? state.sections.find(item => item.id === sectionElement.dataset.sectionId) : null;
  const entry = section && entryElement ? section.entries.find(item => item.id === entryElement.dataset.entryId) : null;
  return { section, entry, sectionElement, entryElement };
}

function moveItem(list, index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= list.length) return;
  [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
}

function clearEntryDragStyles() {
  $$(".entry-card.is-dragging, .entry-card.is-drop-before, .entry-card.is-drop-after").forEach(element => {
    element.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
  });
  $$(".section-card.is-entry-drop-target").forEach(element => element.classList.remove("is-entry-drop-target"));
  $$(".entries-list.is-drop-at-end").forEach(element => element.classList.remove("is-drop-at-end"));
}

function resetEntryDrag() {
  clearEntryDragStyles();
  draggedEntry = null;
  dragPlacement = null;
}

function scrollEditorDuringDrag(clientY) {
  const scroller = $(".editor-scroll");
  if (!scroller) return;
  const bounds = scroller.getBoundingClientRect();
  const edge = 64;
  if (clientY < bounds.top + edge) scroller.scrollTop -= 14;
  if (clientY > bounds.bottom - edge) scroller.scrollTop += 14;
}

$$('[data-personal-field]').forEach(input => input.addEventListener("input", event => {
  state.personal[event.target.dataset.personalField] = event.target.value;
  queueSave();
  renderPreview();
}));

$$('[data-header-line-index]').forEach(input => input.addEventListener("input", event => {
  const index = Number(event.target.dataset.headerLineIndex);
  const field = event.target.dataset.headerLineField;
  state.personal.headerLines[index][field] = event.target.value;
  queueSave();
  renderPreview();
}));

$("#spacingRange").addEventListener("input", event => {
  state.settings.spacing = Number(event.target.value);
  queueSave();
  renderPreview();
});

$("#fontFamilySelect").addEventListener("change", event => {
  state.settings.fontFamily = event.target.value;
  queueSave();
  renderPreview();
});

$("#bodySizeRange").addEventListener("input", event => {
  state.settings.bodySize = Number(event.target.value);
  $("#bodySizeOutput").textContent = `${state.settings.bodySize} pt`;
  queueSave();
  renderPreview();
});

$("#nameSizeRange").addEventListener("input", event => {
  state.settings.nameSize = Number(event.target.value);
  $("#nameSizeOutput").textContent = `${state.settings.nameSize} pt`;
  queueSave();
  renderPreview();
});

$("#sectionTitleSizeRange").addEventListener("input", event => {
  state.settings.sectionTitleSize = Number(event.target.value);
  $("#sectionTitleSizeOutput").textContent = `${state.settings.sectionTitleSize} pt`;
  queueSave();
  renderPreview();
});

$("#sectionGapRange").addEventListener("input", event => {
  state.settings.sectionGap = Number(event.target.value);
  $("#sectionGapOutput").textContent = `${state.settings.sectionGap} pt`;
  queueSave();
  renderPreview();
});

$("#entryGapRange").addEventListener("input", event => {
  state.settings.entryGap = Number(event.target.value);
  $("#entryGapOutput").textContent = `${state.settings.entryGap} pt`;
  queueSave();
  renderPreview();
});

$("#bulletGapRange").addEventListener("input", event => {
  state.settings.bulletGap = Number(event.target.value);
  $("#bulletGapOutput").textContent = `${state.settings.bulletGap} pt`;
  queueSave();
  renderPreview();
});

$("#sectionsEditor").addEventListener("input", event => {
  const { section, entry } = getContext(event.target);
  if (!section) return;
  const field = event.target.dataset.field;
  if (field === "section-title") section.title = event.target.value;
  if (entry && field === "entry-title") entry.title = event.target.value;
  if (entry && field === "entry-subtitle") entry.subtitle = event.target.value;
  if (entry && field === "entry-date") entry.date = event.target.value;
  if (entry && field === "entry-bullets") {
    entry.bullets = event.target.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    autoResizeTextarea(event.target);
  }
  queueSave();
  renderPreview();
  if (field === "section-title") {
    const button = event.target.closest(".section-card").querySelector(".add-entry-button");
    button.textContent = `＋ 在“${section.title || "未命名模块"}”中添加条目`;
  }
  const summary = event.target.closest(".entry-card")?.querySelector(".entry-summary-copy strong");
  if (summary && entry) summary.textContent = plainText(entry.title || entry.bullets[0] || "空白条目");
});

$("#sectionsEditor").addEventListener("click", event => {
  if (event.target.closest("[data-drag-handle]")) return;
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;
  const { section, entry, entryElement } = getContext(actionTarget);
  if (!section) return;
  const sectionIndex = state.sections.indexOf(section);
  const entryIndex = entry ? section.entries.indexOf(entry) : -1;

  if (action === "toggle-entry-open") {
    entryElement.classList.toggle("is-open");
    if (entryElement.classList.contains("is-open")) {
      requestAnimationFrame(() => autoResizeTextarea(entryElement.querySelector('textarea[data-field="entry-bullets"]')));
    }
  }
  if (action === "toggle-section-collapse") section.collapsed = !section.collapsed;
  if (action === "add-entry") {
    section.entries.push({ id: uid(), title: "新条目", subtitle: "", date: "", bullets: ["在这里填写一条成果或职责。"], visible: true });
  }
  if (action === "toggle-section") section.visible = !section.visible;
  if (action === "toggle-entry-visible" && entry) entry.visible = !entry.visible;
  if (action === "move-section-up") moveItem(state.sections, sectionIndex, -1);
  if (action === "move-section-down") moveItem(state.sections, sectionIndex, 1);
  if (action === "move-entry-up" && entry) moveItem(section.entries, entryIndex, -1);
  if (action === "move-entry-down" && entry) moveItem(section.entries, entryIndex, 1);
  if (action === "delete-entry" && entry && confirm("删除这个条目？")) section.entries.splice(entryIndex, 1);
  if (action === "delete-section" && confirm(`删除“${section.title}”及其中所有条目？`)) state.sections.splice(sectionIndex, 1);

  if (action !== "toggle-entry-open") {
    queueSave();
    renderSectionsEditor();
    renderPreview();
  }
});

$("#sectionsEditor").addEventListener("dragstart", event => {
  const handle = event.target.closest("[data-drag-handle]");
  if (!handle) return;
  const { section, entry, entryElement } = getContext(handle);
  if (!section || !entry || !entryElement) return;

  draggedEntry = { sectionId: section.id, entryId: entry.id, wasOpen: entryElement.classList.contains("is-open") };
  dragPlacement = null;
  entryElement.classList.add("is-dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", entry.id);
  }
});

$("#sectionsEditor").addEventListener("dragover", event => {
  if (!draggedEntry) return;
  const sectionElement = event.target.closest("[data-section-id]");
  if (!sectionElement) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  scrollEditorDuringDrag(event.clientY);
  clearEntryDragStyles();

  const draggedElement = $(`[data-entry-id="${draggedEntry.entryId}"]`);
  draggedElement?.classList.add("is-dragging");
  sectionElement.classList.add("is-entry-drop-target");

  const targetEntryElement = event.target.closest("[data-entry-id]");
  if (targetEntryElement?.dataset.entryId === draggedEntry.entryId) {
    dragPlacement = { sectionId: sectionElement.dataset.sectionId, targetEntryId: draggedEntry.entryId, position: "self" };
    return;
  }

  if (targetEntryElement) {
    const bounds = targetEntryElement.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    targetEntryElement.classList.add(position === "before" ? "is-drop-before" : "is-drop-after");
    dragPlacement = { sectionId: sectionElement.dataset.sectionId, targetEntryId: targetEntryElement.dataset.entryId, position };
  } else {
    sectionElement.querySelector(".entries-list")?.classList.add("is-drop-at-end");
    dragPlacement = { sectionId: sectionElement.dataset.sectionId, targetEntryId: null, position: "end" };
  }
});

$("#sectionsEditor").addEventListener("dragenter", event => {
  if (draggedEntry && event.target.closest("[data-section-id]")) event.preventDefault();
});

$("#sectionsEditor").addEventListener("drop", event => {
  if (!draggedEntry) return;
  event.preventDefault();
  const droppedSectionElement = event.target.closest("[data-section-id]");
  let droppedPlacement = null;
  if (droppedSectionElement) {
    const entriesList = droppedSectionElement.querySelector(".entries-list");
    const listBounds = entriesList?.getBoundingClientRect();
    const isInsideVisibleList = listBounds && listBounds.height > 0 && event.clientY >= listBounds.top && event.clientY <= listBounds.bottom;
    if (isInsideVisibleList) {
      const nextEntry = [...entriesList.querySelectorAll(".entry-card")]
        .filter(element => element.dataset.entryId !== draggedEntry.entryId)
        .find(element => {
          const bounds = element.getBoundingClientRect();
          return event.clientY < bounds.top + bounds.height / 2;
        });
      droppedPlacement = nextEntry
        ? { sectionId: droppedSectionElement.dataset.sectionId, targetEntryId: nextEntry.dataset.entryId, position: "before" }
        : { sectionId: droppedSectionElement.dataset.sectionId, targetEntryId: null, position: "end" };
    } else {
      droppedPlacement = { sectionId: droppedSectionElement.dataset.sectionId, targetEntryId: null, position: "end" };
    }
  }
  const placement = droppedPlacement || dragPlacement;
  if (!placement || placement.position === "self") {
    resetEntryDrag();
    return;
  }

  const sourceSection = state.sections.find(section => section.id === draggedEntry.sectionId);
  const targetSection = state.sections.find(section => section.id === placement.sectionId);
  const sourceIndex = sourceSection?.entries.findIndex(entry => entry.id === draggedEntry.entryId) ?? -1;
  if (!sourceSection || !targetSection || sourceIndex < 0) {
    resetEntryDrag();
    return;
  }

  const [entry] = sourceSection.entries.splice(sourceIndex, 1);
  let targetIndex = targetSection.entries.length;
  if (placement.targetEntryId) {
    const referenceIndex = targetSection.entries.findIndex(item => item.id === placement.targetEntryId);
    if (referenceIndex >= 0) targetIndex = referenceIndex + (placement.position === "after" ? 1 : 0);
  }
  targetSection.entries.splice(targetIndex, 0, entry);
  targetSection.collapsed = false;
  const shouldOpen = draggedEntry.wasOpen;
  const movedAcrossSections = sourceSection !== targetSection;
  resetEntryDrag();
  queueSave();
  renderSectionsEditor();
  renderPreview();
  if (shouldOpen) $(`[data-entry-id="${entry.id}"]`)?.classList.add("is-open");
  showToast(movedAcrossSections ? `已移至“${targetSection.title}”` : "条目顺序已更新");
});

$("#sectionsEditor").addEventListener("dragend", resetEntryDrag);

$("#sectionsEditor").addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches('[data-action="toggle-entry-open"]')) event.target.click();
});

$("#addSectionButton").addEventListener("click", () => {
  const section = { id: uid(), title: "新模块", visible: true, collapsed: false, entries: [{ id: uid(), title: "新条目", subtitle: "", date: "", bullets: ["在这里填写一条成果或职责。"], visible: true }] };
  state.sections.push(section);
  queueSave();
  renderSectionsEditor();
  renderPreview();
  requestAnimationFrame(() => {
    const card = $(`[data-section-id="${section.id}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    card?.querySelector(".section-title-input")?.select();
  });
});

$("#collapseAllButton").addEventListener("click", () => {
  const shouldCollapse = !state.sections.every(section => section.collapsed);
  state.sections.forEach(section => { section.collapsed = shouldCollapse; });
  queueSave();
  renderSectionsEditor();
});

$("#resetButton").addEventListener("click", () => {
  if (!confirm("恢复到内置样例？当前内容会被替换。建议先备份数据。")) return;
  state = demoState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
  showToast("已恢复样例");
});

$("#exportJsonButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.personal.name || "我的"}简历数据.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("数据备份已下载");
});

$("#importJsonButton").addEventListener("click", () => $("#importJsonInput").click());
$("#importJsonInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed.personal || !Array.isArray(parsed.sections)) throw new Error("格式不正确");
    state = normalizeState(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    showToast("简历数据已导入");
  } catch (error) {
    alert(`无法导入：${error.message}`);
  } finally {
    event.target.value = "";
  }
});

$("#printButton").addEventListener("click", () => {
  if (!fitResult.fits) {
    alert("当前内容超过一页。请删减文字、隐藏次要条目，或调小行距与各项间距后再导出。 ");
    return;
  }
  window.print();
});

window.addEventListener("resize", () => {
  scalePreviewPage();
  autoResizeVisibleTextareas();
});
window.addEventListener("beforeprint", () => {
  $("#resumePage").style.transform = "none";
  fitContent(PRINT_SAFETY_PX, false);
});
window.addEventListener("afterprint", () => {
  scheduleFit();
  scalePreviewPage();
});

renderAll();
if (document.fonts?.ready) document.fonts.ready.then(scheduleFit);

