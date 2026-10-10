(() => {
  const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  function markdown(markdown) {
    const inline = value => escape(value).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    const lines = String(markdown || '').replaceAll('\r\n', '\n').split('\n');
    const html = [];
    let list = '';
    const closeList = () => { if (list) html.push(`</${list}>`); list = ''; };
    const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { closeList(); continue; }
      if (line.startsWith('```')) {
        closeList(); const code = [];
        while (++i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i]);
        html.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`); continue;
      }
      if (line.includes('|') && lines[i + 1] && cells(lines[i + 1]).every(cell => /^:?-{3,}:?$/.test(cell))) {
        closeList(); const header = cells(line); i++;
        const rows = [];
        while (lines[i + 1]?.trim().includes('|')) rows.push(cells(lines[++i]));
        html.push(`<div class="lesson-table-scroll"><table><thead><tr>${header.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${header.map((_, index) => `<td>${inline(row[index] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) { closeList(); const level = Math.min(4, heading[1].length + 1); html.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
      const item = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+[.)、](?:\s+|(?=[\p{Script=Han}]))(.+)$/u);
      if (item) {
        const tag = /^[-*]/.test(line) ? 'ul' : 'ol';
        if (list !== tag) { closeList(); list = tag; html.push(`<${tag}>`); }
        const checkbox = item[1].match(/^\[([ xX])\]\s*(.*)$/);
        html.push(`<li>${checkbox ? `<input type="checkbox" disabled ${checkbox[1] !== ' ' ? 'checked' : ''}> ${inline(checkbox[2])}` : inline(item[1])}</li>`); continue;
      }
      closeList();
      if (/^---+$/.test(line)) html.push('<hr>');
      else if (line.startsWith('>')) html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
      else html.push(`<p>${inline(line)}</p>`);
    }
    closeList(); return html.join('');
  }
  function model(point) {
    const sort = versions => [...(versions || [])].sort((a, b) => b.versionNumber - a.versionNumber);
    const designs = sort(point.designs);
    const rehearsals = sort(point.rehearsals);
    return { hasContent: Boolean(point.overviewMarkdown || designs.length || rehearsals.length), tabs: [
      { id: 'overview', kind: 'overview', label: '课程概览' },
      { id: 'design', kind: 'design', label: '教学设计', versions: designs, selectedId: designs[0]?.id },
      { id: 'rehearsal', kind: 'trial', label: '试讲复盘', versions: rehearsals, selectedId: rehearsals[0]?.id }
    ] };
  }
  function bilibiliPlayer(value) {
    let url;
    try { url = new URL(value); } catch { return ''; }
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    if (!['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'player.bilibili.com'].includes(url.hostname)) return '';
    const id = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10}|av\d+)(?:\/|$)/)?.[1];
    const bvid = id?.startsWith('BV') ? id : url.searchParams.get('bvid');
    const aid = id?.startsWith('av') ? id.slice(2) : url.searchParams.get('aid');
    const params = new URLSearchParams();
    if (/^BV[0-9A-Za-z]{10}$/.test(bvid || '')) params.set('bvid', bvid);
    else if (/^[1-9]\d*$/.test(aid || '')) params.set('aid', aid);
    else return '';
    const part = url.searchParams.get('p');
    if (/^[1-9]\d*$/.test(part || '')) params.set('p', part);
    params.set('autoplay', '0');
    params.set('danmaku', '0');
    params.set('poster', '1');
    return `https://player.bilibili.com/player.html?${params}`;
  }
  function media(version) {
    const player = bilibiliPlayer(version.video);
    const video = version.video
      ? `<section class="video-slot${player ? ' bili-video' : ''}" ${player ? 'data-bili-video' : ''}>${player
        ? `<iframe class="lesson-video" data-bili-frame data-player-src="${escape(player)}" title="试讲视频 · 使用底部控制条播放和暂停" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; fullscreen 'none'; picture-in-picture" hidden></iframe><button type="button" class="bili-start video-placeholder" data-bili-start aria-label="播放试讲视频"><span aria-hidden="true">▶</span><strong>播放试讲视频</strong><small>在本页观看</small></button><div class="bili-click-shield" data-bili-shield aria-hidden="true" hidden><span>播放 / 暂停请使用下方控制条</span></div><button type="button" class="bili-fullscreen" data-bili-fullscreen aria-label="全屏观看视频" title="全屏观看视频" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg></button>`
        : `<video class="lesson-video" controls preload="metadata" src="${escape(version.video)}">你的浏览器暂不支持视频播放。</video>`}</section>`
      : `<section class="video-slot"><div class="video-placeholder"><span aria-hidden="true">▶</span><strong>试讲视频待上传</strong><small>记录课堂表达，回看每一次改进</small></div></section>`;
    const board = version.boardImage
      ? `<figure class="board-preview"><a href="${escape(version.boardImage)}" target="_blank" rel="noopener" aria-label="查看 V${version.versionNumber || Number(version.id.slice(1))} 板书原图"><img src="${escape(version.boardImage)}" alt="V${version.versionNumber || Number(version.id.slice(1))} 板书" loading="lazy"></a><figcaption>本版板书 · 点击查看原图 ↗</figcaption></figure>`
      : `<section class="board-preview"><div class="board-placeholder"><span aria-hidden="true">▤</span><strong>板书待上传</strong></div></section>`;
    return {
      video: `<div class="lesson-media" aria-label="本版视频">${video}</div>`,
      board: `<section class="lesson-board-section" aria-label="本版板书"><h3>本版板书</h3>${board}</section>`
    };
  }
  function bindMedia(panel) {
    panel.querySelectorAll('[data-bili-video]').forEach(slot => {
      const frame = slot.querySelector('[data-bili-frame]');
      const start = slot.querySelector('[data-bili-start]');
      const shield = slot.querySelector('[data-bili-shield]');
      const fullscreen = slot.querySelector('[data-bili-fullscreen]');
      start.addEventListener('click', () => {
        if (slot.dataset.started === 'true') return;
        const url = new URL(frame.dataset.playerSrc);
        url.searchParams.set('autoplay', '1');
        frame.src = url.href;
        slot.dataset.started = 'true';
        frame.hidden = false;
        start.hidden = true;
        shield.hidden = false;
        fullscreen.hidden = false;
        frame.focus({ preventScroll: true });
      });
      // Fullscreen the wrapper so the click shield remains over the third-party frame.
      fullscreen.addEventListener('click', async () => {
        try {
          if (slot.ownerDocument.fullscreenElement === slot) await slot.ownerDocument.exitFullscreen();
          else await slot.requestFullscreen();
        } catch {
          fullscreen.title = '此浏览器暂不支持全屏';
          fullscreen.setAttribute('aria-label', fullscreen.title);
        }
      });
      slot.addEventListener('fullscreenchange', () => {
        const label = slot.ownerDocument.fullscreenElement === slot ? '退出全屏' : '全屏观看视频';
        fullscreen.title = label;
        fullscreen.setAttribute('aria-label', label);
      });
    });
  }
  function readerMarkdown(version) {
    let header = true;
    const fields = { '日期': 'date', '试讲时长': 'duration', '时长': 'duration', '试讲形式': 'format', '形式': 'format' };
    return String(version.markdown || '').split(/\r?\n/).filter(line => {
      const text = line.trim();
      if (!header || !text || /^#\s/.test(text)) return true;
      if (/^\*\*(?:设计版本|试讲版本|采用的教学设计版本|版本说明)[：:]/.test(text)) return false;
      const entry = text.match(/^(?:\*\*)?(日期|试讲时长|时长|试讲形式|形式)[：:](?:\*\*)?\s*(.*)$/);
      if (entry) return entry[2].trim() !== version[fields[entry[1]]];
      header = false;
      return true;
    }).join('\n');
  }
  function versionLabel(version) {
    return `V${version.versionNumber || Number(version.id.slice(1))}${version.date ? ` · ${version.date}` : ''}`;
  }
  function versionPicker(tab, selected) {
    if (tab.versions.length < 2) return '';
    return `<div class="lesson-version-picker" data-version-picker data-open="false"><button type="button" class="lesson-version-trigger" data-history-version title="选择过往版本" aria-label="${escape(tab.label)}版本：${escape(versionLabel(selected))}" aria-haspopup="listbox" aria-expanded="false" aria-controls="history-${escape(tab.id)}"><span class="lesson-version-trigger-label">${escape(versionLabel(selected))}</span><span class="lesson-version-trigger-short" aria-hidden="true">V${selected.versionNumber || Number(selected.id.slice(1))}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button><div class="lesson-version-menu" id="history-${escape(tab.id)}" role="listbox" aria-label="${escape(tab.label)}版本" aria-hidden="true">${tab.versions.map(version => `<button type="button" role="option" tabindex="-1" aria-selected="${version.id === selected.id}" data-history-option="${escape(version.id)}"><span>${escape(versionLabel(version))}</span><span aria-hidden="true">${version.id === selected.id ? '✓' : ''}</span></button>`).join('')}</div></div>`;
  }
  function render(tab, point, lookup) {
    if (tab.kind === 'overview') return window.courseOverview.render(point, lookup, markdown);
    const version = tab.versions.find(v => v.id === tab.selectedId) || tab.versions[0];
    if (!version) {
      const emptyMedia = tab.kind === 'trial' ? media({}) : null;
      return `<div class="version-layout">${emptyMedia?.video || ''}<section class="lesson-plan"><p class="lesson-empty-note">${tab.label}待补充</p>${emptyMedia?.board || ''}</section></div>`;
    }
    const selector = versionPicker(tab, version);
    // Version information belongs to the controls. Keep the sole version out of the reader.
    const body = tab.kind === 'trial' ? readerMarkdown(version).replace(/^#\s+试讲复盘\s*\n/, '') : readerMarkdown(version);
    const metadata = [version.date, version.duration, version.format].filter(Boolean);
    const title = tab.kind === 'trial' ? `<h2 class="lesson-version-heading">试讲复盘${selector ? ` <span class="lesson-selected-version">V${version.versionNumber || Number(version.id.slice(1))}</span>` : ''}</h2>` : '';
    const toolbar = title || metadata.length || selector ? `<div class="lesson-version-toolbar ${tab.kind === 'trial' ? 'is-rehearsal' : ''}">${title}<div class="lesson-version-meta">${metadata.map(value => `<span title="${escape(value)}">${escape(value)}</span>`).join('')}</div>${selector}</div>` : '';
    const document = `<section class="lesson-document"><div class="lesson-markdown">${markdown(body)}</div></section>`;
    const resources = version.lessonFile ? `<a class="resource-link" href="${escape(version.lessonFile)}" target="_blank" rel="noopener">打开 Markdown ↗</a>` : '';
    const showMedia = tab.kind === 'trial' || Boolean(version.video || version.boardImage);
    const versionMedia = showMedia ? media(version) : null;
    return `<div class="version-layout">${versionMedia?.video || ''}<section class="lesson-plan">${toolbar}${document}${resources}${versionMedia?.board || ''}</section></div>`;
  }
  function header(lesson, stage, term, status, category = lesson.unit.title) {
    const breadcrumb = `${stage.label}数学 / ${lesson.grade.label} / ${term} / ${lesson.unit.title}`;
    const expanded = `${stage.label}数学 / ${lesson.grade.label} / ${term} / ${category}`;
    return `<header class="lesson-dialog-header"><div class="lesson-header-surface" aria-hidden="true"></div><div class="lesson-breadcrumb lesson-expanded-breadcrumb">${escape(expanded)}</div><div class="lesson-breadcrumb lesson-compact-breadcrumb" title="${escape(breadcrumb)}">${escape(breadcrumb)}</div><div class="lesson-heading-group"><h2 title="${escape(lesson.point.title)}">${escape(lesson.point.title)}</h2></div><span class="lesson-state lesson-compact-state ${escape(lesson.point.status)}">${escape(status)}</span><div class="lesson-submeta"><span>${escape(lesson.unit.title)}</span><span class="lesson-state lesson-expanded-state ${escape(lesson.point.status)}">${escape(status)}</span></div></header>`;
  }
  function closePicker(picker, focus = false) {
    if (!picker) return;
    picker.dataset.open = 'false';
    const trigger = picker.querySelector('[data-history-version]');
    trigger.setAttribute('aria-expanded', 'false');
    picker.querySelector('[role="listbox"]').setAttribute('aria-hidden', 'true');
    if (focus) trigger.focus({ preventScroll: true });
  }
  function bindVersionPicker(panel, tab, onChange) {
    const picker = panel.querySelector('[data-version-picker]');
    if (!picker) return;
    const trigger = picker.querySelector('[data-history-version]');
    const menu = picker.querySelector('[role="listbox"]');
    const options = [...menu.querySelectorAll('[data-history-option]')];
    function open(focus = false) {
      const boundary = panel.getBoundingClientRect();
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = boundary.bottom - rect.bottom - 14;
      const spaceAbove = rect.top - boundary.top - 14;
      const above = spaceBelow < Math.min(menu.scrollHeight, 230) && spaceAbove > spaceBelow;
      picker.dataset.side = above ? 'up' : 'down';
      menu.style.maxHeight = `${Math.max(56, Math.min(230, above ? spaceAbove : spaceBelow))}px`;
      picker.dataset.open = 'true';
      trigger.setAttribute('aria-expanded', 'true');
      menu.setAttribute('aria-hidden', 'false');
      if (focus) (options.find(option => option.getAttribute('aria-selected') === 'true') || options[0]).focus();
    }
    trigger.addEventListener('click', () => picker.dataset.open === 'true' ? closePicker(picker) : open());
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(true); }
    });
    options.forEach((option, index) => {
      option.addEventListener('click', () => {
        tab.selectedId = option.dataset.historyOption;
        onChange();
        panel.querySelector('[data-history-version]')?.focus({ preventScroll: true });
      });
      option.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowDown') next = (index + 1) % options.length;
        if (event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = options.length - 1;
        if (next !== undefined) { event.preventDefault(); event.stopPropagation(); options[next].focus(); }
      });
    });
  }
  function bindDialog(root) {
    const panel = root.querySelector('[data-version-panel]');
    let collapseRequested = false;
    function compact() {
      if (collapseRequested || root.classList.contains('is-compact')) return;
      collapseRequested = true;
      window.requestAnimationFrame(() => {
        if (root.isConnected === false) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          root.classList.add('is-compact');
          return;
        }
        const header = root.querySelector('.lesson-dialog-header');
        const surface = root.querySelector('.lesson-header-surface');
        const title = root.querySelector('.lesson-heading-group h2');
        const tabs = root.querySelector('.version-tabs');
        const breadcrumb = root.querySelector('.lesson-expanded-breadcrumb');
        const meta = root.querySelector('.lesson-submeta');
        // Read both layouts once; only transforms and opacity change during the animation.
        const before = {
          header: header.getBoundingClientRect(), title: title.getBoundingClientRect(),
          tabs: tabs.getBoundingClientRect(), panel: panel.getBoundingClientRect(),
          breadcrumb: breadcrumb.getBoundingClientRect(), meta: meta.getBoundingClientRect(),
          font: parseFloat(getComputedStyle(title).fontSize)
        };
        for (const name of ['breadcrumb', 'meta']) {
          root.style.setProperty(`--lesson-${name}-left`, `${before[name].left - before.header.left}px`);
          root.style.setProperty(`--lesson-${name}-top`, `${before[name].top - before.header.top}px`);
        }
        root.classList.add('is-compact', 'is-collapsing');
        const after = {
          header: header.getBoundingClientRect(), title: title.getBoundingClientRect(),
          tabs: tabs.getBoundingClientRect(), panel: panel.getBoundingClientRect(),
          font: parseFloat(getComputedStyle(title).fontSize)
        };
        const animations = [];
        const timing = { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' };
        const animate = (element, frames, options = timing) => animations.push(element.animate(frames, options));
        animate(surface, [{ transform: `scaleY(${before.header.height / after.header.height})` }, { transform: 'scaleY(1)' }]);
        animate(title, [
          { transform: `translate3d(${before.title.left - after.title.left}px,${before.title.top - after.title.top}px,0) scale(${before.font / after.font})` },
          { transform: 'translate3d(0,0,0) scale(1)' }
        ]);
        for (const [name, element] of [['tabs', tabs], ['panel', panel]]) {
          animate(element, [{ transform: `translate3d(0,${before[name].top - after[name].top}px,0)` }, { transform: 'translate3d(0,0,0)' }]);
        }
        for (const element of [breadcrumb, meta]) animate(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'both' });
        for (const selector of ['.lesson-compact-breadcrumb', '.lesson-compact-state']) {
          animate(root.querySelector(selector), [{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 120, fill: 'both' });
        }
        Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
          animations.forEach(animation => animation.cancel());
          root.classList.remove('is-collapsing');
        });
      });
    }
    root.addEventListener('wheel', event => {
      if (event.target.closest('[role="listbox"]')) return;
      closePicker(root.querySelector('[data-version-picker][data-open="true"]'));
      if (event.deltaY > 0) compact();
    }, { passive: true });
    panel.addEventListener('scroll', () => {
      if (panel.scrollTop > 18) compact();
    }, { passive: true });
    root.addEventListener('click', event => {
      if (!event.target.closest('[data-version-picker]')) closePicker(root.querySelector('[data-version-picker][data-open="true"]'));
    });
    root.addEventListener('keydown', event => {
      const open = root.querySelector('[data-version-picker][data-open="true"]');
      if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker(open, true); }
      else if (open && event.key === 'Tab') closePicker(open);
    });
  }
  async function refresh(point) {
    const response = await fetch(`/lessons/${encodeURIComponent(point.id)}/index.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error('暂时无法读取最新课程材料');
    const { lesson } = await response.json();
    point.overviewMarkdown = lesson.overviewMarkdown;
    point.overview = { prerequisiteIds: lesson.prerequisiteIds, nextTopicIds: lesson.nextTopicIds };
    point.designs = lesson.designs;
    point.rehearsals = lesson.rehearsals;
  }
  window.lessonContent = Object.freeze({ escape, markdown, model, render, refresh, header, bindDialog, bindVersionPicker, bindMedia });
})();
