const listRoot = document.querySelector("[data-writing-list]");
const pane = document.querySelector("[data-reading-pane]");
const titleNode = document.querySelector("[data-article-title]");
const authorNode = document.querySelector("[data-article-author]");
const yearNode = document.querySelector("[data-article-year]");
const dateNode = document.querySelector("[data-article-date]");
const bodyNode = document.querySelector("[data-article-body]");
const countNode = document.querySelector("[data-library-count]");
let library = [];

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

function showArticle(id, updateUrl = true) {
  const article = library.find((item) => item.id === id) || library[0];
  if (!article) return;
  titleNode.textContent = article.title;
  authorNode.textContent = article.author || "未署名";
  yearNode.textContent = article.year || "未标日期";
  dateNode.textContent = article.date && article.date !== String(article.year) ? article.date : "";
  bodyNode.innerHTML = markdownToHtml(article.markdown);
  listRoot.querySelectorAll("[data-article-id]").forEach((button) => button.classList.toggle("is-active", button.dataset.articleId === article.id));
  pane.scrollTo({ top: 0, behavior: "smooth" });
  if (updateUrl) history.replaceState(null, "", `/write?article=${encodeURIComponent(article.id)}`);
  document.title = `${article.title}｜${article.author || "未署名"}`;
}

function renderLibrary() {
  const years = [...new Set(library.map((item) => item.year))];
  listRoot.innerHTML = years.map((year) => `<section class="year-group"><span class="year-label">${escapeHtml(year)}</span><div class="year-articles">${library.filter((item) => item.year === year).map((item) => `<button class="article-choice" type="button" data-article-id="${escapeHtml(item.id)}">《${escapeHtml(item.title)}》</button>`).join("")}</div></section>`).join("");
  listRoot.querySelectorAll("[data-article-id]").forEach((button) => button.addEventListener("click", () => showArticle(button.dataset.articleId)));
}

async function loadLibrary() {
  try {
    const response = await fetch("/writing-library.json", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取作品目录");
    library = (await response.json()).items || [];
    countNode.textContent = `${library.length} 篇作品`;
    renderLibrary();
    const requested = new URLSearchParams(location.search).get("article");
    showArticle(requested || library[0]?.id, false);
  } catch (error) {
    countNode.textContent = "读取失败";
    titleNode.textContent = "作品暂时无法打开";
    bodyNode.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

loadLibrary();
