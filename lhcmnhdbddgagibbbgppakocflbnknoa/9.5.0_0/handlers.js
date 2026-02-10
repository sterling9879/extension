import { dom } from "./dom.js";
import { state } from "./state.js";
import {
  updateMainButton,
  updateLiveStatus,
  updateButtonStates,
  updateInterfaceVisibility,
  updateUIAfterModeChange,
  logMessage,
  updateQueueModal,
  updateFailedPromptsUI,
} from "./ui.js";
import { i18n } from "./i18n.js";
import { setLanguage } from "./language.js";
import {
  startQueue,
  resetState,
  skipToNextJob,
} from "./automation.js";
import { startScanner, stopScanner } from "./scanner.js";
import { sortImageFiles, readFileAsDataURL } from "./utils.js";
import {
  saveImage,
  clearAllImages,
  deleteImage,
  saveRefImage as saveRef,
  getAllRefImages as getRefImages,
  deleteRefImage as deleteRef,
  clearAllRefImages as clearRefs,
} from "./db.js";

function handleMainAction() {
  if (
    !dom.mainActionButton ||
    !dom.startNewProjectButton ||
    !dom.startCurrentProjectButton
  )
    return;

  const hasPending = state.masterQueue.some((e) => "pending" === e.status);

  if ((0 !== state.masterQueue.length && hasPending) || state.isRunning) {
    if (state.isRunning) {
      state.isPaused = !state.isPaused;
      updateMainButton();

      if (state.isPaused) {
        const currentIndex =
          (state.masterQueue[state.currentJobIndex] || { taskList: [] })
            .currentIndex || 0;
        updateLiveStatus(
          i18n("status_paused", { index: currentIndex + 1 }),
          "warn",
        );
        logMessage(i18n("log_paused"), "warn");
      } else {
        logMessage(i18n("log_resumed"), "info");
        updateLiveStatus(i18n("log_resumed"), "info");
      }
    } else {
      dom.mainActionButton.style.display = "none";
      dom.startNewProjectButton.style.display = "flex";
      dom.startCurrentProjectButton.style.display = "flex";
    }
  }
}

function startQueueWithMode(isCurrentProject) {
  if (
    !dom.mainActionButton ||
    !dom.startNewProjectButton ||
    !dom.startCurrentProjectButton
  )
    return;

  dom.mainActionButton.style.display = "flex";
  dom.startNewProjectButton.style.display = "none";
  dom.startCurrentProjectButton.style.display = "none";
  startQueue(isCurrentProject);
}

function handleStop() {
  if (state.isRunning || state.downloadInterval || state.finalScanTimerId) {
    state.stopRequested = true;
    state.isPaused = false;
    logMessage(i18n("log_stop_request"), "warn");

    if (state.finalScanTimerId) {
      clearInterval(state.finalScanTimerId);
      state.finalScanTimerId = null;
    }

    setTimeout(() => {
      resetState(i18n("reset_user_stop"), false);
    }, 100);
  }
}

function handleModeChange(e) {
  state.currentMode = e.target.value;
  chrome.storage.local.set({ mode: state.currentMode });
  updateUIAfterModeChange();
}

function handleImageUpload(e) {
  state.imageFileList = Array.from(e.target.files);
  const sortOrder = dom.imageSortSelector.value;
  sortImageFiles(sortOrder);
  dom.imageCount.textContent = state.imageFileList.length;
  dom.imageFileSummary.style.display = "block";

  const sortLabel =
    dom.imageSortSelector.options[dom.imageSortSelector.selectedIndex].text;
  logMessage(
    i18n("log_images_sorted", {
      count: state.imageFileList.length,
      order: sortLabel,
    }),
    "info",
  );
}

function handleSortChange(e) {
  const sortOrder = e.target.value;
  chrome.storage.local.set({ imageSort: sortOrder });
  sortImageFiles(sortOrder);

  const sortLabel =
    dom.imageSortSelector.options[dom.imageSortSelector.selectedIndex].text;
  logMessage(
    i18n("log_images_sorted", {
      count: state.imageFileList.length,
      order: sortLabel,
    }),
    "info",
  );
}

function handlePromptFileUpload(evt) {
  const file = evt.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      if (dom.promptsTextarea) {
        const existing = dom.promptsTextarea.value.trim();
        const newContent = loadEvt.target.result.trim();
        dom.promptsTextarea.value = existing
          ? `${existing}\n\n${newContent}`
          : newContent;
        chrome.storage.local.set({ prompts: dom.promptsTextarea.value });
      }
    };
    reader.onerror = (errEvt) =>
      logMessage(
        i18n("log_txt_read_error", { error: errEvt.target.error }),
        "error",
      );
    reader.readAsText(file);
  }
  evt.target.value = null;
}

async function navigateToFlow() {
  try {
    const tabs = await chrome.tabs.query({ url: "*://*/*tools/flow*" });
    let flowTab =
      tabs.find((tab) => tab.url?.includes("/project")) ||
      tabs.find((tab) => tab.url?.includes("/tools/flow"));

    if (flowTab) {
      await chrome.tabs.update(flowTab.id, { active: true });
      await chrome.windows.update(flowTab.windowId, { focused: true });
    } else {
      await chrome.tabs.create({
        url: "https://labs.google/fx/tools/flow",
      });
    }
  } catch (err) {
    logMessage(i18n("log_nav_to_flow_error"), "error");
  }
}

function copyFailedPrompts() {
  const text = state.failedPromptsList
    .sort((a, b) =>
      null != a.index && null != b.index
        ? a.index - b.index
        : null != a.index
          ? -1
          : null != b.index
            ? 1
            : 0,
    )
    .map((entry) =>
      null != entry.index ? `${entry.index}. ${entry.key}` : entry.key,
    )
    .join("\n\n");

  if (text) {
    try {
      navigator.clipboard.writeText(text).then(
        () => updateLiveStatus(i18n("status_copy_success"), "success"),
        () => updateLiveStatus(i18n("status_copy_fail"), "error"),
      );
    } catch (err) {
      updateLiveStatus(i18n("status_copy_fail"), "error");
    }
  }
}

