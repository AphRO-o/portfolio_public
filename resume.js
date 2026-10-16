import { renderResume } from "/resume-format.mjs";
import { installResumeScrollResistance } from "/resume-scroll.mjs?v=panel-motion-5";

for (const root of document.querySelectorAll("[data-resume]")) {
  installResumeScrollResistance(root);
  const intro = root.querySelector("[data-resume-intro]");
  const content = root.querySelector("[data-resume-content]");
  async function load() {
    root.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(root.dataset.resumeSrc, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const markup = renderResume(await response.json(), root.dataset.resume);
      intro.innerHTML = markup.intro;
      content.innerHTML = markup.content;
      root.dataset.resumeLoaded = "true";
    } catch (error) {
      console.error("无法读取简历", error);
      // A built page already contains the resume, so preserve it if offline.
      if (!content.querySelector("article")) {
        content.replaceChildren();
        const message = document.createElement("p");
        message.setAttribute("role", "status");
        message.textContent = "简历暂时无法读取。";
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "重新加载";
        retry.addEventListener("click", load);
        content.append(message, retry);
      }
    } finally {
      root.setAttribute("aria-busy", "false");
    }
  }
  load();
}
