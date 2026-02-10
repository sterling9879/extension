import { state } from "./state.js";
import { logMessage } from "./ui.js";
import { i18n } from "./i18n.js";

/**
 * Main wrapper that injects a function into the Flow page's context
 * via chrome.scripting.executeScript. Automatically appends state.selectors
 * as the last argument so injected functions can access XPath selectors.
 *
 * @param {Function} func - The function to inject and execute on the page
 * @param {Array} args - Arguments to pass to the function (selectors appended automatically)
 * @returns {*} The return value from the injected function, or undefined on error
 */
export async function injectScript(func, args = []) {
  let tabId = state.flowTabId;

  // If we don't have a stored Flow tab ID, try to find the active tab
  if (!tabId) {
    try {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!activeTab?.url?.includes("/tools/flow")) {
        logMessage(i18n("log_critical_error"), "error");
        return;
      }
      tabId = activeTab.id;
      state.flowTabId = activeTab.id;
    } catch (_err) {
      logMessage(i18n("log_critical_error"), "error");
      return;
    }
  }

  // Verify the tab still exists
  try {
    await chrome.tabs.get(tabId);
  } catch (tabError) {
    // Side effect: reads state.isRunning || state.downloadInterval (original minified behavior)
    state.isRunning || state.downloadInterval;
    throw tabError;
  }

  // Execute the function in the page's MAIN world
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: func,
      args: [...args, state.selectors],
      world: "MAIN",
    });

    // Handle chrome.runtime.lastError
    if (chrome.runtime.lastError) {
      const errorMsg =
        chrome.runtime.lastError.message ||
        i18n("log_unknown_runtime_error");

      // Silently ignore known connection/tab errors when appropriate
      if (
        state.stopRequested ||
        errorMsg.includes(i18n("log_connection_error")) ||
        errorMsg.includes(i18n("log_no_tab_error")) ||
        errorMsg.includes(i18n("log_receiving_end_error")) ||
        errorMsg.includes(i18n("log_target_page_error"))
      ) {
        // Only silently ignore if running/downloading and it's not a "no tab" + is "target page" error
        (state.isRunning || state.downloadInterval) &&
          !errorMsg.includes(i18n("log_no_tab_error")) &&
          errorMsg.includes(i18n("log_target_page_error"));
      } else {
        logMessage(
          i18n("log_scripting_error", {
            error: i18n("log_runtime_error", { error: errorMsg }),
          }),
          "error",
        );
      }
      return;
    }

    // Handle errors returned from the injected script
    if (results?.[0]?.error) {
      logMessage(
        i18n("log_scripting_error", {
          error: i18n("log_injected_script_error", {
            error: results[0].error.message || results[0].error,
          }),
        }),
        "error",
      );
      return;
    }

    // Return the result if it exists
    if (void 0 !== results?.[0]?.result) {
      return results[0].result;
    }
    return undefined;
  } catch (catchError) {
    const errorMsg = catchError.message || String(catchError);

    // Silently ignore known connection errors when stop was requested or tab is gone
    if (
      state.stopRequested ||
      errorMsg.includes(i18n("log_connection_error")) ||
      errorMsg.includes(i18n("log_no_tab_error"))
    ) {
      state.isRunning || state.downloadInterval;
    } else {
      logMessage(
        i18n("log_scan_inject_failed", { error: errorMsg }),
        "error",
      );
    }
    return;
  }
}

// ============================================================================
// PAGE-INJECTED FUNCTIONS
// These functions are passed to chrome.scripting.executeScript and run
// inside the Flow page's DOM context. They do NOT have access to the
// extension's scope -- only to the page's `document`, `window`, etc.
// The last parameter is always the `selectors` object (appended by injectScript).
// ============================================================================

/**
 * Click a DOM element found by XPath. Falls back to dispatching a MouseEvent.
 */
export function clickElementByXPath(xpath) {
  try {
    const element = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (element) {
      try {
        element.click();
        return true;
      } catch (_clickErr) {
        try {
          element.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );
          return true;
        } catch (_dispatchErr) {
          return false;
        }
      }
    }
    return;
  } catch (_err) {
    return;
  }
}

/**
 * Click the "New Project" button using XPath from selectors.
 */
export function clickNewProjectButton(selectors) {
  const xpath = selectors?.NEW_PROJECT_BUTTON_XPATH;
  if (!xpath) return false;

  let button = null;
  try {
    button = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
  } catch (_err) {
    return false;
  }

  if (button) {
    try {
      button.click();
      return true;
    } catch (_err) {
      return false;
    }
  }
  return false;
}

/**
 * Check if the "queue full" popup is visible on the page.
 */
