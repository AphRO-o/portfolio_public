const data = window.curriculumData;
const header = document.querySelector("[data-header]");
const dialog = document.querySelector("[data-lesson-dialog]");
const dialogContent = document.querySelector("[data-dialog-content]");
const mapExplorer = document.querySelector("[data-map-explorer]");
const mapFrame = document.querySelector("[data-map-frame]");
const miniMapShell = document.querySelector(".mini-map-shell");
const statusLabels = { pending: "尚未备课", planning: "已进入规划", drafted: "已有教案", recorded: "已完成试讲" };
let currentLesson = null;
let currentLessonTabs = [];
let currentLessonTabIndex = 0;
let versionPanelAnimationTimer = 0;
let resetMiniMapFisheye = null;
let mapTransitionTimer = 0;
let mapPrepareTimer = 0;
let pendingMapUnitId = null;
let mapOriginTrigger = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
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

function termDisplayLabel(grade, semester) {
  if (grade.stage !== "junior") return semester.label;
  if (semester.label.includes("上")) return "上学期";
  if (semester.label.includes("下")) return "下学期";
  return semester.label;
}

function flattenTopics() {
  const topics = [];
  data.grades.forEach((grade) => grade.terms.forEach((semester) => semester.units.forEach((unit) => unit.points.forEach((point) => {
    topics.push({ id: point.id, grade, semester, unit, point });
  }))));
  return topics;
}

const topicLookup = new Map(flattenTopics().map((topic) => [topic.id, topic]));

function lessonVersions(lesson) {
  return Array.isArray(lesson?.point?.versions) ? lesson.point.versions : [];
}

function lessonTabModel(lesson) {
  const versions = lessonVersions(lesson);
  const designVersion = versions.find((version) => version.designMarkdown);
  const designMarkdown = designVersion?.designMarkdown || "";
  const lessonFile = designVersion?.lessonFile || versions.find((version) => version.lessonFile)?.lessonFile || "";
  const trials = versions.map((version, index) => {
    const match = `${version.id || ""} ${version.label || ""}`.match(/v\s*(\d+)/i);
    return { ...version, tabId: `trial-${version.id || index + 1}`, versionNumber: match ? Number(match[1]) : index + 1, sourceIndex: index };
  }).filter((version) => Boolean(version.video || version.reflectionMarkdown || version.reflection || version.boardImage || version.board || version.date || version.duration || version.format))
    .sort((a, b) => b.versionNumber - a.versionNumber || b.sourceIndex - a.sourceIndex);
  const hasContent = Boolean(designMarkdown || trials.length);
  const tabs = [{ id: "overview", label: "课程概览", kind: "overview", hasContent }];
  if (designMarkdown) tabs.push({ id: "design", label: "教学设计", kind: "design", designMarkdown, lessonFile });
  trials.forEach((version) => tabs.push({ ...version, id: version.tabId, label: `试讲 v${version.versionNumber}`, kind: "trial" }));
  return { tabs, hasContent };
}

function overviewMarkdown(value) {
  if (Array.isArray(value)) return value.map((item) => `- ${item}`).join("\n");
  return String(value || "").trim();
}

function renderCourseOverview(lesson, hasContent) {
  if (!hasContent) return `<section class="course-overview is-empty" aria-label="课程概览"></section>`;
  const overview = lesson.point.overview || {};
  const fields = [
    ["教学目标", overview.objectives || overview.objective],
    ["前置知识点", overview.prerequisites || overview.prerequisite],
    ["后置知识点", overview.nextTopics || overview.next],
    ["例题设计", overview.examples || overview.exampleDesign]
  ];
  return `<section class="course-overview">${fields.map(([label, value]) => {
    const markdown = overviewMarkdown(value);
    return `<article><span>${label}</span>${markdown ? `<div class="lesson-markdown">${markdownToSafeHtml(markdown)}</div>` : `<i>待补充</i>`}</article>`;
  }).join("")}</section>`;
}

