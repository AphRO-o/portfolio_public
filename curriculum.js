const data = window.curriculumData;
const filtersRoot = document.querySelector("[data-filters]");
const stageBandsRoot = document.querySelector("[data-stage-bands]");
const gradeGrid = document.querySelector("[data-grade-grid]");
const canvas = document.querySelector("[data-map-canvas]");
const statsRoot = document.querySelector("[data-stats]");
const dialog = document.querySelector("[data-lesson-dialog]");
const dialogContent = document.querySelector("[data-dialog-content]");
const mapViewport = document.querySelector("[data-map-viewport]");
const zoomLabel = document.querySelector("[data-zoom-label]");
const zoomInButton = document.querySelector("[data-zoom-in]");
const zoomOutButton = document.querySelector("[data-zoom-out]");
const resetViewButton = document.querySelector("[data-reset-view]");
const mapHelp = document.querySelector(".map-help");
const topicSearch = document.querySelector("[data-topic-search]");
const searchCount = document.querySelector("[data-search-count]");

const statusLabels = {
  pending: "尚未备课",
  planning: "已进入规划",
  drafted: "已有教案",
  recorded: "已完成试讲"
};

let activeCategory = "all";
let filterMode = "all";
let currentLesson = null;
const view = { x: 0, y: 0, scale: 0.3 };
const drag = { active: false, id: null, x: 0, y: 0 };
const MIN_SCALE = 0.3;
const UNIT_FOCUS_SCALE = 1.2;


function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markdownToSafeHtml(markdown) {
  const inline = (value) => escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const html = [];
  let list = null;
  const closeList = () => { if (list) html.push(`</${list}>`); list = null; };
  String(markdown || "").replaceAll("\r\n", "\n").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) { closeList(); return; }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { closeList(); const level = Math.min(4, heading[1].length + 2); html.push(`<h${level}>${inline(heading[2])}</h${level}>`); return; }
    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) { closeList(); html.push(`<blockquote>${inline(quote[1])}</blockquote>`); return; }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const next = unordered ? "ul" : "ol";
      if (list !== next) { closeList(); list = next; html.push(`<${list}>`); }
      html.push(`<li>${inline((unordered || ordered)[1])}</li>`);
      return;
    }
    if (/^---+$/.test(trimmed)) { closeList(); html.push("<hr>"); return; }
    closeList(); html.push(`<p>${inline(trimmed)}</p>`);
  });
  closeList();
  return html.join("");
}

function topicId(gradeIndex, termIndex, unitIndex, pointIndex, point) {
  return point?.id || `topic-${gradeIndex}-${termIndex}-${unitIndex}-${pointIndex}`;
}

function termDisplayLabel(grade, semester) {
  if (grade.stage !== "junior") return semester.label;
  if (semester.label.includes("上")) return "上学期";
  if (semester.label.includes("下")) return "下学期";
  return semester.label;
}

function flattenTopics() {
  const topics = [];
  data.grades.forEach((grade, gradeIndex) => grade.terms.forEach((semester, termIndex) => semester.units.forEach((unit, unitIndex) => unit.points.forEach((point, pointIndex) => {
    topics.push({ id: topicId(gradeIndex, termIndex, unitIndex, pointIndex, point), grade, semester, unit, point });
  }))));
  return topics;
}

function renderFilters() {
  filtersRoot.innerHTML = Object.entries(data.categories).map(([id, category]) => {
    const isActive = id === activeCategory && filterMode !== "all";
    const stateLabel = isActive ? (filterMode === "focus" ? "聚焦" : "紧凑") : "";
    const label = id === "all" ? "全部显示" : category.short;
    return `<button class="domain-filter" type="button" data-domain="${id}" aria-pressed="${id === "all" ? filterMode === "all" : isActive}" aria-label="${label}${stateLabel ? `，${stateLabel}模式` : ""}" title="${id === "all" ? "恢复全部课程" : "重复点击切换：聚焦 → 紧凑 → 全部"}">${label}${stateLabel ? `<small>${stateLabel}</small>` : ""}</button>`;
  }).join("");
  filtersRoot.querySelectorAll("[data-domain]").forEach((button) => button.addEventListener("click", () => cycleFilter(button.dataset.domain)));
}

