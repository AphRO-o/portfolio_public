(() => {
  const root = document.querySelector("[data-showcase-site]");
  if (!root) return;

  const imageRoot = "/content/dev/pic/optimized/desktop/";
  const images = {
    reader: `${imageRoot}gpt.webp`,
    edge: `${imageRoot}iot.webp`,
    road: `${imageRoot}road2.webp`,
    cv: `${imageRoot}cv.webp`,
    soap_cover: `${imageRoot}soap_cover.webp`,
    soap_wheel: `${imageRoot}soap_wheel.webp`,
    soap_dust: `${imageRoot}soap_dust.webp`,
    soap_lava: `${imageRoot}soap_lava.webp`
  };
  const winterPreviews = [
    { image: images.soap_cover, label: "小肥皂的启程" },
    { image: images.soap_wheel, label: "水轮澡堂" },
    { image: images.soap_dust, label: "灰尘山" },
    { image: images.soap_lava, label: "岩浆雨" }
  ];
  const paperRoot = "/content/dev/paper/";
  const paperFiles = {
    edge: `${paperRoot}${encodeURIComponent("Machine Learning at the Network Edge Compressed Sensor Data for Gateway-based Activity Recognition.pdf")}`,
    roads: `${paperRoot}${encodeURIComponent("基于城市街景图的道路设施环境安全评价.pdf")}`
  };

  const projects = [
    { id: "winter", category: "games", categoryLabel: "游戏", eyebrow: "INDIE GAME · IN DEV", title: "寻冬", english: "SEEKING WINTER", summary: "冬天已经很久没有来过了。为了不在漫长的夏天里融化，一块小肥皂决定出发，寻找传说中的寒冷。", meta: ["GAME DESIGN", "SYSTEM DESIGN", "UNITY"], image: images.soap_dust, link: "", linkLabel: "项目正在制作中" },
    { id: "iot", category: "papers", categoryLabel: "项目", eyebrow: "NUS CAPSTONE · EDGE MACHINE LEARNING", title: "Machine Learning at the Network Edge: Compressed Sensor Data for Gateway-Based Activity Recognition", navTitle: "Machine Learning at the Network Edge", english: "网络边缘的机器学习：面向网关活动识别的压缩传感器数据", summary: "以手机惯性传感器的人体活动识别为例，比较无损压缩、量化、PCA 与自编码器。逐特征 int8 将单条数据从 2,244 字节降至 561 字节，Macro-F1 仍保持在约 95.5%。", meta: ["EDGE COMPUTING", "SENSOR DATA", "INT8 / PCA / AE"], image: images.edge, link: paperFiles.edge, linkLabel: "阅读完整论文" },
    { id: "roads", category: "papers", categoryLabel: "项目", eyebrow: "TONGJI THESIS · COMPUTER VISION", title: "基于城市街景图的道路设施环境安全评价", english: "Safety Evaluation of Road Facilities Surroundings Based on Urban Street View Imagery", summary: "融合加州北部事故数据与旧金山路网，使用街景图像、YOLO 语义分割、XGBoost 和 GIS 评估道路安全。隔离设施与信号灯是事故严重程度的重要影响因素；获同济大学优秀毕业论文。", meta: ["STREET VIEW", "YOLO / XGBOOST", "GIS"], image: images.road, link: paperFiles.roads, linkLabel: "阅读完整论文" },
    { id: "reader", category: "projects", categoryLabel: "工具", eyebrow: "LOCAL TOOL · CONVERSATION READER", title: "GPT Reader", english: "READ WITH CONTEXT", summary: "把 ChatGPT 导出包变成可搜索的对话书架。按每轮问答快速定位、阅读历史讨论，并导出 Markdown；对话文件完全在你的浏览器中处理。", meta: ["OFFLINE", "CHATGPT EXPORT", "MARKDOWN"], image: images.reader, link: "/tools/gpt-reader/", linkLabel: "打开 GPT Reader" },
    { id: "cv", category: "projects", categoryLabel: "工具", eyebrow: "PRODUCTIVITY · STRUCTURED WRITING", title: "CV Creator", english: "BUILD A BETTER CV", summary: "模块化编辑经历，实时预览 A4 简历并自动压缩到一页。支持模块排序、字体与间距调整、JSON 备份及 PDF 导出；内容自动保存在本机浏览器。", meta: ["A4 PREVIEW", "LOCAL SAVE", "PDF EXPORT"], image: images.cv, link: "/tools/cv-creator/", linkLabel: "打开 CV Creator" }
  ];

  const imageEditorEnabled = new URLSearchParams(location.search).has("editImages") &&
    ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  const draftKey = "aphro-dev-image-layout-draft-v1";
  const activeProjectKey = "aphro-dev-image-editor-project-v1";
  const layoutIds = [...projects.map((project) => project.id), ...winterPreviews.slice(1).map((_, index) => `winter-preview-${index + 2}`)];
  const frameLimits = { x: [-100, 100], y: [-100, 100], zoom: [0.2, 3], mobileX: [-100, 100], mobileY: [-100, 100], mobileZoom: [0.2, 3] };
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const readLocal = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const writeLocal = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Private browsing may disable storage. */ } };
  function normalizeLayouts(raw) {
    const result = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
    for (const id of layoutIds) {
      const input = raw[id];
      if (!input || typeof input !== "object" || Array.isArray(input)) continue;
      const frame = {};
      for (const [key, [minimum, maximum]] of Object.entries(frameLimits)) {
        if (input[key] === undefined || input[key] === null || input[key] === "") continue;
        const number = Number(input[key]);
        if (Number.isFinite(number)) frame[key] = clamp(number, minimum, maximum);
      }
      if (Object.keys(frame).length) result[id] = frame;
    }
    return result;
  }
  let draftLayouts = {};
  let hasDraft = false;
  if (imageEditorEnabled) {
    const savedDraft = readLocal(draftKey);
    if (savedDraft !== null) {
      try {
        draftLayouts = normalizeLayouts(JSON.parse(savedDraft));
        hasDraft = true;
      } catch { /* Ignore an invalid draft. */ }
    }
  }
  let imageLayouts = { ...draftLayouts };
  let refreshImageEditor = () => {};

  const imageReady = new Map();
  function ensureImage(source) {
    if (imageReady.has(source)) return imageReady.get(source);
    const image = new Image();
    image.fetchPriority = document.documentElement.classList.contains("showcase-loading") ? "high" : "low";
    image.src = source;
    const ready = image.decode ? image.decode().catch(() => {}) : Promise.resolve();
    imageReady.set(source, ready);
    return ready;
  }
  const mobileViewport = window.matchMedia("(max-width: 620px)");
  const hoverPointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const responsiveSource = (source) => mobileViewport.matches
    ? source.replace("/desktop/", "/mobile/") : source;
  const sourceFor = (project) => responsiveSource(project.id === "winter"
    ? winterPreviews[winterPreviewIndex].image : project.image);

  const hero = root.querySelector("[data-showcase-hero]");
  const backdrops = [root.querySelector("[data-hero-backdrop]"), root.querySelector("[data-hero-next]")];
  const projectCopy = root.querySelector(".project-copy");
  const previousButton = root.querySelector("[data-project-previous]");
  const nextButton = root.querySelector("[data-project-next]");
  const rail = root.querySelector("[data-project-rail]");
  const railTitle = root.querySelector("[data-rail-title]");
  const previewRoot = root.querySelector("[data-winter-preview]");
  const previewTrack = root.querySelector("[data-winter-preview-track]");
  const previewWindow = root.querySelector(".winter-preview-window");
  const fields = {
    eyebrow: root.querySelector("[data-project-eyebrow]"), title: root.querySelector("[data-project-title]"),
    english: root.querySelector("[data-project-english]"), summary: root.querySelector("[data-project-summary]"),
    meta: root.querySelector("[data-project-meta]"), link: root.querySelector("[data-project-link]"),
    previous: root.querySelector("[data-previous-label]"),
    next: root.querySelector("[data-next-label]"), previousContext: root.querySelector("[data-previous-context]"),
    nextContext: root.querySelector("[data-next-context]")
  };
  let activeIndex = 0;
  let activeLayer = 0;
  let imageToken = 0;
  let winterPreviewIndex = 0;
  let winterPreviewStep = winterPreviews.length;
  let previewTimer = null;
  let previewLoopReset = null;
  let railHoveredIndex = null;
  let heroVisible = true;

  const pad = (number) => String(number).padStart(2, "0");
  const projectIndex = (id) => projects.findIndex((project) => project.id === id);
  const wrap = (index) => (index + projects.length) % projects.length;
  const frameId = (project) => project.id === "winter" && winterPreviewIndex > 0
    ? `winter-preview-${winterPreviewIndex + 1}` : project.id;

  const railButtons = projects.map((project, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-rail-bar";
    button.dataset.railCategory = project.category;
    button.setAttribute("aria-label", `${pad(index + 1)} · ${project.categoryLabel} · ${project.navTitle || project.title}`);
    button.addEventListener("pointerenter", () => { railHoveredIndex = index; paintRail(); });
    button.addEventListener("focus", () => { railHoveredIndex = index; paintRail(); });
    button.addEventListener("click", () => setActive(index));
    rail.append(button);
    return button;
  });
  function paintRail() {
    const focus = railHoveredIndex;
    railButtons.forEach((button, index) => {
      const distance = focus === null ? Infinity : Math.abs(index - focus);
      const height = focus === null ? (index === activeIndex ? 29 : 15) : Math.max(15, 43 - distance * 12);
      button.style.setProperty("--bar-height", `${height}px`);
      button.setAttribute("aria-current", String(index === activeIndex));
    });
    const shown = projects[focus ?? activeIndex];
    railTitle.textContent = shown.navTitle || shown.title;
  }
  rail.addEventListener("pointerleave", () => { railHoveredIndex = null; paintRail(); });
  rail.addEventListener("focusout", (event) => {
    if (!rail.contains(event.relatedTarget)) { railHoveredIndex = null; paintRail(); }
  });

  [...winterPreviews, ...winterPreviews, ...winterPreviews].forEach((preview, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "winter-preview-thumb";
    button.setAttribute("aria-label", `寻冬预览图 ${index % winterPreviews.length + 1}：${preview.label}`);
    if (index < winterPreviews.length || index >= winterPreviews.length * 2) button.tabIndex = -1;
    const image = document.createElement("img");
    image.src = preview.image.replace("/desktop/", "/thumb/");
    image.loading = "lazy";
    image.fetchPriority = "low";
    image.alt = "";
    image.decoding = "async";
    image.draggable = false;
    button.append(image);
    button.addEventListener("click", () => {
      switchWinterPreview(index % winterPreviews.length, index);
      scheduleWinterPreview();
    });
    previewTrack.append(button);
  });
  const previewButtons = [...previewTrack.querySelectorAll(".winter-preview-thumb")];
  const previewStepWidth = () => previewButtons[0].offsetWidth + parseFloat(getComputedStyle(previewTrack).gap || "0");
  function positionWinterPreview(step, animate = true) {
    if (mobileViewport.matches) return;
    const centerOffset = (previewWindow.offsetWidth - previewButtons[0].offsetWidth) / 2;
    previewTrack.style.transition = animate ? "" : "none";
    previewTrack.style.transform = `translate3d(${centerOffset - step * previewStepWidth()}px, 0, 0)`;
    if (!animate) {
      void previewTrack.offsetWidth;
      requestAnimationFrame(() => { previewTrack.style.transition = ""; });
    }
    previewButtons.forEach((button, index) => button.setAttribute("aria-current", String(index === step)));
  }
  function switchWinterPreview(index, targetStep = winterPreviews.length + index) {
    clearTimeout(previewLoopReset);
    winterPreviewIndex = (index + winterPreviews.length) % winterPreviews.length;
    winterPreviewStep = targetStep;
    positionWinterPreview(winterPreviewStep);
    if (activeIndex === projectIndex("winter")) showImage(projects[activeIndex], false);
    refreshImageEditor();
    if (winterPreviewStep < winterPreviews.length || winterPreviewStep >= winterPreviews.length * 2) {
      previewLoopReset = setTimeout(() => {
        winterPreviewStep += winterPreviewStep < winterPreviews.length ? winterPreviews.length : -winterPreviews.length;
        positionWinterPreview(winterPreviewStep, false);
      }, 380);
    }
  }
  function scheduleWinterPreview() {
    clearTimeout(previewTimer);
    if (document.documentElement.classList.contains("showcase-loading") || activeIndex !== projectIndex("winter") || document.hidden || !heroVisible || imageEditorEnabled ||
      (!previewRoot.hidden && previewRoot.matches(":hover")) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ensureImage(responsiveSource(winterPreviews[(winterPreviewIndex + 1) % winterPreviews.length].image));
    previewTimer = setTimeout(() => {
      switchWinterPreview(winterPreviewIndex + 1, winterPreviewStep + 1);
      scheduleWinterPreview();
    }, 5000);
  }
  previewRoot.addEventListener("pointerenter", () => clearTimeout(previewTimer));
  previewRoot.addEventListener("pointerleave", scheduleWinterPreview);
  previewRoot.addEventListener("focusin", () => clearTimeout(previewTimer));
  previewRoot.addEventListener("focusout", (event) => { if (!previewRoot.contains(event.relatedTarget)) scheduleWinterPreview(); });
  document.addEventListener("visibilitychange", scheduleWinterPreview);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      scheduleWinterPreview();
    }, { threshold: 0.15 }).observe(hero);
  }
  window.addEventListener("resize", () => {
    previewRoot.hidden = projects[activeIndex].id !== "winter" || mobileViewport.matches;
    positionWinterPreview(winterPreviewStep, false);
    if (document.documentElement.classList.contains("showcase-ready")) showImage(projects[activeIndex], false);
    scheduleWinterPreview();
    refreshImageEditor();
  });

  function frameImage(image, project) {
    const frame = imageLayouts[frameId(project)] || {};
    image.style.setProperty("--image-position", project.position ?? "center");
    image.style.setProperty("--image-position-mobile", project.mobilePosition ?? project.position ?? "center");
    image.style.setProperty("--image-offset-x", `${frame.x ?? 0}%`);
    image.style.setProperty("--image-offset-y", `${frame.y ?? 0}%`);
    image.style.setProperty("--image-offset-x-mobile", `${frame.mobileX ?? 0}%`);
    image.style.setProperty("--image-offset-y-mobile", `${frame.mobileY ?? 0}%`);
    image.style.setProperty("--image-zoom", String(frame.zoom ?? project.zoom ?? 1));
    image.style.setProperty("--image-zoom-mobile", String(frame.mobileZoom ?? project.mobileZoom ?? 1));
  }

  function showImage(project, immediate) {
    const token = ++imageToken;
    const outgoing = backdrops[activeLayer];
    const isHalfImage = project.category !== "games";
    const source = sourceFor(project);
    if (immediate || (outgoing.getAttribute("src") === source && outgoing.classList.contains("is-half-image") === isHalfImage)) {
      outgoing.src = source;
      frameImage(outgoing, project);
      outgoing.classList.toggle("is-half-image", isHalfImage);
      return;
    }
    const incoming = backdrops[1 - activeLayer];
    ensureImage(source).then(() => {
      if (token !== imageToken) return;
      incoming.src = source;
      frameImage(incoming, project);
      incoming.classList.toggle("is-half-image", isHalfImage);
      requestAnimationFrame(() => {
        if (token !== imageToken) return;
        incoming.classList.add("is-visible");
        outgoing.classList.remove("is-visible");
        activeLayer = 1 - activeLayer;
      });
    });
  }

  function setActive(index, immediate = false) {
    const nextIndex = wrap(index);
    const project = projects[nextIndex];
    const previous = projects[wrap(nextIndex - 1)];
    const next = projects[wrap(nextIndex + 1)];
      activeIndex = nextIndex;
      showImage(project, immediate);
      hero.classList.toggle("is-half-image", project.category !== "games");
      hero.classList.toggle("is-road-paper", project.id === "roads");
      previewRoot.hidden = project.id !== "winter" || mobileViewport.matches;
      root.querySelector("[data-concept-disclaimer]").hidden = project.id !== "winter";
      if (project.id === "winter") positionWinterPreview(winterPreviewStep, false);
      scheduleWinterPreview();
      fields.eyebrow.textContent = project.eyebrow;
      fields.title.textContent = project.title;
      hero.classList.toggle("has-long-title", project.title.length > 7);
      hero.classList.toggle("has-very-long-title", project.title.length > 32);
      fields.english.textContent = project.english;
      fields.english.hidden = project.category !== "papers";
      fields.english.lang = project.id === "roads" ? "en" : "zh-Hans";
      fields.summary.textContent = project.summary;
      fields.meta.innerHTML = project.meta.map((item) => `<span>${item}</span>`).join("");
      fields.link.textContent = "";
      fields.link.append(document.createTextNode(project.linkLabel + " "));
      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      fields.link.append(arrow);
      fields.link.href = project.link || "#";
      fields.link.setAttribute("aria-disabled", String(!project.link));
      if (project.link?.toLowerCase().endsWith(".pdf")) {
        fields.link.target = "_blank";
        fields.link.rel = "noopener noreferrer";
      } else {
        fields.link.removeAttribute("target");
        fields.link.removeAttribute("rel");
      }
      paintRail();
      fields.previous.textContent = previous.navTitle || previous.title;
      fields.next.textContent = next.navTitle || next.title;
      fields.previousContext.textContent = `上一个 · ${previous.categoryLabel}`;
      fields.nextContext.textContent = `下一个 · ${next.categoryLabel}`;
      previousButton.setAttribute("aria-label", `上一个 · ${previous.categoryLabel} · ${previous.navTitle || previous.title}`);
      nextButton.setAttribute("aria-label", `下一个 · ${next.categoryLabel} · ${next.navTitle || next.title}`);
      previousButton.title = previous.navTitle || previous.title;
      nextButton.title = next.navTitle || next.title;
      if (imageEditorEnabled) writeLocal(activeProjectKey, project.id);
      refreshImageEditor();
      root.querySelectorAll("[data-category]").forEach((button) => button.setAttribute("aria-current", String(button.dataset.category === project.category)));
      root.querySelectorAll("[data-project-id]").forEach((button) => button.setAttribute("aria-current", String(button.dataset.projectId === project.id)));
      if (!immediate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        projectCopy.getAnimations().forEach((animation) => animation.cancel());
        projectCopy.animate(
          [{ opacity: 0.72, transform: "translateY(9px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 190, easing: "ease-out" }
        );
      }
  }

  let lastArrowClickAt = 0;
  let lastArrowDirection = 0;
  function navigateByArrow(direction, event) {
    const now = performance.now();
    if (event.detail > 1 || (event.detail > 0 && direction === lastArrowDirection && now - lastArrowClickAt < 360)) return;
    lastArrowDirection = direction;
    lastArrowClickAt = now;
    setActive(activeIndex + direction);
  }
  previousButton.addEventListener("click", (event) => navigateByArrow(-1, event));
  nextButton.addEventListener("click", (event) => navigateByArrow(1, event));
  const closeMenu = (menu) => {
    menu.classList.remove("is-open");
    menu.querySelector(":scope > button")?.setAttribute("aria-expanded", "false");
  };
  const closeMenus = () => root.querySelectorAll("[data-category-menu]").forEach(closeMenu);
  const openMenu = (menu) => {
    closeMenus();
    menu.classList.add("is-open");
    menu.querySelector(":scope > button")?.setAttribute("aria-expanded", "true");
  };

  root.querySelectorAll("[data-category]").forEach((button) => {
    const menu = button.closest("[data-category-menu]");
    button.addEventListener("click", () => {
      if (menu.classList.contains("is-open")) closeMenus();
      else openMenu(menu);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      event.stopPropagation();
      openMenu(menu);
      const choices = menu.querySelectorAll("[data-project-id]");
      (event.key === "ArrowDown" ? choices[0] : choices[choices.length - 1])?.focus();
    });
  });
  root.querySelectorAll("[data-project-id]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    setActive(projectIndex(button.dataset.projectId));
    closeMenus();
    button.closest("[data-category-menu]").querySelector(":scope > button").focus({ preventScroll: true });
  }));
  root.querySelectorAll("[data-category-menu]").forEach((menu) => {
    menu.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse" && hoverPointer.matches && !mobileViewport.matches) openMenu(menu);
    });
    menu.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && hoverPointer.matches && !mobileViewport.matches) closeMenu(menu);
    });
    menu.addEventListener("focusout", (event) => { if (!menu.contains(event.relatedTarget)) closeMenu(menu); });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".category-nav")) closeMenus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key === "ArrowLeft") setActive(activeIndex - 1);
    if (event.key === "ArrowRight") setActive(activeIndex + 1);
    if (event.key === "Escape") closeMenus();
  });
  fields.link.addEventListener("click", (event) => { if (fields.link.getAttribute("aria-disabled") === "true") event.preventDefault(); });

  function setupImageEditor() {
    const editor = document.createElement("aside");
    editor.className = "image-editor";
    editor.setAttribute("aria-label", "图片位置编辑器");
    editor.innerHTML = `
      <details open>
        <summary>图片位置调节</summary>
        <div class="image-editor-body">
          <p class="image-editor-project" data-editor-project></p>
          <p class="image-editor-note"><span data-editor-device></span> · 拖动画面可定位；切换项目会保留草稿。</p>
          <div class="image-editor-preview-controls" data-editor-preview-controls hidden>
            <button type="button" data-editor-preview-previous>← 上一张预览</button>
            <button type="button" data-editor-preview-next>下一张预览 →</button>
          </div>
          <label class="image-editor-field">水平 <input type="range" min="-100" max="100" step="0.5" data-frame="x" /><output data-frame-output="x"></output></label>
          <label class="image-editor-field">垂直 <input type="range" min="-100" max="100" step="0.5" data-frame="y" /><output data-frame-output="y"></output></label>
          <label class="image-editor-field">比例 <input type="range" min="0.2" max="3" step="0.01" data-frame="zoom" /><output data-frame-output="zoom"></output></label>
          <div class="image-editor-actions">
            <button type="button" data-editor-reset>当前图复位</button>
            <button type="button" data-editor-copy>复制全部参数</button>
            <button type="button" data-editor-save>保存到项目文件</button>
          </div>
          <p class="image-editor-status" data-editor-status aria-live="polite">浏览器会自动暂存；保存时请选择项目的 content/dev 文件夹。</p>
        </div>
      </details>`;
    root.append(editor);
    hero.classList.add("is-image-editing");
    const status = editor.querySelector("[data-editor-status]");
    const mobile = window.matchMedia("(max-width: 620px)");
    let directoryHandle = null;
    const mobileKey = { x: "mobileX", y: "mobileY", zoom: "mobileZoom" };
    const currentFrame = () => imageLayouts[frameId(projects[activeIndex])] || {};
    const displayValue = (key, value) => key === "zoom" ? `${Number(value).toFixed(2)}×` : `${Number(value).toFixed(1)}%`;
    const frameValue = (frame, key) => mobile.matches ? (frame[mobileKey[key]] ?? (key === "zoom" ? 1 : 0)) : (frame[key] ?? (key === "zoom" ? 1 : 0));
    const persistDraft = () => { hasDraft = true; writeLocal(draftKey, JSON.stringify(imageLayouts)); };

    refreshImageEditor = () => {
      const project = projects[activeIndex];
      const frame = currentFrame();
      editor.querySelector("[data-editor-project]").textContent = project.id === "winter"
        ? `寻冬 · 预览图 ${pad(winterPreviewIndex + 1)} / ${pad(winterPreviews.length)}`
        : project.navTitle || project.title;
      editor.querySelector("[data-editor-device]").textContent = mobile.matches
        ? `手机取景（${hero.clientWidth} × ${hero.clientHeight}，右上角锚点）` : `桌面取景（${hero.clientWidth} × ${hero.clientHeight}）`;
      editor.querySelector("[data-editor-preview-controls]").hidden = project.id !== "winter";
      editor.querySelectorAll("[data-frame]").forEach((input) => {
        const value = frameValue(frame, input.dataset.frame);
        input.value = String(value);
        editor.querySelector(`[data-frame-output="${input.dataset.frame}"]`).textContent = displayValue(input.dataset.frame, value);
      });
    };
    refreshImageEditor();
    mobile.addEventListener("change", refreshImageEditor);
    editor.querySelector("[data-editor-preview-previous]").addEventListener("click", () => switchWinterPreview(winterPreviewIndex - 1, winterPreviewStep - 1));
    editor.querySelector("[data-editor-preview-next]").addEventListener("click", () => switchWinterPreview(winterPreviewIndex + 1, winterPreviewStep + 1));

    editor.addEventListener("input", (event) => {
      const input = event.target.closest("[data-frame]");
      if (!input) return;
      const project = projects[activeIndex];
      const keyId = frameId(project);
      const key = mobile.matches ? mobileKey[input.dataset.frame] : input.dataset.frame;
      imageLayouts[keyId] ||= {};
      imageLayouts[keyId][key] = Number(input.value);
      frameImage(backdrops[activeLayer], project);
      refreshImageEditor();
      persistDraft();
      status.textContent = "已暂存；完成后点“保存到项目文件”。";
    });

    editor.querySelector("[data-editor-reset]").addEventListener("click", () => {
      const project = projects[activeIndex];
      const id = frameId(project);
      const keys = mobile.matches ? Object.values(mobileKey) : Object.keys(mobileKey);
      if (imageLayouts[id]) keys.forEach((key) => delete imageLayouts[id][key]);
      frameImage(backdrops[activeLayer], project);
      refreshImageEditor();
      persistDraft();
      status.textContent = mobile.matches ? "手机取景已回到右上角、原比例。" : "桌面取景已回到居中、原比例。";
    });
    editor.querySelector("[data-editor-copy]").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(`${JSON.stringify(imageLayouts, null, 2)}\n`);
        status.textContent = "全部图片参数已复制。";
      } catch { status.textContent = "复制失败，请检查浏览器剪贴板权限。"; }
    });
    editor.querySelector("[data-editor-save]").addEventListener("click", async () => {
      if (!window.showDirectoryPicker) {
        status.textContent = "当前浏览器不支持直接保存；请用 Edge/Chrome，或复制全部参数。";
        return;
      }
      try {
        if (!directoryHandle) directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        if (directoryHandle.name !== "dev") {
          directoryHandle = null;
          status.textContent = "请选择项目中的 content/dev 文件夹。";
          return;
        }
        const fileHandle = await directoryHandle.getFileHandle("image-layout.json", { create: false });
        const writable = await fileHandle.createWritable();
        await writable.write(`${JSON.stringify(imageLayouts, null, 2)}\n`);
        await writable.close();
        try { localStorage.removeItem(draftKey); } catch { /* Keep the current preview if storage is unavailable. */ }
        hasDraft = false;
        status.textContent = "已写入 content/dev/image-layout.json；刷新页面也会保留。";
      } catch (error) {
        if (error?.name !== "AbortError") status.textContent = `保存失败：${error?.message || "请重试"}`;
      }
    });

    let drag = null;
    hero.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".project-copy, .showcase-controls, .image-editor")) return;
      const project = projects[activeIndex];
      const image = backdrops[activeLayer];
      if (project.category !== "games" && event.clientX < image.getBoundingClientRect().left) return;
      const frame = currentFrame();
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
        x: frameValue(frame, "x"), y: frameValue(frame, "y"), width: image.offsetWidth, height: image.offsetHeight };
      hero.setPointerCapture(event.pointerId);
      hero.classList.add("is-image-dragging");
      event.preventDefault();
    });
    hero.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const project = projects[activeIndex];
      const xKey = mobile.matches ? "mobileX" : "x";
      const yKey = mobile.matches ? "mobileY" : "y";
      const keyId = frameId(project);
      imageLayouts[keyId] ||= {};
      imageLayouts[keyId][xKey] = Math.round(clamp(drag.x + (event.clientX - drag.startX) / drag.width * 100, -100, 100) * 10) / 10;
      imageLayouts[keyId][yKey] = Math.round(clamp(drag.y + (event.clientY - drag.startY) / drag.height * 100, -100, 100) * 10) / 10;
      frameImage(backdrops[activeLayer], project);
      refreshImageEditor();
    });
    const finishDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      hero.classList.remove("is-image-dragging");
      if (hero.hasPointerCapture(event.pointerId)) hero.releasePointerCapture(event.pointerId);
      persistDraft();
      status.textContent = "位置已暂存；完成后点“保存到项目文件”。";
    };
    hero.addEventListener("pointerup", finishDrag);
    hero.addEventListener("pointercancel", finishDrag);
  }

  const year = root.querySelector("[data-showcase-year]");
  if (year) year.textContent = new Date().getFullYear();
  const resume = root.querySelector("#resume");
  if (resume && window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const layer = document.createElement("div");
    layer.className = "resume-glow-layer";
    layer.setAttribute("aria-hidden", "true");
    const spot = document.createElement("div");
    spot.className = "resume-glow-spot";
    layer.append(spot);
    resume.prepend(layer);

    let glowFrame = 0;
    let lastPointer = null;
    const hideGlow = () => {
      lastPointer = null;
      spot.classList.remove("is-visible");
    };
    const paintGlow = () => {
      glowFrame = 0;
      if (!lastPointer) return;
      const bounds = resume.getBoundingClientRect();
      const x = lastPointer.x - bounds.left;
      const y = lastPointer.y - bounds.top;
      if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
        spot.classList.remove("is-visible");
        return;
      }
      spot.style.transform = `translate3d(${x - 180}px, ${y - 180}px, 0)`;
      spot.classList.add("is-visible");
    };
    const scheduleGlow = () => {
      if (!glowFrame) glowFrame = requestAnimationFrame(paintGlow);
    };
    const moveGlow = (event) => {
      if (event.pointerType !== "mouse") return;
      lastPointer = { x: event.clientX, y: event.clientY };
      scheduleGlow();
    };
    resume.addEventListener("pointerenter", moveGlow);
    resume.addEventListener("pointermove", moveGlow, { passive: true });
    resume.addEventListener("pointerleave", hideGlow);
    window.addEventListener("scroll", () => { if (lastPointer) scheduleGlow(); }, { passive: true });
    window.addEventListener("blur", hideGlow);
  }
  const rememberedProject = imageEditorEnabled ? readLocal(activeProjectKey) : null;
  const initialIndex = projects.findIndex((project) => project.id === rememberedProject);
  setActive(initialIndex < 0 ? 0 : initialIndex, true);
  if (imageEditorEnabled) setupImageEditor();
  const layoutsReady = fetch("/content/dev/image-layout.json", { cache: "no-store", signal: AbortSignal.timeout(3000) })
    .then((response) => response.ok ? response.json() : {})
    .then((savedLayouts) => {
      if (!hasDraft) imageLayouts = normalizeLayouts(savedLayouts);
      frameImage(backdrops[activeLayer], projects[activeIndex]);
      refreshImageEditor();
    })
    .catch(() => { /* Default centered framing remains available. */ });
  async function startShowcase() {
    await Promise.all([layoutsReady, ensureImage(sourceFor(projects[activeIndex]))]);
    // The user may choose a different project while the first image is loading.
    let source;
    do {
      source = sourceFor(projects[activeIndex]);
      await ensureImage(source);
    } while (source !== sourceFor(projects[activeIndex]));
    setActive(activeIndex, true);
    await backdrops[activeLayer].decode().catch(() => {});
    document.documentElement.classList.remove("showcase-loading");
    document.documentElement.classList.add("showcase-ready");
    scheduleWinterPreview();
    const preloadRemaining = () => {
      let next = 0;
      const sources = [...new Set(projects.map(sourceFor))];
      const loadNext = () => {
        if (next < sources.length) ensureImage(sources[next++]).then(loadNext);
      };
      loadNext();
    };
    if ("requestIdleCallback" in window) requestIdleCallback(preloadRemaining, { timeout: 2000 });
    else setTimeout(preloadRemaining, 800);
  }
  startShowcase();
})();
