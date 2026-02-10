import { dom } from "./dom.js";
import { state } from "./state.js";
import {
  logMessage,
  updateLiveStatus,
  updateProgressBar,
  updateButtonStates,
  updateFailedPromptsUI,
  updateQueueModal,
} from "./ui.js";
import { i18n } from "./i18n.js";
import {
  injectScript,
  clickNewProjectButton,
  scanExistingVideos,
  setInitialSettings,
  setImageSettings,
  selectImageMode,
  selectTextMode,
  selectCreateImageMode,
  processImageAndPromptOnPage,
  processPromptOnPage,
  clickElementByXPath,
  scanForQueueFullPopup,
  scanExistingImages,
  processPromptWithRefImage,
  processPromptWithExistingRefImages,
} from "./injector.js";
import {
  getProjectIdFromUrl,
  readFileAsDataURL,
  getRandomWait,
  pauseIfNeeded,
  interruptibleSleep,
  interruptibleSleepAndScan,
  waitForTabLoad,
} from "./utils.js";
import { startScanner, stopScanner } from "./scanner.js";
import { getImage } from "./db.js";

export function addFailedPrompt(promptItem, reason, taskIndex, jobIndex) {
  const key = `job${jobIndex + 1}_${"string" == typeof promptItem ? promptItem : promptItem.name || "unknown file"}`;
  if (!state.failedPromptsList.some((entry) => entry.key === key)) {
    const failedEntry = {
      key: key,
      item: promptItem,
      reason: reason,
      index: taskIndex,
    };
    state.failedPromptsList.push(failedEntry);
    updateFailedPromptsUI();

    const job = state.masterQueue[jobIndex];
    if (job) {
      const task = state.masterTaskList.find(
        (t) => t.jobId === job.id && t.index === taskIndex,
      );
      if (task) {
        task.status = "failed";
      }
    }
  }
}

export async function applyPageSettings(jobConfig) {
  await interruptibleSleep(2000);
  try {
    await chrome.tabs.setZoom(state.flowTabId, 0.5);
  } catch (err) {
    logMessage(i18n("log_set_zoom_fail"), "warn");
  }

  const isImageMode = "text-to-image" === jobConfig.mode;

  // Apply grid view
  await (async function applyGridView() {
    if (!state.selectors.GRID_VIEW_BUTTON_XPATH) {
      logMessage(i18n("log_grid_view_selector_not_found"), "warning");
      return;
    }
    logMessage(i18n("log_applying_grid_view"), "info");
    const clickResult = await injectScript(clickElementByXPath, [
      state.selectors.GRID_VIEW_BUTTON_XPATH,
    ]);
    if (clickResult === true) {
      logMessage(i18n("log_grid_view_clicked"), "info");
      await interruptibleSleep(500);
    } else {
      logMessage(
        i18n(
          clickResult === false
            ? "log_grid_view_not_clickable"
            : "log_grid_view_xpath_error",
        ),
        "warning",
      );
    }
  })();

  if (!isImageMode) {
    // Apply videocam mode
    await (async function applyVideocamMode() {
      if (!state.selectors.VIDEOCAM_BUTTON_XPATH) {
        logMessage(i18n("log_videocam_selector_not_found"), "warning");
        return;
      }
      logMessage(i18n("log_applying_videocam_mode"), "info");
      const clickResult = await injectScript(clickElementByXPath, [
        state.selectors.VIDEOCAM_BUTTON_XPATH,
      ]);
      if (clickResult === true) {
        logMessage(i18n("log_videocam_clicked"), "info");
        await interruptibleSleep(500);
      } else {
        logMessage(
          i18n(
            clickResult === false
              ? "log_videocam_not_clickable"
              : "log_videocam_xpath_error",
          ),
          "warning",
        );
      }
    })();

    try {
      const existingVideos = await injectScript(scanExistingVideos);
      if (Array.isArray(existingVideos) && existingVideos.length > 0) {
        existingVideos.forEach((url) => state.downloadedVideoUrls.add(url));
        logMessage(
          i18n("log_initial_scan_found", { count: existingVideos.length }),
          "info",
        );
      }
    } catch (err) {
      logMessage(i18n("log_scan_existing_fail"), "warn");
    }
  }

  let modeSelected = false;

  if (isImageMode) {
    logMessage("Selecting Create Image mode...", "info");
    modeSelected = await injectScript(selectCreateImageMode);
    if (!modeSelected) {
      logMessage(
        i18n("log_cannot_select_mode_after_reload", { mode: jobConfig.mode }),
        "error",
      );
      return false;
    }
    await interruptibleSleep(1500);

    const repeatCount = jobConfig.repeatCount || "1";
    const model = jobConfig.model || "nano_banana_pro";
    const aspectRatio = jobConfig.aspectRatio || "landscape";
    logMessage(
      `Applying image settings: count=${repeatCount}, model=${model}, ratio=${aspectRatio}`,
      "info",
    );

    const imgSettingsResult = await injectScript(setImageSettings, [
      repeatCount,
      model,
      aspectRatio,
    ]);
    if (!imgSettingsResult) {
      logMessage(
        "Image settings may not have been applied - check Flow UI",
        "warn",
      );
    } else {
      logMessage(i18n("log_settings_applied"), "info");
    }

    await interruptibleSleep(500);

    try {
      const existingImages = await injectScript(scanExistingImages);
      if (Array.isArray(existingImages) && existingImages.length > 0) {
        existingImages.forEach((url) => state.downloadedVideoUrls.add(url));
        logMessage(`Found ${existingImages.length} existing images`, "info");
      }
    } catch (err) {
      logMessage("Failed to scan existing images", "warn");
    }

    return true;
  }

  const repeatCount = jobConfig.repeatCount || "1";
  const model = jobConfig.model || "default";
  const aspectRatio = jobConfig.aspectRatio || "landscape";

  if ("image-to-video" !== jobConfig.mode) {
    if (
      !(await injectScript(setInitialSettings, [
        repeatCount,
        model,
        aspectRatio,
      ]))
    ) {
      logMessage(i18n("log_settings_fail"), "error");
      return false;
    }
  } else {
    await injectScript(setInitialSettings, [repeatCount, model, aspectRatio]);
  }

  modeSelected =
    "image-to-video" === jobConfig.mode
      ? await injectScript(selectImageMode)
      : await injectScript(selectTextMode);

  if (modeSelected) {
    logMessage(i18n("log_settings_applied"), "info");
    return true;
  } else {
    logMessage(
      i18n("log_cannot_select_mode_after_reload", { mode: jobConfig.mode }),
      "error",
    );
    return false;
  }
}

