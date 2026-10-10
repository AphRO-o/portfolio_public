const data = window.curriculumData;
const requestedParams = new URLSearchParams(window.location.search);
const isEmbeddedMap = requestedParams.get("embed") === "1";
if (isEmbeddedMap) document.documentElement.classList.add("is-embedded-map");
const filtersRoot = document.querySelector("[data-filters]");
const layoutControlRoot = document.querySelector("[data-layout-control]");
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
const topicSearch = document.querySelector("[data-topic-search]");
const searchCount = document.querySelector("[data-search-count]");

const statusLabels = {
  pending: "尚未备课",
  planning: "已进入规划",
  drafted: "已有教案",
  recorded: "已完成试讲"
};

let activeCategory = "all";
let layoutMode = "loose";
let currentLesson = null;
let lessonOpenRequest = 0;
let currentLessonTabs = [];
let currentLessonTabIndex = 0;
let viewFrame = 0;
let interactionTimer = 0;
let resetAnimationTimer = 0;
const DESKTOP_MIN_SCALE = 0.3;
const MOBILE_EMBEDDED_MIN_SCALE = 0.2;
const minimumScale = () => isEmbeddedMap && window.matchMedia("(max-width: 680px)").matches ? MOBILE_EMBEDDED_MIN_SCALE : DESKTOP_MIN_SCALE;
const view = { x: 0, y: 0, scale: minimumScale() };
const pointers = new Map();
const gesture = {
  mode: "idle",
  primaryId: null,
  lastX: 0,
  lastY: 0,
  lastCenterX: 0,
  lastCenterY: 0,
  lastDistance: 0,
  moved: false,
  suppressClickUntil: 0,
  tapTarget: null
};
const MAX_SCALE = 1.65;
const UNIT_FOCUS_SCALE = 1.2;
const mapBounds = { viewportWidth: 0, viewportHeight: 0, canvasWidth: 0, canvasHeight: 0 };


function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markdownToSafeHtml(markdown) { return window.lessonContent.markdown(markdown); }

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

const topicLookup = new Map(flattenTopics().map((topic) => [topic.id, topic]));

function renderFilters() {
  const compact = layoutMode === "compact";
  layoutControlRoot.innerHTML = `<button class="layout-mode-toggle" type="button" data-layout-toggle aria-pressed="${compact}" aria-label="当前为${compact ? "紧凑" : "松散"}模式，点击切换为${compact ? "松散" : "紧凑"}" title="切换地图排列密度"><span class="layout-toggle-options" aria-hidden="true"><i></i><span>松散</span><span>紧凑</span></span></button>`;
  filtersRoot.innerHTML = Object.entries(data.categories).filter(([id]) => id !== "all").map(([id, category]) => {
    const isActive = id === activeCategory;
    return `<button class="domain-filter" type="button" data-domain="${id}" aria-pressed="${isActive}" aria-label="${category.short}${isActive ? "，取消筛选" : "，筛选"}" title="${isActive ? "取消此筛选" : `只看${category.label}`}">${category.short}</button>`;
  }).join("");
  layoutControlRoot.querySelector("[data-layout-toggle]")?.addEventListener("click", toggleLayoutMode);
  filtersRoot.querySelectorAll("[data-domain]").forEach((button) => button.addEventListener("click", () => toggleCategoryFilter(button.dataset.domain)));
}

function syncFilterControls() {
  const compact = layoutMode === "compact";
  const layoutToggle = layoutControlRoot.querySelector("[data-layout-toggle]");
  if (layoutToggle) {
    layoutToggle.setAttribute("aria-pressed", String(compact));
    layoutToggle.setAttribute("aria-label", `当前为${compact ? "紧凑" : "松散"}模式，点击切换为${compact ? "松散" : "紧凑"}`);
  }
  filtersRoot.querySelectorAll("[data-domain]").forEach((button) => {
    const category = data.categories[button.dataset.domain];
    const active = button.dataset.domain === activeCategory;
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", `${category.short}${active ? "，取消筛选" : "，筛选"}`);
    button.title = active ? "取消此筛选" : `只看${category.label}`;
  });
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

  gradeGrid.querySelectorAll("[data-topic-id]").forEach((button) => button.addEventListener("click", () => openLesson(topicLookup.get(button.dataset.topicId))));
  gradeGrid.querySelectorAll(".unit-focus-button").forEach((button) => button.addEventListener("click", () => focusUnit(button.closest(".unit-card"))));
}

