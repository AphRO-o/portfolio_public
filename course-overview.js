(() => {
  const text = (value) => Array.isArray(value) ? value.map((item) => `- ${item}`).join("\n") : String(value ?? "");
  const ids = (value) => Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string" && id))] : [];
  const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function read(point) {
    const overview = point.overview || {};
    return {
      ...overview,
      objectives: text(overview.objectives ?? overview.objective),
      focus: text(overview.focus ?? overview.keyPoints),
      difficulties: text(overview.difficulties ?? overview.difficulty),
      prerequisites: text(overview.prerequisites ?? overview.prerequisite),
      nextTopics: text(overview.nextTopics ?? overview.next),
      reflections: text(overview.reflections ?? point.thought),
      prerequisiteIds: ids(overview.prerequisiteIds),
      nextTopicIds: ids(overview.nextTopicIds)
    };
  }

  function hasContent(point) {
    if (point.overviewMarkdown !== undefined) return Boolean(point.overviewMarkdown.trim());
    const overview = read(point);
    return ["objectives", "focus", "difficulties", "prerequisites", "nextTopics", "reflections"].some((field) => overview[field].trim())
      || overview.prerequisiteIds.length > 0 || overview.nextTopicIds.length > 0;
  }

  function render(point, lookup, markdownToHtml) {
    const overview = read(point);
    if (point.overviewMarkdown !== undefined) {
      const links = [["前置知识点", "prerequisiteIds"], ["后置知识点", "nextTopicIds"]].map(([label, field]) => {
        const items = overview[field].filter(id => id !== point.id).map(id => {
          const topic = lookup.get(id);
          return topic ? `<a class="overview-topic-link" href="/curriculum?topic=${encodeURIComponent(id)}" data-overview-topic="${escape(id)}"><strong>${escape(topic.point.title)} ↗</strong><small>${escape(topic.grade.label)} · ${escape(topic.unit.title)}</small></a>` : '<span class="overview-topic-missing">关联知识点已移除</span>';
        }).join('');
        return items ? `<article><h3>${label}</h3><div class="overview-topic-links">${items}</div></article>` : '';
      }).join('');
      let header = true;
      const body = point.overviewMarkdown.split(/\r?\n/).filter(line => {
        const text = line.trim();
        if (!header || !text) return true;
        if (/^#\s+(?:课程概览|课例概览)$/.test(text)) return false;
        if (/^\*\*(?:课题|学段(?:\s*\/\s*年级)?|教材位置|课型|建议课时)[：:]\*\*/.test(text)) return false;
        header = false;
        return true;
      }).join('\n').trim();
      return `<section class="course-overview"><article class="overview-markdown"><div class="lesson-markdown">${body ? markdownToHtml(body) : '<i>课程概览待补充</i>'}</div></article>${links}</section>`;
    }
    const fields = [
      ["教学目标", "objectives"], ["教学重点", "focus"], ["教学难点", "difficulties"],
      ["前置知识点", "prerequisites", "prerequisiteIds"], ["后置知识点", "nextTopics", "nextTopicIds"], ["我的感想", "reflections"]
    ];
    return `<section class="course-overview" aria-label="课程概览">${fields.map(([label, field, relation]) => {
      const content = overview[field].trim();
      const links = (overview[relation] || []).filter((id) => id !== point.id).map((id) => {
        const topic = lookup.get(id);
        if (!topic) return `<span class="overview-topic-missing">关联知识点已移除</span>`;
        return `<a class="overview-topic-link" href="/curriculum?topic=${encodeURIComponent(id)}" data-overview-topic="${escape(id)}"><strong>${escape(topic.point.title)} ↗</strong><small>${escape(topic.grade.label)} · ${escape(topic.semester.label)} · ${escape(topic.unit.title)}</small></a>`;
      }).join("");
      return `<article><h3>${label}</h3>${content ? `<div class="lesson-markdown">${markdownToHtml(content)}</div>` : ""}${links ? `<div class="overview-topic-links">${links}</div>` : ""}${!content && !links ? "<i>待补充</i>" : ""}</article>`;
    }).join("")}</section>`;
  }

  window.courseOverview = Object.freeze({ text, read, hasContent, render });
})();
