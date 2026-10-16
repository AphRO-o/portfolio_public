// The same CV Creator data is rendered for both the static build and live pages.
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

export function inlineResumeText(value = "") {
  const source = String(value);
  const links = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  let result = "";
  let cursor = 0;
  for (const match of source.matchAll(links)) {
    result += escapeHtml(source.slice(cursor, match.index));
    const href = match[2].trim();
    result += /^(?:https?:\/\/|mailto:|tel:)/i.test(href)
      ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(match[1])}</a>`
      : escapeHtml(match[0]);
    cursor = match.index + match[0].length;
  }
  return result + escapeHtml(source.slice(cursor));
}

export function validateResume(data) {
  if (!data?.personal || typeof data.personal.name !== "string" || !Array.isArray(data.sections)) {
    throw new Error("简历需包含 personal.name 和 sections");
  }
  if (data.personal.headerLines !== undefined && !Array.isArray(data.personal.headerLines)) throw new Error("headerLines 必须是数组");
  for (const section of data.sections) {
    if (!section || typeof section.title !== "string" || !Array.isArray(section.entries)) throw new Error("简历模块格式不正确");
    for (const entry of section.entries) {
      if (!entry || !Array.isArray(entry.bullets)) throw new Error("简历条目需包含 bullets 数组");
    }
  }
  return data;
}

function headerMarkup(personal, site) {
  const legacyContact = [personal.location, personal.phone, personal.email].filter(Boolean).join("｜");
  const lines = personal.headerLines || [{ text: legacyContact }, { text: personal.target || "" }];
  return lines.map((line, index) => {
    const text = typeof line === "string" ? line : (line?.url && line?.text ? `[${line.text}](${line.url})` : line?.text || "");
    if (!text) return "";
    const parts = text.split("｜").map(value => value.trim()).filter(Boolean);
    const contacts = parts.filter(value => /^\[[^\]]+\]\(mailto:/i.test(value));
    const other = parts.filter(value => !contacts.includes(value));
    const facts = other.length > 1;
    const body = facts
      ? `<div class="${site === "dev" ? "resume-facts" : "qualification-list"}">${other.map(value => `<span>${inlineResumeText(value)}</span>`).join("")}</div>`
      : other.length ? `<p${site === "dev" ? ` class="${index === 0 ? "resume-role" : "resume-lead"}"` : ""}>${inlineResumeText(other[0])}</p>` : "";
    return body + contacts.map(value => `<div class="resume-mail">${inlineResumeText(value)}</div>`).join("");
  }).join("");
}

function entryMarkup(entry, site) {
  const body = `${entry.title ? `<h3>${inlineResumeText(entry.title)}</h3>` : ""}${entry.subtitle ? `<p>${inlineResumeText(entry.subtitle)}</p>` : ""}${entry.bullets.some(Boolean) ? `<ul>${entry.bullets.filter(Boolean).map(bullet => `<li>${inlineResumeText(bullet)}</li>`).join("")}</ul>` : ""}`;
  return `<article class="${site === "dev" ? "resume-entry" : "profile-entry"}"><time>${inlineResumeText(entry.date || "")}</time>${site === "dev" ? `<div>${body}</div>` : body}</article>`;
}

export function renderResume(data, site) {
  validateResume(data);
  if (!["teach", "dev"].includes(site)) throw new Error("未知简历站点");
  const intro = `<p class="${site === "dev" ? "resume-kicker" : "eyebrow"}">FULL RESUME</p><h2 id="resume-title">${inlineResumeText(data.personal.name)}</h2>${headerMarkup(data.personal, site)}`;
  const sections = data.sections.filter(section => section.visible !== false);
  const content = sections.map((section, index) => {
    const entries = section.entries.filter(entry => entry.visible !== false);
    const label = site === "dev" ? `${String(index + 1).padStart(2, "0")} / ` : "";
    // Keep the existing skill cards when the entries fit their compact layout.
    const cards = section.id === "skills" && entries.every(entry => !entry.date && !entry.bullets.some(Boolean));
    const body = cards
      ? `<div class="${site === "dev" ? "skill-grid" : "credential-list"}">${entries.map((entry, entryIndex) => site === "dev"
        ? `<article><span>${inlineResumeText(entry.title || "")}</span><p>${inlineResumeText(entry.subtitle || "")}</p></article>`
        : `<article><span>${String(entryIndex + 1).padStart(2, "0")}</span><div><strong>${inlineResumeText(entry.title || "")}</strong><p>${inlineResumeText(entry.subtitle || "")}</p></div></article>`).join("")}</div>`
      : entries.map(entry => entryMarkup(entry, site)).join("");
    return `<section class="${site === "dev" ? "resume-group" : "profile-group"}"><p class="${site === "dev" ? "resume-label" : "profile-kicker"}">${label}${inlineResumeText(section.title)}</p>${body}</section>`;
  }).join("");
  return { intro, content };
}

export function renderResumePage(html, data, site) {
  const { intro, content } = renderResume(data, site);
  return html.replace(/(<div[^>]* data-resume-intro>)[\s\S]*?(<\/div>)/, () => `<div class="${site === "teach" ? "experience-heading reveal" : "resume-intro"}" data-resume-intro>${intro}</div>`)
    .replace(/(<div[^>]* data-resume-content>)[\s\S]*?(<\/div>)/, () => `<div class="${site === "teach" ? "profile-stack reveal" : "resume-content"}" data-resume-content>${content}</div>`);
}