function updateStats() {
  const topics = flattenTopics();
  const visible = activeCategory === "all" ? topics : topics.filter((item) => item.unit.category === activeCategory);
  const lessonPlans = visible.filter((item) => (item.point.designs || []).length > 0).length;
  const playableTrials = visible.reduce((total, item) => total + (item.point.rehearsals || []).filter((version) => version.video).length, 0);
  statsRoot.innerHTML = `
    <span class="map-metric"><strong>${visible.length}</strong><small>知识点</small></span>
    <span class="map-metric"><strong>${lessonPlans}</strong><small>篇教案</small></span>
    <span class="map-metric"><strong>${playableTrials}</strong><small>可播放试讲</small></span>`;
}

function toggleLayoutMode() {
  layoutMode = layoutMode === "loose" ? "compact" : "loose";
  applyFilterState();
}

function toggleCategoryFilter(category) {
  activeCategory = activeCategory === category ? "all" : category;
  applyFilterState();
}

function syncTermAlignment() {
  const firstTerms = [...gradeGrid.querySelectorAll(".grade-column")]
    .filter((column) => column.querySelectorAll(":scope > .term-block").length > 1)
    .map((column) => column.querySelector(":scope > .term-block"));
  firstTerms.forEach((term) => term.style.removeProperty("min-height"));
  if (layoutMode !== "loose" || !firstTerms.length) return;
  const tallest = Math.max(...firstTerms.map((term) => term.offsetHeight));
  firstTerms.forEach((term) => { term.style.minHeight = `${tallest}px`; });
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

function applyFilterState(animate = true) {
  const previousPositions = captureFilterLayout();
  syncFilterControls();
  const hasFilter = activeCategory !== "all";
  gradeGrid.dataset.layoutMode = layoutMode;
  gradeGrid.querySelectorAll("[data-route-category]").forEach((unit) => {
    const excluded = hasFilter && unit.dataset.routeCategory !== activeCategory;
    unit.classList.toggle("is-dimmed", layoutMode === "loose" && excluded);
    unit.classList.toggle("is-filtered-out", layoutMode === "compact" && excluded);
  });
  gradeGrid.querySelectorAll(".term-block").forEach((semester) => {
    const hasActiveUnit = Array.from(semester.querySelectorAll("[data-route-category]")).some((unit) => !hasFilter || unit.dataset.routeCategory === activeCategory);
    semester.classList.toggle("is-muted", layoutMode === "loose" && hasFilter && !hasActiveUnit);
    semester.classList.toggle("is-filtered-out", layoutMode === "compact" && hasFilter && !hasActiveUnit);
  });
  syncTermAlignment();
  updateStats();
  refreshMapBounds();
  applyView();
  if (animate) animateFilterLayout(previousPositions);
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
  if (topicSearch.value.trim() && activeCategory !== "all") {
    activeCategory = "all";
    applyFilterState();
    return;
  }
  applySearch(topicSearch.value);
}

function resetMapFilters() {
  activeCategory = "all";
  topicSearch.value = "";
  applyFilterState(false);
}

function lessonTabModel(lesson) { return window.lessonContent.model(lesson.point); }

function renderCourseOverview(lesson) {
  return window.courseOverview.render(lesson.point, topicLookup, markdownToSafeHtml);
}

dialogContent.addEventListener("click", (event) => {
  const link = event.target.closest("[data-overview-topic]");
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const topic = topicLookup.get(link.dataset.overviewTopic);
  if (!topic) return;
  event.preventDefault();
  openLesson(topic);
});

function renderVersionPanel(tab, direction = 1, resetScroll = false) {
  const panel = dialogContent.querySelector("[data-version-panel]");
  if (!panel) return;
  const shouldAnimate = panel.dataset.ready === "true";
  panel.querySelectorAll("video").forEach(video => video.pause());
  panel.dataset.ready = "true";
  panel.innerHTML = window.lessonContent.render(tab, currentLesson.point, topicLookup);
  window.lessonContent.bindMedia(panel);
  if (resetScroll) panel.scrollTop = 0;
  window.lessonContent.bindVersionPicker(panel, tab, () => renderVersionPanel(tab));
  if (shouldAnimate) animateVersionPanel(panel, direction);
}

function animateVersionPanel(panel, direction) {
  if (panel.closest('.is-collapsing')) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  panel.getAnimations().forEach((animation) => animation.cancel());
  panel.animate(
    [{ opacity: 0, transform: `translate3d(${direction < 0 ? -16 : 16}px,0,0)` }, { opacity: 1, transform: "translate3d(0,0,0)" }],
    { duration: 260, easing: "cubic-bezier(.22,.8,.28,1)" }
  );
}

function selectVersion(versionId) {
  const nextIndex = Math.max(0, currentLessonTabs.findIndex((tab) => tab.id === versionId));
  if (nextIndex === currentLessonTabIndex) return;
  const direction = nextIndex > currentLessonTabIndex ? 1 : -1;
  const selected = currentLessonTabs[nextIndex] || currentLessonTabs[0];
  currentLessonTabIndex = nextIndex;
  dialogContent.querySelectorAll("[data-version-id]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.versionId === selected.id)));
  renderVersionPanel(selected, direction, true);
}

function openLesson(lesson) {
  if (!lesson) return;
  if (viewFrame) {
    cancelAnimationFrame(viewFrame);
    viewFrame = 0;
    applyView();
  }
  const requestId = ++lessonOpenRequest;
  currentLesson = lesson;
  const stage = data.stages[lesson.grade.stage];
  const model = lessonTabModel(lesson);
  currentLessonTabs = model.tabs;
  currentLessonTabIndex = 0;
  dialogContent.innerHTML = `
    <article class="lesson-dialog-inner ${model.hasContent ? "" : "is-empty-lesson"}" style="--dialog-stage:${stage.color}">
      ${window.lessonContent.header(lesson, stage, termDisplayLabel(lesson.grade, lesson.semester), statusLabels[lesson.point.status], data.categories[lesson.unit.category].label)}
      <div class="version-tabs" role="tablist" aria-label="课例内容">
        ${model.tabs.map((tab, index) => `<button type="button" role="tab" data-version-id="${escapeHtml(tab.id)}" aria-selected="${index === 0}">${escapeHtml(tab.label)}</button>`).join("")}
      </div>
      <div class="version-panel" data-version-panel role="tabpanel" tabindex="0"></div>
    </article>`;
  window.lessonContent.bindDialog(dialogContent.querySelector('.lesson-dialog-inner'));
  dialogContent.querySelectorAll("[data-version-id]").forEach((button) => button.addEventListener("click", () => selectVersion(button.dataset.versionId)));
  dialog.classList.remove("is-closing");
  document.documentElement.classList.add("is-lesson-open");
  renderVersionPanel(model.tabs[0]);
  if (!dialog.open) dialog.showModal();
  window.lessonContent.refresh(lesson.point).then(() => {
    if (requestId !== lessonOpenRequest || currentLesson !== lesson || !dialog.open) return;
    const activeId = currentLessonTabs[currentLessonTabIndex]?.id;
    currentLessonTabs = lessonTabModel(lesson).tabs;
    currentLessonTabIndex = Math.max(0, currentLessonTabs.findIndex(tab => tab.id === activeId));
    renderVersionPanel(currentLessonTabs[currentLessonTabIndex]);
  }).catch(() => {
    // Static snapshots remain usable if the network is unavailable.
  });
  if (isEmbeddedMap) window.parent.postMessage({ type: "curriculum-lesson-state", open: true }, window.location.origin);
}

function clearLessonDialog() {
  dialog.querySelectorAll("video").forEach((video) => video.pause());
  if (dialog.open) dialog.close();
  dialog.classList.remove("is-closing");
  document.documentElement.classList.remove("is-lesson-open");
  dialogContent.replaceChildren();
  currentLesson = null;
  if (isEmbeddedMap) window.parent.postMessage({ type: "curriculum-lesson-state", open: false }, window.location.origin);
}

function closeLessonDialog(immediate = false) {
  if (!dialog.open || dialog.classList.contains("is-closing")) {
    if (immediate) clearLessonDialog();
    return;
  }
  if (immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    clearLessonDialog();
    return;
  }
  dialog.classList.add("is-closing");
  window.setTimeout(() => {
    clearLessonDialog();
  }, 180);
}

function overviewControlInset() {
  if (!document.documentElement.classList.contains("is-embedded-map") || window.innerWidth <= 680 || view.scale >= 0.6) return 0;
  const controlsRight = document.querySelector("[data-header]")?.getBoundingClientRect().right || 182;
  const configuredGap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--overview-control-gap")) || 0;
  return controlsRight + configuredGap;
}

function overviewSafeArea() {
  const area = { left: overviewControlInset(), right: 0, top: 0, bottom: 0 };
  if (!isEmbeddedMap || window.innerWidth > 680 || view.scale >= 0.6) return area;
  const viewportRect = mapViewport.getBoundingClientRect();
  const headerRect = document.querySelector("[data-header]")?.getBoundingClientRect();
  const hudRect = document.querySelector(".map-hud")?.getBoundingClientRect();
  const gap = 12;
  area.left = gap;
  area.right = gap;
  area.top = headerRect ? Math.max(0, headerRect.bottom - viewportRect.top + gap) : gap;
  area.bottom = hudRect ? Math.max(0, viewportRect.bottom - hudRect.top + gap) : gap;
  return area;
}

function constrainView() {
  if (!mapBounds.viewportWidth || !mapBounds.canvasWidth) refreshMapBounds();
  const scaledWidth = mapBounds.canvasWidth * view.scale;
  const scaledHeight = mapBounds.canvasHeight * view.scale;
  const safe = overviewSafeArea();
  const usableWidth = Math.max(1, mapBounds.viewportWidth - safe.left - safe.right);
  const usableHeight = Math.max(1, mapBounds.viewportHeight - safe.top - safe.bottom);
  const marginX = usableWidth / 2;
  const marginY = usableHeight / 2;
  view.x = scaledWidth <= usableWidth
    ? safe.left + (usableWidth - scaledWidth) / 2
    : Math.min(safe.left + marginX, Math.max(safe.left + usableWidth - scaledWidth - marginX, view.x));
  view.y = scaledHeight <= usableHeight
    ? safe.top + (usableHeight - scaledHeight) / 2
    : Math.min(safe.top + marginY, Math.max(safe.top + usableHeight - scaledHeight - marginY, view.y));
}

function refreshMapBounds() {
  mapBounds.viewportWidth = mapViewport.clientWidth;
  mapBounds.viewportHeight = mapViewport.clientHeight;
  mapBounds.canvasWidth = canvas.offsetWidth;
  mapBounds.canvasHeight = canvas.offsetHeight;
}

function applyView() {
  const nextZoomLevel = view.scale < 0.6 ? "overview" : "detail";
  const zoomLevelChanged = canvas.dataset.zoomLevel !== nextZoomLevel;
  if (zoomLevelChanged) {
    canvas.dataset.zoomLevel = nextZoomLevel;
    document.documentElement.classList.toggle("is-map-overview", nextZoomLevel === "overview");
    refreshMapBounds();
  }
  constrainView();
  const transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
  if (canvas.style.transform !== transform) canvas.style.transform = transform;
  const label = `${Math.round(view.scale * 100)}%`;
  if (zoomLabel.textContent !== label) zoomLabel.textContent = label;
}

function scheduleView() {
  if (viewFrame) return;
  viewFrame = requestAnimationFrame(() => {
    viewFrame = 0;
    applyView();
  });
}

function markMapInteracting() {
  mapViewport.classList.add("is-interacting");
  window.clearTimeout(interactionTimer);
  interactionTimer = window.setTimeout(() => mapViewport.classList.remove("is-interacting"), 140);
}

function resetView(animate = false) {
  if (viewFrame) cancelAnimationFrame(viewFrame);
  viewFrame = 0;
  clearContextFocus(true);
  window.clearTimeout(resetAnimationTimer);
  canvas.classList.remove("is-focusing", "is-resetting");
  const shouldAnimate = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (shouldAnimate) {
    void canvas.offsetWidth;
    canvas.classList.add("is-resetting");
  }
  view.scale = minimumScale();
  refreshMapBounds();
  const safe = overviewSafeArea();
  const usableWidth = Math.max(1, mapBounds.viewportWidth - safe.left - safe.right);
  const usableHeight = Math.max(1, mapBounds.viewportHeight - safe.top - safe.bottom);
  const scaledWidth = mapBounds.canvasWidth * view.scale;
  const scaledHeight = mapBounds.canvasHeight * view.scale;
  view.x = scaledWidth <= usableWidth
    ? safe.left + (usableWidth - scaledWidth) / 2
    : safe.left;
  view.y = scaledHeight <= usableHeight
    ? safe.top + (usableHeight - scaledHeight) / 2
    : safe.top;
  applyView();
  if (shouldAnimate) resetAnimationTimer = window.setTimeout(() => canvas.classList.remove("is-resetting"), 460);
}

function zoomAt(clientX, clientY, factor) {
  const rect = mapViewport.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const oldScale = view.scale;
  const nextScale = Math.min(MAX_SCALE, Math.max(minimumScale(), oldScale * factor));
  if (Math.abs(nextScale - oldScale) < 0.001) return;
  const mapX = (localX - view.x) / oldScale;
  const mapY = (localY - view.y) / oldScale;
  view.scale = nextScale;
  view.x = localX - mapX * nextScale;
  view.y = localY - mapY * nextScale;
  scheduleView();
}

function clearContextFocus(instant = false) {
  if (!canvas.classList.contains("is-context-focused")) return;
  if (instant) canvas.classList.add("is-context-clearing");
  canvas.classList.remove("is-context-focused");
  gradeGrid.querySelectorAll(".unit-card.is-context-focus").forEach((unit) => unit.classList.remove("is-context-focus"));
  if (instant) requestAnimationFrame(() => canvas.classList.remove("is-context-clearing"));
}

function setContextFocus(unit) {
  clearContextFocus();
  unit.classList.add("is-context-focus");
  canvas.classList.add("is-context-focused");
}

function focusUnit(unit, instant = false) {
  if (!unit || canvas.dataset.zoomLevel !== "overview") return;
  if (viewFrame) cancelAnimationFrame(viewFrame);
  viewFrame = 0;
  setContextFocus(unit);
  canvas.dataset.zoomLevel = "detail";
  document.documentElement.classList.remove("is-map-overview");
  const moveToUnit = () => {
    const viewportRect = mapViewport.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const unitRect = unit.getBoundingClientRect();
    const centerX = (unitRect.left + unitRect.width / 2 - canvasRect.left) / view.scale;
    const centerY = (unitRect.top + unitRect.height / 2 - canvasRect.top) / view.scale;
    view.scale = UNIT_FOCUS_SCALE;
    view.x = viewportRect.width / 2 - centerX * view.scale;
    view.y = viewportRect.height / 2 - centerY * view.scale;
    if (instant) {
      canvas.classList.remove("is-focusing");
      canvas.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
      zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
      refreshMapBounds();
      return;
    }
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
      refreshMapBounds();
    }, 460);
  };
  if (instant) moveToUnit();
  else requestAnimationFrame(() => requestAnimationFrame(moveToUnit));
}

mapViewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  markMapInteracting();
  clearContextFocus(true);
  zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.00135));
}, { passive: false });

function pairMetrics() {
  const [first, second] = [...pointers.values()];
  if (!first || !second) return null;
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
  };
}

function capturePointer(pointer) {
  if (!pointer || pointer.captured) return;
  try {
    mapViewport.setPointerCapture(pointer.id);
    pointer.captured = true;
  } catch {}
}

function beginPinch() {
  const metrics = pairMetrics();
  if (!metrics) return;
  pointers.forEach(capturePointer);
  gesture.mode = "pinch";
  gesture.lastCenterX = metrics.x;
  gesture.lastCenterY = metrics.y;
  gesture.lastDistance = metrics.distance;
  gesture.moved = true;
  mapViewport.classList.add("is-dragging");
}

mapViewport.addEventListener("pointerdown", (event) => {
  if (canvas.classList.contains("is-context-focused")) clearContextFocus(true);
  if (event.pointerType === "mouse" && (event.button !== 0 || event.target.closest("button"))) return;
  const pointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    captured: false,
    startedOnButton: Boolean(event.target.closest("button"))
  };
  pointers.set(event.pointerId, pointer);
  markMapInteracting();
  gesture.tapTarget = event.target.closest("button");
  if (event.pointerType !== "mouse") {
    event.preventDefault();
    capturePointer(pointer);
  } else {
    capturePointer(pointer);
  }

  if (pointers.size >= 2) {
    event.preventDefault();
    beginPinch();
    return;
  }

  gesture.mode = "pan";
  gesture.primaryId = event.pointerId;
  gesture.lastX = event.clientX;
  gesture.lastY = event.clientY;
  gesture.moved = false;
});