function renderStageBands() {
  stageBandsRoot.innerHTML = Object.entries(data.stages).map(([id, stage]) => `
    <div class="stage-band ${id}" style="--stage-color:${stage.color}"><strong>${stage.label}数学</strong><span>${stage.years}</span></div>
  `).join("");
}

function renderGrades() {
  gradeGrid.innerHTML = data.grades.map((grade, gradeIndex) => {
    const stage = data.stages[grade.stage];
    const semesters = grade.terms.map((semester, termIndex) => {
      const units = semester.units.map((unit, unitIndex) => {
        const category = data.categories[unit.category];
        const startedCount = unit.points.filter((point) => point.status !== "pending").length;
        const heatLevel = startedCount === 0 ? 0 : Math.min(4, Math.ceil((startedCount / unit.points.length) * 4));
        const points = unit.points.map((point, pointIndex) => {
          const id = topicId(gradeIndex, termIndex, unitIndex, pointIndex, point);
          return `
            <button class="knowledge-chip" type="button" data-topic-id="${id}" data-status="${point.status}" style="--node-stage:${stage.color}" aria-label="${escapeHtml(`${grade.label}${termDisplayLabel(grade, semester)}，${unit.title}，${point.title}，${statusLabels[point.status]}`)}">
              <span>${escapeHtml(point.title)}</span><i aria-hidden="true"></i>
            </button>`;
        }).join("");
        return `
          <article class="unit-card" data-unit-id="${escapeHtml(unit.id)}" data-route-category="${unit.category}" data-stage="${grade.stage}" data-heat="${heatLevel}" data-search-text="${escapeHtml(unit.points.map((point) => point.title).join(" ").toLocaleLowerCase())}" style="--unit-stage:${stage.color}">
            <div class="unit-heading"><span>${category.label}</span><strong>${escapeHtml(unit.title)}</strong></div>
            <div class="knowledge-list">${points}</div>
            <button class="unit-focus-button" type="button" aria-label="聚焦单元：${escapeHtml(`${grade.label}${termDisplayLabel(grade, semester)} ${unit.title}`)}"></button>
          </article>`;
      }).join("");
      return `
        <section class="term-block">
          <div class="term-heading"><strong>${escapeHtml(termDisplayLabel(grade, semester))}</strong><span>${semester.units.reduce((total, unit) => total + unit.points.length, 0)} 个知识点</span></div>
          <div class="unit-list">${units}</div>
        </section>`;
    }).join("");
    return `
      <section class="grade-column" style="--stage-color:${stage.color}" aria-labelledby="${grade.id}-title">
        <div class="grade-heading">
          <div><strong id="${grade.id}-title">${grade.label}</strong><small>${grade.source} · ${stage.label}数学</small></div>
          <span class="grade-number">${grade.code}</span>
        </div>
        ${semesters}
      </section>`;
  }).join("");

  const lookup = new Map(flattenTopics().map((topic) => [topic.id, topic]));
  gradeGrid.querySelectorAll("[data-topic-id]").forEach((button) => button.addEventListener("click", () => openLesson(lookup.get(button.dataset.topicId))));
  gradeGrid.querySelectorAll(".unit-focus-button").forEach((button) => button.addEventListener("click", () => focusUnit(button.closest(".unit-card"))));
}

function updateStats() {
  const topics = flattenTopics();
  const visible = activeCategory === "all" ? topics : topics.filter((item) => item.unit.category === activeCategory);
  const started = visible.filter((item) => item.point.status !== "pending").length;
  statsRoot.innerHTML = `<strong>${visible.length}</strong><span>个知识点</span><small>${started} 个已开始备课</small>`;
}