function retryFailed() {
  if (state.failedPromptsList.length === 0) {
    logMessage("No failed prompts to retry", "warn");
    return;
  }
  if (state.isRunning) {
    logMessage("Cannot retry while running", "warn");
    return;
  }
  const failedPrompts = state.failedPromptsList
    .filter((f) => f.item && typeof f.item === "string")
    .map((f) => f.item);
  if (failedPrompts.length === 0) {
    logMessage("No text prompts to retry", "warn");
    return;
  }
  const mode = state.currentMode || "text-to-image";
  const downloadFolder =
    dom.jobDownloadFolderInput?.value?.trim() || "Retry-Failed";
  const repeatCount =
    mode === "text-to-image"
      ? dom.imageRepeatCountInput?.value || "4"
      : dom.repeatCountInput?.value || "4";
  const model =
    mode === "text-to-image"
      ? dom.imageModelSelector?.value || "nano_banana_pro"
      : dom.modelSelector?.value || "default";
  const aspectRatio = dom.aspectRatioSelector?.value || "landscape";
  const job = {
    id: Date.now().toString(),
    mode: mode,
    prompts: failedPrompts,
    images: [],
    downloadFolder: downloadFolder,
    repeatCount: repeatCount,
    model: model,
    aspectRatio: aspectRatio,
    startFrom: 1,
    status: "pending",
    progress: { completed: 0, total: failedPrompts.length },
    currentIndex: 0,
  };
  state.masterQueue.push(job);
  chrome.storage.local.set({ masterQueue: state.masterQueue });
  state.failedPromptsList = [];
  updateFailedPromptsUI();
  logMessage(
    `Queued ${failedPrompts.length} failed prompts for retry`,
    "success",
  );
  updateQueueModal();
}

export function handleTabRemoval(tabId) {
  if (
    tabId === state.flowTabId &&
    (state.isRunning || state.downloadInterval)
  ) {
    resetState(i18n("error_tab_closed"), false);
  }
}

function handleAutoDownloadChange() {
  chrome.storage.local.set({
    autoDownload: dom.autoDownloadCheckbox.checked,
  });

  if (
    !dom.autoDownloadCheckbox.checked &&
    state.downloadInterval &&
    !state.isRunning
  ) {
    stopScanner();
  }

  updateButtonStates();
}

async function addJobToQueue() {
  const mode = dom.modeSelector.value;
  let prompts = dom.promptsTextarea.value
    .trim()
    .split(/[\r\n]{2,}/)
    .filter((e) => e.trim());
  const imageFiles = [...state.imageFileList];

  if ("text-to-image" === mode) {
    state.imageToVideoPromptMap = {};
    prompts = prompts.map((p) => {
      if (p.includes("|||")) {
        const [img, vid] = p.split("|||").map((s) => s.trim());
        state.imageToVideoPromptMap[img] = vid;
        return img;
      }
      return p;
    });
    chrome.storage.local.set({
      imageToVideoPromptMap: state.imageToVideoPromptMap,
    });
  }

  let folderName = dom.jobDownloadFolderInput.value.trim();
  if (!folderName) {
    folderName = i18n("job_folder_default");
  }
  const downloadFolder = folderName;
  dom.jobDownloadFolderInput.value = downloadFolder;

  const repeatCount =
    "text-to-image" === mode
      ? dom.imageRepeatCountInput.value
      : dom.repeatCountInput.value;
  const modelValue =
    "text-to-image" === mode
      ? dom.imageModelSelector.value
      : dom.modelSelector.value;
  const aspectRatio = dom.aspectRatioSelector.value;
  const startFrom = parseInt(dom.startFromInput.value, 10) || 1;

  let savedImages = [];

  if (("text-to-video" === mode || "text-to-image" === mode) && 0 === prompts.length) {
    logMessage(i18n("log_queue_job_add_fail_prompt"), "error");
    updateLiveStatus(i18n("log_queue_job_add_fail_prompt"), "error");
    return;
  }

  if ("image-to-video" === mode) {
    if (0 === imageFiles.length) {
      logMessage(i18n("log_queue_job_add_fail_image"), "error");
      updateLiveStatus(i18n("log_queue_job_add_fail_image"), "error");
      return;
    }
    if (0 === prompts.length) {
      logMessage(i18n("log_queue_job_add_fail_prompt"), "error");
      updateLiveStatus(i18n("log_queue_job_add_fail_prompt"), "error");
      return;
    }
    try {
      for (const imageFile of imageFiles) {
        const saved = await saveImage(imageFile);
        savedImages.push(saved);
      }
    } catch (err) {
      logMessage(i18n("log_db_save_error", { error: err.message }), "error");
      updateLiveStatus(
        i18n("status_db_save_error", { error: err.message }),
        "error",
      );
      return;
    }
    if (0 === savedImages.length && imageFiles.length > 0) {
      logMessage(i18n("log_db_read_all_fail"), "error");
      updateLiveStatus(i18n("status_db_read_all_fail"), "error");
      return;
    }
  }

  // Build per-prompt ref image map (resolve prompt keys to indices)
  const refMap = {};
  if ("text-to-image" === mode && Object.keys(state.promptRefMap).length > 0) {
    prompts.forEach((prompt, idx) => {
      const key = prompt.trim().substring(0, 100);
      if (state.promptRefMap[key] && state.promptRefMap[key].length > 0) {
        refMap[idx] = state.promptRefMap[key];
      }
    });
  }

  const newJob = {
    id: Date.now().toString(),
    mode: mode,
    prompts: prompts,
    images: savedImages,
    downloadFolder: downloadFolder,
    repeatCount: repeatCount,
    model: modelValue,
    aspectRatio: aspectRatio,
    startFrom: startFrom,
    status: "pending",
    progress: {
      completed: 0,
      total: "image-to-video" === mode ? savedImages.length : prompts.length,
    },
    currentIndex: 0,
    refImageMap: refMap,
  };

  state.masterQueue.push(newJob);
  chrome.storage.local.set({ masterQueue: state.masterQueue });
  logMessage(
    i18n("log_queue_job_added", { count: state.masterQueue.length }),
    "success",
  );
  updateQueueModal();

  dom.promptsTextarea.value = "";
  state.imageFileList = [];
  dom.imageInput.value = null;
  dom.imageCount.textContent = "0";
  dom.imageFileSummary.style.display = "none";
  state.promptRefMap = {};
  chrome.storage.local.set({ prompts: "", promptRefMap: {} });

  if (assignModeActive) {
    toggleAssignMode();
  }

  state.nextProjectCounter++;
  chrome.storage.local.set({
    nextProjectCounter: state.nextProjectCounter,
  });

  const nextFolderName = `${i18n("job_folder_prefix") || "Project-"}${state.nextProjectCounter.toString().padStart(2, "0")}`;
  dom.jobDownloadFolderInput.value = nextFolderName;
}

function openQueueModal() {
  updateQueueModal();
  dom.queueModalOverlay.style.display = "flex";
}

function closeQueueModal() {
  dom.queueModalOverlay.style.display = "none";
}