mapViewport.addEventListener("pointermove", (event) => {
  if (!pointers.has(event.pointerId)) return;
  markMapInteracting();
  const pointer = pointers.get(event.pointerId);
  pointer.x = event.clientX;
  pointer.y = event.clientY;

  if (pointers.size >= 2) {
    event.preventDefault();
    const metrics = pairMetrics();
    if (!metrics) return;
    if (gesture.mode !== "pinch") {
      beginPinch();
      return;
    }
    view.x += metrics.x - gesture.lastCenterX;
    view.y += metrics.y - gesture.lastCenterY;
    const factor = Math.min(1.18, Math.max(0.85, metrics.distance / gesture.lastDistance));
    gesture.lastCenterX = metrics.x;
    gesture.lastCenterY = metrics.y;
    gesture.lastDistance = metrics.distance;
    gesture.moved = true;
    zoomAt(metrics.x, metrics.y, factor);
    return;
  }

  if (gesture.mode !== "pan" || gesture.primaryId !== event.pointerId) return;
  const deltaX = event.clientX - gesture.lastX;
  const deltaY = event.clientY - gesture.lastY;
  gesture.lastX = event.clientX;
  gesture.lastY = event.clientY;
  if (!gesture.moved && Math.hypot(deltaX, deltaY) < 3) return;
  event.preventDefault();
  capturePointer(pointer);
  gesture.moved = true;
  mapViewport.classList.add("is-dragging");
  view.x += deltaX;
  view.y += deltaY;
  scheduleView();
});

