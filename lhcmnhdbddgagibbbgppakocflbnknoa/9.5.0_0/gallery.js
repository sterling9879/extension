import { dom } from "./dom.js";
import { state } from "./state.js";
import { logMessage, updateQueueModal } from "./ui.js";
import { injectScript, downloadVideoAtResolution } from "./injector.js";
import { saveImage } from "./db.js";
import { openMergeModal, executeMergeAsNewJob } from "./handlers.js";

// Helper: scroll Flow page to a specific Y position (injected into page)
function scrollToPosition(scrollY) {
  const scrollContainer = document.querySelector("[data-virtuoso-scroller]") || document.querySelector("main") || document.documentElement;
  scrollContainer.scrollTop = scrollY;
}

// Scan Flow page for generated images grouped by prompt (static snapshot of current viewport)
export function scanFlowForImages() {
  const results = [];
  try {
    const containers = document.querySelectorAll(
      "[data-index][data-item-index]",
    );
    containers.forEach((container, containerIdx) => {
      let promptText = "";
      const buttons = container.querySelectorAll("button");
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || "";
        if (
          text.length > 20 &&
          !text.includes("Add To Prompt") &&
          !text.includes("Download") &&
          !text.includes("Nano Banana") &&
          !text.includes("more_vert") &&
          !text.includes("more options") &&
          !text.includes("favorite") &&
          !text.includes("chevron")
        ) {
          promptText = text;
          break;
        }
      }
      if (!promptText || promptText.length < 15) {
        promptText = `Image ${containerIdx + 1}`;
      }
      const images = container.querySelectorAll('img[src^="http"]');
      const imageUrls = [];
      images.forEach((img, imgIdx) => {
        const src = img.getAttribute("src");
        if (
          src &&
          !src.includes("avatar") &&
          !src.includes("icon") &&
          !src.includes("googleusercontent.com/a/")
        ) {
          imageUrls.push({ url: src, containerIndex: containerIdx, imageIndex: imgIdx });
        }
      });
      if (imageUrls.length > 0) {
        results.push({ prompt: promptText.substring(0, 100), images: imageUrls, containerIndex: containerIdx });
      }
    });
  } catch (e) {
    console.error("[AutoFlow Gallery] Scan error:", e);
  }
  return results;
}

/**
 * Scroll-and-scan: Scrolls through entire Flow page incrementally, scanning
 * for images at each scroll position. Flow virtualizes rendering (only images
 * in viewport exist in DOM), so we collect data during scroll and deduplicate
 * by URL. Each image stores the scroll position where it was found so we can
 * scroll back to it later for UI-based downloads (2K/4K).
 */
function scrollAndScanAll() {
  return new Promise((resolve) => {
    // Flow uses a Virtuoso virtualizer div — NOT <main> or documentElement
    const scrollContainer =
      document.querySelector("[data-virtuoso-scroller]") || document.querySelector("main") || document.documentElement;
    const originalScroll = scrollContainer.scrollTop;
    const seenUrls = new Set();
    const allGroups = []; // { prompt, images: [{ url, scrollY, dataIndex }] }
    const groupByPrompt = {}; // prompt -> index in allGroups
    let scrollAttempts = 0;
    const maxAttempts = 60; // Support up to ~60 viewports worth of content
    let noNewFoundCount = 0;

    function scanCurrentView() {
      let foundNew = 0;
      const containers = document.querySelectorAll(
        "[data-index][data-item-index]",
      );

      containers.forEach((container) => {
        const dataIndex = container.getAttribute("data-index");
        const dataItemIndex = container.getAttribute("data-item-index");

        // Extract prompt text
        let promptText = "";
        const buttons = container.querySelectorAll("button");
        for (const btn of buttons) {
          const text = btn.textContent?.trim() || "";
          if (
            text.length > 20 &&
            !text.includes("Add To Prompt") &&
            !text.includes("Download") &&
            !text.includes("Nano Banana") &&
            !text.includes("more_vert") &&
            !text.includes("more options") &&
            !text.includes("favorite") &&
            !text.includes("chevron")
          ) {
            promptText = text;
            break;
          }
        }

        // Extract images
        const images = container.querySelectorAll('img[src^="http"]');
        images.forEach((img) => {
          const src = img.getAttribute("src");
          if (
            !src ||
            src.includes("avatar") ||
            src.includes("icon") ||
            src.includes("googleusercontent.com/a/")
          ) return;

          const baseUrl = src.split("?")[0];
          if (seenUrls.has(baseUrl)) return;
          seenUrls.add(baseUrl);
          foundNew++;

          // Use prompt or generate fallback
          const prompt = (promptText && promptText.length >= 15)
            ? promptText.substring(0, 100)
            : `Image ${(allGroups.length + 1)}`;

          // Group by prompt
          if (!(prompt in groupByPrompt)) {
            groupByPrompt[prompt] = allGroups.length;
            allGroups.push({ prompt, images: [], containerIndex: parseInt(dataIndex) || 0 });
          }

          const groupIdx = groupByPrompt[prompt];
          allGroups[groupIdx].images.push({
            url: src,
            scrollY: scrollContainer.scrollTop,
            dataIndex: dataIndex,
            dataItemIndex: dataItemIndex,
            containerIndex: parseInt(dataIndex) || 0,
            imageIndex: allGroups[groupIdx].images.length,
          });
        });
      });

      return foundNew;
    }

    function scrollStep() {
      const newFound = scanCurrentView();

      if (newFound === 0) {
        noNewFoundCount++;
      } else {
        noNewFoundCount = 0;
      }

      scrollAttempts++;

      // Stop if: hit max attempts, or scrolled past content with no new images
      const atBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 50;
      if (scrollAttempts >= maxAttempts || (atBottom && noNewFoundCount >= 2) || noNewFoundCount >= 5) {
        // Return to original position
        scrollContainer.scrollTop = originalScroll;
        console.log("[AutoFlow Gallery] Scroll-scan complete:", seenUrls.size, "unique images in", allGroups.length, "groups after", scrollAttempts, "steps");
        setTimeout(() => resolve(allGroups), 300);
        return;
      }

      // Scroll down by ~80% of container viewport (not window — Virtuoso has its own height)
      scrollContainer.scrollTop += Math.floor(scrollContainer.clientHeight * 0.8);

      // Wait for Flow to render new items (virtualized list needs time to swap DOM)
      setTimeout(scrollStep, 250);
    }

    // Start from the top to ensure we capture everything
    scrollContainer.scrollTop = 0;
    setTimeout(scrollStep, 300);
  });
}