function cycleFilter(category) {
  if (category === "all") {
    activeCategory = "all";
    filterMode = "all";
  } else if (activeCategory !== category || filterMode === "all") {
    activeCategory = category;
    filterMode = "focus";
  } else if (filterMode === "focus") {
    filterMode = "compact";
  } else {
    activeCategory = "all";
    filterMode = "all";
  }
  applyFilterState();
}

function captureFilterLayout() {
  const positions = new Map();
  gradeGrid.querySelectorAll(".term-heading, .unit-card").forEach((element) => {
    if (element.getClientRects().length) positions.set(element, element.getBoundingClientRect());
  });
  return positions;
}

function animateFilterLayout(previousPositions) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  gradeGrid.querySelectorAll(".term-heading, .unit-card").forEach((element) => {
    if (!element.getClientRects().length) return;
    const current = element.getBoundingClientRect();
    const previous = previousPositions.get(element);
    window.clearTimeout(element._layoutAnimationTimer);
    element.style.transition = "none";
    if (previous) {
      const offsetX = previous.left - current.left;
      const offsetY = previous.top - current.top;
      if (Math.abs(offsetX) < 0.5 && Math.abs(offsetY) < 0.5) {
        element.style.removeProperty("transition");
        return;
      }
      element.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    } else {
      element.style.opacity = "0";
      element.style.transform = "translateY(-10px) scale(0.975)";
    }
    element.getBoundingClientRect();
    requestAnimationFrame(() => {
      element.style.transition = "transform 520ms cubic-bezier(0.22, 0.8, 0.28, 1), opacity 360ms ease-out";
      element.style.transform = "translate(0, 0) scale(1)";
      element.style.opacity = "";
      element._layoutAnimationTimer = window.setTimeout(() => {
        element.style.removeProperty("transition");
        element.style.removeProperty("transform");
        element.style.removeProperty("opacity");
      }, 560);
    });
  });
}

function applyFilterState() {
  const previousPositions = captureFilterLayout();
  renderFilters();
  gradeGrid.dataset.filterMode = filterMode;
  gradeGrid.querySelectorAll("[data-route-category]").forEach((unit) => {
    const excluded = filterMode !== "all" && unit.dataset.routeCategory !== activeCategory;
    unit.classList.toggle("is-dimmed", filterMode === "focus" && excluded);
    unit.classList.toggle("is-filtered-out", filterMode === "compact" && excluded);
  });
  gradeGrid.querySelectorAll(".term-block").forEach((semester) => {
    const hasActiveUnit = Array.from(semester.querySelectorAll("[data-route-category]")).some((unit) => filterMode === "all" || unit.dataset.routeCategory === activeCategory);
    semester.classList.toggle("is-muted", filterMode === "focus" && !hasActiveUnit);
    semester.classList.toggle("is-filtered-out", filterMode === "compact" && !hasActiveUnit);
  });
  updateStats();
  applyView();
  animateFilterLayout(previousPositions);
  applySearch(topicSearch.value);
}

function applySearch(rawQuery) {
  const query = rawQuery.trim().toLocaleLowerCase();
  let matches = 0;
  gradeGrid.querySelectorAll(".unit-card").forEach((unit) => {
    const isMatch = Boolean(query) && unit.dataset.searchText.includes(query);
    unit.classList.toggle("is-search-match", isMatch);
    unit.classList.toggle("is-search-dimmed", Boolean(query) && !isMatch);
    if (isMatch) matches += 1;
  });
  canvas.classList.toggle("is-searching", Boolean(query));
  searchCount.textContent = query ? `${matches} 个单元` : "";
}

function handleSearch() {
  if (topicSearch.value.trim() && filterMode !== "all") {
    activeCategory = "all";
    filterMode = "all";
    applyFilterState();
    return;
  }
  applySearch(topicSearch.value);
}