function finishGesture(event) {
  if (!pointers.has(event.pointerId)) return;
  const shouldSuppressClick = gesture.moved || gesture.mode === "pinch" || pointers.size > 1;
  const tapTarget = !shouldSuppressClick && pointers.size === 1 ? gesture.tapTarget : null;
  pointers.delete(event.pointerId);
  if (mapViewport.hasPointerCapture(event.pointerId)) mapViewport.releasePointerCapture(event.pointerId);
  if (shouldSuppressClick) gesture.suppressClickUntil = performance.now() + 450;

  const remaining = [...pointers.values()][0];
  if (remaining) {
    gesture.mode = "pan";
    gesture.primaryId = remaining.id;
    gesture.lastX = remaining.x;
    gesture.lastY = remaining.y;
    gesture.moved = shouldSuppressClick;
    return;
  }

  gesture.mode = "idle";
  gesture.primaryId = null;
  gesture.moved = false;
  gesture.tapTarget = null;
  mapViewport.classList.remove("is-dragging");
  window.clearTimeout(interactionTimer);
  interactionTimer = window.setTimeout(() => mapViewport.classList.remove("is-interacting"), 80);
  if (tapTarget) {
    gesture.suppressClickUntil = performance.now() + 450;
    if (tapTarget.matches("[data-topic-id]")) openLesson(topicLookup.get(tapTarget.dataset.topicId));
    if (tapTarget.matches(".unit-focus-button")) focusUnit(tapTarget.closest(".unit-card"));
  }
}