// Inject scanner and get results
export async function refreshGallery() {
  if (!state.flowTabId) {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.url?.includes("/tools/flow")) {
        state.flowTabId = tab.id;
      } else {
        logMessage("Please navigate to a Flow project first", "warn");
        return;
      }
    } catch (e) {
      logMessage("Could not find Flow tab", "error");
      return;
    }
  }

  try {
    // Scroll through entire page, scanning at each position to beat virtualization
    logMessage("Scanning all images (scrolling through page)...", "info");
    const results = await injectScript(scrollAndScanAll, []);

    console.log("[AutoFlow Gallery] Scroll-scan results:", results);

    if (Array.isArray(results) && results.length > 0) {
      // Preserve selections across refresh by URL
      const previousSelectedUrls = new Set();
      state.selectedImages.forEach((imageId) => {
        const item = dom.galleryContainer?.querySelector(`[data-image-id="${imageId}"]`);
        if (item) previousSelectedUrls.add(item.dataset.url);
      });

      state.galleryImages = results;
      state.selectedImages.clear();

      // Restore selections by matching URLs
      results.forEach((group, groupIdx) => {
        group.images.forEach((img, imgIdx) => {
          if (previousSelectedUrls.has(img.url)) {
            state.selectedImages.add(`${groupIdx}-${imgIdx}`);
          }
        });
      });

      renderGallery();
      const totalFound = results.reduce((sum, g) => sum + g.images.length, 0);
      const restored = state.selectedImages.size;
      logMessage(
        `Found ${totalFound} images in ${results.length} groups${restored ? ` (${restored} still selected)` : ""}`,
        "success",
      );
    } else {
      state.galleryImages = [];
      renderGallery();
      logMessage("No images found on page", "info");
    }
  } catch (e) {
    console.error("[AutoFlow Gallery] Refresh error:", e);
    logMessage("Failed to scan for images: " + e.message, "error");
  }
}

// Render gallery UI
export function renderGallery() {
  if (!dom.galleryContainer) return;

  const totalImages = state.galleryImages.reduce(
    (sum, g) => sum + g.images.length,
    0,
  );

  if (dom.galleryCount) {
    dom.galleryCount.textContent = `${totalImages} images`;
  }

  if (state.galleryImages.length === 0) {
    dom.galleryContainer.innerHTML =
      '<p class="gallery-empty">No images yet. Run Nano Banana Pro to generate images, then click refresh.</p>';
    updateGalleryButtons();
    return;
  }

  let html = "";
  let globalIndex = 0;

  state.galleryImages.forEach((group, groupIdx) => {
    html += `<div class="gallery-prompt-group">`;
    html += `<div class="gallery-prompt-text">${group.prompt}</div>`;
    html += `<div class="gallery-images">`;

    group.images.forEach((img, imgIdx) => {
      const imageId = `${groupIdx}-${imgIdx}`;
      const isSelected = state.selectedImages.has(imageId);
      html += `
        <div class="gallery-image-item ${isSelected ? "selected" : ""}"
             data-image-id="${imageId}"
             data-url="${img.url}"
             data-prompt="${group.prompt}"
             data-container-index="${img.containerIndex || group.containerIndex || groupIdx}"
             data-scroll-y="${img.scrollY || 0}"
             data-data-index="${img.dataIndex || ""}"
             data-data-item-index="${img.dataItemIndex || ""}">
          <img src="${img.url}" alt="Generated image" loading="lazy">
        </div>
      `;
      globalIndex++;
    });

    html += `</div></div>`;
  });

  dom.galleryContainer.innerHTML = html;

  // Add click handlers
  dom.galleryContainer
    .querySelectorAll(".gallery-image-item")
    .forEach((item) => {
      item.addEventListener("click", () => toggleImageSelection(item));
      // Double-click to expand
      item.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        openLightbox(item.dataset.url, "image");
      });
    });

  updateGalleryButtons();
}

// Toggle image selection
function toggleImageSelection(item) {
  const imageId = item.dataset.imageId;

  if (state.selectedImages.has(imageId)) {
    state.selectedImages.delete(imageId);
    item.classList.remove("selected");
  } else {
    state.selectedImages.add(imageId);
    item.classList.add("selected");
  }

  updateGalleryButtons();
}

// Update button states
function updateGalleryButtons() {
  const count = state.selectedImages.size;

  if (dom.selectedCount) {
    dom.selectedCount.textContent = count;
  }

  if (dom.downloadSelectedBtn) {
    dom.downloadSelectedBtn.disabled = count === 0;
  }

  if (dom.addToVideoQueueBtn) {
    dom.addToVideoQueueBtn.disabled = count === 0;
  }

  if (dom.mergeToQueueBtn) {
    // Only enable merge if there are pending I2V jobs to merge into
    const hasPendingI2V = state.masterQueue.some(
      (job) => "pending" === job.status && "image-to-video" === job.mode,
    );
    dom.mergeToQueueBtn.disabled = count === 0 || !hasPendingI2V;
  }
}