function animateVersionPanel(panel, direction) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.clearTimeout(versionPanelAnimationTimer);
  panel.classList.remove("is-switching", "is-switching-forward", "is-switching-backward");
  panel.getBoundingClientRect();
  panel.classList.add("is-switching", direction < 0 ? "is-switching-backward" : "is-switching-forward");
  versionPanelAnimationTimer = window.setTimeout(() => {
    panel.classList.remove("is-switching", "is-switching-forward", "is-switching-backward");
  }, 300);
}

function renderVersionPanel(tab, direction = 1) {
  const panel = dialogContent.querySelector("[data-version-panel]");
  if (!panel) return;
  const shouldAnimate = panel.dataset.ready === "true";
  panel.dataset.ready = "true";
  panel.classList.remove("is-loading");
  if (tab.kind === "overview") {
    panel.innerHTML = renderCourseOverview(currentLesson, tab.hasContent);
  } else if (tab.kind === "design") {
    const lessonFile = tab.lessonFile ? `<a class="resource-link" href="${escapeHtml(tab.lessonFile)}" target="_blank" rel="noopener">打开完整 Markdown 教案 ↗</a>` : "";
    panel.innerHTML = `<div class="version-layout"><section class="lesson-plan"><p class="plan-kicker">LESSON DESIGN</p><section class="lesson-document"><h3>教学设计</h3><div class="lesson-markdown">${markdownToSafeHtml(tab.designMarkdown)}</div></section>${lessonFile}</section></div>`;
  } else {
    const videoContent = tab.video
      ? `<video class="lesson-video" controls preload="metadata" src="${escapeHtml(tab.video)}">你的浏览器暂不支持视频播放。</video>`
      : `<div class="video-placeholder"><span aria-hidden="true">▶</span><strong>试讲视频待上传</strong><small>上传后将在这里保持 16:9 播放</small></div>`;
    const reflection = tab.reflectionMarkdown
      ? `<div class="lesson-markdown">${markdownToSafeHtml(tab.reflectionMarkdown)}</div>`
      : tab.reflection ? `<p>${escapeHtml(tab.reflection)}</p>` : `<p class="lesson-empty-note">本版复盘待补充</p>`;
    const board = tab.boardImage
      ? `<figure class="board-preview"><a href="${escapeHtml(tab.boardImage)}" target="_blank" rel="noopener"><img src="${escapeHtml(tab.boardImage)}" alt="${escapeHtml(`试讲 v${tab.versionNumber} 板书`)}" /></a><figcaption>本版板书 · 点击查看原图</figcaption></figure>`
      : tab.board ? `<div class="lesson-markdown"><p>${escapeHtml(tab.board)}</p></div>` : `<p class="lesson-empty-note">本版板书待补充</p>`;
    panel.innerHTML = `<div class="version-layout"><section class="video-slot">${videoContent}</section><section class="lesson-plan"><p class="plan-kicker">TRIAL v${tab.versionNumber}</p><div class="lesson-version-meta">${[tab.date, tab.duration, tab.format].filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div><section class="lesson-document reflection"><h3>本版复盘</h3>${reflection}</section><section class="lesson-document board-document"><h3>本版板书</h3>${board}</section></section></div>`;
  }
  if (shouldAnimate) animateVersionPanel(panel, direction);
}

