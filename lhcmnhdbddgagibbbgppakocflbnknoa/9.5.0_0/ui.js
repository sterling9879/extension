import { dom } from "./dom.js";
import { state } from "./state.js";
import { i18n } from "./i18n.js";

export function renderToolsList() {
  if (
    !state.fetchedToolsList ||
    0 === state.fetchedToolsList.length ||
    !state.currentLang
  ) {
    return;
  }
  if (!dom.toolListContainer) return;

  let html = "";
  for (const tool of state.fetchedToolsList) {
    const title =
      (tool.title && tool.title[state.currentLang]) ||
      (tool.title && tool.title.en) ||
      "No Title";
    const description =
      (tool.description && tool.description[state.currentLang]) ||
      (tool.description && tool.description.en) ||
      "";
    html += `
          <a href="${tool.url}" target="_blank" rel="noopener noreferrer" class="tool-card">
            <span class="material-symbols-outlined tool-card-icon">${tool.icon || "extension"}</span>
            <div class="tool-card-content">
              <h4 class="tool-card-title">${title}</h4>
              <p class="tool-card-desc">${description}</p>
            </div>
          </a>
        `;
  }
  dom.toolListContainer.innerHTML = html;
}

export async function updateInterfaceVisibility() {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = activeTab?.url || "";
    const isFlowPage =
      url.startsWith("https://labs.google/fx/") ||
      url.startsWith("https://veo.genaipro.vn/fx/");

    dom.mainInterface.style.display = isFlowPage ? "flex" : "none";
    dom.wrongPageInterface.style.display = isFlowPage ? "none" : "flex";
    if (dom.wrongPageMessageElement && !isFlowPage) {
      dom.wrongPageMessageElement.innerHTML = i18n("wrong_page_message");
    }
  } catch (err) {
    dom.mainInterface.style.display = "none";
    dom.wrongPageInterface.style.display = "flex";
    if (dom.wrongPageMessageElement) {
      dom.wrongPageMessageElement.innerHTML = i18n("wrong_page_message");
    }
  }
}

export function updateButtonStates() {
  const isBusy =
    state.isRunning || !!state.downloadInterval || !!state.finalScanTimerId;
  const hasPending = state.masterQueue.some(
    (job) => "pending" === job.status,
  );

  dom.mainActionButton.disabled =
    (!state.isRunning && !!state.finalScanTimerId) ||
    (0 === state.masterQueue.length && !state.isRunning) ||
    (!hasPending && !state.isRunning);

  updateMainButton();

  dom.stopButton.disabled = !isBusy;

  if (dom.skipJobButton) {
    dom.skipJobButton.disabled = !state.isRunning && !state.finalScanTimerId;
  }

  dom.clearQueueButton.disabled = isBusy || 0 === state.masterQueue.length;

  if (dom.queueResetAllButton) {
    const hasFinished = state.masterQueue.some(
      (job) => "done" === job.status || "failed" === job.status,
    );
    dom.queueResetAllButton.disabled = isBusy || !hasFinished;
  }

  if (dom.queueDeleteAllButton) {
    dom.queueDeleteAllButton.disabled =
      isBusy || 0 === state.masterQueue.length;
  }

  if (!state.isRunning) {
    updateUIAfterModeChange();
  }
}

export function updateMainButton() {
  const iconEl = dom.mainActionButton.querySelector(
    ".material-symbols-outlined",
  );
  const labelEl = dom.mainActionButton.querySelector("span:last-child");

  if (!iconEl || !labelEl) return;

  if (
    (state.isRunning || (!state.downloadInterval && !state.finalScanTimerId)) &&
    state.isRunning
  ) {
    if (state.isPaused) {
      iconEl.textContent = "play_arrow";
      labelEl.textContent = i18n("continue_button");
      dom.mainActionButton.title = i18n("continue_button_title");
    } else {
      iconEl.textContent = "pause";
      labelEl.textContent = i18n("pause_button");
      dom.mainActionButton.title = i18n("pause_button_title");
    }
  } else {
    iconEl.textContent = "play_arrow";
    labelEl.textContent = i18n("start_button");
    dom.mainActionButton.title = i18n("start_button_title");
  }
}