function lessonVersions(lesson) {
  const label = lesson.point.title;
  const thought = lesson.point.thought || lesson.unit.thought || "暂时还没有吐槽；等第一次读教材和试讲后补上。";
  const existing = lesson.point.versions;
  if (existing) return existing;
  return [
    {
      id: "v0", label: "v0 · 备课起点", state: "available", video: null,
      question: thought,
      objective: `先厘清“${label}”在前后知识链中的位置，以及学生已有的生活经验和前置知识。`,
      design: "对照教材、课标和不同版本材料，拆出概念形成、例题、练习与表达四条线。",
      board: "待设计：只保留能显示数学关系和思考过程的板书。"
    },
    { id: "v1", label: "v1 · 第一版教案", state: lesson.point.status === "drafted" || lesson.point.status === "recorded" ? "available" : "empty" },
    { id: "trial1", label: "试讲 v1", state: lesson.point.status === "recorded" ? "available" : "empty" },
    { id: "review1", label: "复盘与改写", state: "empty" }
  ];
}

function renderVersionPanel(version) {
  const panel = dialogContent.querySelector("[data-version-panel]");
  if (!panel) return;
  if (version.state === "empty") {
    panel.innerHTML = `
      <div class="empty-version">
        <span aria-hidden="true">＋</span>
        <h3>${escapeHtml(version.label)}</h3>
        <p>这个版本尚未创建。完成后可在数据文件中加入视频地址、教案内容、板书和复盘。</p>
      </div>`;
    animateVersionPanel(panel);
    return;
  }
  const videoContent = version.video
    ? `<video class="lesson-video" controls preload="metadata" src="${escapeHtml(version.video)}">你的浏览器暂不支持视频播放。</video>`
    : `<div class="video-placeholder"><span aria-hidden="true">▶</span><strong>视频尚未录制</strong><small>未来可嵌入对应版本的无生试讲</small></div>`;
  const lessonFile = version.lessonFile
    ? `<a class="resource-link" href="${escapeHtml(version.lessonFile)}" target="_blank" rel="noopener">打开完整 Markdown 教案 ↗</a>`
    : "";
  const boardImage = version.boardImage
    ? `<figure class="board-preview"><a href="${escapeHtml(version.boardImage)}" target="_blank" rel="noopener"><img src="${escapeHtml(version.boardImage)}" alt="${escapeHtml(`${version.label}板书`)}" /></a><figcaption>板书设计 · 点击图片可在新标签查看</figcaption></figure>`
    : "";
  const publishedLesson = version.designMarkdown || version.reflectionMarkdown;
  const lessonContent = publishedLesson
    ? `<p class="plan-kicker">LESSON ARCHIVE</p><div class="lesson-version-meta">${[version.date, version.duration, version.format].filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>${version.designMarkdown ? `<section class="lesson-document"><h3>教学设计</h3><div class="lesson-markdown">${markdownToSafeHtml(version.designMarkdown)}</div></section>` : ""}${version.reflectionMarkdown ? `<section class="lesson-document reflection"><h3>本版复盘</h3><div class="lesson-markdown">${markdownToSafeHtml(version.reflectionMarkdown)}</div></section>` : ""}`
    : `<p class="plan-kicker">LESSON DESIGN</p><div class="plan-row"><span>核心问题</span><p>${escapeHtml(version.question || "待补充")}</p></div><div class="plan-row"><span>学习目标</span><p>${escapeHtml(version.objective || "待补充")}</p></div><div class="plan-row"><span>设计路径</span><p>${escapeHtml(version.design || "待补充")}</p></div><div class="plan-row"><span>板书思路</span><p>${escapeHtml(version.board || "待补充")}</p></div>${version.reflection ? `<div class="plan-row"><span>课后复盘</span><p>${escapeHtml(version.reflection)}</p></div>` : ""}`;
  panel.innerHTML = `<div class="version-layout"><section class="video-slot">${videoContent}</section><section class="lesson-plan">${lessonContent}${lessonFile}${boardImage}</section></div>`;
  animateVersionPanel(panel);
}

function animateVersionPanel(panel) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  panel.classList.remove("is-switching");
  panel.getBoundingClientRect();
  panel.classList.add("is-switching");
  window.setTimeout(() => panel.classList.remove("is-switching"), 340);
}