export async function startQueue(isContinuation = false) {
  if (state.zoomResetTimerId) {
    clearTimeout(state.zoomResetTimerId);
    state.zoomResetTimerId = null;
  }
  if (state.finalScanTimerId) {
    clearInterval(state.finalScanTimerId);
    state.finalScanTimerId = null;
  }

  const firstPendingIndex = state.masterQueue.findIndex(
    (job) => "pending" === job.status,
  );

  if (firstPendingIndex === -1) {
    logMessage(i18n("log_no_pending_jobs"), "warn");
    return;
  }

  try {
    if (Object.keys(state.selectors).length === 0) {
      throw new Error(i18n("log_load_selectors_fail"));
    }

    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!activeTab || !activeTab.id) {
      throw new Error(i18n("log_no_active_tab"));
    }

    state.flowTabId = activeTab.id;
    state.isRunning = true;
    state.stopRequested = false;
    state.isPaused = false;
    state.currentJobIndex = firstPendingIndex;
    state.failedPromptsList = [];
    state.masterTaskList = [];

    updateButtonStates();
    updateFailedPromptsUI();
    dom.logDisplay.innerHTML = "";
    logMessage(i18n("log_session_ready"), "system");

    await processNextJob(isContinuation);
  } catch (err) {
    logMessage(i18n("status_start_error", { error: err.message }), "CRITICAL");
    updateLiveStatus(
      i18n("status_start_error", { error: err.message }),
      "error",
    );
    resetState(i18n("reset_error"));
  }
}