// Download selected images at specified resolution
export async function downloadSelectedImages() {
  console.log("[AutoFlow Gallery] downloadSelectedImages called");
  console.log(
    "[AutoFlow Gallery] selectedImages size:",
    state.selectedImages.size,
  );
  console.log("[AutoFlow Gallery] isDownloading:", state.isDownloading);

  if (state.selectedImages.size === 0) {
    console.log("[AutoFlow Gallery] No images selected, returning");
    return;
  }
  if (state.isDownloading) {
    logMessage("Download already in progress", "warn");
    return;
  }

  const resolution = dom.downloadResolution?.value || "4k";
  console.log("[AutoFlow Gallery] Resolution:", resolution);
  logMessage(
    `Starting download of ${state.selectedImages.size} images at ${resolution.toUpperCase()}...`,
    "info",
  );

  state.isDownloading = true;

  // Collect selected image data (including stored scroll position for virtualized list)
  const toDownload = [];
  state.selectedImages.forEach((imageId) => {
    const item = dom.galleryContainer.querySelector(
      `[data-image-id="${imageId}"]`,
    );
    if (item) {
      toDownload.push({
        id: imageId,
        url: item.dataset.url,
        prompt: item.dataset.prompt,
        containerIndex: parseInt(item.dataset.containerIndex) || 0,
        scrollY: parseInt(item.dataset.scrollY) || 0,
        dataIndex: item.dataset.dataIndex || "",
        dataItemIndex: item.dataset.dataItemIndex || "",
      });
    }
  });

  // Download 3 at a time (Flow's limit)
  const batchSize = 3;
  let downloaded = 0;

  for (let i = 0; i < toDownload.length; i += batchSize) {
    const batch = toDownload.slice(i, i + batchSize);

    // Download this batch - one at a time to avoid UI conflicts
    for (let batchIdx = 0; batchIdx < batch.length; batchIdx++) {
      const img = batch[batchIdx];
      try {
        await downloadSingleImage(img, resolution, downloaded + batchIdx + 1);
        downloaded++;
        logMessage(`Downloaded ${downloaded}/${toDownload.length}`, "info");
        // Wait between downloads to let Flow UI settle
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        logMessage(`Failed to download image: ${e.message}`, "error");
      }
    }

    // Wait between batches if more to come
    if (i + batchSize < toDownload.length) {
      logMessage(
        `Waiting before next batch... (${downloaded}/${toDownload.length} done)`,
        "info",
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  state.isDownloading = false;
  logMessage(
    `Download complete! ${downloaded}/${toDownload.length} images saved.`,
    "success",
  );
}

/**
 * Scroll-aware download: Scrolls to the stored position where the image was
 * originally found, waits for Flow to re-render it in the virtualized list,
 * then finds the container by matching the image URL and clicks download.
 * Injected into the page context.
 */
export function downloadWithResolution(imageUrl, scrollY, resolution) {
  return new Promise((resolve, reject) => {
    try {
      console.log("[AutoFlow] downloadWithResolution:", { imageUrl: imageUrl?.substring(0, 60), scrollY, resolution });

      const scrollContainer = document.querySelector("main") || document.documentElement;

      // Scroll to the stored position where this image was found
      scrollContainer.scrollTop = scrollY;

      // Wait for Flow to re-render the virtualized list at this position
      setTimeout(() => {
        // Find container by matching image URL (reliable across virtualization)
        let container = null;
        const allImages = document.querySelectorAll('img[src^="http"]');
        const urlBase = imageUrl.split("?")[0];

        for (const img of allImages) {
          if (img.src.split("?")[0] === urlBase) {
            // Walk up to find the [data-index] container
            let el = img;
            for (let i = 0; i < 15 && el; i++) {
              if (el.hasAttribute && el.hasAttribute("data-index") && el.hasAttribute("data-item-index")) {
                container = el;
                break;
              }
              el = el.parentElement;
            }
            break;
          }
        }

        if (!container) {
          console.log("[AutoFlow] Container not found after scroll for:", urlBase.substring(0, 60));
          reject("Container not found after scroll - image may have moved");
          return;
        }

        // Hover over image to reveal download button
        const img = container.querySelector("img");
        if (img) {
          img.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
          img.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        }

        setTimeout(() => {
          // Find download button
          let downloadBtnParent = null;
          const allButtons = container.querySelectorAll("button");

          // Method 1: button with aria-haspopup containing download icon
          const downloadBtn = container.querySelector('button[aria-haspopup="menu"] i.google-symbols');
          downloadBtnParent = downloadBtn?.closest("button");

          // Method 2: icon text
          if (!downloadBtnParent) {
            for (const icon of container.querySelectorAll('i.google-symbols, i[class*="google-symbols"]')) {
              if (icon.textContent?.toLowerCase().includes("download")) {
                downloadBtnParent = icon.closest("button");
                break;
              }
            }
          }

          // Method 3: aria-label
          if (!downloadBtnParent) {
            for (const btn of allButtons) {
              if (btn.getAttribute("aria-label")?.toLowerCase().includes("download")) {
                downloadBtnParent = btn;
                break;
              }
            }
          }

          if (!downloadBtnParent) {
            reject("Download button not found in container");
            return;
          }

          downloadBtnParent.click();

          // Wait for resolution menu
          setTimeout(() => {
            const resMap = { "1k": "1K", "2k": "2K", "4k": "4K" };
            const targetRes = resMap[resolution] || "4K";
            const menuItems = document.querySelectorAll('[role="menuitem"]');
            let found = false;

            for (const item of menuItems) {
              if (item.textContent?.includes(targetRes)) {
                item.click();
                found = true;
                break;
              }
            }

            resolve(found ? "started" : "auto");
          }, 600);
        }, 400);
      }, 500); // Wait 500ms for Flow to render after scroll
    } catch (e) {
      reject(e.message);
    }
  });
}

// Download a single image - scrolls to stored position for Flow UI downloads
async function downloadSingleImage(img, resolution, index) {
  try {
    // Use scroll-aware download that navigates to stored position first
    const result = await injectScript(downloadWithResolution, [
      img.url,
      img.scrollY || 0,
      resolution,
    ]);
    return result;
  } catch (e) {
    console.error("[AutoFlow Gallery] Flow UI download failed, falling back to direct:", e);

    // Fallback to direct URL download (always 1K)
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").substring(0, 15);
    const filename = `image_${index}_${timestamp}.png`;
    const folder = dom.jobDownloadFolderInput?.value || "Flow-Gallery";

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "downloadFile", url: img.url, filename: `${folder}/${filename}` },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve();
          } else {
            reject(new Error(response?.error || "Download failed"));
          }
        },
      );
    });
  }
}

