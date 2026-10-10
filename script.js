const data = window.curriculumData;
const header = document.querySelector("[data-header]");
const dialog = document.querySelector("[data-lesson-dialog]");
const dialogContent = document.querySelector("[data-dialog-content]");
const mapExplorer = document.querySelector("[data-map-explorer]");
const mapFrame = document.querySelector("[data-map-frame]");
const miniMapShell = document.querySelector(".mini-map-shell");
const statusLabels = { pending: "尚未备课", planning: "已进入规划", drafted: "已有教案", recorded: "已完成试讲" };
let currentLesson = null;
let lessonOpenRequest = 0;
let currentLessonTabs = [];
let currentLessonTabIndex = 0;
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

function markdownToSafeHtml(markdown) { return window.lessonContent.markdown(markdown); }

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

function animateVersionPanel(panel, direction) {
  if (panel.closest('.is-collapsing')) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  panel.getAnimations().forEach((animation) => animation.cancel());
  panel.animate(
    [{ opacity: 0, transform: `translate3d(${direction < 0 ? -16 : 16}px,0,0)` }, { opacity: 1, transform: "translate3d(0,0,0)" }],
    { duration: 260, easing: "cubic-bezier(.22,.8,.28,1)" }
  );
}

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
  const requestId = ++lessonOpenRequest;
  currentLesson = lesson;
  const stage = data.stages[lesson.grade.stage];
  const model = lessonTabModel(lesson);
  currentLessonTabs = model.tabs;
  currentLessonTabIndex = 0;
  dialogContent.innerHTML = `<article class="lesson-dialog-inner ${model.hasContent ? "" : "is-empty-lesson"}" style="--dialog-stage:${stage.color}">${window.lessonContent.header(lesson, stage, termDisplayLabel(lesson.grade, lesson.semester), statusLabels[lesson.point.status], data.categories[lesson.unit.category].label)}<div class="version-tabs" role="tablist" aria-label="课例内容">${model.tabs.map((tab, index) => `<button type="button" role="tab" data-version-id="${escapeHtml(tab.id)}" aria-selected="${index === 0}">${escapeHtml(tab.label)}</button>`).join("")}</div><div class="version-panel" data-version-panel role="tabpanel" tabindex="0"></div></article>`;
  window.lessonContent.bindDialog(dialogContent.querySelector('.lesson-dialog-inner'));
  dialogContent.querySelectorAll("[data-version-id]").forEach((button) => button.addEventListener("click", () => selectVersion(button.dataset.versionId)));
  dialog.classList.remove("is-closing");
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
}

function closeLessonDialog() {
  dialog.querySelectorAll("video").forEach(video => video.pause());
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
  mapExplorer.classList.remove("has-lesson-open");
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
    mapExplorer.classList.remove("is-closing", "is-expanded", "is-transitioning", "is-preparing", "has-lesson-open");
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
  const area = document.querySelector(".featured-area");
  const tabs = [...document.querySelectorAll("[data-featured-stage]")];
  const panels = [...document.querySelectorAll("[data-featured-panel]")];
  const referencePanel = panels.find((panel) => panel.dataset.featuredPanel === "primary");
  let panelHeightFrame = 0;
  const syncPanelHeight = () => {
    if (!area || !referencePanel) return;
    cancelAnimationFrame(panelHeightFrame);
    area.style.removeProperty("--featured-panel-height");
    panelHeightFrame = requestAnimationFrame(() => {
      const height = Math.ceil(referencePanel.getBoundingClientRect().height);
      if (height) area.style.setProperty("--featured-panel-height", `${height}px`);
    });
  };
  const setFeaturedStage = (stage) => { document.documentElement.dataset.featuredStage = stage; };
  setFeaturedStage(tabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset.featuredStage || "primary");
  syncPanelHeight();
  window.addEventListener("resize", syncPanelHeight, { passive: true });
  document.fonts?.ready.then(syncPanelHeight);
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
    const videoVersion = lesson ? (lesson.point.rehearsals || []).find((version) => version.video) : null;
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

document.querySelector(".hero-featured-link")?.addEventListener("click", (event) => {
  const target = document.querySelector("#featured-lessons");
  if (!target) return;
  event.preventDefault();
  let top = 0;
  let node = target;
  while (node) {
    top += node.offsetTop;
    node = node.offsetParent;
  }
  const headerOffset = document.querySelector("[data-header]")?.offsetHeight || 60;
  window.scrollTo({
    top: Math.max(0, top - headerOffset - 16),
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
  });
});

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
  if (event.data?.type === "curriculum-lesson-state") mapExplorer?.classList.toggle("has-lesson-open", Boolean(event.data.open));
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