function selectVersion(versionId) {
  const nextIndex = Math.max(0, currentLessonTabs.findIndex((tab) => tab.id === versionId));
  if (nextIndex === currentLessonTabIndex) return;
  const direction = nextIndex > currentLessonTabIndex ? 1 : -1;
  const selected = currentLessonTabs[nextIndex] || currentLessonTabs[0];
  currentLessonTabIndex = nextIndex;
  dialogContent.querySelectorAll("[data-version-id]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.versionId === selected.id)));
  renderVersionPanel(selected, direction);
}

function openLesson(lesson) {
  if (!lesson) return;
  currentLesson = lesson;
  const stage = data.stages[lesson.grade.stage];
  const category = data.categories[lesson.unit.category];
  const model = lessonTabModel(lesson);
  currentLessonTabs = model.tabs;
  currentLessonTabIndex = 0;
  dialogContent.innerHTML = `<article class="lesson-dialog-inner ${model.hasContent ? "" : "is-empty-lesson"}" style="--dialog-stage:${stage.color}"><header class="lesson-dialog-header"><div class="lesson-breadcrumb">${stage.label}数学 / ${escapeHtml(lesson.grade.label)} / ${escapeHtml(termDisplayLabel(lesson.grade, lesson.semester))} / ${category.label}</div><h2>${escapeHtml(lesson.point.title)}</h2><div class="lesson-submeta"><span>${escapeHtml(lesson.unit.title)}</span><span class="lesson-state ${lesson.point.status}">${statusLabels[lesson.point.status]}</span></div></header><div class="version-tabs" role="tablist" aria-label="课例内容">${model.tabs.map((tab, index) => `<button type="button" role="tab" data-version-id="${escapeHtml(tab.id)}" aria-selected="${index === 0}">${escapeHtml(tab.label)}</button>`).join("")}</div><div class="version-panel is-loading" data-version-panel role="tabpanel"><div class="panel-loading">正在展开课例…</div></div></article>`;
  dialogContent.querySelectorAll("[data-version-id]").forEach((button) => button.addEventListener("click", () => selectVersion(button.dataset.versionId)));
  dialog.classList.remove("is-closing");
  dialog.showModal();
  window.setTimeout(() => {
    if (dialog.open && currentLesson === lesson) renderVersionPanel(model.tabs[0]);
  }, 180);
}

function closeLessonDialog() {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return dialog.close();
  dialog.classList.add("is-closing");
  window.setTimeout(() => { dialog.close(); dialog.classList.remove("is-closing"); }, 180);
}

function setMapTransitionOrigin() {
  if (!miniMapShell || !mapExplorer?.open) return false;
  const sourceRect = miniMapShell.getBoundingClientRect();
  const source = {
    left: Math.max(0, sourceRect.left),
    top: Math.max(0, sourceRect.top),
    right: Math.min(window.innerWidth, sourceRect.right),
    bottom: Math.min(window.innerHeight, sourceRect.bottom)
  };
  source.width = Math.max(0, source.right - source.left);
  source.height = Math.max(0, source.bottom - source.top);
  const target = mapExplorer.getBoundingClientRect();
  if (!source.width || !source.height || !target.width || !target.height) return false;
  const offsetX = source.left + source.width / 2 - (target.left + target.width / 2);
  const offsetY = source.top + source.height / 2 - (target.top + target.height / 2);
  mapExplorer.style.setProperty("--map-origin-x", `${offsetX.toFixed(2)}px`);
  mapExplorer.style.setProperty("--map-origin-y", `${offsetY.toFixed(2)}px`);
  mapExplorer.style.setProperty("--map-origin-scale-x", Math.max(.06, source.width / target.width).toFixed(4));
  mapExplorer.style.setProperty("--map-origin-scale-y", Math.max(.06, source.height / target.height).toFixed(4));
  return true;
}

function focusMapFrame(unitId, instant = false) {
  pendingMapUnitId = unitId;
  if (!mapFrame.getAttribute("src")) {
    mapFrame.src = "/curriculum?embed=1";
    return;
  }
  if (mapFrame.dataset.ready === "true") {
    mapFrame.contentWindow?.postMessage({ type: "curriculum-focus-unit", unitId, instant }, window.location.origin);
  }
}

function revealMapExplorer() {
  if (!mapExplorer?.open || !mapExplorer.classList.contains("is-preparing")) return;
  window.clearTimeout(mapPrepareTimer);
  mapExplorer.classList.remove("is-preparing");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || !setMapTransitionOrigin()) {
    mapExplorer.classList.add("is-expanded");
    return;
  }
  mapExplorer.classList.add("is-transitioning");
  void mapExplorer.offsetWidth;
  requestAnimationFrame(() => {
    mapExplorer.classList.add("is-expanded");
    mapTransitionTimer = window.setTimeout(() => mapExplorer.classList.remove("is-transitioning"), 420);
  });
}

function dismissMapFrameOverlays() {
  if (mapFrame?.dataset.ready !== "true") return;
  mapFrame.contentWindow?.postMessage({ type: "curriculum-dismiss-overlays" }, window.location.origin);
}