// Add selected images to video queue
export async function addSelectedToVideoQueue() {
  console.log("[AutoFlow Gallery] → Video button clicked");
  console.log("[AutoFlow Gallery] Selected images:", state.selectedImages.size);
  console.log(
    "[AutoFlow Gallery] Prompt mapping:",
    state.imageToVideoPromptMap,
  );

  if (state.selectedImages.size === 0) {
    logMessage("No images selected", "warn");
    return;
  }

  logMessage("Processing selected images...", "info");

  const selectedData = [];
  let missingVideoPrompts = 0;

  state.selectedImages.forEach((imageId) => {
    const item = dom.galleryContainer.querySelector(
      `[data-image-id="${imageId}"]`,
    );
    if (item) {
      const imagePrompt = item.dataset.prompt;
      // Look up video prompt - try exact match first, then partial match
      let videoPrompt = state.imageToVideoPromptMap[imagePrompt];

      if (!videoPrompt) {
        // Try partial match (prompt might be truncated in gallery)
        for (const [imgP, vidP] of Object.entries(
          state.imageToVideoPromptMap,
        )) {
          if (imgP.startsWith(imagePrompt) || imagePrompt.startsWith(imgP)) {
            videoPrompt = vidP;
            break;
          }
        }
      }

      if (videoPrompt) {
        selectedData.push({
          url: item.dataset.url,
          imagePrompt: imagePrompt,
          videoPrompt: videoPrompt,
        });
      } else {
        missingVideoPrompts++;
        console.log(
          "[AutoFlow Gallery] No video prompt found for:",
          imagePrompt,
        );
      }
    }
  });

  if (missingVideoPrompts > 0 && selectedData.length === 0) {
    logMessage(
      "No video prompts found. Use format: image prompt ||| video prompt",
      "error",
    );
    return;
  }

  if (selectedData.length === 0) {
    logMessage("No valid images to process", "error");
    return;
  }

  try {
    // Fetch images and save to IndexedDB
    const savedImages = [];
    const videoPrompts = [];

    for (let i = 0; i < selectedData.length; i++) {
      const item = selectedData[i];
      logMessage(`Fetching image ${i + 1}/${selectedData.length}...`, "info");

      try {
        const response = await fetch(item.url);
        const blob = await response.blob();
        const file = new File([blob], `gallery_image_${i + 1}.png`, {
          type: blob.type || "image/png",
        });

        const savedRef = await saveImage(file);
        savedImages.push(savedRef);
        videoPrompts.push(item.videoPrompt);
      } catch (fetchErr) {
        console.error("[AutoFlow Gallery] Failed to fetch image:", fetchErr);
        logMessage(`Failed to fetch image ${i + 1}`, "warn");
      }
    }

    if (savedImages.length === 0) {
      logMessage("Failed to save any images", "error");
      return;
    }

    // Create job and add to masterQueue
    const mergeData = { prompts: videoPrompts, images: savedImages };
    executeMergeAsNewJob(mergeData);

    console.log("[AutoFlow Gallery] Created video job with", savedImages.length, "images");

    // Clear selection
    state.selectedImages.clear();
    renderGallery();
  } catch (err) {
    console.error("[AutoFlow Gallery] Error adding to video queue:", err);
    logMessage("Error adding to queue: " + err.message, "error");
  }
}

// ==================== VIDEO GALLERY ====================

// State for video gallery
state.galleryVideos = [];
state.selectedVideos = new Set();
state.videoPlaybackSpeed = 1;