function handleQueueFolderChange(e) {
  if (e.target.classList.contains("queue-folder-input")) {
    const jobId = e.target.dataset.jobId;
    const folderValue = e.target.value.trim();
    const job = state.masterQueue.find((item) => item.id === jobId);

    if (job && "pending" === job.status) {
      job.downloadFolder = folderValue;
      e.target.value = folderValue;
      chrome.storage.local.set({ masterQueue: state.masterQueue });
    }
  }
}

async function handleQueueAction(e) {
  // Handle expandable prompt list toggle
  const expandableDesc = e.target.closest("[data-expandable]");
  if (expandableDesc) {
    const jobId = expandableDesc.dataset.jobId;
    const expandDiv = dom.queueListDisplay.querySelector(
      `[data-expand-id="${jobId}"]`,
    );
    if (expandDiv) {
      const isOpen = expandDiv.classList.toggle("open");
      if (isOpen && !expandDiv.dataset.rendered) {
        renderExpandedPrompts(jobId, expandDiv);
        expandDiv.dataset.rendered = "true";
      }
    }
    return;
  }

  // Handle "Select All" in expanded prompts
  const selectAllBtn = e.target.closest(".btn-select-all-prompts");
  if (selectAllBtn) {
    const jobId = selectAllBtn.dataset.jobId;
    const expandDiv = dom.queueListDisplay.querySelector(
      `[data-expand-id="${jobId}"]`,
    );
    if (expandDiv) {
      const checkboxes = expandDiv.querySelectorAll(
        'input[type="checkbox"].prompt-check',
      );
      const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
      checkboxes.forEach((cb) => (cb.checked = !allChecked));
      updateRedoCount(jobId, expandDiv);
    }
    return;
  }

  // Handle "Redo Selected" button
  const redoBtn = e.target.closest(".btn-redo-selected");
  if (redoBtn) {
    const jobId = redoBtn.dataset.jobId;
    redoSelectedPrompts(jobId);
    return;
  }

  // Handle checkbox change in expanded prompts
  const promptCheck = e.target.closest(".prompt-check");
  if (promptCheck) {
    const jobId = promptCheck.dataset.jobId;
    const expandDiv = dom.queueListDisplay.querySelector(
      `[data-expand-id="${jobId}"]`,
    );
    if (expandDiv) updateRedoCount(jobId, expandDiv);
    return;
  }

  const resetBtn = e.target.closest(".queue-reset-job");
  if (resetBtn) {
    const jobId = resetBtn.closest("tr").dataset.jobId;
    const job = state.masterQueue.find((item) => item.id === jobId);

    if (job && "pending" !== job.status && "running" !== job.status) {
      job.status = "pending";
      job.progress.completed = 0;
      job.currentIndex = 0;
      chrome.storage.local.set({ masterQueue: state.masterQueue });
      updateQueueModal();
    }
    return;
  }

  const deleteBtn = e.target.closest(".queue-delete-job");
  if (deleteBtn) {
    const jobId = deleteBtn.closest("tr").dataset.jobId;
    const jobIndex = state.masterQueue.findIndex((item) => item.id === jobId);

    if (jobIndex > -1) {
      const job = state.masterQueue[jobIndex];

      if ("running" === job.status) {
        logMessage(i18n("log_queue_delete_fail_running"), "error");
        return;
      }

      if ("image-to-video" === job.mode && job.images) {
        try {
          for (const img of job.images) {
            await deleteImage(img.id);
          }
        } catch (err) {
          logMessage(
            i18n("log_db_delete_error", { error: err.message }),
            "error",
          );
        }
      }

      state.masterQueue.splice(jobIndex, 1);
      chrome.storage.local.set({ masterQueue: state.masterQueue });
      updateQueueModal();
      logMessage(
        i18n("log_queue_job_deleted", { index: jobIndex + 1 }),
        "warn",
      );
    }
  }
}

function renderExpandedPrompts(jobId, container) {
  const job = state.masterQueue.find((item) => item.id === jobId);
  if (!job || !job.prompts) return;

  let html = "";
  job.prompts.forEach((prompt, idx) => {
    const preview = prompt.length > 60 ? prompt.substring(0, 60) + "..." : prompt;
    html += `
      <div class="queue-prompt-row">
        <input type="checkbox" class="prompt-check" data-job-id="${jobId}" data-prompt-idx="${idx}">
        <span class="prompt-idx-label">${idx + 1}.</span>
        <span class="prompt-preview" title="${prompt.replace(/"/g, "&quot;")}">${preview}</span>
      </div>
    `;
  });

  html += `
    <div class="queue-prompt-actions">
      <button class="btn-select-all-prompts" data-job-id="${jobId}">Select All</button>
      <button class="btn-redo-selected" data-job-id="${jobId}" disabled>Redo Selected (0)</button>
    </div>
  `;

  container.innerHTML = html;
}

function updateRedoCount(jobId, container) {
  const checked = container.querySelectorAll(".prompt-check:checked");
  const redoBtn = container.querySelector(".btn-redo-selected");
  if (redoBtn) {
    redoBtn.disabled = checked.length === 0;
    redoBtn.textContent = `Redo Selected (${checked.length})`;
  }
}

function redoSelectedPrompts(jobId) {
  const job = state.masterQueue.find((item) => item.id === jobId);
  if (!job) return;

  const expandDiv = dom.queueListDisplay.querySelector(
    `[data-expand-id="${jobId}"]`,
  );
  if (!expandDiv) return;

  const checkedBoxes = expandDiv.querySelectorAll(".prompt-check:checked");
  if (checkedBoxes.length === 0) return;

  const selectedPrompts = [];
  const selectedImages = [];

  checkedBoxes.forEach((cb) => {
    const idx = parseInt(cb.dataset.promptIdx, 10);
    if (job.prompts[idx]) {
      selectedPrompts.push(job.prompts[idx]);
      // For image-to-video, also grab the corresponding image
      if ("image-to-video" === job.mode && job.images && job.images[idx]) {
        selectedImages.push(job.images[idx]);
      }
    }
  });

  if (selectedPrompts.length === 0) return;

  const newJob = {
    id: Date.now().toString(),
    mode: job.mode,
    prompts: selectedPrompts,
    images: "image-to-video" === job.mode ? selectedImages : [],
    downloadFolder: job.downloadFolder,
    repeatCount: job.repeatCount,
    model: job.model,
    aspectRatio: job.aspectRatio,
    startFrom: 1,
    status: "pending",
    progress: {
      completed: 0,
      total:
        "image-to-video" === job.mode
          ? selectedImages.length
          : selectedPrompts.length,
    },
    currentIndex: 0,
    refImageMap: {},
  };

  // Copy relevant refImageMap entries with reindexed keys
  if (job.refImageMap) {
    checkedBoxes.forEach((cb, newIdx) => {
      const origIdx = parseInt(cb.dataset.promptIdx, 10);
      if (job.refImageMap[origIdx]) {
        newJob.refImageMap[newIdx] = job.refImageMap[origIdx];
      }
    });
  }

  state.masterQueue.push(newJob);
  chrome.storage.local.set({ masterQueue: state.masterQueue });
  updateQueueModal();
  logMessage(
    `Redo: Added ${selectedPrompts.length} prompt(s) as new job #${state.masterQueue.length}`,
    "success",
  );
}