export function updateFailedPromptsUI() {
  dom.failedPromptsDisplay.innerHTML = "";

  state.failedPromptsList
    .sort((a, b) =>
      null != a.index && null != b.index
        ? a.index - b.index
        : null != a.index
          ? -1
          : null != b.index
            ? 1
            : 0,
    )
    .forEach((item) => {
      const div = document.createElement("div");
      // Note: the comma operator discards the truncated string; only the
      // second expression (the full key) is actually used as displayText.
      const _unused =
        item.key.length > 100 ? item.key.substring(0, 97) : item.key;
      const displayText = null != item.index ? `${item.key}` : item.key;

      div.textContent = displayText;
      div.title = `Tac vu #${item.index || "N/A"}: ${item.key}\nLy do: ${item.reason}`;
      dom.failedPromptsDisplay.appendChild(div);
    });

  dom.failedSummary.textContent = i18n("failed_prompts_summary", {
    count: state.failedPromptsList.length,
  });
}

export function updateProgressBar(current, total, jobIndex = 0, jobCount = 0) {
  if (!dom.progressBar) return;

  let percent = 0;
  if (jobCount > 0) {
    const perJob = 100 / jobCount;
    percent = jobIndex * perJob + (total > 0 ? current / total : 0) * perJob;
  } else if (total > 0) {
    percent = (current / total) * 100;
  }
  dom.progressBar.value = percent;
}

export function updateLiveStatus(message, level = "info") {
  if (!dom.liveStatus) return;

  dom.liveStatus.textContent = message;
  dom.liveStatus.style.color = {
    info: "var(--text-color)",
    success: "var(--success-color)",
    warn: "var(--warning-color)",
    error: "var(--error-color)",
    CRITICAL: "var(--error-color)",
  }[level];

  if (
    state.isRunning &&
    state.masterQueue.length > 0 &&
    state.currentJobIndex < state.masterQueue.length
  ) {
    if (state.masterQueue[state.currentJobIndex]) {
      const prefix = `[Job ${state.currentJobIndex + 1}/${state.masterQueue.length}]`;
      dom.liveStatus.textContent = `${prefix} ${message}`;
      return;
    }
  }

  dom.liveStatus.textContent = message;
}

export function logMessage(msg, level = "info") {
  if (!dom.logDisplay) return;

  const div = document.createElement("div");
  const sanitized = String(msg).replace(/<|>/g, "&lt;");
  const emojiMap = {
    system: "\u{1F535}",
    success: "\u{1F7E2}",
    warn: "\u{1F7E1}",
    error: "\u{1F534}",
    info: "\u26AA\uFE0F",
    CRITICAL: "\u{1F534}",
  };
  div.innerHTML = `<span style="color: #9aa0a6; margin-right: 5px;">${new Date().toLocaleTimeString("vi-VN")}</span> ${emojiMap[level] || "\u26AA\uFE0F"} ${sanitized}`;

  dom.logDisplay.appendChild(div);
  dom.logDisplay.scrollTop = dom.logDisplay.scrollHeight;
}

export function updateUIAfterModeChange() {
  const isImageMode = "text-to-image" === state.currentMode;
  const videoPromptHint = document.getElementById("videoPromptHint");
  if (videoPromptHint) {
    videoPromptHint.style.display = isImageMode ? "block" : "none";
  }

  if ("image-to-video" === state.currentMode) {
    dom.imageModeContainer.style.display = "block";
    dom.promptListTitle.textContent = i18n("prompt_list_for_images");
    dom.promptsTextarea.placeholder = i18n("prompt_placeholder");
    dom.aspectRatioSelector.disabled = false;
  } else {
    dom.imageModeContainer.style.display = "none";
    dom.promptListTitle.textContent = i18n("prompt_list");
    dom.promptsTextarea.placeholder = i18n("prompt_placeholder");
    dom.aspectRatioSelector.disabled = false;
  }
}