// Scan Flow page for generated videos
async function mergeSelectedToExistingQueue() {
  if (state.selectedImages.size === 0) {
    logMessage("No images selected", "warn");
    return;
  }

  // Check if there are existing pending I2V jobs to merge into
  const pendingI2V = state.masterQueue.filter(
    (job) => "pending" === job.status && "image-to-video" === job.mode,
  );

  if (pendingI2V.length === 0) {
    logMessage("No pending video jobs to merge into. Use 'Frame to Video' to create a new job.", "warn");
    return;
  }

  logMessage("Processing selected images for merge...", "info");

  const selectedData = [];
  let missingVideoPrompts = 0;

  state.selectedImages.forEach((imageId) => {
    const item = dom.galleryContainer.querySelector(
      `[data-image-id="${imageId}"]`,
    );
    if (item) {
      const imagePrompt = item.dataset.prompt;
      let videoPrompt = state.imageToVideoPromptMap[imagePrompt];

      if (!videoPrompt) {
        for (const [imgP, vidP] of Object.entries(
          state.imageToVideoPromptMap,
        )) {
          if (imgP.startsWith(imagePrompt) || imagePrompt.startsWith(imgP)) {
            videoPrompt = vidP;
            break;
          }
        }
      }

      if (videoPrompt) {
        selectedData.push({
          url: item.dataset.url,
          imagePrompt: imagePrompt,
          videoPrompt: videoPrompt,
        });
      } else {
        missingVideoPrompts++;
      }
    }
  });

  if (selectedData.length === 0) {
    logMessage(
      "No video prompts found. Use format: image prompt ||| video prompt",
      "error",
    );
    return;
  }

  try {
    const savedImages = [];
    const videoPrompts = [];

    for (let i = 0; i < selectedData.length; i++) {
      const item = selectedData[i];
      logMessage(`Fetching image ${i + 1}/${selectedData.length}...`, "info");
      try {
        const response = await fetch(item.url);
        const blob = await response.blob();
        const file = new File([blob], `gallery_image_${i + 1}.png`, {
          type: blob.type || "image/png",
        });
        const savedRef = await saveImage(file);
        savedImages.push(savedRef);
        videoPrompts.push(item.videoPrompt);
      } catch (fetchErr) {
        logMessage(`Failed to fetch image ${i + 1}`, "warn");
      }
    }

    if (savedImages.length === 0) {
      logMessage("Failed to save any images", "error");
      return;
    }

    openMergeModal({ prompts: videoPrompts, images: savedImages });

    state.selectedImages.clear();
    renderGallery();
  } catch (err) {
    logMessage("Error preparing merge: " + err.message, "error");
  }
}

export function scanFlowForVideos() {
  const videoList = [];
  try {
    const allVideos = document.querySelectorAll("video");
    allVideos.forEach((video, idx) => {
      let src = video.getAttribute("src");
      if (!src || !src.startsWith("http")) {
        const source = video.querySelector("source");
        if (source) src = source.getAttribute("src");
      }
      if (!src || !src.startsWith("http")) return;
      let promptText = "";
      let container = video.parentElement;
      for (let i = 0; i < 20 && container; i++) {
        const buttons = container.querySelectorAll("button");
        for (const btn of buttons) {
          const t = btn.textContent?.trim() || "";
          if (t.length > 15 && t.length < 300 && !t.includes("Download") && !t.includes("Add To") && !t.includes("more_vert") && !t.includes("favorite")) {
            promptText = t; break;
          }
        }
        if (promptText) break;
        const textEls = container.querySelectorAll("span, p, div");
        for (const el of textEls) {
          const t = el.textContent?.trim() || "";
          if (t.length > 15 && t.length < 300 && (t.startsWith("[") || t.includes("shot") || t.includes("view") || t.includes("wireframe"))) {
            promptText = t; break;
          }
        }
        if (promptText) break;
        container = container.parentElement;
      }
      if (!promptText || promptText.length < 5) promptText = "";
      videoList.push({ url: src, prompt: promptText.substring(0, 150), videoIndex: idx });
    });
  } catch (e) {
    console.error("[AutoFlow Video Gallery] Scan error:", e);
  }
  return videoList;
}

// Scroll-and-scan for videos (Flow uses Virtuoso virtualizer)
function scrollAndScanAllVideos() {
  return new Promise((resolve) => {
    // Flow uses a Virtuoso virtualizer div — NOT <main> or documentElement
    const scrollContainer = document.querySelector("[data-virtuoso-scroller]") || document.querySelector("main") || document.documentElement;
    const originalScroll = scrollContainer.scrollTop;
    const seenUrls = new Set();
    const allVideos = [];
    let scrollAttempts = 0;
    const maxAttempts = 200;

    function findPromptText(video) {
      let container = video.parentElement;
      for (let i = 0; i < 20 && container; i++) {
        // Look for prompt div (class contains sc-e6a99d5c-3 or similar)
        const divs = container.querySelectorAll("div");
        for (const el of divs) {
          // Only check direct text content (not inherited from children)
          const directText = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("");
          if (directText.length > 15 && directText.length < 400 && (directText.startsWith("[") || directText.includes("shot") || directText.includes("view") || directText.includes("wireframe") || directText.includes("holographic") || directText.includes("neon"))) {
            return directText;
          }
        }
        container = container.parentElement;
      }
      return "";
    }

    function scanCurrentView() {
      let foundNew = 0;
      const videos = document.querySelectorAll("video");
      videos.forEach((video) => {
        let src = video.getAttribute("src");
        if (!src || !src.startsWith("http")) {
          const source = video.querySelector("source");
          if (source) src = source.getAttribute("src");
        }
        if (!src || !src.startsWith("http")) return;

        const baseUrl = src.split("?")[0];
        if (seenUrls.has(baseUrl)) return;
        seenUrls.add(baseUrl);
        foundNew++;

        const promptText = findPromptText(video);

        allVideos.push({
          url: src,
          prompt: promptText ? promptText.substring(0, 150) : "",
          videoIndex: allVideos.length,
          scrollY: scrollContainer.scrollTop,
        });
      });
      return foundNew;
    }

    function scrollStep() {
      scanCurrentView();
      scrollAttempts++;

      // Check if we've reached the bottom of the Virtuoso container
      const atBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 20;

      if (scrollAttempts >= maxAttempts || atBottom) {
        scanCurrentView();
        scrollContainer.scrollTop = originalScroll;
        console.log("[AutoFlow Video Gallery] Scroll-scan complete:", seenUrls.size, "unique videos after", scrollAttempts, "steps");
        setTimeout(() => resolve(allVideos), 300);
        return;
      }

      // Scroll by 70% of the container's visible height (not window)
      scrollContainer.scrollTop += Math.floor(scrollContainer.clientHeight * 0.7);
      setTimeout(scrollStep, 350);
    }

    scrollContainer.scrollTop = 0;
    setTimeout(scrollStep, 400);
  });
}