function handleClearQueue() {
  if (state.isRunning) return;
  if (dom.confirmClearQueueModal) {
    dom.confirmClearQueueModal.style.display = "flex";
  }
}

function handleResetAll() {
  if (state.isRunning) return;

  let anyReset = false;
  state.masterQueue.forEach((job) => {
    if ("done" === job.status || "failed" === job.status) {
      job.status = "pending";
      job.progress.completed = 0;
      job.currentIndex = 0;
      anyReset = true;
    }
  });

  if (anyReset) {
    chrome.storage.local.set({ masterQueue: state.masterQueue });
    updateQueueModal();
  }
}

function handleConfirmClear() {
  if (state.isRunning) return;

  if (dom.confirmClearQueueModal) {
    dom.confirmClearQueueModal.style.display = "none";
  }

  state.masterQueue = [];
  chrome.storage.local.set({ masterQueue: [] }, () => {
    clearAllImages().then(() => {
      logMessage(i18n("log_queue_cleared"), "warn");
      updateQueueModal();
    });
  });
}

function handleCancelClear() {
  if (dom.confirmClearQueueModal) {
    dom.confirmClearQueueModal.style.display = "none";
  }
}

let selectedRefIds = new Set();
let assignModeActive = false;
let promptSaveTimer = null;

// Collapsible sections
function initCollapsibles() {
  document.querySelectorAll(".section-header.collapsible").forEach((header) => {
    header.addEventListener("click", (ev) => {
      // Don't collapse if clicking a button inside the header
      if (ev.target.closest("button")) return;
      const targetId = header.dataset.target;
      const content = document.getElementById(targetId);
      if (!content) return;
      header.classList.toggle("collapsed");
      content.classList.toggle("collapsed");
    });
  });
}

// Per-prompt ref assignment
function renderPromptAssignList() {
  if (!dom.promptAssignList) return;
  const textarea = dom.promptsTextarea;
  if (!textarea) return;
  const prompts = textarea.value
    .trim()
    .split(/[\r\n]{2,}/)
    .filter((p) => p.trim());
  const refImages = state.selectedRefImages || [];
  if (prompts.length === 0 || refImages.length === 0) {
    dom.promptAssignList.innerHTML =
      '<p style="color: var(--text-secondary); font-size: 11px; text-align: center; padding: 12px;">Need prompts and active reference images</p><div class="assign-footer"><span id="assignStatus">0 custom assignments</span><button id="assignDoneBtn" onclick="">Done</button></div>';
    return;
  }
  let html = "";
  prompts.forEach((prompt, idx) => {
    const promptKey = prompt.trim().substring(0, 100);
    const assigned = state.promptRefMap[promptKey] || [];
    html += `<div class="prompt-assign-row" data-prompt-idx="${idx}" data-prompt-key="${promptKey.replace(/"/g, "&quot;")}">`;
    html += `<span class="prompt-idx">${idx + 1}.</span>`;
    html += `<span class="prompt-text" title="${prompt.trim().replace(/"/g, "&quot;")}">${prompt.trim().substring(0, 60)}${prompt.trim().length > 60 ? "..." : ""}</span>`;
    refImages.forEach((img) => {
      const isAssigned = assigned.includes(img.id);
      html += `<img class="ref-thumb-toggle ${isAssigned ? "assigned" : ""}" src="${img.dataUrl}" data-ref-id="${img.id}" data-prompt-key="${promptKey.replace(/"/g, "&quot;")}" alt="${img.name || "ref"}" loading="lazy">`;
    });
    html += `</div>`;
  });
  // Count assignments
  const assignCount = Object.keys(state.promptRefMap).filter(
    (k) => state.promptRefMap[k] && state.promptRefMap[k].length > 0,
  ).length;
  html += `<div class="assign-footer"><span id="assignStatus">${assignCount} custom assignment${assignCount !== 1 ? "s" : ""}</span><button id="assignDoneBtn">Done</button></div>`;
  dom.promptAssignList.innerHTML = html;
  // Wire click handlers
  dom.promptAssignList
    .querySelectorAll(".ref-thumb-toggle")
    .forEach((thumb) => {
      thumb.addEventListener("click", () => {
        const refId = thumb.dataset.refId;
        const promptKey = thumb.dataset.promptKey;
        if (!state.promptRefMap[promptKey]) state.promptRefMap[promptKey] = [];
        const arr = state.promptRefMap[promptKey];
        const idx = arr.indexOf(refId);
        if (idx > -1) {
          arr.splice(idx, 1);
        } else {
          arr.push(refId);
        }
        if (arr.length === 0) delete state.promptRefMap[promptKey];
        chrome.storage.local.set({ promptRefMap: state.promptRefMap });
        renderPromptAssignList();
        updateAssignHint();
      });
    });
  // Wire done button
  const doneBtn = dom.promptAssignList.querySelector("#assignDoneBtn");
  if (doneBtn) doneBtn.addEventListener("click", toggleAssignMode);
}

function toggleAssignMode() {
  assignModeActive = !assignModeActive;
  if (assignModeActive) {
    renderPromptAssignList();
    dom.promptAssignList.style.display = "block";
    dom.promptsTextarea.style.display = "none";
    if (dom.assignRefsBtn) {
      dom.assignRefsBtn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 14px;">edit_note</span> Edit Prompts';
    }
  } else {
    dom.promptAssignList.style.display = "none";
    dom.promptsTextarea.style.display = "";
    if (dom.assignRefsBtn) {
      dom.assignRefsBtn.innerHTML =
        '<span class="material-symbols-outlined" style="font-size: 14px;">assignment</span> Assign to Prompts';
    }
  }
}

function updateAssignHint() {
  const hint = dom.refAssignHint;
  if (!hint) return;
  const assignCount = Object.keys(state.promptRefMap).filter(
    (k) => state.promptRefMap[k] && state.promptRefMap[k].length > 0,
  ).length;
  if (assignCount > 0) {
    hint.textContent = `${assignCount} prompt${assignCount !== 1 ? "s" : ""} with custom refs`;
    hint.style.color = "var(--primary-color)";
  } else {
    hint.textContent = "Will be used for all prompts";
    hint.style.color = "var(--text-secondary)";
  }
}