export async function scanForQueueFullPopup(selectors) {
  return !!document.evaluate(
    selectors.QUEUE_FULL_POPUP_XPATH,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue;
}

/**
 * Set the prompt text in the textarea, then click the generate button.
 * Polls for up to 30 attempts to find an enabled generate button.
 * Returns true on success, or a status string ("QUEUE_FULL", "POLICY_PROMPT",
 * "RATE_LIMIT") if an error popup appears, or false on failure.
 */
export async function processPromptOnPage(
  promptText,
  textareaId,
  generateButtonXPath,
  selectors,
) {
  if (!textareaId || !generateButtonXPath) return false;

  const textarea = document.getElementById(textareaId);
  if (!textarea) return false;

  const genBtnXPath = generateButtonXPath;

  // Set the prompt text using React-compatible value setter
  try {
    textarea.focus();
    await new Promise((resolve) => setTimeout(resolve, 50));
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    ).set.call(textarea, promptText);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    textarea.blur();
    await new Promise((resolve) => setTimeout(resolve, 50));
  } catch (_err) {
    return false;
  }

  // Poll for the generate button to become enabled
  for (let attempt = 0; attempt < 30; attempt++) {
    let generateButton = null;
    try {
      generateButton = document.evaluate(
        genBtnXPath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
    } catch (_err) {}

    if (generateButton && !generateButton.disabled) {
      try {
        generateButton.click();
        await new Promise((resolve) => setTimeout(resolve, 1e3));

        // Check for error popups after clicking generate
        for (let checkIdx = 0; checkIdx < 10; checkIdx++) {
          if (
            document.evaluate(
              selectors.QUEUE_FULL_POPUP_XPATH,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue
          )
            return "QUEUE_FULL";

          if (
            document.evaluate(
              selectors.PROMPT_POLICY_ERROR_POPUP_XPATH,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue
          )
            return "POLICY_PROMPT";

          if (
            selectors.RATE_LIMIT_POPUP_XPATH &&
            document.evaluate(
              selectors.RATE_LIMIT_POPUP_XPATH,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue
          )
            return "RATE_LIMIT";

          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
        return true;
      } catch (_err) {
        return false;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

/**
 * Switch Flow's mode dropdown to "Image-to-Video".
 */
export async function selectImageMode(selectors) {
  try {
    const dropdown = document.evaluate(
      selectors.MODE_DROPDOWN_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (!dropdown) return false;

    // Already in Image-to-Video mode
    if (
      dropdown.textContent &&
      (dropdown.textContent.includes("Tạo video từ các khung hình") ||
        dropdown.textContent.includes("Image-to-Video"))
    )
      return true;

    // Open dropdown and select Image-to-Video
    dropdown.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const modeOption = document.evaluate(
      selectors.IMAGE_TO_VIDEO_MODE_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (!modeOption) return false;

    modeOption.click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Switch Flow's mode dropdown to "Text-to-Video".
 */
export async function selectTextMode(selectors) {
  try {
    const dropdown = document.evaluate(
      selectors.MODE_DROPDOWN_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (!dropdown) return false;

    // Already in Text-to-Video mode
    if (
      dropdown.textContent &&
      (dropdown.textContent.includes("Từ văn") ||
        dropdown.textContent.includes("Text-to-Video"))
    )
      return true;

    // Open dropdown and select Text-to-Video
    dropdown.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const modeOption = document.evaluate(
      selectors.TEXT_TO_VIDEO_MODE_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (!modeOption) return false;

    modeOption.click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Switch Flow's mode dropdown to "Create Image".
 */
export async function selectCreateImageMode(selectors) {
  try {
    const dropdown = document.evaluate(
      selectors.MODE_DROPDOWN_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (!dropdown) return false;

    // Already in Create Image mode
    if (
      dropdown.textContent &&
      (dropdown.textContent.includes("Create Image") ||
        dropdown.textContent.includes("Tạo ảnh"))
    )
      return true;

    // Open dropdown and select Create Image
    dropdown.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const modeOption = document.evaluate(
      selectors.CREATE_IMAGE_MODE_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (!modeOption) return false;

    modeOption.click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Scan the page for result containers and group newly found images by prompt.
 * Filters out images whose base URLs are already in knownImageUrls.
 *
 * @param {string[]} knownImageUrls - Base URLs of already-known images
 * @param {object} selectors - XPath selectors
 * @returns {Array<{prompt: string, images: string[]}>}
 */
export function findAndGroupNewImages(knownImageUrls, selectors) {
  const groups = [];
  const containerXPath = selectors.RESULT_CONTAINER_XPATH;
  const promptButtonXPath =
    ".//button[normalize-space(.) != '' and following-sibling::div//text()[contains(., 'Veo') or contains(., 'Nano') or contains(., 'Imagen')]]";
  const imagesXPath = selectors.IMAGES_IN_CONTAINER_XPATH;

  if (!containerXPath || !promptButtonXPath || !imagesXPath) return [];

  try {
    const containerIterator = document.evaluate(
      containerXPath,
      document,
      null,
      XPathResult.ORDERED_NODE_ITERATOR_TYPE,
      null,
    );
    let container = containerIterator.iterateNext();

    while (container) {
      try {
        const promptButton = document.evaluate(
          promptButtonXPath,
          container,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;

        if (promptButton && promptButton.textContent) {
          const promptText = promptButton.textContent.trim();
          const newImages = [];

          const imageIterator = document.evaluate(
            imagesXPath,
            container,
            null,
            XPathResult.ORDERED_NODE_ITERATOR_TYPE,
            null,
          );
          let imageNode = imageIterator.iterateNext();

          while (imageNode) {
            const src = imageNode.getAttribute("src");
            if (src && (src.startsWith("http") || src.startsWith("data:"))) {
              const baseUrl = src.split("?")[0];
              if (!knownImageUrls.includes(baseUrl)) {
                newImages.push(src);
              }
            }
            imageNode = imageIterator.iterateNext();
          }

          if (newImages.length > 0) {
            groups.push({ prompt: promptText, images: newImages });
          }
        }
      } catch (_err) {}
      container = containerIterator.iterateNext();
    }
  } catch (_err) {}

  return groups;
}

/**
 * Collect all existing image src URLs on the page (base URLs without query params).
 */
export function scanExistingImages() {
  const urls = new Set();
  try {
    document
      .querySelectorAll('img[src^="http"],img[src^="data:"]')
      .forEach((img) => {
        const src = img.getAttribute("src");
        if (src) urls.add(src.split("?")[0]);
      });
  } catch (_err) {}
  return Array.from(urls);
}

/**
 * Open the settings panel and configure video generation settings:
 * output count, model, and aspect ratio. Closes settings when done.
 *
 * @param {number} outputCount - Number of outputs (1-4)
 * @param {string} model - Model key (e.g. "veo2_fast", "veo3_quality", "default")
 * @param {string} aspectRatio - "portrait" or "landscape"
 * @param {object} selectors - XPath selectors
 */
export async function setInitialSettings(
  outputCount,
  model,
  aspectRatio,
  selectors,
) {
  try {
    // Open settings panel
    const settingsButton = document.evaluate(
      selectors.SETTINGS_BUTTON_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    if (!settingsButton) return false;

    settingsButton.click();
    await new Promise((resolve) => setTimeout(resolve, 1e3));

    // --- Output count ---
    const outputCountXPaths = {
      1: selectors.OUTPUT_NUMBER_ONE_XPATH,
      2: selectors.OUTPUT_NUMBER_TWO_XPATH,
      3: selectors.OUTPUT_NUMBER_THREE_XPATH,
      4: selectors.OUTPUT_NUMBER_FOUR_XPATH,
    };

    const outputNumberButton = document.evaluate(
      selectors.OUTPUT_NUMBER_BUTTON_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    if (!outputNumberButton) return false;

    outputNumberButton.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const outputOption = document.evaluate(
      outputCountXPaths[outputCount],
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    if (!outputOption) return false;

    outputOption.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // --- Model selection ---
    const modelXPaths = {
      veo2_fast: selectors.MODEL_VEO_2_FAST_XPATH,
      veo3_quality: selectors.MODEL_VEO_3_QUALITY_XPATH,
      veo2_quality: selectors.MODEL_VEO_2_QUALITY_XPATH,
      default: selectors.MODEL_VEO_3_FAST_XPATH,
      veo3_fast_low: selectors.MODEL_VEO_3_FAST_LOW_XPATH,
    };
    const resolvedModelKey =
      model !== "default" && modelXPaths[model] ? model : "default";

    const modelSelectionButton = document.evaluate(
      selectors.MODEL_SELECTION_BUTTON_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    if (!modelSelectionButton) return false;

    modelSelectionButton.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const modelOption = document.evaluate(
      modelXPaths[resolvedModelKey],
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    if (!modelOption) return false;

    modelOption.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // --- Aspect ratio ---
    const aspectRatioDropdown = document.evaluate(
      selectors.ASPECT_RATIO_DROPDOWN_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    if (!aspectRatioDropdown) return false;

    aspectRatioDropdown.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const ratioXPath =
      aspectRatio === "portrait"
        ? selectors.PORTRAIT_ASPECT_RATIO_XPATH
        : selectors.LANDSCAPE_ASPECT_RATIO_XPATH;

    const ratioOption = document.evaluate(
      ratioXPath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (!ratioOption) return false;

    ratioOption.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Close the settings panel with Escape
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        keyCode: 27,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1e3));

    return true;
  } catch (_err) {
    // Try to close settings on error
    try {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          keyCode: 27,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
    } catch (_innerErr) {}
    return false;
  }
}

/**
 * Configure image generation settings by interacting with combobox buttons:
 * outputs per prompt, aspect ratio, and model (Nano Banana Pro).
 *
 * @param {number|string} count - Number of outputs
 * @param {string} model - Model name (currently always selects "Nano Banana Pro")
 * @param {string} ratio - "portrait" or "landscape"
 * @param {object} selectors - XPath selectors (unused, kept for API compatibility)
 */
export async function setImageSettings(count, model, ratio, selectors) {
  try {
    console.log("[AutoFlow] setImageSettings called with:", {
      count: count,
      model: model,
      ratio: ratio,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Open the settings (tune) dialog
    const tuneBtn = document.querySelector(
      'button[aria-haspopup="dialog"] i.material-icons',
    );
    const tuneBtnParent = tuneBtn?.closest("button");
    if (tuneBtnParent && tuneBtn?.textContent?.includes("tune")) {
      console.log("[AutoFlow] Found settings (tune) button, clicking...");
      tuneBtnParent.click();
      await new Promise((resolve) => setTimeout(resolve, 800));
    } else {
      console.log("[AutoFlow] Settings (tune) button not found");
    }

    // --- Outputs per prompt ---
    const outputsBtn = [
      ...document.querySelectorAll('button[role="combobox"]'),
    ].find(
      (btn) =>
        btn.textContent?.includes("Outputs per prompt") ||
        btn.textContent?.includes("output"),
    );
    if (outputsBtn) {
      console.log("[AutoFlow] Found Outputs per prompt button, clicking...");
      outputsBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const options = document.querySelectorAll('[role="option"]');
      console.log("[AutoFlow] Found output options:", options.length);
      for (const opt of options) {
        const optText = opt.textContent?.trim();
        if (optText === count || optText === String(count)) {
          console.log("[AutoFlow] Clicking output option:", optText);
          opt.click();
          await new Promise((resolve) => setTimeout(resolve, 500));
          break;
        }
      }
    } else {
      console.log("[AutoFlow] Outputs per prompt button not found");
    }

    // --- Aspect ratio ---
    const ratioBtn = [
      ...document.querySelectorAll('button[role="combobox"]'),
    ].find((btn) => {
      const text = btn.textContent || "";
      return (
        text.includes("Aspect") ||
        text.includes("Landscape") ||
        text.includes("Portrait") ||
        text.includes("16:9") ||
        text.includes("9:16")
      );
    });
    if (ratioBtn) {
      console.log("[AutoFlow] Found Aspect Ratio button, clicking...");
      ratioBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const options = document.querySelectorAll('[role="option"]');
      console.log("[AutoFlow] Found ratio options:", options.length);
      const targetRatio = ratio === "portrait" ? "Portrait" : "Landscape";
      for (const opt of options) {
        const optText = opt.textContent || "";
        if (optText.includes(targetRatio)) {
          console.log("[AutoFlow] Clicking ratio option:", optText);
          opt.click();
          await new Promise((resolve) => setTimeout(resolve, 500));
          break;
        }
      }
    } else {
      console.log("[AutoFlow] Aspect Ratio button not found");
    }

    // --- Model selection (Nano Banana Pro) ---
    const modelBtn = [
      ...document.querySelectorAll('button[role="combobox"]'),
    ].find((btn) => {
      const text = btn.textContent || "";
      return (
        text.includes("Model") ||
        text.includes("Nano") ||
        text.includes("Imagen")
      );
    });
    if (modelBtn) {
      console.log("[AutoFlow] Found Model button, clicking...");
      modelBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const options = document.querySelectorAll('[role="option"]');
      console.log("[AutoFlow] Found model options:", options.length);
      for (const opt of options) {
        const optText = opt.textContent || "";
        if (optText.includes("Nano Banana Pro")) {
          console.log("[AutoFlow] Clicking model option:", optText);
          opt.click();
          await new Promise((resolve) => setTimeout(resolve, 500));
          break;
        }
      }
    } else {
      console.log("[AutoFlow] Model button not found");
    }

    // Close any open dropdowns
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        keyCode: 27,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    document.body.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    console.log("[AutoFlow] setImageSettings completed");
    return true;
  } catch (err) {
    console.error("[AutoFlow] setImageSettings error:", err);
    try {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          keyCode: 27,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
    } catch (_innerErr) {}
    return false;
  }
}

/**
 * Upload an image file via URL, optionally crop it, then enter a prompt and
 * click generate. Used for Image-to-Video mode.
 *
 * @param {string} imageDataUrl - URL or data URL of the image to upload
 * @param {string} fileName - Name for the uploaded file
 * @param {string} fileType - MIME type of the file
 * @param {string} promptText - The prompt to enter
 * @param {string} orientation - "portrait" or "landscape" for crop ratio
 * @param {object} selectors - XPath selectors
 */
export async function processImageAndPromptOnPage(
  imageDataUrl,
  fileName,
  fileType,
  promptText,
  orientation,
  selectors,
) {
  try {
    // Wait for the "Add Image" button to become enabled (up to 180s)
    let addImageButton = null;
    let addImageTimeout = 180000;
    const addImagePollInterval = 500;

    while (addImageTimeout > 0) {
      try {
        addImageButton = document.evaluate(
          selectors.START_IMAGE_ADD_BUTTON_XPATH,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;
      } catch (_err) {}

      if (addImageButton && !addImageButton.disabled) {
        addImageButton.click();
        await new Promise((resolve) => setTimeout(resolve, 2e3));
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, addImagePollInterval));
      addImageTimeout -= addImagePollInterval;
    }
    if (addImageTimeout <= 0) return false;

    // Wait for the hidden file input to appear (up to 10s)
    let fileInput = null;
    let fileInputTimeout = 10000;
    const fileInputPollInterval = 250;

    while (fileInputTimeout > 0) {
      let inputSnapshot = null;
      try {
        inputSnapshot = document.evaluate(
          selectors.HIDDEN_FILE_INPUT_XPATH,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );
      } catch (_err) {}

      if (inputSnapshot && inputSnapshot.snapshotLength > 0) {
        fileInput = inputSnapshot.snapshotItem(
          inputSnapshot.snapshotLength - 1,
        );
        break;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, fileInputPollInterval),
      );
      fileInputTimeout -= fileInputPollInterval;
    }
    if (!fileInput) return false;

    // Fetch the image and set it on the file input
    const fetchResponse = await fetch(imageDataUrl);
    const imageBlob = await fetchResponse.blob();
    const imageFile = new File([imageBlob], fileName, { type: fileType });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(imageFile);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    // Wait for upload spinner to disappear
    let spinner = document.evaluate(
      selectors.UPLOAD_SPINNER_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (spinner) {
      let spinnerTimeout = 180000;
      const spinnerPollInterval = 500;
      while (spinner && spinnerTimeout > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, spinnerPollInterval),
        );
        spinnerTimeout -= spinnerPollInterval;
        spinner = document.evaluate(
          selectors.UPLOAD_SPINNER_XPATH,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;
      }
      if (spinnerTimeout <= 0) return false;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 2e3));
    }

    // Handle crop ratio selection if dropdown exists
    const cropRatioDropdown = document.evaluate(
      selectors.IMAGE_CROP_RATIO_DROPDOWN_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (cropRatioDropdown) {
      cropRatioDropdown.click();
      await new Promise((resolve) => setTimeout(resolve, 500));

      const cropRatioXPath =
        orientation === "portrait"
          ? selectors.IMAGE_CROP_RATIO_PORTRAIT_XPATH
          : selectors.IMAGE_CROP_RATIO_LANDSCAPE_XPATH;

      const cropRatioOption = document.evaluate(
        cropRatioXPath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;

      if (cropRatioOption) {
        cropRatioOption.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Click "Crop and Save" if present
    const cropAndSaveButton = document.evaluate(
      selectors.CROP_AND_SAVE_BUTTON_XPATH,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (cropAndSaveButton) {
      cropAndSaveButton.click();
      await new Promise((resolve) => setTimeout(resolve, 1e3));
    }

    // Enter the prompt
    const textarea = document.getElementById(selectors.PROMPT_TEXTAREA_ID);
    if (!textarea) return false;

    textarea.focus();
    await new Promise((resolve) => setTimeout(resolve, 50));
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    ).set.call(textarea, promptText);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    textarea.blur();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Wait before looking for generate button
    await new Promise((resolve) => setTimeout(resolve, 4e3));

    // Poll for generate button (up to 180s)
    let generateButton = null;
    let genTimeout = 180000;
    const genPollInterval = 1000;
    let genElapsed = 0;

    while (genElapsed < genTimeout) {
      // Check for image policy error
      try {
        if (
          document.evaluate(
            selectors.IMAGE_POLICY_ERROR_POPUP_XPATH,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue
        )
          return "POLICY_IMAGE";
      } catch (_err) {}

      // Look for generate button
      try {
        generateButton = document.evaluate(
          selectors.GENERATE_BUTTON_XPATH,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;
      } catch (_err) {}

      if (generateButton && !generateButton.disabled) {
        generateButton.click();
        await new Promise((resolve) => setTimeout(resolve, 1e3));

        // Check for error popups after clicking
        for (let checkIdx = 0; checkIdx < 10; checkIdx++) {
          if (
            document.evaluate(
              selectors.QUEUE_FULL_POPUP_XPATH,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue
          )
            return "QUEUE_FULL";

          if (
            document.evaluate(
              selectors.PROMPT_POLICY_ERROR_POPUP_XPATH,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue
          )
            return "POLICY_PROMPT";

          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, genPollInterval));
      genElapsed += genPollInterval;
    }
    return false;
  } catch (_err) {
    return false;
  }
}

/**
 * Scan the page for result containers and group newly found videos by prompt.
 * Filters out videos whose base URLs are already in knownVideoUrls.
 *
 * @param {string[]} knownVideoUrls - Base URLs of already-known videos
 * @param {object} selectors - XPath selectors
 * @returns {Array<{prompt: string, videos: string[]}>}
 */
export function findAndGroupNewVideos(knownVideoUrls, selectors) {
  const groups = [];
  const containerXPath = selectors.RESULT_CONTAINER_XPATH;
  const promptXPath = selectors.PROMPT_IN_CONTAINER_XPATH;
  const videosXPath = selectors.VIDEOS_IN_CONTAINER_XPATH;

  if (!containerXPath || !promptXPath || !videosXPath) return [];

  try {
    const containerIterator = document.evaluate(
      containerXPath,
      document,
      null,
      XPathResult.ORDERED_NODE_ITERATOR_TYPE,
      null,
    );
    let container = containerIterator.iterateNext();

    while (container) {
      try {
        const promptElement = document.evaluate(
          promptXPath,
          container,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;

        if (promptElement && promptElement.textContent) {
          const promptText = promptElement.textContent.trim();
          const newVideos = [];

          const videoIterator = document.evaluate(
            videosXPath,
            container,
            null,
            XPathResult.ORDERED_NODE_ITERATOR_TYPE,
            null,
          );
          let videoNode = videoIterator.iterateNext();

          while (videoNode) {
            const src = videoNode.getAttribute("src");
            if (src && src.startsWith("http")) {
              const baseUrl = src.split("?")[0];
              if (!knownVideoUrls.includes(baseUrl)) {
                newVideos.push(src);
              }
            }
            videoNode = videoIterator.iterateNext();
          }

          if (newVideos.length > 0) {
            groups.push({ prompt: promptText, videos: newVideos });
          }
        }
      } catch (_err) {}
      container = containerIterator.iterateNext();
    }
  } catch (_err) {}

  return groups;
}

/**
 * Collect all existing video src URLs on the page (base URLs without query params).
 */
export function scanExistingVideos() {
  const urls = new Set();
  try {
    document.querySelectorAll('video[src^="http"]').forEach((video) => {
      const src = video.getAttribute("src");
      if (src) urls.add(src.split("?")[0]);
    });
  } catch (_err) {}
  return Array.from(urls);
}

/**
 * Check if the prompt policy error popup is visible on the page.
 */
export function scanForPolicyError(selectors) {
  return !!document.evaluate(
    selectors.PROMPT_POLICY_ERROR_POPUP_XPATH,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue;
}

// Download video at specific resolution via Flow's UI
export async function downloadVideoAtResolution(videoUrl, resolution) {
  try {
    console.log("[AutoFlow] downloadVideoAtResolution:", {
      videoUrl: videoUrl?.substring(0, 80),
      resolution,
    });

    // Find video element by URL (unique identifier)
    const allVideos = document.querySelectorAll('video[src^="http"]');
    const urlBase = videoUrl?.split("?")[0];
    let targetVideo = null;

    for (const vid of allVideos) {
      const vidUrl = vid.getAttribute("src")?.split("?")[0];
      if (vidUrl === urlBase) {
        targetVideo = vid;
        console.log("[AutoFlow] Found video by URL match");
        break;
      }
    }

    if (!targetVideo) {
      console.log(
        "[AutoFlow] Video not found by URL. Available videos:",
        allVideos.length,
      );
      return { success: false, error: "Video not found" };
    }

    // Find the video card container - walk up DOM to find download button area
    // Based on Flow's HTML structure: video is inside nested divs, download button is a sibling area
    let container = targetVideo.parentElement;
    for (let i = 0; i < 10 && container; i++) {
      // Look for a container that has the download button
      const downloadBtn = container.querySelector(
        'button[aria-haspopup="menu"] i.google-symbols',
      );
      if (
        downloadBtn &&
        downloadBtn.textContent?.toLowerCase().includes("download")
      ) {
        break;
      }
      container = container.parentElement;
    }

    if (!container) {
      console.log("[AutoFlow] Container not found for video");
      return { success: false, error: "Container not found" };
    }

    // Hover to reveal buttons
    targetVideo.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    targetVideo.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));

    // Find the download button - button with aria-haspopup="menu" containing google-symbols download icon
    let downloadBtn = null;
    const buttons = container.querySelectorAll('button[aria-haspopup="menu"]');

    for (const btn of buttons) {
      const icon = btn.querySelector("i.google-symbols");
      if (icon && icon.textContent?.toLowerCase().includes("download")) {
        downloadBtn = btn;
        break;
      }
    }

    // Fallback: any button with download icon
    if (!downloadBtn) {
      const icons = container.querySelectorAll("i.google-symbols");
      for (const icon of icons) {
        if (icon.textContent?.toLowerCase().includes("download")) {
          downloadBtn = icon.closest("button");
          break;
        }
      }
    }

    if (!downloadBtn) {
      console.log("[AutoFlow] Download button not found");
      return { success: false, error: "Download button not found" };
    }

    console.log("[AutoFlow] Clicking download button");
    downloadBtn.click();
    await new Promise((r) => setTimeout(r, 500));

    // Map resolution to menu text
    const resMap = {
      "720p": "Original",
      "1080p": "1080p",
      "4k": "4K",
    };
    const targetText = resMap[resolution] || "Original";

    // Find menu items
    const menuItems = document.querySelectorAll('[role="menuitem"]');
    console.log("[AutoFlow] Found menu items:", menuItems.length);

    let found = false;
    for (const item of menuItems) {
      const text = item.textContent || "";
      if (text.includes(targetText)) {
        console.log("[AutoFlow] Clicking resolution:", text);
        item.click();
        found = true;
        break;
      }
    }

    if (!found) {
      // Close menu if no option found
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      console.log(
        "[AutoFlow] Resolution option not found, menu items:",
        Array.from(menuItems).map((m) => m.textContent),
      );
      return { success: false, error: "Resolution option not found" };
    }

    return { success: true };
  } catch (e) {
    console.error("[AutoFlow] downloadVideoAtResolution error:", e);
    return { success: false, error: e.message };
  }
}

// Download image at specific resolution via Flow's UI (1K/2K/4K)
export async function downloadImageAtResolution(imageUrl, resolution) {
  try {
    console.log("[AutoFlow] downloadImageAtResolution:", {
      imageUrl: imageUrl?.substring(0, 80),
      resolution,
    });

    const allImages = document.querySelectorAll('img[src^="http"]');
    const urlBase = imageUrl?.split("?")[0];
    let targetImg = null;

    for (const img of allImages) {
      const imgUrl = img.getAttribute("src")?.split("?")[0];
      if (imgUrl === urlBase) {
        targetImg = img;
        break;
      }
    }

    if (!targetImg) {
      console.log(
        "[AutoFlow] Image not found by URL. Available images:",
        allImages.length,
      );
      return { success: false, error: "Image not found" };
    }

    // Walk up DOM to find container with download button
    let container = targetImg.parentElement;
    for (let i = 0; i < 10 && container; i++) {
      const downloadBtn = container.querySelector(
        'button[aria-haspopup="menu"] i.google-symbols',
      );
      if (
        downloadBtn &&
        downloadBtn.textContent?.toLowerCase().includes("download")
      ) {
        break;
      }
      container = container.parentElement;
    }

    if (!container) {
      console.log("[AutoFlow] Container not found for image");
      return { success: false, error: "Container not found" };
    }

    // Hover to reveal buttons
    targetImg.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    targetImg.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));

    // Find download button
    let downloadBtn = null;
    const buttons = container.querySelectorAll('button[aria-haspopup="menu"]');

    for (const btn of buttons) {
      const icon = btn.querySelector("i.google-symbols");
      if (icon && icon.textContent?.toLowerCase().includes("download")) {
        downloadBtn = btn;
        break;
      }
    }

    if (!downloadBtn) {
      const icons = container.querySelectorAll("i.google-symbols");
      for (const icon of icons) {
        if (icon.textContent?.toLowerCase().includes("download")) {
          downloadBtn = icon.closest("button");
          break;
        }
      }
    }

    if (!downloadBtn) {
      console.log("[AutoFlow] Download button not found for image");
      return { success: false, error: "Download button not found" };
    }

    console.log("[AutoFlow] Clicking image download button");
    downloadBtn.click();
    await new Promise((r) => setTimeout(r, 500));

    // Map resolution to menu text
    const resMap = { "1k": "1K", "2k": "2K", "4k": "4K" };
    const targetText = resMap[resolution] || "4K";

    const menuItems = document.querySelectorAll('[role="menuitem"]');
    console.log("[AutoFlow] Found menu items:", menuItems.length);

    let found = false;
    for (const item of menuItems) {
      const text = item.textContent || "";
      if (text.includes(targetText)) {
        console.log("[AutoFlow] Clicking image resolution:", text);
        item.click();
        found = true;
        break;
      }
    }

    if (!found) {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      console.log("[AutoFlow] Image resolution option not found");
      return { success: false, error: "Resolution option not found" };
    }

    return { success: true };
  } catch (e) {
    console.error("[AutoFlow] downloadImageAtResolution error:", e);
    return { success: false, error: e.message };
  }
}

// Process prompt with reference images for Create Image mode (image-to-image)
// refImages can be a single image object or an array of image objects
export async function processPromptWithRefImage(refImages, prompt, selectors) {
  try {
    // Normalize to array and reverse so image 1 uploads last (ends up leftmost/most important in Flow)
    const images = Array.isArray(refImages) ? [...refImages].reverse() : [refImages];
    console.log(
      "[AutoFlow] processPromptWithRefImage started with",
      images.length,
      "reference image(s) (reversed for correct Flow ordering)",
    );

    // Upload each reference image
    for (let imgIndex = 0; imgIndex < images.length; imgIndex++) {
      const refImg = images[imgIndex];
      const refImageDataUrl = refImg.dataUrl || refImg;
      const refImageName = refImg.name || `ref_${imgIndex}.png`;
      const refImageType = refImg.type || "image/png";

      console.log(
        "[AutoFlow] Uploading reference image",
        imgIndex + 1,
        ":",
        refImageName,
      );

      // Find and click the add button
      let addBtn = null;

      if (imgIndex === 0) {
        // First image - use the main add button
        const addBtnXPaths = [
          selectors.START_IMAGE_ADD_BUTTON_XPATH,
          "//button[.//i[text()='add'] and .//div[@data-type='button-overlay']]",
          "//button[contains(@class, 'add') or .//i[text()='add_photo_alternate']]",
        ];

        for (const xpath of addBtnXPaths) {
          if (!xpath) continue;
          try {
            addBtn = document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue;
            if (addBtn) break;
          } catch (e) {}
        }

        // Fallback: look for button with "add" icon and overlay
        if (!addBtn) {
          const buttons = document.querySelectorAll("button");
          for (const btn of buttons) {
            const icon = btn.querySelector("i");
            if (icon && icon.textContent?.includes("add")) {
              const overlay = btn.querySelector('[data-type="button-overlay"]');
              if (overlay) {
                addBtn = btn;
                break;
              }
            }
          }
        }
      } else {
        // Subsequent images - find the next "add" button (they all have overlay)
        console.log("[AutoFlow] Looking for additional add button...");
        await new Promise((r) => setTimeout(r, 500));

        // All add buttons have the same structure with overlay
        // We need to find all of them and click one that's available
        const addBtnXPath = "//button[.//i[contains(text(),'add')]]";
        try {
          const results = document.evaluate(
            addBtnXPath,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null,
          );
          console.log(
            "[AutoFlow] Found",
            results.snapshotLength,
            "add buttons total",
          );

          // Get the last add button (usually the one for adding more images)
          if (results.snapshotLength > 0) {
            // Try to find the button that's near the image thumbnails area (bottom of screen)
            for (let i = results.snapshotLength - 1; i >= 0; i--) {
              const btn = results.snapshotItem(i);
              const rect = btn.getBoundingClientRect();
              // Check if visible and in the lower part of the screen (where the input area is)
              if (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.top > window.innerHeight / 2
              ) {
                addBtn = btn;
                console.log(
                  "[AutoFlow] Using add button at index",
                  i,
                  "position:",
                  rect.top,
                );
                break;
              }
            }
            // Fallback to last button if none found in lower area
            if (!addBtn) {
              addBtn = results.snapshotItem(results.snapshotLength - 1);
              console.log("[AutoFlow] Fallback to last add button");
            }
          }
        } catch (e) {
          console.log("[AutoFlow] Error finding add buttons:", e);
        }
      }

      if (!addBtn) {
        if (imgIndex === 0) {
          console.log(
            "[AutoFlow] No reference image add button found, proceeding without reference",
          );
          return await processPromptOnPage(
            prompt,
            selectors.PROMPT_TEXTAREA_ID,
            selectors.GENERATE_BUTTON_XPATH,
            selectors,
          );
        } else {
          console.log(
            "[AutoFlow] No more add buttons found, continuing with",
            imgIndex,
            "images",
          );
          break;
        }
      }

      // Click the add button
      addBtn.click();
      await new Promise((r) => setTimeout(r, 2000));

      // Find file input
      let fileInput = null;
      let waitTime = 10000;
      const waitStep = 250;

      while (waitTime > 0) {
        try {
          const inputs = document.evaluate(
            selectors.HIDDEN_FILE_INPUT_XPATH,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null,
          );
          if (inputs && inputs.snapshotLength > 0) {
            fileInput = inputs.snapshotItem(inputs.snapshotLength - 1);
            break;
          }
        } catch (e) {}
        await new Promise((r) => setTimeout(r, waitStep));
        waitTime -= waitStep;
      }

      if (!fileInput) {
        console.log("[AutoFlow] File input not found for image", imgIndex + 1);
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        if (imgIndex === 0) {
          return await processPromptOnPage(
            prompt,
            selectors.PROMPT_TEXTAREA_ID,
            selectors.GENERATE_BUTTON_XPATH,
            selectors,
          );
        }
        break;
      }

      // Upload the reference image
      const response = await fetch(refImageDataUrl);
      const blob = await response.blob();
      const file = new File([blob], refImageName, { type: refImageType });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      // Wait for upload - use spinner detection with fallback timing
      console.log("[AutoFlow] Waiting for image", imgIndex + 1, "to upload...");

      // Wait a moment for upload to start
      await new Promise((r) => setTimeout(r, 1500));

      // Check for and handle crop dialog
      for (let i = 0; i < 10; i++) {
        const cropBtn = document.evaluate(
          selectors.CROP_AND_SAVE_BUTTON_XPATH,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;
        if (cropBtn) {
          console.log("[AutoFlow] Crop dialog found, clicking...");
          cropBtn.click();
          await new Promise((r) => setTimeout(r, 1500));
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      // Wait for spinner to disappear (max 15 seconds)
      for (let i = 0; i < 30; i++) {
        const spinner = document.evaluate(
          selectors.UPLOAD_SPINNER_XPATH,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;
        if (!spinner) {
          console.log(
            "[AutoFlow] Image",
            imgIndex + 1,
            "upload complete (no spinner)",
          );
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      // Extra wait to ensure image is fully processed before next action
      await new Promise((r) => setTimeout(r, 1000));
      console.log("[AutoFlow] Ready for next image or prompt");
    }

    console.log("[AutoFlow] All reference images uploaded, entering prompt");

    // Enter the prompt
    const textArea = document.getElementById(selectors.PROMPT_TEXTAREA_ID);
    if (!textArea) {
      console.log("[AutoFlow] Textarea not found");
      return false;
    }

    textArea.focus();
    await new Promise((r) => setTimeout(r, 50));
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    ).set.call(textArea, prompt);
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    textArea.blur();
    await new Promise((r) => setTimeout(r, 50));

    // Wait for generate button and click
    await new Promise((r) => setTimeout(r, 2000));

    let genBtn = null;
    let genWait = 180000;
    const genStep = 1000;

    while (genWait > 0) {
      // Check for policy errors
      try {
        if (
          document.evaluate(
            selectors.IMAGE_POLICY_ERROR_POPUP_XPATH,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue
        ) {
          return "POLICY_IMAGE";
        }
      } catch (e) {}

      try {
        genBtn = document.evaluate(
          selectors.GENERATE_BUTTON_XPATH,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;
      } catch (e) {}

      if (genBtn && !genBtn.disabled) {
        genBtn.click();
        await new Promise((r) => setTimeout(r, 1000));

        // Check for errors after click
        for (let i = 0; i < 10; i++) {
          if (
            document.evaluate(
              selectors.QUEUE_FULL_POPUP_XPATH,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue
          ) {
            return "QUEUE_FULL";
          }
          if (
            document.evaluate(
              selectors.PROMPT_POLICY_ERROR_POPUP_XPATH,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue
          ) {
            return "POLICY_PROMPT";
          }
          if (
            selectors.RATE_LIMIT_POPUP_XPATH &&
            document.evaluate(
              selectors.RATE_LIMIT_POPUP_XPATH,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue
          ) {
            return "RATE_LIMIT";
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        console.log(
          "[AutoFlow] processPromptWithRefImage completed successfully",
        );
        return true;
      }

      await new Promise((r) => setTimeout(r, genStep));
      genWait -= genStep;
    }

    return false;
  } catch (e) {
    console.error("[AutoFlow] processPromptWithRefImage error:", e);
    return false;
  }
}

// Select already-uploaded reference images from picker instead of re-uploading
// imageCount = number of reference images to select from picker
export async function processPromptWithExistingRefImages(
  imageCount,
  prompt,
  selectors,
) {
  try {
    console.log(
      "[AutoFlow] processPromptWithExistingRefImages: selecting",
      imageCount,
      "images from picker",
    );

    for (let imgIndex = 0; imgIndex < imageCount; imgIndex++) {
      let addBtn = null;

      if (imgIndex === 0) {
        // First image - use the main add button
        const addBtnXPaths = [
          selectors.START_IMAGE_ADD_BUTTON_XPATH,
          "//button[.//i[text()='add'] and .//div[@data-type='button-overlay']]",
          "//button[contains(@class, 'add') or .//i[text()='add_photo_alternate']]",
        ];
        for (const xpath of addBtnXPaths) {
          if (!xpath) continue;
          try {
            addBtn = document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue;
            if (addBtn) break;
          } catch (e) {}
        }
        if (!addBtn) {
          const buttons = document.querySelectorAll("button");
          for (const btn of buttons) {
            const icon = btn.querySelector("i");
            if (icon && icon.textContent?.includes("add")) {
              const overlay = btn.querySelector('[data-type="button-overlay"]');
              if (overlay) {
                addBtn = btn;
                break;
              }
            }
          }
        }
      } else {
        // Subsequent images - find additional add button in lower screen area
        await new Promise((r) => setTimeout(r, 500));
        const addBtnXPath = "//button[.//i[contains(text(),'add')]]";
        try {
          const results = document.evaluate(
            addBtnXPath,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null,
          );
          for (let i = results.snapshotLength - 1; i >= 0; i--) {
            const btn = results.snapshotItem(i);
            const rect = btn.getBoundingClientRect();
            if (
              rect.width > 0 &&
              rect.height > 0 &&
              rect.top > window.innerHeight / 2
            ) {
              addBtn = btn;
              break;
            }
          }
          if (!addBtn && results.snapshotLength > 0) {
            addBtn = results.snapshotItem(results.snapshotLength - 1);
          }
        } catch (e) {}
      }

      if (!addBtn) {
        console.log(
          "[AutoFlow] Picker: no add button found for image",
          imgIndex + 1,
        );
        if (imgIndex === 0) return "PICKER_FAILED";
        break; // Continue with however many we got
      }

      // Click add button to open picker
      addBtn.click();
      await new Promise((r) => setTimeout(r, 1500));

      // Wait for picker to appear - look for image tile buttons
      let pickerImages = [];
      for (let wait = 0; wait < 20; wait++) {
        const allButtons = document.querySelectorAll("button");
        pickerImages = [];
        for (const btn of allButtons) {
          const spans = btn.querySelectorAll("span");
          for (const span of spans) {
            if (
              span.textContent &&
              span.textContent.includes(
                "A media asset previously uploaded or selected by you",
              )
            ) {
              pickerImages.push(btn);
              break;
            }
          }
        }
        if (pickerImages.length > 0) break;
        await new Promise((r) => setTimeout(r, 300));
      }

      if (pickerImages.length === 0) {
        console.log("[AutoFlow] Picker: no images found in picker");
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        if (imgIndex === 0) return "PICKER_FAILED";
        break;
      }

      console.log(
        "[AutoFlow] Picker: found",
        pickerImages.length,
        "images, clicking index",
        imgIndex,
      );

      // Click the image at position imgIndex (most recent first = our uploaded refs)
      if (imgIndex < pickerImages.length) {
        pickerImages[imgIndex].click();
        console.log("[AutoFlow] Picker: clicked image", imgIndex + 1);
      } else {
        console.log(
          "[AutoFlow] Picker: not enough images, only",
          pickerImages.length,
        );
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        break;
      }

      await new Promise((r) => setTimeout(r, 1000));

      // Safety: handle crop dialog if it appears (unlikely for picker selection)
      for (let i = 0; i < 5; i++) {
        try {
          const cropBtn = document.evaluate(
            selectors.CROP_AND_SAVE_BUTTON_XPATH,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue;
          if (cropBtn) {
            console.log("[AutoFlow] Picker: crop dialog found, clicking...");
            cropBtn.click();
            await new Promise((r) => setTimeout(r, 1000));
            break;
          }
        } catch (e) {}
        await new Promise((r) => setTimeout(r, 200));
      }

      // Wait for any spinner
      for (let i = 0; i < 10; i++) {
        try {
          const spinner = document.evaluate(
            selectors.UPLOAD_SPINNER_XPATH,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue;
          if (!spinner) break;
        } catch (e) {
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    console.log("[AutoFlow] Picker: all images selected, entering prompt");

    // Enter the prompt
    const textArea = document.getElementById(selectors.PROMPT_TEXTAREA_ID);
    if (!textArea) {
      console.log("[AutoFlow] Picker: textarea not found");
      return false;
    }

    textArea.focus();
    await new Promise((r) => setTimeout(r, 50));
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    ).set.call(textArea, prompt);
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    textArea.blur();
    await new Promise((r) => setTimeout(r, 50));

    // Wait for generate button and click
    await new Promise((r) => setTimeout(r, 2000));

    let genBtn = null;
    let genWait = 180000;
    const genStep = 1000;

    while (genWait > 0) {
      try {
        if (
          document.evaluate(
            selectors.IMAGE_POLICY_ERROR_POPUP_XPATH,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue
        ) {
          return "POLICY_IMAGE";
        }
      } catch (e) {}

      try {
        genBtn = document.evaluate(
          selectors.GENERATE_BUTTON_XPATH,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue;
      } catch (e) {}

      if (genBtn && !genBtn.disabled) {
        genBtn.click();
        await new Promise((r) => setTimeout(r, 1000));

        for (let i = 0; i < 10; i++) {
          if (
            document.evaluate(
              selectors.QUEUE_FULL_POPUP_XPATH,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue
          )
            return "QUEUE_FULL";
          if (
            document.evaluate(
              selectors.PROMPT_POLICY_ERROR_POPUP_XPATH,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue
          )
            return "POLICY_PROMPT";
          if (
            selectors.RATE_LIMIT_POPUP_XPATH &&
            document.evaluate(
              selectors.RATE_LIMIT_POPUP_XPATH,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            ).singleNodeValue
          )
            return "RATE_LIMIT";
          await new Promise((r) => setTimeout(r, 1000));
        }

        console.log("[AutoFlow] Picker: prompt submitted successfully");
        return true;
      }

      await new Promise((r) => setTimeout(r, genStep));
      genWait -= genStep;
    }

    return false;
  } catch (e) {
    console.error("[AutoFlow] processPromptWithExistingRefImages error:", e);
    return false;
  }
}