// Refresh video gallery
export async function refreshVideoGallery() {
  if (!state.flowTabId) {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.url?.includes("/tools/flow")) {
        state.flowTabId = tab.id;
      } else {
        logMessage("Please navigate to a Flow project first", "warn");
        return;
      }
    } catch (e) {
      logMessage("Could not find Flow tab", "error");
      return;
    }
  }

  try {
    logMessage("Scanning all videos (scrolling through page)...", "info");
    const results = await injectScript(scrollAndScanAllVideos, []);
    console.log("[AutoFlow Video Gallery] Scroll-scan results:", results);

    if (Array.isArray(results) && results.length > 0) {
      // Preserve selections across refresh by converting URL-based selections
      const previousSelectedUrls = new Set();
      state.selectedVideos.forEach((videoId) => {
        const item = dom.videoGalleryContainer?.querySelector(`[data-video-id="${videoId}"]`);
        if (item) previousSelectedUrls.add(item.dataset.url);
      });

      state.galleryVideos = results;
      state.selectedVideos.clear();

      // Restore selections by matching URLs to new indices
      results.forEach((vid, idx) => {
        if (previousSelectedUrls.has(vid.url)) {
          state.selectedVideos.add(`v-${idx}`);
        }
      });

      renderVideoGallery();
      const restored = state.selectedVideos.size;
      logMessage(`Found ${results.length} videos${restored ? ` (${restored} still selected)` : ""}`, "success");
    } else {
      state.galleryVideos = [];
      renderVideoGallery();
      logMessage("No videos found on page", "info");
    }
  } catch (e) {
    console.error("[AutoFlow Video Gallery] Refresh error:", e);
    logMessage("Failed to scan for videos: " + e.message, "error");
  }
}

// Render video gallery
export function renderVideoGallery() {
  if (!dom.videoGalleryContainer) return;

  const totalVideos = state.galleryVideos.length;

  if (dom.videoGalleryCount) {
    dom.videoGalleryCount.textContent = `${totalVideos} videos`;
  }

  if (totalVideos === 0) {
    dom.videoGalleryContainer.innerHTML =
      '<p class="gallery-empty">No videos yet. Generate videos, then click refresh.</p>';
    updateVideoGalleryButtons();
    return;
  }

  // Render as a flat grid - all videos side by side
  let html = '<div class="video-gallery-grid">';

  state.galleryVideos.forEach((vid, idx) => {
    const videoId = `v-${idx}`;
    const isSelected = state.selectedVideos.has(videoId);
    // Extract tag like [C14], [V1-S1], etc. from prompt
    const tagMatch = (vid.prompt || "").match(/\[([^\]]+)\]/);
    const tag = tagMatch ? tagMatch[0] : `#${idx + 1}`;
    html += `
      <div class="gallery-video-item ${isSelected ? "selected" : ""}"
           data-video-id="${videoId}"
           data-url="${vid.url}"
           data-prompt="${vid.prompt || ""}"
           data-scroll-y="${vid.scrollY || 0}">
        <div class="video-tag-label">${tag}</div>
        <video data-src="${vid.url}" loop playsinline preload="none"></video>
      </div>
    `;
  });

  html += "</div>";
  dom.videoGalleryContainer.innerHTML = html;

  // Add click handlers and hover play
  dom.videoGalleryContainer
    .querySelectorAll(".gallery-video-item")
    .forEach((item) => {
      const video = item.querySelector("video");

      item.addEventListener("click", () => toggleVideoSelection(item));

      // Double-click to expand
      item.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        openLightbox(item.dataset.url, "video");
      });

      // Lazy-load: set src on hover, then play
      item.addEventListener("mouseenter", () => {
        if (video) {
          // Load video src if not already loaded (or was unloaded after poster capture)
          if ((!video.src || !video.src.startsWith("http")) && video.dataset.src) {
            video.src = video.dataset.src;
          }
          video.playbackRate = state.videoPlaybackSpeed;
          video.play().catch(() => {});
        }
      });

      item.addEventListener("mouseleave", () => {
        if (video) {
          video.pause();
          // Capture first frame as poster on first leave (so thumbnail persists)
          if (!video.poster && video.readyState >= 2) {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = video.videoWidth || 160;
              canvas.height = video.videoHeight || 90;
              canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
              video.poster = canvas.toDataURL("image/jpeg", 0.6);
            } catch (e) { /* cross-origin, ignore */ }
          }
          video.currentTime = 0;
        }
      });
    });

  // Lazy thumbnail generation: load first frame for videos scrolled into view
  // Only loads 4 at a time to avoid bandwidth congestion
  const observer = new IntersectionObserver((entries) => {
    let loading = 0;
    entries.forEach((entry) => {
      if (!entry.isIntersecting || loading >= 4) return;
      const video = entry.target.querySelector("video");
      if (!video || video.poster || video.src) return;
      loading++;
      video.src = video.dataset.src;
      video.preload = "metadata";
      video.addEventListener("loadeddata", () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 160;
          canvas.height = video.videoHeight || 90;
          canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
          video.poster = canvas.toDataURL("image/jpeg", 0.6);
        } catch (e) { /* cross-origin */ }
        // Unload the video data after capturing poster to free memory
        video.removeAttribute("src");
        video.load();
      }, { once: true });
      observer.unobserve(entry.target);
    });
  }, { root: dom.videoGalleryContainer, rootMargin: "200px", threshold: 0 });

  dom.videoGalleryContainer.querySelectorAll(".gallery-video-item").forEach((item) => {
    observer.observe(item);
  });

  updateVideoGalleryButtons();
}