function showAssignButton() {
  if (!dom.assignRefsBtn) return;
  const hasRefs = (state.selectedRefImages || []).length > 0;
  dom.assignRefsBtn.style.display = hasRefs ? "flex" : "none";
}

function updateRefUI() {
  const warningEl = document.getElementById("noRefWarning");
  const countEl = document.getElementById("refActiveCount");
  const previewsEl = document.getElementById("selectedRefPreviews");

  if (selectedRefIds.size === 0) {
    if (dom.selectedRefImage) dom.selectedRefImage.style.display = "none";
    // Show warning only if there are images but none selected
    getRefImages().then((images) => {
      if (warningEl)
        warningEl.style.display = images.length > 0 ? "block" : "none";
    });
  } else {
    if (warningEl) warningEl.style.display = "none";
    if (dom.selectedRefImage) dom.selectedRefImage.style.display = "block";
    if (countEl) countEl.textContent = selectedRefIds.size;
    // Update preview thumbnails
    if (previewsEl) {
      previewsEl.innerHTML = Array.from(state.selectedRefImages || [])
        .map(
          (img) =>
            `<img src="${img.dataUrl}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; border: 2px solid var(--success-color);" loading="lazy">`,
        )
        .join("");
    }
    showAssignButton();
    updateAssignHint();
  }
}

async function loadRefImagesGrid() {
  if (!dom.refImagesGrid) return;
  try {
    const images = await getRefImages();
    const countEl = document.getElementById("refImageCount");
    if (countEl) countEl.textContent = `(${images.length} saved)`;
    if (images.length === 0) {
      dom.refImagesGrid.innerHTML = `<p style="color: var(--text-secondary); font-size: 11px; margin: 0;">${i18n("ref_empty_message")}</p>`;
      if (dom.selectedRefImage) dom.selectedRefImage.style.display = "none";
      const noRefWarningEl = document.getElementById("noRefWarning");
      if (noRefWarningEl?.style) {
        noRefWarningEl.style.display = "none";
      }
      return;
    }
    dom.refImagesGrid.innerHTML = images
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(
        (img) => `
      <div class="ref-img-item" data-id="${img.id}" title="${img.name || "Reference image"}" style="position: relative; width: 64px; height: 64px; border-radius: 5px; overflow: hidden; cursor: pointer; border: 2px solid ${selectedRefIds.has(img.id) ? "var(--success-color)" : "transparent"}; ${selectedRefIds.has(img.id) ? "box-shadow: 0 0 8px rgba(129,201,149,0.5);" : ""}">
        <img src="${img.dataUrl}" alt="${img.name}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
        ${selectedRefIds.has(img.id) ? '<div style="position: absolute; bottom: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--success-color); display: flex; align-items: center; justify-content: center;"><span style="color: #202124; font-size: 10px; font-weight: bold;">✓</span></div>' : ""}
        <button class="ref-img-delete" data-id="${img.id}" style="position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; background: rgba(244,67,54,0.9); border: none; color: white; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">×</button>
      </div>
    `,
      )
      .join("");
    updateRefUI();
    dom.refImagesGrid.querySelectorAll(".ref-img-item").forEach((item) => {
      item.addEventListener("click", (ev) => {
        if (ev.target.classList.contains("ref-img-delete")) return;
        const id = item.dataset.id;
        const img = item.querySelector("img");
        const imgData = { id, dataUrl: img.src, name: img.alt };
        // Toggle selection
        if (selectedRefIds.has(id)) {
          selectedRefIds.delete(id);
          state.selectedRefImages = (state.selectedRefImages || []).filter(
            (x) => x.id !== id,
          );
        } else {
          selectedRefIds.add(id);
          state.selectedRefImages = state.selectedRefImages || [];
          state.selectedRefImages.push(imgData);
        }
        // Also set single selectedRefImage for backwards compatibility (use first selected)
        if (selectedRefIds.size > 0) {
          state.selectedRefImage = state.selectedRefImages[0];
        } else {
          state.selectedRefImage = null;
        }
        chrome.storage.local.set({
          selectedRefImages: state.selectedRefImages,
          selectedRefImage: state.selectedRefImage,
        });
        loadRefImagesGrid();
        logMessage(
          selectedRefIds.has(id)
            ? "Reference image activated"
            : "Reference image deactivated",
          "info",
        );
      });
    });
    dom.refImagesGrid.querySelectorAll(".ref-img-delete").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const id = btn.dataset.id;
        await deleteRef(id);
        if (selectedRefIds.has(id)) {
          selectedRefIds.delete(id);
          state.selectedRefImages = (state.selectedRefImages || []).filter(
            (x) => x.id !== id,
          );
          state.selectedRefImage =
            state.selectedRefImages?.length > 0
              ? state.selectedRefImages[0]
              : null;
          chrome.storage.local.set({
            selectedRefImages: state.selectedRefImages,
            selectedRefImage: state.selectedRefImage,
          });
        }
        loadRefImagesGrid();
        logMessage(
          i18n("log_ref_image_deleted") || "Reference image deleted",
          "warn",
        );
      });
    });
  } catch (err) {
    console.error("Error loading ref images:", err);
  }
}

async function handleRefImageUpload(ev) {
  const files = ev.target.files;
  if (!files || files.length === 0) return;
  for (const file of files) {
    try {
      await saveRef(file);
    } catch (err) {
      console.error("Error saving ref image:", err);
    }
  }
  ev.target.value = null;
  loadRefImagesGrid();
  logMessage(
    i18n("log_ref_images_uploaded") ||
    `Uploaded ${files.length} image(s) - click to activate`,
    "success",
  );
}

async function handleClearAllRefImages() {
  await clearRefs();
  selectedRefId = null;
  state.selectedRefImage = null;
  chrome.storage.local.remove("selectedRefImage");
  if (dom.selectedRefImage) dom.selectedRefImage.style.display = "none";
  loadRefImagesGrid();
  logMessage(
    i18n("log_ref_images_cleared") || "All reference images cleared",
    "warn",
  );
}

function handleClearSelectedRef() {
  selectedRefIds.clear();
  state.selectedRefImage = null;
  state.selectedRefImages = [];
  state.promptRefMap = {};
  chrome.storage.local.remove(["selectedRefImage", "selectedRefImages"]);
  chrome.storage.local.set({ promptRefMap: {} });
  if (dom.selectedRefImage) dom.selectedRefImage.style.display = "none";
  if (assignModeActive) toggleAssignMode();
  showAssignButton();
  loadRefImagesGrid();
  logMessage(i18n("log_ref_cleared") || "All references cleared", "info");
}

