const listRoot = document.querySelector("[data-writing-list]");
const pane = document.querySelector("[data-reading-pane]");
const titleNode = document.querySelector("[data-article-title]");
const authorNode = document.querySelector("[data-article-author]");
const dateNode = document.querySelector("[data-article-date]");
const bodyNode = document.querySelector("[data-article-body]");
const countNode = document.querySelector("[data-library-count]");
const authorFilterRoot = document.querySelector("[data-author-filter]");
const yearNodeCurrent = document.querySelector("[data-year]");
const articleShell = pane.querySelector(".reading-inner");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let library = [];
let activeAuthor = "all";
let currentArticleId = null;
let articleTransition = 0;
let lockedGlassCleanup = null;

const authorPalette = ["#315f4d", "#9b6846", "#66708f", "#86617d", "#52777b", "#8b7450"];

if (yearNodeCurrent) yearNodeCurrent.textContent = new Date().getFullYear();

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function markdownToHtml(markdown) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const html = [];
  let listType = null;
  const closeList = () => { if (listType) html.push(`</${listType}>`); listType = null; };
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (index === 0 && /^#\s+/.test(trimmed)) return;
    if (!trimmed) { closeList(); return; }
    if (/^---+$/.test(trimmed)) { closeList(); html.push("<hr />"); return; }
    const heading = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (heading) { closeList(); const level = Math.min(heading[1].length, 3); html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`); return; }
    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) { closeList(); html.push(`<blockquote><p>${renderInline(quote[1])}</p></blockquote>`); return; }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const nextType = unordered ? "ul" : "ol";
      if (listType !== nextType) { closeList(); listType = nextType; html.push(`<${listType}>`); }
      html.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
      return;
    }
    closeList();
    html.push(`<p>${renderInline(trimmed)}</p>`);
  });
  closeList();
  return html.join("");
}

function lockedArticleToHtml(article) {
  const widths = [94, 82, 89, 68, 91, 76, 86, 57];
  return (article.segments || []).map((segment, segmentIndex) => {
    if (segment.type === "public") {
      return `<section class="locked-public">${markdownToHtml(segment.markdown || "")}</section>`;
    }
    const blocks = Math.max(1, Math.min(7, Number(segment.blocks) || 1));
    const lines = Array.from({ length: blocks * 3 + 1 }, (_, lineIndex) => {
      const width = widths[(segmentIndex * 3 + lineIndex) % widths.length];
      return `<i style="--locked-line:${width}%"></i>`;
    }).join("");
    return `<section class="locked-copy" aria-label="此段正文暂未公开"><div class="locked-copy-glass" aria-hidden="true">${lines}</div><span class="locked-copy-note">正文暂未公开</span></section>`;
  }).join("");
}

function setupLockedGlassInteraction() {
  lockedGlassCleanup?.();
  lockedGlassCleanup = null;
  if (reducedMotion.matches) return;
  const glasses = [...bodyNode.querySelectorAll(".locked-copy")];
  if (!glasses.length) return;
  let frame = 0;
  let pointerX = 50;
  let pointerY = 50;
  const properties = ["--glass-light-x", "--glass-light-y", "--glass-content-x", "--glass-content-y", "--glass-shadow-x", "--glass-shadow-y"];
  const paint = () => {
    frame = 0;
    glasses.forEach((glass) => {
      const oppositeX = 100 - pointerX;
      const oppositeY = 100 - pointerY;
      glass.style.setProperty("--glass-light-x", `${oppositeX.toFixed(1)}%`);
      glass.style.setProperty("--glass-light-y", `${oppositeY.toFixed(1)}%`);
      glass.style.setProperty("--glass-content-x", `${((pointerX - 50) * .035).toFixed(2)}px`);
      glass.style.setProperty("--glass-content-y", `${((pointerY - 50) * .025).toFixed(2)}px`);
      glass.style.setProperty("--glass-shadow-x", `${((50 - pointerX) * .07).toFixed(2)}px`);
      glass.style.setProperty("--glass-shadow-y", `${(10 + (50 - pointerY) * .045).toFixed(2)}px`);
    });
  };
  const trackPointer = (event) => {
    pointerX = Math.max(0, Math.min(100, (event.clientX / window.innerWidth) * 100));
    pointerY = Math.max(0, Math.min(100, (event.clientY / window.innerHeight) * 100));
    if (!frame) frame = requestAnimationFrame(paint);
  };
  const reset = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    glasses.forEach((glass) => properties.forEach((property) => glass.style.removeProperty(property)));
  };
  document.addEventListener("pointermove", trackPointer, { passive: true });
  document.addEventListener("pointerleave", reset, { passive: true });
  window.addEventListener("blur", reset, { passive: true });
  lockedGlassCleanup = () => {
    document.removeEventListener("pointermove", trackPointer);
    document.removeEventListener("pointerleave", reset);
    window.removeEventListener("blur", reset);
    reset();
  };
}

function authorAccent(author) {
  const text = String(author || "未署名");
  let hash = 0;
  for (const character of text) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return authorPalette[hash % authorPalette.length];
}

function visibleLibrary() {
  return libraryForAuthor(activeAuthor);
}

function libraryForAuthor(author) {
  return author === "all" ? library : library.filter((item) => item.author === author);
}

function updateLibraryCount() {
  const visibleCount = visibleLibrary().length;
  countNode.textContent = activeAuthor === "all" ? `${library.length} 篇作品` : `${visibleCount} / ${library.length} 篇作品`;
  countNode.classList.remove("is-updating");
  void countNode.offsetWidth;
  countNode.classList.add("is-updating");
}

function syncArticleChoiceIndicator(animate = true, fromRect = null) {
  const indicator = listRoot.querySelector(".article-choice-indicator");
  const activeChoice = listRoot.querySelector(".article-choice.is-active");
  if (!indicator || !activeChoice) return;
  const listRect = listRoot.getBoundingClientRect();
  const choiceRect = activeChoice.getBoundingClientRect();
  const x = choiceRect.left - listRect.left + listRoot.scrollLeft;
  const y = choiceRect.top - listRect.top + listRoot.scrollTop;
  const shouldAnimate = animate && !reducedMotion.matches;
  listRoot.classList.remove("is-choice-animated");
  if (shouldAnimate && fromRect?.width && fromRect?.height) {
    listRoot.style.setProperty("--choice-x", `${fromRect.left - listRect.left + listRoot.scrollLeft}px`);
    listRoot.style.setProperty("--choice-y", `${fromRect.top - listRect.top + listRoot.scrollTop}px`);
    listRoot.style.setProperty("--choice-width", `${fromRect.width}px`);
    listRoot.style.setProperty("--choice-height", `${fromRect.height}px`);
    void indicator.offsetWidth;
  }
  listRoot.classList.toggle("is-choice-animated", shouldAnimate);
  listRoot.style.setProperty("--choice-x", `${x}px`);
  listRoot.style.setProperty("--choice-y", `${y}px`);
  listRoot.style.setProperty("--choice-width", `${choiceRect.width}px`);
  listRoot.style.setProperty("--choice-height", `${choiceRect.height}px`);
  listRoot.style.setProperty("--choice-color", activeChoice.style.getPropertyValue("--author-accent"));
}

function commitArticle(article, updateUrl, markerDirection, updateIndicator = true) {
  const hadCurrentArticle = Boolean(currentArticleId);
  currentArticleId = article.id;
  document.documentElement.style.setProperty("--current-author-accent", authorAccent(article.author));
  titleNode.textContent = article.title;
  authorNode.textContent = article.author || "未署名";
  dateNode.textContent = article.date && article.date !== String(article.year) ? article.date : "";
  bodyNode.classList.toggle("is-locked", Boolean(article.locked));
  lockedGlassCleanup?.();
  lockedGlassCleanup = null;
  bodyNode.innerHTML = article.locked ? lockedArticleToHtml(article) : markdownToHtml(article.markdown || "");
  if (article.locked) setupLockedGlassInteraction();
  listRoot.querySelectorAll("[data-article-id]").forEach((button) => button.classList.toggle("is-active", button.dataset.articleId === article.id));
  const activeChoice = listRoot.querySelector(`[data-article-id="${CSS.escape(article.id)}"]`);
  if (updateIndicator) syncArticleChoiceIndicator(hadCurrentArticle);
  if (markerDirection && activeChoice) {
    const markerClass = `is-marker-entering-${markerDirection}`;
    activeChoice.classList.add(markerClass);
    window.setTimeout(() => activeChoice.classList.remove(markerClass), 280);
  }
  pane.scrollTo({ top: 0, behavior: "auto" });
  if (updateUrl) history.replaceState(null, "", `/write?article=${encodeURIComponent(article.id)}`);
  document.title = `${article.title}｜${article.author || "未署名"}`;
}

function showArticle(id, updateUrl = true, animate = true) {
  const article = library.find((item) => item.id === id) || library[0];
  if (!article) return;
  if (article.id === currentArticleId) {
    pane.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
    return;
  }
  const shouldAnimate = animate && currentArticleId && !reducedMotion.matches;
  const previousChoice = listRoot.querySelector(`[data-article-id="${CSS.escape(currentArticleId || "")}"]`);
  const nextChoice = listRoot.querySelector(`[data-article-id="${CSS.escape(article.id)}"]`);
  if (!shouldAnimate) {
    commitArticle(article, updateUrl, false);
    return;
  }
  const sequence = ++articleTransition;
  const markerDirection = previousChoice && nextChoice && nextChoice.getBoundingClientRect().top < previousChoice.getBoundingClientRect().top ? "up" : "down";
  const leavingClass = `is-marker-leaving-${markerDirection}`;
  previousChoice?.classList.add(leavingClass);
  articleShell.classList.remove("is-entering");
  articleShell.classList.add("is-leaving");
  window.setTimeout(() => {
    if (sequence !== articleTransition) return;
    previousChoice?.classList.remove(leavingClass);
    commitArticle(article, updateUrl, markerDirection);
    articleShell.classList.remove("is-leaving");
    articleShell.classList.add("is-entering");
    window.setTimeout(() => articleShell.classList.remove("is-entering"), 240);
  }, 105);
}

function renderLibrary(updateIndicator = true) {
  const visibleItems = visibleLibrary();
  const years = [...new Set(visibleItems.map((item) => item.year))];
  listRoot.innerHTML = `${years.map((year) => `<section class="year-group" data-library-year="${escapeHtml(year)}"><span class="year-label">${escapeHtml(year)}</span><div class="year-articles">${visibleItems.filter((item) => item.year === year).map((item) => `<button class="article-choice" type="button" data-article-id="${escapeHtml(item.id)}" style="--author-accent:${authorAccent(item.author)}"><span>《${escapeHtml(item.title)}》</span></button>`).join("")}</div></section>`).join("")}<i class="article-choice-indicator" aria-hidden="true"></i>`;
  listRoot.querySelectorAll("[data-article-id]").forEach((button) => button.addEventListener("click", () => showArticle(button.dataset.articleId)));
  listRoot.querySelector(`[data-article-id="${CSS.escape(currentArticleId || "")}"]`)?.classList.add("is-active");
  if (updateIndicator) requestAnimationFrame(() => syncArticleChoiceIndicator(false));
}

function captureLibraryPositions() {
  const choices = new Map([...listRoot.querySelectorAll("[data-article-id]")].map((node) => [node.dataset.articleId, node.getBoundingClientRect()]));
  const years = new Map([...listRoot.querySelectorAll("[data-library-year]")].map((group) => [group.dataset.libraryYear, group.querySelector(".year-label")?.getBoundingClientRect()]));
  return { choices, years };
}

function animateLibraryCompression(previous) {
  if (reducedMotion.matches) return;
  const moving = [];
  listRoot.querySelectorAll("[data-article-id]").forEach((node) => {
    const before = previous.choices.get(node.dataset.articleId);
    if (!before) {
      node.classList.add("is-filter-entering");
      moving.push(node);
      return;
    }
    const after = node.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    node.style.setProperty("--library-shift-x", `${dx}px`);
    node.style.setProperty("--library-shift-y", `${dy}px`);
    node.classList.add("is-filter-arranging");
    moving.push(node);
  });
  listRoot.querySelectorAll("[data-library-year]").forEach((group) => {
    const label = group.querySelector(".year-label");
    const before = previous.years.get(group.dataset.libraryYear);
    if (!label || !before) return;
    const after = label.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    label.style.setProperty("--library-shift-x", `${dx}px`);
    label.style.setProperty("--library-shift-y", `${dy}px`);
    label.classList.add("is-filter-arranging");
    moving.push(label);
  });
  window.setTimeout(() => moving.forEach((node) => {
    node.classList.remove("is-filter-arranging", "is-filter-entering");
    node.style.removeProperty("--library-shift-x");
    node.style.removeProperty("--library-shift-y");
  }), 380);
}

function filterLibrary(nextAuthor) {
  if (nextAuthor === activeAuthor || listRoot.classList.contains("is-filter-transitioning")) return;
  const nextItems = libraryForAuthor(nextAuthor);
  const nextIds = new Set(nextItems.map((item) => item.id));
  const currentIds = [...listRoot.querySelectorAll("[data-article-id]")].map((node) => node.dataset.articleId);
  const listIsUnchanged = currentIds.length === nextItems.length && currentIds.every((id, index) => id === nextItems[index].id);
  if (listIsUnchanged) {
    activeAuthor = nextAuthor;
    updateAuthorFilter();
    updateLibraryCount();
    return;
  }
  const previousPositions = captureLibraryPositions();
  const previousIndicatorRect = listRoot.querySelector(".article-choice-indicator")?.getBoundingClientRect();
  const selectionChanges = !nextIds.has(currentArticleId);
  const nextArticle = selectionChanges ? nextItems[0] : null;
  const exiting = [...listRoot.querySelectorAll("[data-article-id]")].filter((node) => !nextIds.has(node.dataset.articleId));

  listRoot.classList.add("is-filter-transitioning");
  exiting.forEach((node) => node.classList.add("is-filter-exiting"));
  if (selectionChanges) {
    articleShell.classList.remove("is-entering");
    articleShell.classList.add("is-leaving");
  }
  activeAuthor = nextAuthor;
  updateAuthorFilter();

  const finish = () => {
    if (nextArticle) currentArticleId = nextArticle.id;
    renderLibrary(false);
    if (nextArticle) {
      commitArticle(nextArticle, true, false, false);
      articleShell.classList.remove("is-leaving");
      articleShell.classList.add("is-entering");
      window.setTimeout(() => articleShell.classList.remove("is-entering"), 240);
    }
    updateLibraryCount();
    syncArticleChoiceIndicator(true, previousIndicatorRect);
    animateLibraryCompression(previousPositions);
    listRoot.classList.remove("is-filter-transitioning");
  };

  if (reducedMotion.matches || !exiting.length) finish();
  else window.setTimeout(finish, 170);
}

function renderAuthorFilter() {
  const authors = [...new Set(library.map((item) => item.author || "未署名"))];
  const options = [{ id: "all", label: "全部", accent: "#315f4d" }, ...authors.map((author) => ({ id: author, label: author, accent: authorAccent(author) }))];
  authorFilterRoot.innerHTML = `${options.map((option) => `<button type="button" data-author-filter-value="${escapeHtml(option.id)}" aria-pressed="${String(activeAuthor === option.id)}" style="--author-accent:${option.accent}">${escapeHtml(option.label)}</button>`).join("")}<i class="author-filter-indicator" aria-hidden="true"></i>`;
  authorFilterRoot.querySelectorAll("[data-author-filter-value]").forEach((button) => button.addEventListener("click", () => {
    filterLibrary(button.dataset.authorFilterValue);
  }));
  requestAnimationFrame(() => updateAuthorFilter(false));
}

function updateAuthorFilter(animate = true) {
  const buttons = [...authorFilterRoot.querySelectorAll("[data-author-filter-value]")];
  buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.authorFilterValue === activeAuthor)));
  const selected = buttons.find((button) => button.dataset.authorFilterValue === activeAuthor);
  if (!selected) return;
  const labelRange = document.createRange();
  labelRange.selectNodeContents(selected);
  const labelWidth = Math.ceil(labelRange.getBoundingClientRect().width);
  const indicatorWidth = Math.min(selected.offsetWidth, labelWidth + 6);
  const indicatorX = selected.offsetLeft + (selected.offsetWidth - indicatorWidth) / 2;
  authorFilterRoot.classList.toggle("is-animated", animate && !reducedMotion.matches);
  authorFilterRoot.style.setProperty("--filter-x", `${indicatorX}px`);
  authorFilterRoot.style.setProperty("--filter-width", `${indicatorWidth}px`);
  authorFilterRoot.style.setProperty("--filter-color", selected.style.getPropertyValue("--author-accent"));
  if (authorFilterRoot.scrollWidth > authorFilterRoot.clientWidth + 1) {
    selected.scrollIntoView({ block: "nearest", inline: "nearest", behavior: animate && !reducedMotion.matches ? "smooth" : "auto" });
  }
}

async function loadLibrary() {
  try {
    const embedded = document.querySelector("#writing-data");
    let data;
    if (embedded) data = JSON.parse(embedded.textContent);
    else {
      const response = await fetch("/writing-library.json", { cache: "no-store" });
      if (!response.ok) throw new Error("无法读取作品目录");
      data = await response.json();
    }
    library = data.items || [];
    if (!library.length) throw new Error("暂时没有公开作品");
    renderAuthorFilter();
    updateLibraryCount();
    renderLibrary();
    const requested = new URLSearchParams(location.search).get("article");
    showArticle(requested || library[0]?.id, false, false);
  } catch (error) {
    countNode.textContent = "读取失败";
    titleNode.textContent = "作品暂时无法打开";
    bodyNode.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  } finally {
    document.body.classList.remove("reading-room-loading");
    document.body.classList.add("reading-room-ready");
  }
}

window.addEventListener("resize", () => {
  updateAuthorFilter(false);
  syncArticleChoiceIndicator(false);
}, { passive: true });
loadLibrary();
