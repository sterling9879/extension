import { dom } from "./dom.js";
import { state } from "./state.js";
import { logMessage, updateLiveStatus } from "./ui.js";
import { i18n } from "./i18n.js";
import {
  injectScript,
  findAndGroupNewVideos,
  findAndGroupNewImages,
  downloadVideoAtResolution,
  downloadImageAtResolution,
} from "./injector.js";
import { interruptibleSleep } from "./utils.js";

async function performScan() {
  const isImageMode = "text-to-image" === state.activeRunMode;
  const imageAutoDownloadEnabled =
    isImageMode && dom.autoDownloadImagesCheckbox?.checked;
  const imageResolution = state.imageAutoDownloadResolution || "4k";

  if (
    (!dom.autoDownloadCheckbox.checked && !imageAutoDownloadEnabled) ||
    !state.flowTabId
  )
    return;

  let scanResults;
  let currentJob = null;

  if (
    state.isRunning &&
    state.masterQueue.length > 0 &&
    state.currentJobIndex < state.masterQueue.length
  ) {
    currentJob = state.masterQueue[state.currentJobIndex];
  }

  const hasPendingTasks =
    state.masterTaskList.filter((task) => "pending" === task.status).length !==
    0;

  if (!hasPendingTasks && !state.finalScanTimerId && !state.isRunning) {
    return;
  }

  const isImageModeForScan = "text-to-image" === state.activeRunMode;

  try {
    scanResults = isImageModeForScan
      ? await injectScript(findAndGroupNewImages, [
          Array.from(state.downloadedVideoUrls),
        ])
      : await injectScript(findAndGroupNewVideos, [
          Array.from(state.downloadedVideoUrls),
        ]);
  } catch (scanError) {
    if (
      scanError.message.includes("No tab with id") ||
      scanError.message.includes("Receiving end does not exist")
    ) {
      if (!state.stopRequested) {
        logMessage(i18n("error_tab_closed"), "error");
      }
      stopScanner();
    } else if (!state.stopRequested) {
      logMessage(
        i18n("log_scan_error", { error: scanError.message }),
        "error",
      );
    }
    return;
  }

  if (!Array.isArray(scanResults) || scanResults.length === 0) {
    return;
  }

  for (const scannedGroup of scanResults) {
    const scannedPrompt = scannedGroup.prompt.trim();

    const matchingTask = state.masterTaskList.find((task) => {
      if (task.status !== "pending") return false;
      const taskPrompt = task.prompt.trim();
      return (
        taskPrompt === scannedPrompt ||
        taskPrompt.startsWith(scannedPrompt.replace(/\.{3}$/, "")) ||
        scannedPrompt.startsWith(taskPrompt.substring(0, 30))
      );
    });

    if (!matchingTask) continue;

    const matchingJob = state.masterQueue.find(
      (job) => job.id === matchingTask.jobId,
    );
    if (!matchingJob) continue;

    const mediaItems = isImageModeForScan
      ? scannedGroup.images || []
      : scannedGroup.videos || [];
    const newMediaUrls = mediaItems.filter(
      (url) => !state.downloadedVideoUrls.has(url.split("?")[0]),
    );

    if (newMediaUrls.length === 0) continue;

    logMessage(
      i18n("log_scan_found_videos", {
        count: newMediaUrls.length,
        prompt: matchingTask.prompt.substring(0, 30) + "...",
      }),
      "info",
    );

    const letterLabels = "abcdefghijklmnopqrstuvwxyz";

    for (const mediaUrl of newMediaUrls) {
      if (matchingTask.foundVideos >= matchingTask.expectedVideos) break;

      const baseUrl = mediaUrl.split("?")[0];
      if (state.downloadedVideoUrls.has(baseUrl)) continue;

      state.downloadedVideoUrls.add(baseUrl);
      matchingTask.foundVideos++;
      state.newlyDownloadedCount++;

      const letterLabel =
        letterLabels[matchingTask.foundVideos - 1] || matchingTask.foundVideos;
      const now = new Date();
      const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}_${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}`;
      const filename = `${matchingTask.index}.${letterLabel}. ${timestamp}.${isImageModeForScan ? "png" : "mp4"}`;
      const filepath = `${matchingJob.downloadFolder || "Flow Downloads"}/${filename}`;
      const resolution = state.videoDownloadResolution || "720p";

      if (isImageModeForScan && imageAutoDownloadEnabled && imageResolution !== "1k") {
        // Use Flow's UI to download at 2K/4K resolution
        try {
          const result = await injectScript(downloadImageAtResolution, [
            mediaUrl,
            imageResolution,
          ]);
          if (result?.success) {
            logMessage(
              i18n("log_download_video_named", {
                filename: `${imageResolution.toUpperCase()} via Flow UI`,
              }),
              "success",
            );
            if (matchingTask.foundVideos >= matchingTask.expectedVideos) {
              matchingTask.status = "complete";
              logMessage(
                i18n("log_task_complete", { index: matchingTask.index }),
                "success",
              );
            }
          } else {
            logMessage(
              `Image ${imageResolution} download failed: ${result?.error || "unknown"}. Falling back to direct URL.`,
              "warn",
            );
            // Fallback: download raw URL (1K)
            chrome.runtime.sendMessage(
              { type: "downloadFile", url: mediaUrl, filename: filepath },
              () => {},
            );
          }
        } catch (err) {
          logMessage(`Image resolution download error: ${err.message}. Falling back to direct URL.`, "warn");
          chrome.runtime.sendMessage(
            { type: "downloadFile", url: mediaUrl, filename: filepath },
            () => {},
          );
        }
        await interruptibleSleep(2000);
      } else if (isImageModeForScan && imageAutoDownloadEnabled) {
        // 1K resolution - direct URL download (fastest)
        chrome.runtime.sendMessage(
          { type: "downloadFile", url: mediaUrl, filename: filepath },
          (response) => {
            if (chrome.runtime.lastError) {
              const errorMsg =
                chrome.runtime.lastError.message ||
                i18n("log_download_runtime_error");
              if (!state.stopRequested) {
                logMessage(
                  `Image auto-download failed: ${errorMsg}`,
                  "error",
                );
              }
              state.downloadedVideoUrls.delete(baseUrl);
              matchingTask.foundVideos--;
              state.newlyDownloadedCount--;
            } else if (response?.success) {
              logMessage(
                i18n("log_download_video_named", { filename: filepath }),
                "success",
              );
              if (matchingTask.foundVideos >= matchingTask.expectedVideos) {
                matchingTask.status = "complete";
                logMessage(
                  i18n("log_task_complete", { index: matchingTask.index }),
                  "success",
                );
              }
            } else {
              const errorDetail = response?.error || "unknown";
              logMessage(
                `Image auto-download failed: ${errorDetail}`,
                "error",
              );
              state.downloadedVideoUrls.delete(baseUrl);
              matchingTask.foundVideos--;
              state.newlyDownloadedCount--;
            }
          },
        );
        await interruptibleSleep(500);
      } else if (!isImageModeForScan && resolution !== "720p") {
        try {
          const result = await injectScript(downloadVideoAtResolution, [
            mediaUrl,
            resolution,
          ]);
          if (result?.success) {
            logMessage(
              i18n("log_download_video_named", {
                filename: `${resolution} via Flow UI`,
              }),
              "success",
            );
            if (matchingTask.foundVideos >= matchingTask.expectedVideos) {
              matchingTask.status = "complete";
              logMessage(
                i18n("log_task_complete", { index: matchingTask.index }),
                "success",
              );
            }
          } else {
            logMessage(
              `Resolution download failed: ${result?.error || "unknown"}`,
              "warn",
            );
            state.downloadedVideoUrls.delete(baseUrl);
            matchingTask.foundVideos--;
            state.newlyDownloadedCount--;
          }
        } catch (err) {
          logMessage(`Resolution download error: ${err.message}`, "error");
          state.downloadedVideoUrls.delete(baseUrl);
          matchingTask.foundVideos--;
          state.newlyDownloadedCount--;
        }
        await interruptibleSleep(2000);
      } else {
        chrome.runtime.sendMessage(
          { type: "downloadFile", url: mediaUrl, filename: filepath },
          (response) => {
            if (chrome.runtime.lastError) {
              const errorMsg =
                chrome.runtime.lastError.message ||
                i18n("log_download_runtime_error");
              if (
                !state.stopRequested &&
                !errorMsg.includes(i18n("log_connection_error")) &&
                !errorMsg.includes(i18n("log_receiving_end_error"))
              ) {
                logMessage(
                  i18n("log_download_request_failed", {
                    filename: filepath,
                    error: errorMsg,
                  }),
                  "error",
                );
              }
              state.downloadedVideoUrls.delete(baseUrl);
              matchingTask.foundVideos--;
              state.newlyDownloadedCount--;
            } else if (response?.success) {
              logMessage(
                i18n("log_download_video_named", { filename: filepath }),
                "success",
              );
              if (matchingTask.foundVideos >= matchingTask.expectedVideos) {
                matchingTask.status = "complete";
                logMessage(
                  i18n("log_task_complete", { index: matchingTask.index }),
                  "success",
                );
              }
            } else {
              const errorDetail =
                response?.error || i18n("log_download_unknown_error");
              logMessage(
                i18n("log_download_request_failed", {
                  filename: filepath,
                  error: errorDetail,
                }),
                "error",
              );
              state.downloadedVideoUrls.delete(baseUrl);
              matchingTask.foundVideos--;
              state.newlyDownloadedCount--;
            }
          },
        );
        await interruptibleSleep(300);
      }
    }
  }
}

export function startScanner(interval) {
  stopScanner();
  state.downloadInterval = setInterval(performScan, state.scanIntervalMs);
}

export function stopScanner() {
  if (state.downloadInterval) {
    clearInterval(state.downloadInterval);
    state.downloadInterval = null;
  }
}