export function initRefImages() {
  chrome.storage.local.get(
    ["selectedRefImage", "selectedRefImages", "promptRefMap"],
    (data) => {
      if (data.promptRefMap) state.promptRefMap = data.promptRefMap;
      if (data.selectedRefImages && data.selectedRefImages.length > 0) {
        state.selectedRefImages = data.selectedRefImages;
        state.selectedRefImage = data.selectedRefImages[0];
        selectedRefIds = new Set(data.selectedRefImages.map((x) => x.id));
      } else if (data.selectedRefImage) {
        // Backwards compatibility
        state.selectedRefImage = data.selectedRefImage;
        state.selectedRefImages = [data.selectedRefImage];
        selectedRefIds = new Set([data.selectedRefImage.id]);
      }
      loadRefImagesGrid();
    },
  );
}

export function attachEventListeners() {
  try {
    document.querySelectorAll(".tab-button").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        const tabName = tabBtn.getAttribute("data-tab");
        document
          .querySelectorAll(".tab-button.active")
          .forEach((el) => el.classList.remove("active"));
        document
          .querySelectorAll(".tab-pane.active")
          .forEach((el) => el.classList.remove("active"));
        tabBtn.classList.add("active");
        document.getElementById(`content-${tabName}`)?.classList.add("active");
      });
    });

    initCollapsibles();

    dom.mainActionButton.addEventListener("click", handleMainAction);
    dom.startNewProjectButton.addEventListener("click", () =>
      startQueueWithMode(false),
    );
    dom.startCurrentProjectButton.addEventListener("click", () =>
      startQueueWithMode(true),
    );
    dom.stopButton.addEventListener("click", handleStop);

    if (dom.skipJobButton) {
      dom.skipJobButton.addEventListener("click", skipToNextJob);
    }

    dom.promptsTextarea.addEventListener("input", () => {
      clearTimeout(promptSaveTimer);
      promptSaveTimer = setTimeout(
        () => chrome.storage.local.set({ prompts: dom.promptsTextarea.value }),
        500,
      );
    });

    dom.startFromInput.addEventListener("input", () =>
      chrome.storage.local.set({ startFrom: dom.startFromInput.value }),
    );

    dom.repeatCountInput.addEventListener("change", (e) =>
      chrome.storage.local.set({ videoCount: e.target.value }),
    );

    dom.minInitialWaitTimeInput.addEventListener("input", () =>
      chrome.storage.local.set({
        minInitialWait: dom.minInitialWaitTimeInput.value,
      }),
    );

    dom.maxInitialWaitTimeInput.addEventListener("input", () =>
      chrome.storage.local.set({
        maxInitialWait: dom.maxInitialWaitTimeInput.value,
      }),
    );

    dom.languageSelector.addEventListener("change", (e) =>
      setLanguage(e.target.value),
    );

    dom.autoDownloadCheckbox.addEventListener(
      "change",
      handleAutoDownloadChange,
    );

    if (dom.videoDownloadResolution) {
      dom.videoDownloadResolution.addEventListener("change", (e) => {
        state.videoDownloadResolution = e.target.value;
        chrome.storage.local.set({
          videoDownloadResolution: e.target.value,
        });
      });
    }

    dom.modeSelector.addEventListener("change", handleModeChange);

    dom.aspectRatioSelector.addEventListener("change", (e) =>
      chrome.storage.local.set({ aspectRatio: e.target.value }),
    );

    dom.modelSelector.addEventListener("change", (e) =>
      chrome.storage.local.set({ model: e.target.value }),
    );

    dom.imageRepeatCountInput.addEventListener("change", (e) =>
      chrome.storage.local.set({ imageRepeatCount: e.target.value }),
    );

    dom.imageModelSelector.addEventListener("change", (e) =>
      chrome.storage.local.set({ imageModel: e.target.value }),
    );

    dom.uploadImageButton.addEventListener("click", () =>
      dom.imageInput.click(),
    );
    dom.imageInput.addEventListener("change", handleImageUpload);
    dom.imageSortSelector.addEventListener("change", handleSortChange);
    dom.uploadPromptButton.addEventListener("click", () =>
      dom.fileInput.click(),
    );
    dom.fileInput.addEventListener("change", handlePromptFileUpload);
    dom.navigateToFlowButton.addEventListener("click", navigateToFlow);
    dom.copyFailedButton.addEventListener("click", copyFailedPrompts);

    if (dom.retryFailedButton) {
      dom.retryFailedButton.addEventListener("click", retryFailed);
    }

    dom.openDownloadsSettingsLink.addEventListener("click", (e) => {
      e.preventDefault();
      try {
        chrome.runtime.sendMessage({ type: "openDownloadsSettings" });
      } catch (err) {
        logMessage(i18n("log_open_settings_fail"), "error");
      }
    });

    dom.addToQueueButton.addEventListener("click", addJobToQueue);
    dom.openQueueButton.addEventListener("click", openQueueModal);
    dom.clearQueueButton.addEventListener("click", handleClearQueue);
    dom.closeQueueModal.addEventListener("click", closeQueueModal);
    dom.queueListDisplay.addEventListener("click", handleQueueAction);
    dom.confirmClearQueueButton.addEventListener("click", handleConfirmClear);
    dom.cancelClearQueueButton.addEventListener("click", handleCancelClear);
    dom.queueResetAllButton.addEventListener("click", handleResetAll);
    dom.queueDeleteAllButton.addEventListener("click", handleClearQueue);

    if (dom.autoDownloadImagesCheckbox) {
      dom.autoDownloadImagesCheckbox.addEventListener("change", () =>
        chrome.storage.local.set({
          autoDownloadImages: dom.autoDownloadImagesCheckbox.checked,
        }),
      );
    }

    if (dom.imageAutoDownloadResolution) {
      dom.imageAutoDownloadResolution.addEventListener("change", (e) => {
        state.imageAutoDownloadResolution = e.target.value;
        chrome.storage.local.set({
          imageAutoDownloadResolution: e.target.value,
        });
      });
    }

    if (dom.uploadRefImageBtn) {
      dom.uploadRefImageBtn.addEventListener(
        "click",
        () => dom.refImageInput && dom.refImageInput.click(),
      );
    }

    if (dom.refImageInput) {
      dom.refImageInput.addEventListener("change", handleRefImageUpload);
    }

    if (dom.clearRefImagesBtn) {
      dom.clearRefImagesBtn.addEventListener("click", handleClearAllRefImages);
    }

    if (dom.clearSelectedRef) {
      dom.clearSelectedRef.addEventListener("click", handleClearSelectedRef);
    }

    if (dom.assignRefsBtn) {
      dom.assignRefsBtn.addEventListener("click", toggleAssignMode);
    }

    // Auto-start next job toggle
    if (dom.autoStartNextJob) {
      dom.autoStartNextJob.addEventListener("change", () => {
        state.autoStartNextJob = dom.autoStartNextJob.checked;
        chrome.storage.local.set({ autoStartNextJob: state.autoStartNextJob });
      });
    }

    // Merge queue modal
    if (dom.cancelMergeBtn) {
      dom.cancelMergeBtn.addEventListener("click", closeMergeModal);
    }
    if (dom.newJobInsteadBtn) {
      dom.newJobInsteadBtn.addEventListener("click", () => {
        closeMergeModal();
        // Trigger normal add-to-queue flow via pending merge data
        if (state._pendingMergeData) {
          executeMergeAsNewJob(state._pendingMergeData);
          state._pendingMergeData = null;
        }
      });
    }
    if (dom.mergeJobList) {
      dom.mergeJobList.addEventListener("click", handleMergeJobSelect);
    }

    // Tutorial
    if (dom.tutorialBtn) {
      dom.tutorialBtn.addEventListener("click", startTutorial);
    }
    if (dom.tutorialNextBtn) {
      dom.tutorialNextBtn.addEventListener("click", nextTutorialStep);
    }
    if (dom.tutorialSkipBtn) {
      dom.tutorialSkipBtn.addEventListener("click", endTutorial);
    }
    if (dom.tutorialOverlay) {
      dom.tutorialOverlay.addEventListener("click", (e) => {
        if (e.target === dom.tutorialOverlay) endTutorial();
      });
    }
    const tutorialCloseX = document.getElementById("tutorialCloseX");
    if (tutorialCloseX) {
      tutorialCloseX.addEventListener("click", endTutorial);
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dom.tutorialOverlay?.classList.contains("active")) {
        endTutorial();
      }
    });

    // Also listen for checkbox changes inside queue expand areas
    if (dom.queueListDisplay) {
      dom.queueListDisplay.addEventListener("change", (e) => {
        if (e.target.classList.contains("prompt-check")) {
          const jobId = e.target.dataset.jobId;
          const expandDiv = dom.queueListDisplay.querySelector(
            `[data-expand-id="${jobId}"]`,
          );
          if (expandDiv) updateRedoCount(jobId, expandDiv);
        }
        // Also handle folder changes (existing)
        handleQueueFolderChange(e);
      });
    }
  } catch (err) {
    logMessage(
      i18n("log_event_listener_error", { error: err.message }),
      "error",
    );
  }
}