function openMapExplorer(unitId, trigger = null) {
  if (!mapExplorer || !mapFrame || !unitId) return;
  mapOriginTrigger = trigger;
  pendingMapUnitId = unitId;
  if (mapExplorer.open) {
    focusMapFrame(unitId);
    return;
  }
  resetMiniMapFisheye?.();
  document.body.classList.add("is-map-open");
  window.clearTimeout(mapTransitionTimer);
  window.clearTimeout(mapPrepareTimer);
  mapExplorer.classList.remove("is-closing", "is-expanded", "is-transitioning");
  mapExplorer.classList.add("is-preparing");
  mapExplorer.showModal();
  focusMapFrame(unitId, true);
  mapPrepareTimer = window.setTimeout(revealMapExplorer, 1800);
}

function closeMapExplorer() {
  if (!mapExplorer?.open || mapExplorer.classList.contains("is-closing")) return;
  dismissMapFrameOverlays();
  const finish = () => {
    mapExplorer.close();
    mapExplorer.classList.remove("is-closing", "is-expanded", "is-transitioning", "is-preparing");
    document.body.classList.remove("is-map-open");
    mapOriginTrigger?.focus({ preventScroll: true });
  };
  window.clearTimeout(mapTransitionTimer);
  window.clearTimeout(mapPrepareTimer);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }
  mapExplorer.classList.remove("is-transitioning", "is-expanded");
  mapExplorer.classList.add("is-closing");
  mapTransitionTimer = window.setTimeout(finish, 240);
}