// Toggle video selection
function toggleVideoSelection(item) {
  const videoId = item.dataset.videoId;

  if (state.selectedVideos.has(videoId)) {
    state.selectedVideos.delete(videoId);
    item.classList.remove("selected");
  } else {
    state.selectedVideos.add(videoId);
    item.classList.add("selected");
  }

  updateVideoGalleryButtons();
}

// Update video gallery buttons
function updateVideoGalleryButtons() {
  const count = state.selectedVideos.size;

  if (dom.selectedVideoCount) {
    dom.selectedVideoCount.textContent = count;
  }

  if (dom.downloadSelectedVideosBtn) {
    dom.downloadSelectedVideosBtn.disabled = count === 0;
  }
}

// Show/hide download progress UI
function setDownloadUIState(active) {
  if (dom.downloadSelectedVideosBtn) {
    dom.downloadSelectedVideosBtn.style.display = active ? "none" : "";
  }
  if (dom.cancelVideoDownloadBtn) {
    dom.cancelVideoDownloadBtn.style.display = active ? "" : "none";
  }
  if (dom.videoDownloadProgress) {
    dom.videoDownloadProgress.style.display = active ? "block" : "none";
  }
}

function updateDownloadProgress(current, total, message) {
  if (dom.videoDownloadProgressCount) {
    dom.videoDownloadProgressCount.textContent = `${current}/${total}`;
  }
  if (dom.videoDownloadProgressBar) {
    dom.videoDownloadProgressBar.style.width = `${total > 0 ? (current / total) * 100 : 0}%`;
  }
  if (dom.videoDownloadProgressText && message) {
    dom.videoDownloadProgressText.textContent = message;
  }
}

// Download selected videos at resolution — queue-based with upscale awareness
export async function downloadSelectedVideos() {
  if (state.selectedVideos.size === 0) return;
  if (state.isDownloading) {
    logMessage("Download already in progress", "warn");
    return;
  }

  const resolution = dom.videoDownloadRes?.value || "720p";
  const needsUpscale = resolution === "1080p" || resolution === "4k";

  logMessage(
    `Starting download of ${state.selectedVideos.size} videos at ${resolution}${needsUpscale ? " (upscaling — processing one at a time)" : ""}...`,
    "info",
  );

  state.isDownloading = true;
  state.downloadCancelled = false;

  // Show progress UI, hide download button
  setDownloadUIState(true);

  const toDownload = [];
  state.selectedVideos.forEach((videoId) => {
    const item = dom.videoGalleryContainer.querySelector(
      `[data-video-id="${videoId}"]`,
    );
    if (item) {
      toDownload.push({
        id: videoId,
        url: item.dataset.url,
        scrollY: parseInt(item.dataset.scrollY) || 0,
      });
    }
  });

  const total = toDownload.length;
  let downloaded = 0;
  let failed = 0;

  updateDownloadProgress(0, total, needsUpscale ? "Upscaling & downloading..." : "Downloading...");

  if (needsUpscale) {
    // === UPSCALE MODE: Process one at a time with generous wait ===
    // Flow can only handle ~3 concurrent upscales. We go one at a time to be safe.
    for (const vid of toDownload) {
      if (state.downloadCancelled) break;

      updateDownloadProgress(downloaded, total, `Upscaling ${downloaded + 1}/${total}...`);

      try {
        // Scroll to video position
        await injectScript(scrollToPosition, [vid.scrollY]);
        await new Promise((r) => setTimeout(r, 600));

        if (state.downloadCancelled) break;

        // Click download → select resolution (triggers upscale)
        const result = await injectScript(downloadVideoAtResolution, [vid.url, resolution]);

        if (result?.success) {
          downloaded++;
          logMessage(`Upscaling ${downloaded}/${total}...`, "info");
          updateDownloadProgress(downloaded, total, `Upscaling ${downloaded}/${total}...`);
        } else {
          failed++;
          logMessage(`Failed: ${result?.error || "unknown"}`, "warn");
        }

        // Wait for upscale to complete before starting next
        // 1080p takes ~15-25s, 4K takes ~25-45s
        const upscaleWait = resolution === "4k" ? 35000 : 20000;
        const waitStep = 1000;
        let waited = 0;
        while (waited < upscaleWait && !state.downloadCancelled) {
          await new Promise((r) => setTimeout(r, waitStep));
          waited += waitStep;
        }
      } catch (e) {
        failed++;
        logMessage(`Download error: ${e.message}`, "error");
      }
    }
  } else {
    // === 720p MODE: Fast sequential (no upscale needed) ===
    for (const vid of toDownload) {
      if (state.downloadCancelled) break;

      updateDownloadProgress(downloaded, total, `Downloading ${downloaded + 1}/${total}...`);

      try {
        await injectScript(scrollToPosition, [vid.scrollY]);
        await new Promise((r) => setTimeout(r, 400));

        if (state.downloadCancelled) break;

        const result = await injectScript(downloadVideoAtResolution, [vid.url, resolution]);
        if (result?.success) {
          downloaded++;
          logMessage(`Downloaded ${downloaded}/${total}`, "info");
          updateDownloadProgress(downloaded, total, `Downloaded ${downloaded}/${total}`);
        } else {
          failed++;
          logMessage(`Failed: ${result?.error || "unknown"}`, "warn");
        }
        // Short delay between 720p downloads (no upscale)
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        failed++;
        logMessage(`Download error: ${e.message}`, "error");
      }
    }
  }

  state.isDownloading = false;
  state.downloadCancelled = false;

  // Restore UI
  setDownloadUIState(false);

  if (downloaded === total) {
    logMessage(`Download complete! ${downloaded}/${total} videos saved.`, "success");
  } else if (downloaded > 0) {
    logMessage(`Download stopped: ${downloaded}/${total} saved, ${failed} failed.`, "warn");
  } else {
    logMessage(`Download cancelled.`, "warn");
  }
}