async function processNextJob(isSubsequentJob = false) {
  if (state.stopRequested) {
    resetState(i18n("reset_user_stop"));
    return;
  }

  if (state.finalScanTimerId) {
    clearInterval(state.finalScanTimerId);
    state.finalScanTimerId = null;
  }

  state.currentJobIndex = state.masterQueue.findIndex(
    (job, idx) => "pending" === job.status && idx >= state.currentJobIndex,
  );

  if (state.currentJobIndex === -1) {
    logMessage(i18n("log_all_jobs_complete"), "system");
    updateLiveStatus(i18n("log_all_jobs_complete"), "success");
    resetState(null);
    updateButtonStates();
    return;
  }

  // If auto-start is OFF and this is a subsequent job (not the first), pause
  if (isSubsequentJob && !state.autoStartNextJob) {
    logMessage("Auto-start is OFF. Waiting for manual start.", "info");
    updateLiveStatus("Job complete. Click Start to run next job.", "info");
    resetState(null);
    updateButtonStates();
    return;
  }

  const currentJob = state.masterQueue[state.currentJobIndex];
  currentJob.status = "running";
  updateQueueModal();

  const repeatCount = parseInt(currentJob.repeatCount, 10) || 1;
  const startFrom = currentJob.startFrom || 1;
  let startIndex = Math.max(0, startFrom - 1);

  if (currentJob.currentIndex > 0 && currentJob.currentIndex > startIndex) {
    startIndex = currentJob.currentIndex;
  } else {
    currentJob.currentIndex = startIndex;
  }

  state.taskList = [];

  if ("image-to-video" === currentJob.mode) {
    for (let idx = 0; idx < currentJob.images.length; idx++) {
      const task = {
        index: idx + 1,
        item: currentJob.images[idx],
        prompt: currentJob.prompts[idx % currentJob.prompts.length],
        status: "pending",
        expectedVideos: repeatCount,
        foundVideos: 0,
        jobId: currentJob.id,
      };
      state.taskList.push(task);
      state.masterTaskList.push(task);
    }
  } else {
    for (let idx = 0; idx < currentJob.prompts.length; idx++) {
      let taskRefImgs = [];
      if (currentJob.refImageMap && currentJob.refImageMap[idx]) {
        const refIds = currentJob.refImageMap[idx];
        taskRefImgs = (state.selectedRefImages || []).filter((img) =>
          refIds.includes(img.id),
        );
      }
      const task = {
        index: idx + 1,
        item: currentJob.prompts[idx],
        prompt: currentJob.prompts[idx],
        status: "pending",
        expectedVideos: repeatCount,
        foundVideos: 0,
        jobId: currentJob.id,
        refImages: taskRefImgs,
      };
      state.taskList.push(task);
      state.masterTaskList.push(task);
    }
    if (
      currentJob.refImageMap &&
      Object.keys(currentJob.refImageMap).length > 0
    ) {
      state.taskList.sort((taskA, taskB) => {
        const keyA = (taskA.refImages || [])
          .map((ref) => ref.id)
          .sort()
          .join(",");
        const keyB = (taskB.refImages || [])
          .map((ref) => ref.id)
          .sort()
          .join(",");
        return keyA.localeCompare(keyB);
      });
    }
  }

  state.promptList = state.taskList.map((task) => task.item);
  state.currentMode = currentJob.mode;
  state.currentIndex = currentJob.currentIndex;
  state.refImagesUploaded = false;
  state.lastUploadedRefIds = [];

  await (async function setupAndRunJob(jobConfig, isSubsequent) {
    let alreadyOnProject =
      isSubsequent &&
      (await chrome.tabs.get(state.flowTabId)).url?.includes(
        "/tools/flow/project",
      );

    try {
      if (alreadyOnProject) {
        state.currentProjectId = getProjectIdFromUrl(
          (await chrome.tabs.get(state.flowTabId)).url,
        );
        logMessage(
          i18n("log_continuing_job", { index: state.currentJobIndex + 1 }),
          "system",
        );
        logMessage(
          i18n("log_continue_on_project", {
            id: state.currentProjectId || "N/A",
          }),
          "info",
        );

        try {
          const existingVideos = await injectScript(scanExistingVideos);
          if (Array.isArray(existingVideos) && existingVideos.length > 0) {
            existingVideos.forEach((url) => state.downloadedVideoUrls.add(url));
            logMessage(
              i18n("log_initial_scan_found", { count: existingVideos.length }),
              "info",
            );
          }
        } catch (err) {
          logMessage(i18n("log_scan_existing_fail"), "warn");
        }
      } else {
        state.downloadedVideoUrls.clear();
        updateLiveStatus(i18n("status_creating_project"), "info");
        logMessage(
          i18n("log_starting_job", { index: state.currentJobIndex + 1 }),
          "system",
        );

        await chrome.tabs.update(state.flowTabId, {
          url: "https://labs.google/fx/tools/flow",
        });

        // Wait for homepage to load
        await new Promise((resolve, reject) => {
          const onTabUpdated = (tabId, changeInfo, tab) => {
            if (
              tabId === state.flowTabId &&
              tab.url?.includes("/tools/flow") &&
              !tab.url?.includes("/project") &&
              "complete" === changeInfo.status
            ) {
              chrome.tabs.onUpdated.removeListener(onTabUpdated);
              resolve();
            } else if (
              tabId !== state.flowTabId ||
              "complete" !== changeInfo.status ||
              tab.url?.includes("/tools/flow") ||
              tab.url?.includes("accounts.google.com")
            ) {
              // Not our tab, not complete, still on flow, or on google auth - skip
            } else {
              chrome.tabs.onUpdated.removeListener(onTabUpdated);
              reject(
                new Error(
                  i18n("log_nav_error_or_unexpected_page", { url: tab.url }),
                ),
              );
            }
          };
          chrome.tabs.onUpdated.addListener(onTabUpdated);
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(onTabUpdated);
            reject(new Error(i18n("log_timeout_nav_homepage")));
          }, 60000);
        });

        await interruptibleSleep(2000);

        if (state.stopRequested) {
          resetState(i18n("reset_user_stop"));
          return;
        }

        logMessage(i18n("log_homepage_loaded"), "info");

        if (!(await injectScript(clickNewProjectButton))) {
          throw new Error(i18n("log_click_new_project_fail"));
        }

        logMessage(i18n("log_wait_for_project"), "info");

        // Wait for project page to load
        await new Promise((resolve, reject) => {
          const onTabUpdated = (tabId, changeInfo, tab) => {
            if (
              tabId === state.flowTabId &&
              tab.url?.includes("/project/") &&
              "complete" === changeInfo.status
            ) {
              chrome.tabs.onUpdated.removeListener(onTabUpdated);
              resolve();
            } else if (
              tabId !== state.flowTabId ||
              "complete" !== changeInfo.status ||
              tab.url?.includes("/project/")
            ) {
              // Not our tab, not complete, or already on project - skip
            } else if (tab.url?.includes("/tools/flow")) {
              chrome.tabs.onUpdated.removeListener(onTabUpdated);
              reject(new Error(i18n("log_fail_nav_from_homepage")));
            } else if (!tab.url?.includes("accounts.google.com")) {
              chrome.tabs.onUpdated.removeListener(onTabUpdated);
              reject(
                new Error(
                  i18n("log_unexpected_page_after_click", { url: tab.url }),
                ),
              );
            }
          };
          chrome.tabs.onUpdated.addListener(onTabUpdated);
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(onTabUpdated);
            reject(new Error(i18n("error_timeout_new_project")));
          }, 60000);
        });

        const currentUrl = (await chrome.tabs.get(state.flowTabId)).url;
        state.currentProjectId = getProjectIdFromUrl(currentUrl);
        logMessage(
          i18n("log_navigated_to_project", {
            id: state.currentProjectId || "N/A",
          }),
          "info",
        );
      }

      if (!(await applyPageSettings(jobConfig))) {
        throw new Error(i18n("log_apply_initial_settings_fail"));
      }

      if (state.stopRequested) {
        resetState(i18n("reset_user_stop"));
        return;
      }

      if (state.currentIndex >= state.taskList.length) {
        const errorMsg = i18n("status_invalid_start_pos", {
          start: state.currentIndex + 1,
          total: state.taskList.length,
        });
        updateLiveStatus(errorMsg, "error");
        logMessage(errorMsg, "error");
        jobConfig.status = "done";
        updateQueueModal();
        chrome.storage.local.set({ masterQueue: state.masterQueue });
        state.currentJobIndex++;
        await processNextJob(true);
        return;
      }

      stopScanner();

      if (
        dom.autoDownloadCheckbox.checked ||
        dom.autoDownloadImagesCheckbox?.checked
      ) {
        startScanner("main");
        logMessage(
          i18n("log_scanner_started", {
            interval: state.scanIntervalMs / 1000,
          }),
          "info",
        );
      } else {
        logMessage(i18n("log_auto_scan_off"), "info");
      }

      state.newlyDownloadedCount = 0;
      state.activeRunMode = state.currentMode;
      chrome.storage.local.set({ lastRunMode: state.currentMode });

      // Process all tasks in this job
      await (async function processAllTasks(jobConfig) {
        const totalTasks = state.taskList.length;
        const aspectRatio = jobConfig.aspectRatio || "landscape";

        while (
          state.currentIndex < totalTasks &&
          state.isRunning &&
          !state.stopRequested
        ) {
          await pauseIfNeeded();
          if (state.stopRequested) break;

          const currentTask = state.taskList[state.currentIndex];
          let taskFailed = false;
          let policyViolation = false;

          jobConfig.progress.completed = state.currentIndex;
          updateQueueModal();

          for (
            let retryAttempt = 0;
            retryAttempt <= state.MAX_RETRIES;
            retryAttempt++
          ) {
            await pauseIfNeeded();
            if (state.stopRequested) break;

            if (retryAttempt > 0) {
              logMessage(
                i18n("log_retry_task", {
                  index: currentTask.index,
                  retry: retryAttempt,
                }),
                "warn",
              );
              if (dom.autoDownloadCheckbox.checked) {
                await interruptibleSleep(state.scanIntervalMs);
              }
              try {
                await new Promise((resolve, reject) => {
                  chrome.tabs.reload(
                    state.flowTabId,
                    { bypassCache: true },
                    () => {
                      if (chrome.runtime.lastError) {
                        return reject(
                          new Error(chrome.runtime.lastError.message),
                        );
                      }
                      resolve();
                    },
                  );
                });
                await waitForTabLoad(state.flowTabId);
                state.refImagesUploaded = false;
                if (!(await applyPageSettings(jobConfig))) {
                  throw new Error(i18n("log_settings_fail"));
                }
              } catch (reloadErr) {
                if (reloadErr.message === i18n("reset_user_stop")) {
                  logMessage(i18n("reset_user_stop"), "warn");
                  taskFailed = true;
                  break;
                }
                const errorDetail =
                  i18n("log_page_reload_fail") + `: ${reloadErr.message}`;
                logMessage(errorDetail, "CRITICAL");
                addFailedPrompt(
                  currentTask.item,
                  errorDetail,
                  currentTask.index,
                  state.currentJobIndex,
                );
                taskFailed = true;
                break;
              }
              if (!(await waitForQueueClear())) {
                taskFailed = true;
                break;
              }
            }

            let statusMessage;
            let injectResult;

            updateProgressBar(
              state.currentIndex,
              totalTasks,
              state.currentJobIndex,
              state.masterQueue.length,
            );

            if ("image-to-video" === jobConfig.mode) {
              const imageItem = currentTask.item;
              let dataUrl;
              statusMessage = i18n("log_processing_image", {
                index: currentTask.index,
                total: totalTasks,
                retry: retryAttempt,
                maxRetry: state.MAX_RETRIES,
              });
              logMessage(statusMessage, "info");
              updateLiveStatus(statusMessage, "info");

              try {
                const imageBlob = await getImage(imageItem.id);
                if (imageBlob) {
                  dataUrl = await readFileAsDataURL(imageBlob);
                } else {
                  injectResult = "FILE_READ_ERROR";
                }
              } catch (readErr) {
                injectResult = "FILE_READ_ERROR";
              }

              if (injectResult !== "FILE_READ_ERROR") {
                if (dataUrl) {
                  injectResult = await injectScript(
                    processImageAndPromptOnPage,
                    [
                      dataUrl,
                      imageItem.name,
                      imageItem.type,
                      currentTask.prompt,
                      aspectRatio,
                    ],
                  );
                } else {
                  injectResult = "FILE_READ_ERROR";
                }
              }
            } else {
              statusMessage = i18n("log_processing", {
                index: currentTask.index,
                total: totalTasks,
                retry: retryAttempt,
                maxRetry: state.MAX_RETRIES,
              });
              logMessage(statusMessage, "info");
              updateLiveStatus(statusMessage, "info");

              if ("text-to-image" === jobConfig.mode) {
                const taskRefs =
                  currentTask.refImages && currentTask.refImages.length > 0
                    ? currentTask.refImages
                    : state.selectedRefImages &&
                        state.selectedRefImages.length > 0
                      ? state.selectedRefImages
                      : [];

                if (taskRefs.length > 0) {
                  const currentRefIds = taskRefs
                    .map((ref) => ref.id)
                    .sort()
                    .join(",");

                  // Check if ref images changed and we need to reload
                  if (
                    state.lastUploadedRefIds.length > 0 &&
                    currentRefIds !== state.lastUploadedRefIds.join(",")
                  ) {
                    logMessage("Ref images changed, reloading page...", "info");
                    try {
                      await new Promise((resolve, reject) => {
                        chrome.tabs.reload(
                          state.flowTabId,
                          { bypassCache: true },
                          () => {
                            if (chrome.runtime.lastError) {
                              return reject(
                                new Error(chrome.runtime.lastError.message),
                              );
                            }
                            resolve();
                          },
                        );
                      });
                      await waitForTabLoad(state.flowTabId);
                      state.refImagesUploaded = false;
                      if (!(await applyPageSettings(jobConfig))) {
                        logMessage(
                          "Failed to apply settings after reload",
                          "error",
                        );
                        injectResult = false;
                        continue;
                      }
                    } catch (reloadErr) {
                      logMessage(
                        "Page reload failed: " + reloadErr.message,
                        "error",
                      );
                      injectResult = false;
                      continue;
                    }
                  }

                  if (!state.refImagesUploaded) {
                    injectResult = await injectScript(
                      processPromptWithRefImage,
                      [taskRefs, currentTask.prompt],
                    );
                    if (injectResult === true) {
                      state.refImagesUploaded = true;
                      state.lastUploadedRefIds = taskRefs
                        .map((ref) => ref.id)
                        .sort();
                    }
                  } else {
                    injectResult = await injectScript(
                      processPromptWithExistingRefImages,
                      [taskRefs.length, currentTask.prompt],
                    );
                    if ("PICKER_FAILED" === injectResult) {
                      logMessage(
                        "Picker failed, falling back to full upload",
                        "warn",
                      );
                      injectResult = await injectScript(
                        processPromptWithRefImage,
                        [taskRefs, currentTask.prompt],
                      );
                      if (injectResult === true) {
                        state.refImagesUploaded = true;
                        state.lastUploadedRefIds = taskRefs
                          .map((ref) => ref.id)
                          .sort();
                      }
                    }
                  }
                } else {
                  injectResult = await injectScript(processPromptOnPage, [
                    currentTask.prompt,
                    state.selectors.PROMPT_TEXTAREA_ID,
                    state.selectors.GENERATE_BUTTON_XPATH,
                  ]);
                }
              } else {
                injectResult = await injectScript(processPromptOnPage, [
                  currentTask.prompt,
                  state.selectors.PROMPT_TEXTAREA_ID,
                  state.selectors.GENERATE_BUTTON_XPATH,
                ]);
              }
            }

            if (injectResult === true) {
              logMessage(
                i18n("log_submit_success", { index: currentTask.index }),
                "success",
              );
              taskFailed = false;
              break;
            }

            if ("QUEUE_FULL" === injectResult) {
              logMessage(i18n("log_queue_full"), "warn");
              if (await handleQueueFull()) {
                retryAttempt--;
                continue;
              }
              taskFailed = true;
              if (retryAttempt === state.MAX_RETRIES) {
                logMessage(i18n("log_queue_full_gave_up"), "error");
                addFailedPrompt(
                  currentTask.item,
                  i18n("log_queue_full"),
                  currentTask.index,
                  state.currentJobIndex,
                );
              }
              continue;
            }

            if ("RATE_LIMIT" === injectResult) {
              logMessage("Rate limited - waiting 30s before retry...", "warn");
              await interruptibleSleep(30000);
              retryAttempt--;
              continue;
            }

            // Handle all other error cases
            taskFailed = true;
            let errorReason = i18n("reason_unknown");
            const filename =
              "image-to-video" === jobConfig.mode
                ? currentTask.item.name
                : "N/A";

            if ("POLICY_IMAGE" === injectResult) {
              errorReason = i18n("log_policy_error_image", {
                filename: filename,
              });
            } else if ("POLICY_PROMPT" === injectResult) {
              errorReason = i18n("log_policy_error_prompt");
            } else if ("FILE_READ_ERROR" === injectResult) {
              errorReason = i18n("log_file_read_error", {
                filename: filename,
              });
            } else if (injectResult === false) {
              errorReason =
                "image-to-video" === jobConfig.mode
                  ? i18n("log_image_inject_fail")
                  : i18n("log_submit_fail");
            }

            logMessage(errorReason, "error");

            if (
              "POLICY_IMAGE" === injectResult ||
              "POLICY_PROMPT" === injectResult
            ) {
              policyViolation = true;
              addFailedPrompt(
                currentTask.item,
                errorReason,
                currentTask.index,
                state.currentJobIndex,
              );
              break;
            }

            if (retryAttempt === state.MAX_RETRIES) {
              logMessage(
                i18n("log_skip_task", {
                  index: currentTask.index,
                  maxRetry: state.MAX_RETRIES,
                }),
                "error",
              );
              addFailedPrompt(
                currentTask.item,
                errorReason,
                currentTask.index,
                state.currentJobIndex,
              );
            }
          }

          if (state.stopRequested) break;

          if (!taskFailed || policyViolation) {
            const waitTime = getRandomWait(
              dom.minInitialWaitTimeInput.value,
              dom.maxInitialWaitTimeInput.value,
            );
            logMessage(
              i18n("log_wait_for_video", {
                seconds: Math.round(waitTime / 1000),
              }),
              "info",
            );
            if (policyViolation) {
              await interruptibleSleep(waitTime);
            } else {
              const scanResult = await interruptibleSleepAndScan(waitTime);
              if ("STOPPED" === scanResult) break;
              if ("POLICY_ERROR" === scanResult) {
                logMessage(i18n("log_policy_error_prompt"), "error");
                taskFailed = true;
              }
            }
          }

          if (state.stopRequested) break;

          if (!taskFailed) {
            logMessage(
              i18n("log_prompt_completed", { index: currentTask.index }),
              "system",
            );
          }
          state.currentIndex++;
          jobConfig.currentIndex = state.currentIndex;
        }

        if (state.stopRequested) {
          jobConfig.status = "pending";
          updateQueueModal();
          resetState(i18n("reset_user_stop"));
        } else if (state.isRunning) {
          jobConfig.status = "done";
          jobConfig.progress.completed = totalTasks;
          updateQueueModal();
          chrome.storage.local.set({ masterQueue: state.masterQueue });

          if (
            dom.autoDownloadCheckbox.checked ||
            dom.autoDownloadImagesCheckbox?.checked
          ) {
            logMessage(
              i18n("log_job_scan_started", {
                index: state.currentJobIndex + 1,
              }),
              "system",
            );
            updateLiveStatus(
              i18n("log_job_scan_started", {
                index: state.currentJobIndex + 1,
              }),
              "info",
            );

            const scanStartTime = Date.now();
            const scanTimeoutMs = 90000;
            const scanIntervalMs = 5000;

            state.finalScanTimerId = setInterval(async () => {
              if (
                state.currentJobIndex >= state.masterQueue.length ||
                !state.masterQueue[state.currentJobIndex]
              ) {
                clearInterval(state.finalScanTimerId);
                state.finalScanTimerId = null;
                return;
              }

              const jobId = state.masterQueue[state.currentJobIndex].id;
              const jobTasks = state.masterTaskList.filter(
                (task) => task.jobId === jobId,
              );
              const allTasksSettled =
                jobTasks.length > 0 &&
                jobTasks.every(
                  (task) =>
                    "complete" === task.status || "failed" === task.status,
                );
              const elapsed = Date.now() - scanStartTime;

              let shouldProceed = false;
              let logKey = "";

              if (allTasksSettled) {
                logKey = "log_job_scan_complete_early";
                shouldProceed = true;
              } else if (elapsed >= scanTimeoutMs) {
                logKey = "log_job_scan_timeout";
                shouldProceed = true;
              }

              if (shouldProceed) {
                logMessage(
                  i18n(logKey, { index: state.currentJobIndex + 1 }),
                  "success",
                );
                clearInterval(state.finalScanTimerId);
                state.finalScanTimerId = null;
                state.currentJobIndex++;
                await processNextJob(true);
              }
            }, scanIntervalMs);
          } else {
            state.currentJobIndex++;
            await processNextJob(true);
          }
        }
      })(jobConfig);
    } catch (jobErr) {
      logMessage(
        i18n("log_critical_job_error", {
          index: state.currentJobIndex + 1,
          error: jobErr.message,
        }),
        "CRITICAL",
      );
      updateLiveStatus(
        i18n("status_start_error", { error: jobErr.message }),
        "error",
      );
      jobConfig.status = "failed";
      updateQueueModal();
      state.currentJobIndex++;
      await processNextJob(true);
    }
  })(currentJob, isSubsequentJob);
}