// ==================== MERGE QUEUE ====================

function closeMergeModal() {
  if (dom.mergeQueueModal) {
    dom.mergeQueueModal.classList.remove("active");
  }
  state._pendingMergeData = null;
}

export function openMergeModal(pendingData) {
  state._pendingMergeData = pendingData;

  // Find pending image-to-video jobs to merge into
  const pendingJobs = state.masterQueue.filter(
    (job) => "pending" === job.status && "image-to-video" === job.mode,
  );

  if (!dom.mergeJobList || !dom.mergeQueueModal) return;

  if (pendingJobs.length === 0) {
    // No merge targets - just create new job directly
    executeMergeAsNewJob(pendingData);
    return;
  }

  dom.mergeJobList.innerHTML = "";
  pendingJobs.forEach((job) => {
    const div = document.createElement("div");
    div.className = "merge-job-option";
    div.dataset.jobId = job.id;
    div.innerHTML = `
      <span class="material-symbols-outlined" style="color: var(--primary-color);">queue</span>
      <div class="merge-job-info">
        <div class="merge-job-name">${job.downloadFolder}</div>
        <div class="merge-job-detail">${job.prompts.length} prompts, ${job.images.length} images</div>
      </div>
    `;
    dom.mergeJobList.appendChild(div);
  });

  dom.mergeQueueModal.classList.add("active");
}

function handleMergeJobSelect(e) {
  const option = e.target.closest(".merge-job-option");
  if (!option || !state._pendingMergeData) return;

  const targetJobId = option.dataset.jobId;
  const targetJob = state.masterQueue.find((job) => job.id === targetJobId);
  if (!targetJob) return;

  const mergeData = state._pendingMergeData;

  // Append prompts and images to the existing job
  targetJob.prompts.push(...mergeData.prompts);
  targetJob.images.push(...mergeData.images);

  // Sort all prompts + images together alphabetically by prompt text
  const paired = targetJob.prompts.map((p, i) => ({ prompt: p, image: targetJob.images[i] }));
  paired.sort((a, b) => a.prompt.localeCompare(b.prompt));
  targetJob.prompts = paired.map((p) => p.prompt);
  targetJob.images = paired.map((p) => p.image);

  targetJob.progress.total = targetJob.images.length;

  chrome.storage.local.set({ masterQueue: state.masterQueue });
  updateQueueModal();
  logMessage(
    `Merged ${mergeData.images.length} item(s) into "${targetJob.downloadFolder}"`,
    "success",
  );

  closeMergeModal();
}

export function executeMergeAsNewJob(mergeData) {
  const downloadFolder =
    dom.jobDownloadFolderInput?.value || "Flow-Video";
  const model = dom.modelSelector?.value || "default";
  const aspectRatio = dom.aspectRatioSelector?.value || "landscape";
  const repeatCount = dom.repeatCountInput?.value || "4";

  const job = {
    id: Date.now().toString(),
    mode: "image-to-video",
    prompts: mergeData.prompts,
    images: mergeData.images,
    downloadFolder: downloadFolder,
    repeatCount: repeatCount,
    model: model,
    aspectRatio: aspectRatio,
    startFrom: 1,
    status: "pending",
    progress: { completed: 0, total: mergeData.images.length },
    currentIndex: 0,
  };

  state.masterQueue.push(job);
  chrome.storage.local.set({ masterQueue: state.masterQueue });
  updateQueueModal();
  logMessage(
    `Added ${mergeData.images.length} video(s) to queue as new job.`,
    "success",
  );
}

export function attachChromeListeners() {
  chrome.tabs.onActivated.addListener(updateInterfaceVisibility);

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
      if (
        activeTabs?.length > 0 &&
        tabId === activeTabs[0].id &&
        (changeInfo.status || changeInfo.url)
      ) {
        updateInterfaceVisibility();
      }
    });
  });

  chrome.tabs.onRemoved.addListener(handleTabRemoval);
}

// ─── Tutorial system ───

