import { dom } from "./dom.js";
import { state } from "./state.js";

export function loadSettings(callback) {
  const defaults = {
    prompts: "",
    startFrom: 1,
    language: "en",
    videoCount: "4",
    minInitialWait: 30,
    maxInitialWait: 60,
    autoDownload: true,
    downloadFolder: "Flow Downloads",
    mode: "text-to-video",
    aspectRatio: "landscape",
    model: "default",
    lastRunMode: null,
    imageSort: "az",
    masterQueue: [],
    nextProjectCounter: 1,
    imageRepeatCount: "1",
    imageModel: "nano_banana_pro",
    imageToVideoPromptMap: {},
    videoDownloadResolution: "720p",
    autoDownloadImages: false,
    imageAutoDownloadResolution: "4k",
    autoStartNextJob: true,
  };

  chrome.storage.local.get(defaults, (savedSettings) => {
    // Apply saved settings to DOM elements
    dom.promptsTextarea.value = savedSettings.prompts;
    dom.startFromInput.value = savedSettings.startFrom;
    dom.repeatCountInput.value = savedSettings.videoCount;
    dom.minInitialWaitTimeInput.value = savedSettings.minInitialWait;
    dom.maxInitialWaitTimeInput.value = savedSettings.maxInitialWait;
    dom.languageSelector.value = savedSettings.language;
    dom.autoDownloadCheckbox.checked = savedSettings.autoDownload;
    dom.modeSelector.value = savedSettings.mode;
    dom.aspectRatioSelector.value = savedSettings.aspectRatio;
    dom.modelSelector.value = savedSettings.model;
    dom.imageSortSelector.value = savedSettings.imageSort;

    if (dom.imageRepeatCountInput) {
      dom.imageRepeatCountInput.value = savedSettings.imageRepeatCount;
    }
    if (dom.imageModelSelector) {
      dom.imageModelSelector.value = savedSettings.imageModel;
    }

    // Apply saved settings to state
    state.activeRunMode = savedSettings.lastRunMode;
    state.currentLang = savedSettings.language;
    state.currentMode = savedSettings.mode;

    const savedQueue = savedSettings.masterQueue || [];
    state.masterQueue = savedQueue.map((item) => ({
      ...item,
      repeatCount: item.repeatCount || savedSettings.videoCount || "1",
      model: item.model || savedSettings.model || "default",
      aspectRatio: item.aspectRatio || savedSettings.aspectRatio || "landscape",
    }));

    state.nextProjectCounter = savedSettings.nextProjectCounter;
    state.imageToVideoPromptMap = savedSettings.imageToVideoPromptMap || {};
    state.videoDownloadResolution =
      savedSettings.videoDownloadResolution || "720p";

    if (dom.videoDownloadResolution) {
      dom.videoDownloadResolution.value = state.videoDownloadResolution;
    }
    // Sync gallery video download dropdown with saved resolution
    if (dom.videoDownloadRes) {
      dom.videoDownloadRes.value = state.videoDownloadResolution;
    }

    state.imageAutoDownloadResolution =
      savedSettings.imageAutoDownloadResolution || "4k";

    if (dom.autoDownloadImagesCheckbox) {
      dom.autoDownloadImagesCheckbox.checked = savedSettings.autoDownloadImages;
    }
    if (dom.imageAutoDownloadResolution) {
      dom.imageAutoDownloadResolution.value = state.imageAutoDownloadResolution;
    }

    state.autoStartNextJob =
      savedSettings.autoStartNextJob !== undefined
        ? savedSettings.autoStartNextJob
        : true;
    if (dom.autoStartNextJob) {
      dom.autoStartNextJob.checked = state.autoStartNextJob;
    }

    if (callback) {
      callback();
    }
  });
}