async function pollQueueFullStatus(maxAttempts, delayMs, attemptOffset) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await pauseIfNeeded();
    if (state.stopRequested) return "STOPPED";

    const isQueueFull = await injectScript(scanForQueueFullPopup);
    if (isQueueFull === undefined) return "ERROR";

    if (!isQueueFull) {
      logMessage(i18n("log_queue_cleared_after_wait"), "info");
      return "CLEARED";
    }

    const retryMsg = i18n("log_queue_full_retrying", {
      attempt: attempt + attemptOffset,
      total: 30,
    });
    logMessage(retryMsg, "warn");
    updateLiveStatus(retryMsg, "warn");
    await interruptibleSleep(delayMs);
  }
  return "STILL_FULL";
}

async function handleQueueFull() {
  let result = await pollQueueFullStatus(10, 10000, 0);

  if ("CLEARED" === result) return true;
  if ("STOPPED" === result || "ERROR" === result) return false;

  logMessage(i18n("log_queue_full_wait_30s"), "warn");
  await interruptibleSleep(30000);

  if (state.stopRequested) return false;

  result = await pollQueueFullStatus(10, 10000, 10);
  return "CLEARED" === result;
}

async function waitForQueueClear() {
  let result = await pollQueueFullStatus(10, 10000, 20);

  if ("CLEARED" === result) return true;
  if ("STOPPED" === result || "ERROR" === result) return false;

  const errorMsg = i18n("log_queue_full_gave_up");
  logMessage(errorMsg, "CRITICAL");
  resetState(errorMsg);
  return false;
}