function selectVersion(versionId) {
  const versions = lessonVersions(currentLesson);
  const selected = versions.find((version) => version.id === versionId) || versions[0];
  dialogContent.querySelectorAll("[data-version-id]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.versionId === selected.id)));
  renderVersionPanel(selected);
}

function openLesson(lesson) {
  if (!lesson) return;
  currentLesson = lesson;
  const stage = data.stages[lesson.grade.stage];
  const category = data.categories[lesson.unit.category];
  const thought = lesson.point.thought || lesson.unit.thought || "暂时还没有吐槽；等第一次读教材和试讲后补上。";
  const versions = lessonVersions(lesson);
  dialogContent.innerHTML = `
    <article class="lesson-dialog-inner" style="--dialog-stage:${stage.color}">
      <header class="lesson-dialog-header">
        <div class="lesson-breadcrumb">${stage.label}数学 / ${lesson.grade.label} / ${termDisplayLabel(lesson.grade, lesson.semester)} / ${category.label}</div>
        <h2>${escapeHtml(lesson.point.title)}</h2>
        <div class="lesson-submeta"><span>${escapeHtml(lesson.unit.title)}</span><span class="lesson-state ${lesson.point.status}">${statusLabels[lesson.point.status]}</span></div>
      </header>
      <aside class="thought-note"><span>我的吐槽 / 追问</span><p>${escapeHtml(thought)}</p></aside>
      <div class="version-tabs" role="tablist" aria-label="课例版本">
        ${versions.map((version, index) => `<button type="button" role="tab" data-version-id="${version.id}" aria-selected="${index === 0}">${escapeHtml(version.label)}${version.state === "empty" ? " · 待创建" : ""}</button>`).join("")}
      </div>
      <div class="version-panel" data-version-panel role="tabpanel"></div>
    </article>`;
  dialogContent.querySelectorAll("[data-version-id]").forEach((button) => button.addEventListener("click", () => selectVersion(button.dataset.versionId)));
  dialog.classList.remove("is-closing");
  dialog.showModal();
  requestAnimationFrame(() => renderVersionPanel(versions[0]));
}

function closeLessonDialog() {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    dialog.close();
    return;
  }
  dialog.classList.add("is-closing");
  window.setTimeout(() => {
    dialog.close();
    dialog.classList.remove("is-closing");
  }, 180);
}

function constrainView() {
  const rect = mapViewport.getBoundingClientRect();
  const scaledWidth = canvas.offsetWidth * view.scale;
  const scaledHeight = canvas.offsetHeight * view.scale;
  const marginX = rect.width / 2;
  const marginY = rect.height / 2;
  view.x = scaledWidth <= rect.width
    ? (rect.width - scaledWidth) / 2
    : Math.min(marginX, Math.max(rect.width - scaledWidth - marginX, view.x));
  view.y = scaledHeight <= rect.height
    ? (rect.height - scaledHeight) / 2
    : Math.min(marginY, Math.max(rect.height - scaledHeight - marginY, view.y));
}

function applyView() {
  const nextZoomLevel = view.scale < 0.6 ? "overview" : "detail";
  canvas.dataset.zoomLevel = nextZoomLevel;
  if (mapHelp) {
    mapHelp.textContent = nextZoomLevel === "overview"
      ? "概览模式 · 单击章节自动聚焦"
      : "滚轮缩放 · 拖拽移动 · 复位可返回全图";
  }
  constrainView();
  canvas.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
  zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
}

function resetView() {
  view.scale = MIN_SCALE;
  view.x = 0;
  view.y = 0;
  applyView();
}

function zoomAt(clientX, clientY, factor) {
  const rect = mapViewport.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const oldScale = view.scale;
  const nextScale = Math.min(1.65, Math.max(MIN_SCALE, oldScale * factor));
  if (Math.abs(nextScale - oldScale) < 0.001) return;
  const mapX = (localX - view.x) / oldScale;
  const mapY = (localY - view.y) / oldScale;
  view.scale = nextScale;
  view.x = localX - mapX * nextScale;
  view.y = localY - mapY * nextScale;
  applyView();
}