function renderMiniMap() {
  const map = document.querySelector("[data-mini-map]");
  if (!map) return;
  const allUnits = [];
  const stageBands = Object.entries(data.stages).map(([stageId, stage]) => {
    const gradeCount = data.grades.filter((grade) => grade.stage === stageId).length;
    return `<div class="mini-overview-stage ${stageId}" style="--mini-stage:${stage.color};--stage-span:${gradeCount}"><strong>${stage.label}数学</strong><span>${stage.years}</span></div>`;
  }).join("");
  const grades = data.grades.map((grade) => {
    const stage = data.stages[grade.stage];
    const terms = grade.terms.map((semester) => `<section class="mini-column-term"><header><strong>${escapeHtml(termDisplayLabel(grade, semester))}</strong><span>${semester.units.length} units</span></header><div class="mini-column-units">${semester.units.map((unit) => {
      const started = unit.points.some((point) => point.status !== "pending");
      allUnits.push({ unit, started });
      return `<a class="mini-unit ${started ? "is-started" : ""}" href="/curriculum?unit=${encodeURIComponent(unit.id)}" data-map-unit="${escapeHtml(unit.id)}" style="--mini-stage:${stage.color}" aria-label="展开完整地图并聚焦：${escapeHtml(grade.label)} ${escapeHtml(termDisplayLabel(grade, semester))} ${escapeHtml(unit.title)}"><strong>${escapeHtml(unit.title)}</strong></a>`;
    }).join("")}</div></section>`).join("");
    return `<article class="mini-overview-grade" style="--mini-stage:${stage.color}"><header class="mini-overview-grade-head"><div><strong>${escapeHtml(grade.label)}</strong><small>${escapeHtml(stage.label)}数学</small></div><span>${escapeHtml(grade.code)}</span></header>${terms}</article>`;
  }).join("");
  map.innerHTML = `<div class="mini-overview-canvas"><div class="mini-overview-bands">${stageBands}</div><div class="mini-overview-grades">${grades}</div></div>`;
  const started = allUnits.filter((item) => item.started).length;
  document.querySelector("[data-mini-progress]").textContent = `${allUnits.length} 个单元 · ${started} 个已开始`;

  map.querySelectorAll("[data-map-unit]").forEach((unit) => unit.addEventListener("click", (event) => {
    event.preventDefault();
    openMapExplorer(unit.dataset.mapUnit, unit);
  }));

  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const nodes = [...map.querySelectorAll(".mini-unit")];
  let nodeCenters = [];
  let mapRect = null;
  let fishFrame = 0;
  let pointerClientX = 0;
  let pointerClientY = 0;
  let pointerInside = false;
  const activeNodes = new Set();
  const resetNode = (node) => {
    node.style.removeProperty("--unit-scale");
    node.style.removeProperty("--unit-shift-x");
    node.style.removeProperty("--unit-shift-y");
    node.style.zIndex = "";
    node.classList.remove("is-fisheye-center", "is-fisheye-near");
  };
  const resetFisheye = () => {
    if (fishFrame) cancelAnimationFrame(fishFrame);
    fishFrame = 0;
    activeNodes.forEach(resetNode);
    activeNodes.clear();
    nodeCenters = [];
    mapRect = null;
    pointerInside = false;
  };
  resetMiniMapFisheye = resetFisheye;
  const measureNodes = () => {
    mapRect = map.getBoundingClientRect();
    nodeCenters = nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { node, x: rect.left - mapRect.left + rect.width / 2, y: rect.top - mapRect.top + rect.height / 2, width: rect.width, height: rect.height };
    });
  };
  const renderFisheye = () => {
    fishFrame = 0;
    if (!pointerInside) return;
    if (!nodeCenters.length) measureNodes();
    if (!mapRect) return;
    const pointerX = pointerClientX - mapRect.left;
    const pointerY = pointerClientY - mapRect.top;
    let centerNode = null;
    let centerDistance = Infinity;
    nodeCenters.forEach((item) => {
      const distance = Math.hypot(pointerX - item.x, pointerY - item.y);
      if (distance < centerDistance) {
        centerDistance = distance;
        centerNode = item.node;
      }
    });
    const nextActive = new Set();
    nodeCenters.forEach(({ node, x, y, width, height }) => {
      const dx = x - pointerX;
      const dy = y - pointerY;
      const distance = Math.hypot(dx, dy);
      const proximity = Math.max(0, 1 - distance / 210);
      const isCenter = node === centerNode;
      if (!isCenter && proximity <= 0) return;
      nextActive.add(node);
      const scale = 1 + Math.pow(proximity, 1.35) * 0.9;
      const push = isCenter || distance < 1 ? 0 : Math.pow(proximity, 1.2) * 22;
      const scaledHalfWidth = width * scale / 2;
      const scaledHalfHeight = height * scale / 2;
      const safeX = Math.min(mapRect.width - scaledHalfWidth - 6, Math.max(scaledHalfWidth + 6, x));
      const safeY = Math.min(mapRect.height - scaledHalfHeight - 6, Math.max(scaledHalfHeight + 6, y));
      const shiftX = isCenter ? safeX - x : distance ? (dx / distance) * push : 0;
      const shiftY = isCenter ? safeY - y : distance ? (dy / distance) * push : 0;
      node.style.setProperty("--unit-scale", scale.toFixed(3));
      node.style.setProperty("--unit-shift-x", `${shiftX}px`);
      node.style.setProperty("--unit-shift-y", `${shiftY}px`);
      node.style.zIndex = String(10 + Math.round(proximity * 20) + (isCenter ? 30 : 0));
      node.classList.toggle("is-fisheye-center", isCenter);
      node.classList.add("is-fisheye-near");
    });
    activeNodes.forEach((node) => { if (!nextActive.has(node)) resetNode(node); });
    activeNodes.clear();
    nextActive.forEach((node) => activeNodes.add(node));
  };
  const scheduleFisheye = () => {
    if (!fishFrame) fishFrame = requestAnimationFrame(renderFisheye);
  };
  const refreshFisheyeAfterLayout = () => {
    if (!pointerInside) return;
    const currentRect = map.getBoundingClientRect();
    const isStillOverMap = pointerClientX >= currentRect.left && pointerClientX <= currentRect.right
      && pointerClientY >= currentRect.top && pointerClientY <= currentRect.bottom;
    if (!isStillOverMap) {
      resetFisheye();
      return;
    }
    measureNodes();
    scheduleFisheye();
  };
  map.addEventListener("pointerenter", (event) => {
    pointerInside = true;
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
    measureNodes();
    scheduleFisheye();
  }, { passive: true });
  map.addEventListener("pointermove", (event) => {
    pointerInside = true;
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
    if (!mapRect) measureNodes();
    scheduleFisheye();
  }, { passive: true });
  map.addEventListener("pointerleave", resetFisheye);
  window.addEventListener("scroll", refreshFisheyeAfterLayout, { passive: true });
  window.addEventListener("resize", refreshFisheyeAfterLayout, { passive: true });
}