export function updateQueueModal() {
  if (!dom.queueTableBody || !dom.queueListDisplay) return;

  dom.queueTableBody.innerHTML = "";
  const tableParent = dom.queueTableBody.parentElement;
  const emptyMessage = dom.queueListDisplay.querySelector(
    ".queue-list-empty-message",
  );

  if (0 === state.masterQueue.length) {
    tableParent.classList.add("empty-queue");
    if (emptyMessage) {
      emptyMessage.style.display = "block";
    }
  } else {
    tableParent.classList.remove("empty-queue");
    if (emptyMessage) {
      emptyMessage.style.display = "none";
    }

    const frag = document.createDocumentFragment();
    state.masterQueue.forEach((job, index) => {
      const row = document.createElement("tr");
      row.dataset.jobId = job.id;

      const summary =
        "image-to-video" === job.mode
          ? i18n("job_summary_image", { count: job.images.length })
          : i18n("job_summary_text", { count: job.prompts.length });

      let modeLabel;
      if ("image-to-video" === job.mode) {
        modeLabel = i18n("mode_image");
      } else if ("text-to-image" === job.mode) {
        modeLabel = i18n("mode_nano_banana");
      } else {
        modeLabel = i18n("mode_text");
      }

      let statusText = "";
      const isPending = "pending" === job.status;
      const isRunning = "running" === job.status;

      switch (job.status) {
        case "pending":
          statusText = i18n("job_status_pending");
          break;
        case "running":
          statusText = `${i18n("job_status_running")} (${job.progress.completed}/${job.progress.total})`;
          break;
        case "done":
          statusText = i18n("job_status_done");
          break;
        case "failed":
          statusText = i18n("job_status_failed");
          break;
        default:
          statusText = job.status;
      }

      const numberCell = document.createElement("td");
      numberCell.textContent = index + 1;
      row.appendChild(numberCell);

      const descCell = document.createElement("td");
      const canExpand = job.prompts && job.prompts.length > 0 && !isRunning;
      descCell.innerHTML = `
                <div class="queue-job-desc" ${canExpand ? `data-expandable="true" data-job-id="${job.id}"` : ""}>
                    ${summary} ${canExpand ? '<span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">expand_more</span>' : ""}
                </div>
                <div class="queue-job-mode">${modeLabel}</div>
                <div class="queue-prompt-expand" data-expand-id="${job.id}"></div>
            `;
      row.appendChild(descCell);

      const folderCell = document.createElement("td");
      if (isPending) {
        const folderInput = document.createElement("input");
        folderInput.type = "text";
        folderInput.className = "queue-folder-input";
        folderInput.value = job.downloadFolder;
        folderInput.dataset.jobId = job.id;
        folderInput.title = i18n("queue_edit_folder_title");
        folderCell.appendChild(folderInput);
      } else {
        folderCell.textContent = job.downloadFolder;
      }
      row.appendChild(folderCell);

      const statusCell = document.createElement("td");
      statusCell.textContent = statusText;
      row.appendChild(statusCell);

      const actionsCell = document.createElement("td");
      actionsCell.innerHTML = `
                <button class="queue-job-button queue-reset-job" title="${i18n("queue_reset_job_title")}" data-job-id="${job.id}" ${isPending || isRunning ? "disabled" : ""}>
                    <span class="material-symbols-outlined">restart_alt</span>
                </button>
                <button class="queue-job-button queue-delete-job" title="${i18n("queue_delete_job_title")}" data-job-id="${job.id}" ${isRunning ? "disabled" : ""}>
                    <span class="material-symbols-outlined">delete</span>
                </button>
            `;
      row.appendChild(actionsCell);

      frag.appendChild(row);
    });
    dom.queueTableBody.appendChild(frag);
  }

  if (dom.queueTaskCount) {
    dom.queueTaskCount.textContent = state.masterQueue.length;
  }

  if (dom.queueResetAllButton) {
    const hasFinished = state.masterQueue.some(
      (job) => "done" === job.status || "failed" === job.status,
    );
    dom.queueResetAllButton.disabled = state.isRunning || !hasFinished;
  }

  if (dom.queueDeleteAllButton) {
    dom.queueDeleteAllButton.disabled =
      state.isRunning || 0 === state.masterQueue.length;
  }

  updateButtonStates();
}