mapViewport.addEventListener("pointerup", finishGesture);
mapViewport.addEventListener("pointercancel", finishGesture);
mapViewport.addEventListener("lostpointercapture", finishGesture);
mapViewport.addEventListener("click", (event) => {
  if (performance.now() >= gesture.suppressClickUntil) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

zoomInButton.addEventListener("click", () => {
  clearContextFocus(true);
  const rect = mapViewport.getBoundingClientRect();
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.16);
});
zoomOutButton.addEventListener("click", () => {
  clearContextFocus(true);
  const rect = mapViewport.getBoundingClientRect();
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.16);
});
resetViewButton.addEventListener("click", () => resetView(true));
document.addEventListener("pointerdown", () => {
  if (canvas.classList.contains("is-context-focused")) clearContextFocus(true);
}, { capture: true, passive: true });
window.addEventListener("resize", () => {
  syncTermAlignment();
  refreshMapBounds();
  applyView();
}, { passive: true });

document.querySelector("[data-close-dialog]").addEventListener("click", () => closeLessonDialog());
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
applyFilterState(false);
resetView();
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
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === "curriculum-dismiss-overlays") {
    closeLessonDialog(true);
    clearContextFocus(true);
    resetMapFilters();
    return;
  }
  if (event.data?.type !== "curriculum-focus-unit") return;
  closeLessonDialog(true);
  resetMapFilters();
  const unitId = String(event.data.unitId || "");
  const requestedUnit = [...gradeGrid.querySelectorAll(".unit-card")].find((unit) => unit.dataset.unitId === unitId);
  if (!requestedUnit) return;
  resetView();
  if (event.data.instant) {
    requestAnimationFrame(() => {
      focusUnit(requestedUnit, true);
      event.source?.postMessage({ type: "curriculum-focus-ready", unitId }, event.origin);
    });
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => focusUnit(requestedUnit)));
  }
});
window.addEventListener("resize", applyView, { passive: true });
