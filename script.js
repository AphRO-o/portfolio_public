const data = window.curriculumData;
const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".site-nav");
const dialog = document.querySelector("[data-lesson-dialog]");
const dialogContent = document.querySelector("[data-dialog-content]");
const mapExplorer = document.querySelector("[data-map-explorer]");
const mapFrame = document.querySelector("[data-map-frame]");
const statusLabels = { pending: "尚未备课", planning: "已进入规划", drafted: "已有教案", recorded: "已完成试讲" };
let currentLesson = null;

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
  const label = lesson.point.title;
  const thought = lesson.point.thought || lesson.unit.thought || "第一次读教材和试讲后补充这里的追问。";
  if (lesson.point.versions?.length) return lesson.point.versions;
  return [
    { id: "v0", label: "v0 · 备课起点", state: "available", video: null, question: thought, objective: `厘清“${label}”在前后知识链中的位置，以及学生已有的生活经验和前置知识。`, design: "对照教材、课标和不同版本材料，拆出概念形成、例题、练习与表达四条线。", board: "待设计：只保留能显示数学关系和思考过程的板书。" },
    { id: "v1", label: "v1 · 第一版教案", state: lesson.point.status === "drafted" || lesson.point.status === "recorded" ? "available" : "empty" },
    { id: "trial1", label: "试讲 v1", state: lesson.point.status === "recorded" ? "available" : "empty" },
    { id: "review1", label: "复盘与改写", state: "empty" }
  ];
}

function animateVersionPanel(panel) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  panel.classList.remove("is-switching");
  panel.getBoundingClientRect();
  panel.classList.add("is-switching");
  window.setTimeout(() => panel.classList.remove("is-switching"), 340);
}

function renderVersionPanel(version) {
  const panel = dialogContent.querySelector("[data-version-panel]");
  if (!panel) return;
  const shouldAnimate = panel.dataset.ready === "true";
  panel.dataset.ready = "true";
  panel.classList.remove("is-loading");
  if (version.state === "empty") {
    panel.innerHTML = `<div class="empty-version"><span aria-hidden="true">＋</span><h3>${escapeHtml(version.label)}</h3><p>这个版本尚未创建。完成后会加入视频、教案、板书和复盘。</p></div>`;
    if (shouldAnimate) animateVersionPanel(panel);
    return;
  }
  const videoContent = version.video
    ? `<video class="lesson-video" controls preload="metadata" src="${escapeHtml(version.video)}">你的浏览器暂不支持视频播放。</video>`
    : `<div class="video-placeholder"><span aria-hidden="true">▶</span><strong>试讲视频待上传</strong><small>教学设计与逐版复盘已经公开</small></div>`;
  const lessonFile = version.lessonFile ? `<a class="resource-link" href="${escapeHtml(version.lessonFile)}" target="_blank" rel="noopener">打开完整 Markdown 教案 ↗</a>` : "";
  const boardImage = version.boardImage ? `<figure class="board-preview"><a href="${escapeHtml(version.boardImage)}" target="_blank" rel="noopener"><img src="${escapeHtml(version.boardImage)}" alt="${escapeHtml(`${version.label}板书`)}" /></a><figcaption>板书设计 · 点击查看原图</figcaption></figure>` : "";
  const publishedLesson = version.designMarkdown || version.reflectionMarkdown;
  const lessonContent = publishedLesson
    ? `<p class="plan-kicker">LESSON ARCHIVE</p><div class="lesson-version-meta">${[version.date, version.duration, version.format].filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>${version.designMarkdown ? `<section class="lesson-document"><h3>教学设计</h3><div class="lesson-markdown">${markdownToSafeHtml(version.designMarkdown)}</div></section>` : ""}${version.reflectionMarkdown ? `<section class="lesson-document reflection"><h3>本版复盘</h3><div class="lesson-markdown">${markdownToSafeHtml(version.reflectionMarkdown)}</div></section>` : ""}`
    : `<p class="plan-kicker">LESSON DESIGN</p><div class="plan-row"><span>核心问题</span><p>${escapeHtml(version.question || "待补充")}</p></div><div class="plan-row"><span>学习目标</span><p>${escapeHtml(version.objective || "待补充")}</p></div><div class="plan-row"><span>设计路径</span><p>${escapeHtml(version.design || "待补充")}</p></div><div class="plan-row"><span>板书思路</span><p>${escapeHtml(version.board || "待补充")}</p></div>${version.reflection ? `<div class="plan-row"><span>课后复盘</span><p>${escapeHtml(version.reflection)}</p></div>` : ""}`;
  panel.innerHTML = `<div class="version-layout"><section class="video-slot">${videoContent}</section><section class="lesson-plan">${lessonContent}${lessonFile}${boardImage}</section></div>`;
  if (shouldAnimate) animateVersionPanel(panel);
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
  const thought = lesson.point.thought || lesson.unit.thought || "第一次读教材和试讲后补充这里的追问。";
  const versions = lessonVersions(lesson);
  dialogContent.innerHTML = `<article class="lesson-dialog-inner" style="--dialog-stage:${stage.color}"><header class="lesson-dialog-header"><div class="lesson-breadcrumb">${stage.label}数学 / ${escapeHtml(lesson.grade.label)} / ${escapeHtml(termDisplayLabel(lesson.grade, lesson.semester))} / ${category.label}</div><h2>${escapeHtml(lesson.point.title)}</h2><div class="lesson-submeta"><span>${escapeHtml(lesson.unit.title)}</span><span class="lesson-state ${lesson.point.status}">${statusLabels[lesson.point.status]}</span></div></header><aside class="thought-note"><span>我的吐槽 / 追问</span><p>${escapeHtml(thought)}</p></aside><div class="version-tabs" role="tablist" aria-label="课例版本">${versions.map((version, index) => `<button type="button" role="tab" data-version-id="${escapeHtml(version.id)}" aria-selected="${index === 0}">${escapeHtml(version.label)}${version.state === "empty" ? " · 待创建" : ""}</button>`).join("")}</div><div class="version-panel is-loading" data-version-panel role="tabpanel"><div class="panel-loading">正在展开课例…</div></div></article>`;
  dialogContent.querySelectorAll("[data-version-id]").forEach((button) => button.addEventListener("click", () => selectVersion(button.dataset.versionId)));
  dialog.classList.remove("is-closing");
  dialog.showModal();
  window.setTimeout(() => {
    if (dialog.open && currentLesson === lesson) renderVersionPanel(versions[0]);
  }, 180);
}