// Update playback speed for all videos
function updateVideoSpeed(speed, source) {
  speed = Math.max(0.25, Math.min(6, parseFloat(speed) || 1));
  state.videoPlaybackSpeed = speed;

  // Sync slider and input
  if (source !== "slider" && dom.videoSpeedSlider) {
    dom.videoSpeedSlider.value = speed;
  }
  if (source !== "input" && dom.videoSpeedInput) {
    dom.videoSpeedInput.value = speed;
  }

  // Update any playing videos
  dom.videoGalleryContainer?.querySelectorAll("video").forEach((v) => {
    v.playbackRate = speed;
  });
}

// Attach gallery event listeners
export function attachGalleryListeners() {
  console.log("[AutoFlow Gallery] Attaching listeners...");

  // Image gallery listeners
  if (dom.refreshGalleryBtn) {
    dom.refreshGalleryBtn.addEventListener("click", refreshGallery);
  }

  if (dom.downloadSelectedBtn) {
    dom.downloadSelectedBtn.addEventListener("click", () => {
      downloadSelectedImages();
    });
  }

  if (dom.addToVideoQueueBtn) {
    dom.addToVideoQueueBtn.addEventListener("click", addSelectedToVideoQueue);
  }

  if (dom.mergeToQueueBtn) {
    dom.mergeToQueueBtn.addEventListener("click", mergeSelectedToExistingQueue);
  }

  // Video gallery listeners
  if (dom.refreshVideoGalleryBtn) {
    dom.refreshVideoGalleryBtn.addEventListener("click", refreshVideoGallery);
  }

  // Sync gallery resolution dropdown → state + storage + settings dropdown
  if (dom.videoDownloadRes) {
    dom.videoDownloadRes.addEventListener("change", (e) => {
      state.videoDownloadResolution = e.target.value;
      chrome.storage.local.set({ videoDownloadResolution: e.target.value });
      if (dom.videoDownloadResolution) {
        dom.videoDownloadResolution.value = e.target.value;
      }
    });
  }

  if (dom.downloadSelectedVideosBtn) {
    dom.downloadSelectedVideosBtn.addEventListener(
      "click",
      downloadSelectedVideos,
    );
  }

  if (dom.cancelVideoDownloadBtn) {
    dom.cancelVideoDownloadBtn.addEventListener("click", () => {
      state.downloadCancelled = true;
      logMessage("Cancelling downloads...", "warn");
      if (dom.videoDownloadProgressText) {
        dom.videoDownloadProgressText.textContent = "Cancelling...";
      }
    });
  }

  if (dom.videoSpeedSlider) {
    dom.videoSpeedSlider.addEventListener("input", (e) => {
      updateVideoSpeed(e.target.value, "slider");
    });
  }

  if (dom.videoSpeedInput) {
    dom.videoSpeedInput.addEventListener("input", (e) => {
      updateVideoSpeed(e.target.value, "input");
    });
  }

  // Gallery sub-tab switching
  document.querySelectorAll(".gallery-subtab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.gallery;

      // Update tab states
      document
        .querySelectorAll(".gallery-subtab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // Show/hide panes
      document.getElementById("imagesGalleryPane").style.display =
        target === "images" ? "block" : "none";
      document.getElementById("videosGalleryPane").style.display =
        target === "videos" ? "block" : "none";
    });
  });

  // Lightbox close handlers
  const lightbox = document.getElementById("galleryLightbox");
  if (lightbox) {
    lightbox.addEventListener("click", closeLightbox);
    lightbox
      .querySelector(".lightbox-close")
      ?.addEventListener("click", closeLightbox);
    // Escape key to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && lightbox.classList.contains("active")) {
        closeLightbox();
      }
    });
  }

  console.log("[AutoFlow Gallery] All listeners attached");
}

// ==================== LIGHTBOX ====================

// Open lightbox with image or video
function openLightbox(url, type) {
  const lightbox = document.getElementById("galleryLightbox");
  const lightboxImg = document.getElementById("lightboxImage");
  const lightboxVid = document.getElementById("lightboxVideo");

  if (!lightbox) return;

  if (type === "video") {
    lightboxImg.style.display = "none";
    lightboxVid.style.display = "block";
    lightboxVid.src = url;
    lightboxVid.playbackRate = state.videoPlaybackSpeed;
    lightboxVid.play().catch(() => {});
  } else {
    lightboxVid.style.display = "none";
    lightboxVid.pause();
    lightboxImg.style.display = "block";
    lightboxImg.src = url;
  }

  lightbox.classList.add("active");
}

// Close lightbox
function closeLightbox() {
  const lightbox = document.getElementById("galleryLightbox");
  const lightboxVid = document.getElementById("lightboxVideo");

  if (lightbox) {
    lightbox.classList.remove("active");
  }
  if (lightboxVid) {
    lightboxVid.pause();
    lightboxVid.src = "";
  }
}