function focusUnit(unit) {
  if (!unit || canvas.dataset.zoomLevel !== "overview") return;
  canvas.dataset.zoomLevel = "detail";
  if (mapHelp) mapHelp.textContent = "滚轮缩放 · 拖拽移动 · 复位可返回全图";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const viewportRect = mapViewport.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const unitRect = unit.getBoundingClientRect();
    const centerX = (unitRect.left + unitRect.width / 2 - canvasRect.left) / view.scale;
    const centerY = (unitRect.top + unitRect.height / 2 - canvasRect.top) / view.scale;
    view.scale = UNIT_FOCUS_SCALE;
    view.x = viewportRect.width / 2 - centerX * view.scale;
    view.y = viewportRect.height / 2 - centerY * view.scale;
    canvas.classList.add("is-focusing");
    canvas.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
    zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
    window.setTimeout(() => {
      canvas.classList.remove("is-focusing");
      const finalViewportRect = mapViewport.getBoundingClientRect();
      const finalUnitRect = unit.getBoundingClientRect();
      view.x += finalViewportRect.left + finalViewportRect.width / 2 - (finalUnitRect.left + finalUnitRect.width / 2);
      view.y += finalViewportRect.top + finalViewportRect.height / 2 - (finalUnitRect.top + finalUnitRect.height / 2);
      canvas.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
    }, 460);
  }));
}

mapViewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.00135));
}, { passive: false });

mapViewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest("button")) return;
  event.preventDefault();
  drag.active = true;
  drag.id = event.pointerId;
  drag.x = event.clientX;
  drag.y = event.clientY;
  mapViewport.classList.add("is-dragging");
  mapViewport.setPointerCapture(event.pointerId);
});

mapViewport.addEventListener("pointermove", (event) => {
  if (!drag.active || drag.id !== event.pointerId) return;
  view.x += event.clientX - drag.x;
  view.y += event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  applyView();
});

function finishDrag(event) {
  if (!drag.active || drag.id !== event.pointerId) return;
  drag.active = false;
  drag.id = null;
  mapViewport.classList.remove("is-dragging");
  if (mapViewport.hasPointerCapture(event.pointerId)) mapViewport.releasePointerCapture(event.pointerId);
}

mapViewport.addEventListener("pointerup", finishDrag);
mapViewport.addEventListener("pointercancel", finishDrag);

zoomInButton.addEventListener("click", () => {
  const rect = mapViewport.getBoundingClientRect();
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.16);
});
zoomOutButton.addEventListener("click", () => {
  const rect = mapViewport.getBoundingClientRect();
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.16);
});
resetViewButton.addEventListener("click", resetView);

document.querySelector("[data-close-dialog]").addEventListener("click", closeLessonDialog);
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeLessonDialog(); });
dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeLessonDialog(); });
topicSearch.addEventListener("input", handleSearch);
topicSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && topicSearch.value) {
    event.preventDefault();
    topicSearch.value = "";
    applySearch("");
  }
});

renderFilters();
renderStageBands();
renderGrades();
updateStats();
resetView();
const requestedParams = new URLSearchParams(window.location.search);
const requestedUnitId = requestedParams.get("unit");
const requestedTopicId = requestedParams.get("topic");
if (requestedUnitId) {
  const requestedUnit = [...gradeGrid.querySelectorAll(".unit-card")].find((unit) => unit.dataset.unitId === requestedUnitId);
  if (requestedUnit) window.setTimeout(() => focusUnit(requestedUnit), 80);
} else if (requestedTopicId) {
  const requestedLesson = flattenTopics().find((topic) => topic.id === requestedTopicId);
  const requestedButton = [...gradeGrid.querySelectorAll("[data-topic-id]")].find((button) => button.dataset.topicId === requestedTopicId);
  if (requestedLesson && requestedButton) {
    window.setTimeout(() => {
      focusUnit(requestedButton.closest(".unit-card"));
      window.setTimeout(() => openLesson(requestedLesson), 520);
    }, 80);
  }
}
window.addEventListener("resize", applyView, { passive: true });