const tutorialSteps = [
  {
    target: "#modeSelector",
    tab: "control",
    title: "1. Creation Mode",
    text: "Choose your workflow:\n• Text-to-Video — prompts → Veo videos\n• Image-to-Video — upload images + prompts → Veo videos\n• Nano Banana Pro — prompts → AI images (1K/2K/4K)",
  },
  {
    target: "#prompts",
    tab: "control",
    title: "2. Prompt List",
    text: 'Enter one prompt per line. Use [V1-S1] tags to organize scenes.\n\nFor Frame-to-Video, use ||| to link image + video prompts:\n[V1-S1] Pancakes on a griddle ||| Butter melts, steam rises\n\nCopy this format and use an LLM to generate your own!',
    action: "paste_example",
  },
  {
    target: "#refImagesContent",
    tab: "control",
    title: "3. Reference Images",
    text: 'Upload reference images to guide generation. Click an image to activate it. Use "Assign to Prompts" to give different refs to different prompts.',
  },
  {
    target: "#addToQueueButton",
    tab: "control",
    title: "4. Add to Queue",
    text: "Click to add your prompts as a job. You can add multiple jobs with different settings before starting. Each job gets its own download folder.",
  },
  {
    target: "#openQueueButton",
    tab: "control",
    title: "5. Queue Manager",
    text: "View all queued jobs. Click any completed job to expand it and see every prompt. Check the ones that didn't work → hit Redo to regenerate just those. Use Merge to combine Frame-to-Video items into an existing job.",
  },
  {
    target: "#autoStartNextJob",
    tab: "control",
    title: "6. Auto-Start Toggle",
    text: "When ON, the next job starts automatically after the current one finishes. Turn OFF if you want to review results between jobs before continuing.",
  },
  {
    target: "#mainActionButton",
    tab: "control",
    title: "7. Start / Stop",
    text: "Hit Start to begin processing the queue. The extension automates Flow — pasting prompts, clicking generate, and downloading results. Hit Stop anytime to pause.",
  },
  {
    target: '[data-tab="gallery"]',
    title: "8. Gallery Tab",
    text: "After images generate, click Refresh here. It scrolls through the entire Flow page to find ALL your images (even 100+). Select your favorites, then download at 1K/2K/4K or send to Frame-to-Video.",
  },
  {
    target: "#refreshGalleryBtn",
    tab: "gallery",
    title: "9. Refresh Gallery",
    text: "Click Refresh to scan all images. The scanner scrolls through Flow's page automatically to beat lazy loading — it finds every image even if you have 100+.",
  },
  {
    target: "#downloadSelectedBtn",
    tab: "gallery",
    title: "10. Download & Frame-to-Video",
    text: 'Select images by clicking them (checkmark appears). Then:\n• "Download" — saves at your chosen resolution (1K/2K/4K)\n• "Frame to Video" — creates a new video job from selected images\n• "Merge" — adds images to an existing video job (auto-sorted alphabetically)',
  },
  {
    target: '[data-tab="settings"]',
    title: "11. Settings Tab",
    text: "Configure everything: model selection, aspect ratio, repeat count, auto-download resolution for images and videos, timing delays, and language (8 languages supported).",
  },
  {
    target: '[data-tab="history"]',
    title: "12. Logs Tab",
    text: "Real-time log of everything happening — downloads, errors, scan results. Check here if something seems off.",
  },
];

let currentTutorialStep = 0;

function switchToTab(tabName) {
  const tabBtn = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
  if (tabBtn && !tabBtn.classList.contains("active")) {
    tabBtn.click();
  }
}

function startTutorial() {
  currentTutorialStep = 0;
  dom.tutorialOverlay.classList.add("active");
  showTutorialStep();
}

function endTutorial() {
  dom.tutorialOverlay.classList.remove("active");
  currentTutorialStep = 0;
}

function nextTutorialStep() {
  currentTutorialStep++;
  if (currentTutorialStep >= tutorialSteps.length) {
    endTutorial();
    return;
  }
  showTutorialStep();
}

function showTutorialStep() {
  const step = tutorialSteps[currentTutorialStep];
  if (!step) { endTutorial(); return; }

  // Switch to the correct tab first if needed
  if (step.tab) {
    switchToTab(step.tab);
  }

  // Small delay to let tab switch render, then position
  setTimeout(() => {
    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
      currentTutorialStep++;
      if (currentTutorialStep < tutorialSteps.length) {
        showTutorialStep();
      } else {
        endTutorial();
      }
      return;
    }

    // Scroll inside the tab-content container
    const scrollContainer = document.querySelector(".tab-content");
    if (scrollContainer && scrollContainer.contains(targetEl)) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Wait for scroll to settle
    setTimeout(() => {
      const rect = targetEl.getBoundingClientRect();

      // Safety: if element is hidden/zero-size, skip
      if (rect.width === 0 && rect.height === 0) {
        currentTutorialStep++;
        if (currentTutorialStep < tutorialSteps.length) {
          showTutorialStep();
        } else {
          endTutorial();
        }
        return;
      }

      // Update content
      dom.tutorialTitle.textContent = step.title;
      dom.tutorialText.textContent = step.text;
      dom.tutorialStepCount.textContent = `${currentTutorialStep + 1} / ${tutorialSteps.length}`;
      dom.tutorialNextBtn.textContent = currentTutorialStep === tutorialSteps.length - 1 ? "Done" : "Next";

      // Paste example prompt if this step has the action
      if (step.action === "paste_example" && dom.prompts && !dom.prompts.value.trim()) {
        dom.prompts.value = "[V1-S1] Pancakes on a griddle, golden brown, butter pat melting ||| Butter melts slowly across golden surface, steam rises, camera pushes in";
      }

      // Position spotlight
      const pad = 6;
      dom.tutorialSpotlight.style.top = (rect.top - pad) + "px";
      dom.tutorialSpotlight.style.left = (rect.left - pad) + "px";
      dom.tutorialSpotlight.style.width = (rect.width + pad * 2) + "px";
      dom.tutorialSpotlight.style.height = (rect.height + pad * 2) + "px";

      // Position tooltip
      const tooltip = dom.tutorialTooltip;
      const tooltipHeight = 160;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      let topPos;
      if (spaceBelow > tooltipHeight + 20) {
        topPos = rect.bottom + 12;
      } else if (spaceAbove > tooltipHeight + 20) {
        topPos = rect.top - tooltipHeight - 12;
      } else {
        topPos = Math.max(10, (window.innerHeight - tooltipHeight) / 2);
      }

      topPos = Math.max(10, Math.min(topPos, window.innerHeight - tooltipHeight - 10));
      tooltip.style.top = topPos + "px";
      tooltip.style.bottom = "auto";

      let leftPos = rect.left + rect.width / 2 - 160;
      leftPos = Math.max(10, Math.min(leftPos, window.innerWidth - 330));
      tooltip.style.left = leftPos + "px";
    }, 300);
  }, 100);
}