function setupFeaturedLessons() {
  const tabs = [...document.querySelectorAll("[data-featured-stage]")];
  const panels = [...document.querySelectorAll("[data-featured-panel]")];
  const setFeaturedStage = (stage) => { document.documentElement.dataset.featuredStage = stage; };
  setFeaturedStage(tabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset.featuredStage || "primary");
  tabs.forEach((tab) => tab.addEventListener("click", () => {
    const stage = tab.dataset.featuredStage;
    setFeaturedStage(stage);
    tabs.forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    panels.forEach((panel) => {
      const inactive = panel.dataset.featuredPanel !== stage;
      panel.classList.toggle("is-inactive", inactive);
      panel.toggleAttribute("inert", inactive);
      panel.setAttribute("aria-hidden", String(inactive));
    });
  }));

  panels.forEach((panel) => {
    const topicId = panel.dataset.featuredTopic;
    if (!topicId) return;
    const lesson = topicLookup.get(topicId);
    const video = panel.querySelector("[data-featured-video]");
    const placeholder = panel.querySelector("[data-featured-video-placeholder]");
    const videoVersion = lesson ? [...lessonVersions(lesson)].reverse().find((version) => version.video) : null;
    if (video && videoVersion) {
      video.src = videoVersion.video;
      video.hidden = false;
      if (placeholder) placeholder.hidden = true;
    }
    video?.addEventListener("click", (event) => event.stopPropagation());
    panel.addEventListener("click", (event) => {
      if (event.target.closest("video")) return;
      openLesson(lesson);
    });
    panel.addEventListener("keydown", (event) => {
      if (event.target !== panel || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      openLesson(lesson);
    });
  });
}

document.querySelector("[data-year]").textContent = new Date().getFullYear();
const homeHero = document.querySelector(".home-hero");
function syncHeaderState() {
  header.classList.toggle("is-scrolled", window.scrollY > 24);
  header.classList.toggle("is-past-hero", Boolean(homeHero) && window.scrollY >= Math.max(0, homeHero.offsetHeight - header.offsetHeight));
}
window.addEventListener("scroll", syncHeaderState, { passive: true });
window.addEventListener("resize", syncHeaderState, { passive: true });
syncHeaderState();
document.querySelectorAll("[data-open-topic]").forEach((button) => button.addEventListener("click", () => openLesson(topicLookup.get(button.dataset.openTopic))));
document.querySelector("[data-close-dialog]").addEventListener("click", closeLessonDialog);
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeLessonDialog(); });
dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeLessonDialog(); });
document.querySelector("[data-close-map]")?.addEventListener("click", closeMapExplorer);
mapExplorer?.addEventListener("cancel", (event) => { event.preventDefault(); closeMapExplorer(); });
mapExplorer?.addEventListener("click", (event) => { if (event.target === mapExplorer) closeMapExplorer(); });
mapFrame?.addEventListener("load", () => {
  mapFrame.dataset.ready = "true";
  if (pendingMapUnitId) mapFrame.contentWindow?.postMessage({ type: "curriculum-focus-unit", unitId: pendingMapUnitId, instant: mapExplorer?.classList.contains("is-preparing") }, window.location.origin);
});
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin || event.source !== mapFrame?.contentWindow) return;
  if (event.data?.type === "curriculum-focus-ready" && event.data.unitId === pendingMapUnitId) revealMapExplorer();
});

if (mapFrame) {
  const warmMap = () => {
    if (!mapFrame.getAttribute("src")) mapFrame.src = "/curriculum?embed=1";
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(warmMap, { timeout: 1200 });
  else window.setTimeout(warmMap, 500);
}
renderMiniMap();
setupFeaturedLessons();

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), { threshold: 0.1 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
