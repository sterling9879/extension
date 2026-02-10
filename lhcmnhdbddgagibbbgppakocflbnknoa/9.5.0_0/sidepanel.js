import { queryDOMElements, dom } from "./dom.js";
import { state } from "./state.js";
import { loadSettings } from "./settings.js";
import { i18n } from "./i18n.js";
import { setLanguage } from "./language.js";
import { fetchConfigAndAuthorInfo } from "./config.js";
import {
  attachEventListeners,
  attachChromeListeners,
  initRefImages,
} from "./handlers.js";
import {
  updateButtonStates,
  updateInterfaceVisibility,
  updateUIAfterModeChange,
  updateLiveStatus,
  updateQueueModal,
} from "./ui.js";
import { attachGalleryListeners } from "./gallery.js";

function disableUI() {
  try {
    if (dom.mainActionButton) dom.mainActionButton.disabled = true;
    if (dom.promptsTextarea) dom.promptsTextarea.disabled = true;
    if (dom.uploadPromptButton) dom.uploadPromptButton.disabled = true;
    if (dom.modeSelector) dom.modeSelector.disabled = true;
    if (dom.uploadImageButton) dom.uploadImageButton.disabled = true;
    if (dom.startNewProjectButton) dom.startNewProjectButton.disabled = true;
    if (dom.startCurrentProjectButton)
      dom.startCurrentProjectButton.disabled = true;
    if (dom.navigateToFlowButton) dom.navigateToFlowButton.disabled = true;
    if (dom.addToQueueButton) dom.addToQueueButton.disabled = true;
    if (dom.clearQueueButton) dom.clearQueueButton.disabled = true;
    if (dom.jobDownloadFolderInput) dom.jobDownloadFolderInput.disabled = true;
    if (dom.confirmClearQueueButton)
      dom.confirmClearQueueButton.disabled = true;
    if (dom.cancelClearQueueButton) dom.cancelClearQueueButton.disabled = true;
    if (dom.queueResetAllButton) dom.queueResetAllButton.disabled = true;
    if (dom.queueDeleteAllButton) dom.queueDeleteAllButton.disabled = true;
  } catch (error) {
    console.error("Error disabling UI:", error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    queryDOMElements();

    if (
      !(
        dom.mainActionButton &&
        dom.stopButton &&
        dom.startNewProjectButton &&
        dom.startCurrentProjectButton &&
        dom.logDisplay &&
        dom.liveStatus &&
        dom.uploadPromptButton &&
        dom.wrongPageMessageElement &&
        dom.autoDownloadCheckbox &&
        dom.openDownloadsSettingsLink &&
        dom.modeSelector &&
        dom.imageModeContainer &&
        dom.aspectRatioSelector &&
        dom.modelSelector &&
        dom.imageSortSelector &&
        dom.navigateToFlowButton &&
        dom.addToQueueButton &&
        dom.openQueueButton &&
        dom.clearQueueButton &&
        dom.queueModalOverlay &&
        dom.promptsTextarea &&
        dom.startFromInput &&
        dom.repeatCountInput &&
        dom.minInitialWaitTimeInput &&
        dom.maxInitialWaitTimeInput &&
        dom.languageSelector &&
        dom.jobDownloadFolderInput &&
        dom.imageInput &&
        dom.fileInput &&
        dom.copyFailedButton &&
        dom.closeQueueModal &&
        dom.queueListDisplay &&
        dom.confirmClearQueueModal &&
        dom.confirmClearQueueButton &&
        dom.cancelClearQueueButton &&
        dom.confirmClearQueueMessage &&
        dom.queueResetAllButton &&
        dom.queueDeleteAllButton
      )
    ) {
      console.error(
        "Interface initialization failed! Critical DOM elements are missing.",
      );
      const errorMessage = i18n("log_init_fail_critical");
      disableUI();
      try {
        updateLiveStatus(errorMessage, "CRITICAL");
      } catch (_statusError) {
        console.error(
          "Failed to update status, liveStatus element might be missing.",
        );
      }
      return;
    }

    dom.mainActionButton.style.display = "flex";
    dom.startNewProjectButton.style.display = "none";
    dom.startCurrentProjectButton.style.display = "none";
    updateLiveStatus(i18n("status_loading_config"), "info");

    if (!(await fetchConfigAndAuthorInfo())) {
      disableUI();
      updateLiveStatus(
        i18n("log_config_load_error") ||
          "Failed to load critical config. Please try reloading.",
        "error",
      );
      return;
    }

    loadSettings(() => {
      setLanguage(state.currentLang);

      const folderName = `${i18n("job_folder_prefix") || "Project-"}${state.nextProjectCounter.toString().padStart(2, "0")}`;
      dom.jobDownloadFolderInput.value = folderName;

      updateUIAfterModeChange();
      updateQueueModal();
      attachEventListeners();
      attachGalleryListeners();
      initRefImages();
      updateButtonStates();
      updateInterfaceVisibility();
      attachChromeListeners();
    });
  } catch (error) {
    console.error("Initialization failed:", error);
    disableUI();
    const criticalMessage =
      i18n("log_init_fail_critical") ||
      "Interface initialization failed! Please reload.";
    try {
      if (dom.liveStatus) updateLiveStatus(criticalMessage, "CRITICAL");
    } catch (_statusError) {
      console.error(
        "Failed to update status during catch, liveStatus element might be missing.",
      );
    }
  }
});
