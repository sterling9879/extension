import { state } from "./state.js";
import { logMessage } from "./ui.js";
import { i18n } from "./i18n.js";
import { scanForPolicyError, injectScript } from "./injector.js";

export const naturalSortCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function getProjectIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/project\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => {
      logMessage(i18n("log_file_read_error", { filename: file.name }), "error");
      resolve(null);
    };
    reader.readAsDataURL(file);
  });
}

export function sortImageFiles(sortOrder) {
  if (!state.imageFileList || state.imageFileList.length === 0) return;

  switch (sortOrder) {
    case "az":
      state.imageFileList.sort((a, b) =>
        naturalSortCollator.compare(a.name, b.name),
      );
      break;
    case "za":
      state.imageFileList.sort((a, b) =>
        naturalSortCollator.compare(b.name, a.name),
      );
      break;
    case "newest":
      state.imageFileList.sort((a, b) => b.lastModified - a.lastModified);
      break;
    case "oldest":
      state.imageFileList.sort((a, b) => a.lastModified - b.lastModified);
      break;
  }
}

export function getRandomWait(minInput, maxInput) {
  const minVal = parseInt(minInput || "90", 10) || 90;
  const maxVal = parseInt(maxInput || "120", 10) || 120;
  const lower = Math.min(minVal, maxVal);
  const upper = Math.max(minVal, maxVal);
  return Math.max(
    1000,
    1000 * (Math.floor(Math.random() * (upper - lower + 1)) + lower),
  );
}

export async function pauseIfNeeded() {
  while (state.isPaused && !state.stopRequested) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export async function interruptibleSleep(durationMs) {
  const endTime = Date.now() + durationMs;
  while (Date.now() < endTime) {
    await pauseIfNeeded();
    if (state.stopRequested) return true;
    const remaining = endTime - Date.now();
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(250, remaining > 0 ? remaining : 0)),
    );
  }
  return false;
}

export async function interruptibleSleepAndScan(durationMs) {
  const endTime = Date.now() + durationMs;
  let nextScanTime = Date.now() + 4000;

  while (Date.now() < endTime) {
    await pauseIfNeeded();
    if (state.stopRequested) return "STOPPED";

    const now = Date.now();
    if (now >= nextScanTime) {
      try {
        if (await injectScript(scanForPolicyError)) return "POLICY_ERROR";
      } catch (_ignoredError) {}
      nextScanTime = now + 1000;
    }

    const remaining = endTime - now;
    const sleepTime = Math.min(
      250,
      remaining > 0 ? remaining : 0,
      nextScanTime - now,
    );
    await new Promise((resolve) =>
      setTimeout(resolve, sleepTime > 0 ? sleepTime : 0),
    );
  }
  return "COMPLETED";
}

export async function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const listener = (updatedTabId, _changeInfo, tab) => {
      if (
        updatedTabId === tabId &&
        tab.status === "complete" &&
        tab.url.includes("/project/")
      ) {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(i18n("log_page_reload_fail")));
    }, 60000);
  });
}