function closeLessonDialog() {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return dialog.close();
  dialog.classList.add("is-closing");
  window.setTimeout(() => { dialog.close(); dialog.classList.remove("is-closing"); }, 180);
}

function openMapExplorer(unitId) {
  if (!mapExplorer || !mapFrame || !unitId) return;
  mapFrame.src = `/curriculum?embed=1&unit=${encodeURIComponent(unitId)}`;
  mapExplorer.showModal();
}

function closeMapExplorer() {
  if (!mapExplorer?.open) return;
  mapExplorer.close();
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
    openMapExplorer(unit.dataset.mapUnit);
  }));

  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const nodes = [...map.querySelectorAll(".mini-unit")];
  let nodeCenters = [];
  const measureNodes = () => {
    const mapRect = map.getBoundingClientRect();
    nodeCenters = nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { node, x: rect.left - mapRect.left + rect.width / 2, y: rect.top - mapRect.top + rect.height / 2, width: rect.width, height: rect.height };
    });
  };
  map.addEventListener("pointerenter", measureNodes, { passive: true });
  map.addEventListener("pointermove", (event) => {
    const mapRect = map.getBoundingClientRect();
    const pointerX = event.clientX - mapRect.left;
    const pointerY = event.clientY - mapRect.top;
    if (!nodeCenters.length) measureNodes();
    const ranked = nodeCenters.map((item) => ({ ...item, distance: Math.hypot(pointerX - item.x, pointerY - item.y) })).sort((a, b) => a.distance - b.distance);
    const centerNode = ranked[0]?.node;
    nodeCenters.forEach(({ node, x, y, width, height }) => {
      const dx = x - pointerX;
      const dy = y - pointerY;
      const distance = Math.hypot(dx, dy);
      const proximity = Math.max(0, 1 - distance / 210);
      const isCenter = node === centerNode;
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
    });
  }, { passive: true });
  map.addEventListener("pointerleave", () => {
    nodes.forEach((node) => {
      node.style.removeProperty("--unit-scale");
      node.style.removeProperty("--unit-shift-x");
      node.style.removeProperty("--unit-shift-y");
      node.style.zIndex = "";
      node.classList.remove("is-fisheye-center");
    });
    nodeCenters = [];
  });
}

function setupFeaturedLessons() {
  const tabs = [...document.querySelectorAll("[data-featured-stage]")];
  const panels = [...document.querySelectorAll("[data-featured-panel]")];
  tabs.forEach((tab) => tab.addEventListener("click", () => {
    const stage = tab.dataset.featuredStage;
    tabs.forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    panels.forEach((panel) => {
      const inactive = panel.dataset.featuredPanel !== stage;
      panel.classList.toggle("is-inactive", inactive);
      panel.toggleAttribute("inert", inactive);
      panel.setAttribute("aria-hidden", String(inactive));
    });
  }));
}

document.querySelector("[data-year]").textContent = new Date().getFullYear();
window.addEventListener("scroll", () => header.classList.toggle("is-scrolled", window.scrollY > 24), { passive: true });
menuButton.addEventListener("click", () => { const nextState = menuButton.getAttribute("aria-expanded") !== "true"; menuButton.setAttribute("aria-expanded", String(nextState)); nav.classList.toggle("is-open", nextState); });
nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => { nav.classList.remove("is-open"); menuButton.setAttribute("aria-expanded", "false"); }));
document.querySelectorAll("[data-open-topic]").forEach((button) => button.addEventListener("click", () => openLesson(topicLookup.get(button.dataset.openTopic))));
document.querySelector("[data-close-dialog]").addEventListener("click", closeLessonDialog);
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeLessonDialog(); });
dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeLessonDialog(); });
document.querySelector("[data-close-map]")?.addEventListener("click", closeMapExplorer);
mapExplorer?.addEventListener("cancel", (event) => { event.preventDefault(); closeMapExplorer(); });
renderMiniMap();
setupFeaturedLessons();

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), { threshold: 0.1 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