export function resetState(statusMessage) {
  stopScanner();

  if (state.finalScanTimerId) {
    clearInterval(state.finalScanTimerId);
    state.finalScanTimerId = null;
  }

  if (state.flowTabId) {
    const savedTabId = state.flowTabId;
    if (state.zoomResetTimerId) {
      clearTimeout(state.zoomResetTimerId);
    }
    state.zoomResetTimerId = setTimeout(() => {
      try {
        chrome.tabs.get(savedTabId, (tab) => {
          if (tab && tab.id === savedTabId) {
            chrome.tabs.setZoom(savedTabId, 1).catch((err) => {});
          }
        });
      } catch (err) {}
      state.zoomResetTimerId = null;
    }, 500);
  }

  state.isRunning = false;
  state.stopRequested = false;
  state.isPaused = false;
  state.currentIndex = 0;
  state.currentJobIndex = 0;
  state.flowTabId = null;
  state.currentProjectId = null;
  state.newlyDownloadedCount = 0;
  state.imageFileList = [];
  state.promptList = [];
  state.taskList = [];
  state.masterTaskList = [];

  state.masterQueue.forEach((job) => {
    if ("running" === job.status) {
      job.status = "pending";
    }
  });

  if (dom.imageFileSummary) {
    dom.imageFileSummary.style.display = "none";
  }
  if (dom.imageCount) {
    dom.imageCount.textContent = "0";
  }
  if (dom.imageInput) {
    dom.imageInput.value = null;
  }

  state.activeRunMode = null;
  state.refImagesUploaded = false;
  state.lastUploadedRefIds = [];

  chrome.storage.local.set({
    lastRunMode: null,
    masterQueue: state.masterQueue,
  });

  updateQueueModal();
  updateButtonStates();

  if (!state.isRunning && !state.downloadInterval && !state.finalScanTimerId) {
    if (dom.mainActionButton) {
      dom.mainActionButton.style.display = "flex";
    }
    if (dom.startNewProjectButton) {
      dom.startNewProjectButton.style.display = "none";
    }
    if (dom.startCurrentProjectButton) {
      dom.startCurrentProjectButton.style.display = "none";
    }
    if (dom.progressBar) {
      dom.progressBar.value = 0;
    }
  }

  if (statusMessage) {
    let severity = "warn";
    if (
      statusMessage.includes("\u2705") ||
      statusMessage === i18n("log_all_jobs_complete")
    ) {
      severity = "success";
    } else if (
      statusMessage.includes("L\u1ed7i") ||
      statusMessage.includes("Error") ||
      statusMessage.includes("Stopped") ||
      statusMessage.includes("D\u1eebng") ||
      statusMessage.includes(i18n("log_queue_full_gave_up")) ||
      statusMessage.includes(i18n("error_tab_closed"))
    ) {
      severity = "error";
    }

    let logLevel = severity;
    if (severity === "success" || severity === "info") {
      logLevel = "system";
    }

    logMessage(statusMessage, logLevel);
    updateLiveStatus(statusMessage, severity);
  } else {
    updateLiveStatus(i18n("status_ready"));
  }
}

export function skipToNextJob() {
  if (state.finalScanTimerId) {
    clearInterval(state.finalScanTimerId);
    state.finalScanTimerId = null;
    logMessage("Skipping scan, moving to next job...", "info");
    state.currentJobIndex++;
    processNextJob(true);
  } else if (state.isRunning) {
    logMessage("Skipping current job...", "info");
    state.stopRequested = true;
    setTimeout(() => {
      state.stopRequested = false;
      state.currentJobIndex++;
      const nextPending = state.masterQueue.findIndex(
        (job, idx) => idx >= state.currentJobIndex && job.status === "pending",
      );
      if (nextPending >= 0) {
        state.currentJobIndex = nextPending;
        processNextJob(true);
      } else {
        logMessage("No more pending jobs", "info");
        resetState(null);
      }
    }, 500);
  } else {
    logMessage("No job running to skip", "warn");
  }
}
