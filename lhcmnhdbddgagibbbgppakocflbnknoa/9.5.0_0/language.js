import { dom } from "./dom.js";
import { state } from "./state.js";
import {
  updateMainButton,
  updateFailedPromptsUI,
  updateUIAfterModeChange,
  updateLiveStatus,
  renderToolsList,
} from "./ui.js";
import { i18n, translations } from "./i18n.js";

export function setLanguage(langCode) {
  state.currentLang = translations[langCode] ? langCode : "en";
  chrome.storage.local.set({ language: state.currentLang });

  document.querySelectorAll("[data-lang-key]").forEach((element) => {
    const langKey = element.getAttribute("data-lang-key");
    if (!translations[state.currentLang]?.[langKey]) return;

    if (element.id === "wrong-page-message") {
      element.innerHTML = i18n(langKey);
    } else {
      let targetElement = element;

      if (
        element.tagName === "BUTTON" &&
        element.querySelector(".material-symbols-outlined")
      ) {
        const textSpans = element.querySelectorAll(
          "span:not(.material-symbols-outlined)",
        );
        if (textSpans.length > 0) {
          targetElement = textSpans[textSpans.length - 1];
        }
      } else if (
        element.classList.contains("tab-button") &&
        element.querySelector("span")
      ) {
        targetElement = element.querySelector("span:last-of-type");
      } else if (
        element.matches("a.sample-link") ||
        element.matches("a#openDownloadsSettingsLink") ||
        element.tagName === "LABEL" ||
        element.classList.contains("section-title") ||
        element.classList.contains("donate-text") ||
        element.tagName === "OPTION" ||
        element.classList.contains("mode-toggle-button")
      ) {
        targetElement = element;
      }

      if (targetElement && targetElement.textContent !== i18n(langKey)) {
        if (targetElement.classList.contains("mode-toggle-button")) {
          const icon = targetElement.querySelector(
            ".material-symbols-outlined",
          );
          targetElement.textContent = i18n(langKey);
          targetElement.prepend(icon);
        } else {
          targetElement.textContent = i18n(langKey);
        }
      }
    }
  });

  document.querySelectorAll("[data-lang-placeholder]").forEach((element) => {
    const placeholderKey = element.getAttribute("data-lang-placeholder");
    if (translations[state.currentLang]?.[placeholderKey]) {
      element.placeholder = i18n(placeholderKey);
    }
  });

  document.querySelectorAll("[data-lang-title]").forEach((element) => {
    const titleKey = element.getAttribute("data-lang-title");
    if (translations[state.currentLang]?.[titleKey]) {
      element.title = i18n(titleKey);
    }
  });

  const userGuideNote = document.getElementById("userGuideNote");
  const userGuideLink = document.getElementById("userGuideLink");

  if (userGuideNote) {
    userGuideNote.textContent = i18n("user_guide_note");
  }
  if (userGuideLink) {
    userGuideLink.textContent = i18n("user_guide_link_text");
    if (state.currentLang === "vi") {
      userGuideLink.href =
        "https://github.com/duckmartians/Auto-Flow/blob/main/README_vi.md";
    } else {
      userGuideLink.href =
        "https://github.com/duckmartians/Auto-Flow/blob/main/README.md";
    }
  }

  updateMainButton();
  updateFailedPromptsUI();
  updateUIAfterModeChange();

  if (!state.isRunning && !state.downloadInterval && !state.finalScanTimerId) {
    updateLiveStatus(i18n("status_ready"));
  }

  renderToolsList();
}
