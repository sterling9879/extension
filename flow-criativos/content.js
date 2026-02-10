// =============================================================================
// Flow Criativos v2.0 — Content Script (content.js)
// =============================================================================
// Runs in ISOLATED world on https://labs.google/fx/tools/flow* pages.
// Creates a floating overlay UI and manages batch video generation automation.
// Communicates with background.js for page-level DOM manipulation (MAIN world),
// file downloads, tab navigation, and zoom control.
// =============================================================================

'use strict';

// =============================================================================
// SECTION 1: SELECTORS — XPath selectors for interacting with the Flow page
// =============================================================================

const SELECTORS = {
  PROMPT_TEXTAREA_ID: 'PINHOLE_TEXT_AREA_ELEMENT_ID',
  GENERATE_BUTTON_XPATH: "//button[.//i[text()='arrow_forward']] | (//button[.//i[normalize-space(text())='arrow_forward']])",
  NEW_PROJECT_BUTTON_XPATH: "//button[.//i[normalize-space(text())='add_2']] | (//button[.//i[normalize-space(.)='add_2']])",
  GRID_VIEW_BUTTON_XPATH: "(//button[@role='radio' and .//i[normalize-space(text())='grid_on']]) | (//button[.//i[normalize-space(.)='grid_view']])",
  VIDEOCAM_BUTTON_XPATH: "//button[@role='radio' and .//i[normalize-space()='videocam']]",
  PROMPT_POLICY_ERROR_POPUP_XPATH: "//li[@data-sonner-toast and .//i[normalize-space(text())='error'] and not(.//*[contains(., '5')])]",
  QUEUE_FULL_POPUP_XPATH: "//li[@data-sonner-toast and .//i[normalize-space(text())='error'] and .//*[contains(., '5')]]",
  RATE_LIMIT_POPUP_XPATH: "//li[@data-sonner-toast and .//*[contains(., 'too quickly')]]",
  START_IMAGE_ADD_BUTTON_XPATH: "(//button[.//div[@data-type='button-overlay'] and .//i[text()='add']])[1]",
  HIDDEN_FILE_INPUT_XPATH: '//input[@type="file"]',
  UPLOAD_SPINNER_XPATH: "//i[contains(text(), 'progress_activity')]",
  IMAGE_CROP_RATIO_DROPDOWN_XPATH: "//button[@role='combobox' and .//i[normalize-space(text())='arrow_drop_down'] and .//i[normalize-space(text())='crop_9_16' or normalize-space(text())='crop_16_9']]",
  IMAGE_CROP_RATIO_LANDSCAPE_XPATH: "//div[@role='option' and .//i[normalize-space(text())='crop_16_9']]",
  IMAGE_CROP_RATIO_PORTRAIT_XPATH: "//div[@role='option' and .//i[normalize-space(text())='crop_9_16']]",
  CROP_AND_SAVE_BUTTON_XPATH: "//button[.//i[normalize-space(text())='crop']]",
  SETTINGS_BUTTON_XPATH: "//button[.//div[contains(., 'Veo')] and .//i[normalize-space(text())='volume_up' or normalize-space(text())='volume_off']]",
  OUTPUT_NUMBER_BUTTON_XPATH: "//button[@role='combobox' and .//span[not(.//i) and (normalize-space(.)='1' or normalize-space(.)='2' or normalize-space(.)='3' or normalize-space(.)='4')]]",
  OUTPUT_NUMBER_ONE_XPATH: "//div[@role='option' and .//span[text()='1']]",
  OUTPUT_NUMBER_TWO_XPATH: "//div[@role='option' and .//span[text()='2']]",
  OUTPUT_NUMBER_THREE_XPATH: "//div[@role='option' and .//span[text()='3']]",
  OUTPUT_NUMBER_FOUR_XPATH: "//div[@role='option' and .//span[text()='4']]",
  MODEL_SELECTION_BUTTON_XPATH: "//button[@role='combobox' and .//span[not(.//i)] and contains(normalize-space(),'Veo')]",
  MODEL_VEO_3_FAST_XPATH: "//div[@role='option' and contains(., 'Veo 3.1 - Fast')]",
  MODEL_VEO_3_FAST_LOW_XPATH: "//div[@role='option' and contains(., 'Veo 3.1 - Fast [Lower Priority]')]",
  MODEL_VEO_2_FAST_XPATH: "//div[@role='option' and contains(., 'Veo 2 - Fast')]",
  MODEL_VEO_3_QUALITY_XPATH: "//div[@role='option' and contains(., 'Veo 3.1 - Quality')]",
  MODEL_VEO_2_QUALITY_XPATH: "//div[@role='option' and contains(., 'Veo 2 - Quality')]",
  ASPECT_RATIO_DROPDOWN_XPATH: "//button[@role='combobox' and .//i[normalize-space(text())='crop_portrait' or normalize-space(text())='crop_landscape']]",
  LANDSCAPE_ASPECT_RATIO_XPATH: "//div[@role='option' and .//i[normalize-space(text())='crop_landscape']]",
  PORTRAIT_ASPECT_RATIO_XPATH: "//div[@role='option' and .//i[normalize-space(text())='crop_portrait']]",
  MODE_DROPDOWN_XPATH: "//button[@role='combobox' and .//i[normalize-space()='arrow_drop_down'] and .//div[@data-type='button-overlay']]",
  IMAGE_TO_VIDEO_MODE_XPATH: "//div[@role='option' and .//i[normalize-space(text())='photo_spark']]",
  TEXT_TO_VIDEO_MODE_XPATH: "//div[@role='option' and .//i[normalize-space(text())='text_analysis']]",
  RESULT_CONTAINER_XPATH: "//div[@data-index and @data-item-index]",
  PROMPT_IN_CONTAINER_XPATH: ".//button[normalize-space(.) != '' and following-sibling::div//text()[contains(., 'Veo')]]",
  VIDEOS_IN_CONTAINER_XPATH: ".//video[starts-with(@src, 'http')]",
  IMAGE_POLICY_ERROR_POPUP_XPATH: "//li[@data-sonner-toast and .//i[normalize-space(text())='error'] and not(.//*[contains(., '5')])]"
};


// =============================================================================
// SECTION 2: TEMPLATES — Preset text base templates for prompt generation
// =============================================================================

const TEMPLATES = {
  custom: { name: 'Personalizado', textBase: '' },
  animar_fala: { name: 'Animar + Fala', textBase: 'Animate this image. The person speaks directly to camera with natural lipsync, saying:' },
  ugc_realista: { name: 'UGC Realista', textBase: 'Create a realistic UGC-style video. The person speaks naturally to the camera with authentic lipsync, saying:' },
  skincare: { name: 'Skincare', textBase: 'Create a skincare routine video. The person demonstrates the product while speaking to camera with natural lipsync, saying:' },
  unboxing: { name: 'Unboxing', textBase: 'Create an unboxing video. The person opens and reveals the product while speaking excitedly to camera with lipsync, saying:' },
  depoimento: { name: 'Depoimento', textBase: 'Create a testimonial video. The person shares their genuine experience speaking directly to camera with natural lipsync, saying:' },
  cinematografico: { name: 'Cinematografico', textBase: 'Create a cinematic video with dramatic lighting and smooth camera movement.' },
  showcase_produto: { name: 'Showcase Produto', textBase: 'Create a product showcase video with elegant presentation and smooth transitions.' },
  talking_head: { name: 'Talking Head', textBase: 'Create a talking head video. The person speaks directly to camera in a professional setting with natural lipsync, saying:' },
  antes_depois: { name: 'Antes/Depois', textBase: 'Create a before and after transformation video with smooth transitions between states.' }
};


// =============================================================================
// SECTION 3: PAGE-INJECTED FUNCTIONS
// These are standalone functions that get serialized (via .toString()) and sent
// to background.js, which executes them in the MAIN world of the Flow page.
// They have NO access to the extension scope — only to the page DOM/window.
// The last parameter is always the SELECTORS object (appended by injectScript).
// =============================================================================

/**
 * Click a DOM element found by XPath. Falls back to dispatching a MouseEvent.
 */
function clickElementByXPath(xpath, selectors) {
  try {
    const element = document.evaluate(
      xpath, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (element) {
      try {
        element.click();
        return true;
      } catch (_clickErr) {
        try {
          element.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true, view: window
          }));
          return true;
        } catch (_dispatchErr) {
          return false;
        }
      }
    }
    return undefined;
  } catch (_err) {
    return undefined;
  }
}

/**
 * Click the "New Project" button using XPath from selectors.
 */
function clickNewProjectButton(selectors) {
  const xpath = selectors?.NEW_PROJECT_BUTTON_XPATH;
  if (!xpath) return false;
  let button = null;
  try {
    button = document.evaluate(
      xpath, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
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
function scanForQueueFullPopup(selectors) {
  try {
    return !!document.evaluate(
      selectors.QUEUE_FULL_POPUP_XPATH,
      document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
  } catch (_err) {
    return false;
  }
}

/**
 * Check if the prompt policy error popup is visible on the page.
 */
function scanForPolicyError(selectors) {
  try {
    return !!document.evaluate(
      selectors.PROMPT_POLICY_ERROR_POPUP_XPATH,
      document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
  } catch (_err) {
    return false;
  }
}

/**
 * Set the prompt text in the textarea, then click the generate button.
 * Polls for up to 30 attempts to find an enabled generate button.
 * Returns true on success, or a status string on error, or false on failure.
 */
async function processPromptOnPage(promptText, textareaId, generateButtonXPath, selectors) {
  if (!textareaId || !generateButtonXPath) return false;
  const textarea = document.getElementById(textareaId);
  if (!textarea) return false;

  // Set the prompt text using React-compatible value setter
  try {
    textarea.focus();
    await new Promise(r => setTimeout(r, 50));
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    ).set.call(textarea, promptText);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    textarea.blur();
    await new Promise(r => setTimeout(r, 50));
  } catch (_err) {
    return false;
  }

  // Poll for the generate button to become enabled
  for (let attempt = 0; attempt < 30; attempt++) {
    let generateButton = null;
    try {
      generateButton = document.evaluate(
        generateButtonXPath, document, null,
        XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue;
    } catch (_err) {}

    if (generateButton && !generateButton.disabled) {
      try {
        generateButton.click();
        await new Promise(r => setTimeout(r, 1000));

        // Check for error popups after clicking generate
        for (let checkIdx = 0; checkIdx < 10; checkIdx++) {
          try {
            if (document.evaluate(selectors.QUEUE_FULL_POPUP_XPATH, document, null,
              XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue) return 'QUEUE_FULL';
          } catch (_e) {}
          try {
            if (document.evaluate(selectors.PROMPT_POLICY_ERROR_POPUP_XPATH, document, null,
              XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue) return 'POLICY_PROMPT';
          } catch (_e) {}
          try {
            if (selectors.RATE_LIMIT_POPUP_XPATH && document.evaluate(selectors.RATE_LIMIT_POPUP_XPATH,
              document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue) return 'RATE_LIMIT';
          } catch (_e) {}
          await new Promise(r => setTimeout(r, 1000));
        }
        return true;
      } catch (_err) {
        return false;
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

/**
 * Switch Flow's mode dropdown to "Image-to-Video".
 */
async function selectImageMode(selectors) {
  try {
    const dropdown = document.evaluate(
      selectors.MODE_DROPDOWN_XPATH, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (!dropdown) return false;

    if (dropdown.textContent &&
      (dropdown.textContent.includes('T\u1EA1o video t\u1EEB c\u00E1c khung h\u00ECnh') ||
       dropdown.textContent.includes('Image-to-Video'))) return true;

    dropdown.click();
    await new Promise(r => setTimeout(r, 500));

    const modeOption = document.evaluate(
      selectors.IMAGE_TO_VIDEO_MODE_XPATH, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (!modeOption) return false;

    modeOption.click();
    await new Promise(r => setTimeout(r, 500));
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Switch Flow's mode dropdown to "Text-to-Video".
 */
async function selectTextMode(selectors) {
  try {
    const dropdown = document.evaluate(
      selectors.MODE_DROPDOWN_XPATH, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (!dropdown) return false;

    if (dropdown.textContent &&
      (dropdown.textContent.includes('T\u1EEB v\u0103n') ||
       dropdown.textContent.includes('Text-to-Video'))) return true;

    dropdown.click();
    await new Promise(r => setTimeout(r, 500));

    const modeOption = document.evaluate(
      selectors.TEXT_TO_VIDEO_MODE_XPATH, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (!modeOption) return false;

    modeOption.click();
    await new Promise(r => setTimeout(r, 500));
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Open the settings panel and configure video generation settings:
 * output count, model, and aspect ratio. Closes settings when done.
 */
async function setInitialSettings(outputCount, model, aspectRatio, selectors) {
  try {
    // Open settings panel
    const settingsButton = document.evaluate(
      selectors.SETTINGS_BUTTON_XPATH, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (!settingsButton) return false;

    settingsButton.click();
    await new Promise(r => setTimeout(r, 1000));

    // --- Output count ---
    const outputCountXPaths = {
      1: selectors.OUTPUT_NUMBER_ONE_XPATH,
      2: selectors.OUTPUT_NUMBER_TWO_XPATH,
      3: selectors.OUTPUT_NUMBER_THREE_XPATH,
      4: selectors.OUTPUT_NUMBER_FOUR_XPATH
    };

    const outputNumberButton = document.evaluate(
      selectors.OUTPUT_NUMBER_BUTTON_XPATH, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (!outputNumberButton) return false;

    outputNumberButton.click();
    await new Promise(r => setTimeout(r, 500));

    const outputOption = document.evaluate(
      outputCountXPaths[outputCount], document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (!outputOption) return false;

    outputOption.click();
    await new Promise(r => setTimeout(r, 500));

    // --- Model selection ---
    const modelXPaths = {
      veo2_fast: selectors.MODEL_VEO_2_FAST_XPATH,
      veo3_quality: selectors.MODEL_VEO_3_QUALITY_XPATH,
      veo2_quality: selectors.MODEL_VEO_2_QUALITY_XPATH,
      default: selectors.MODEL_VEO_3_FAST_XPATH,
      veo3_fast_low: selectors.MODEL_VEO_3_FAST_LOW_XPATH
    };
    const resolvedModelKey = (model !== 'default' && modelXPaths[model]) ? model : 'default';

    const modelSelectionButton = document.evaluate(
      selectors.MODEL_SELECTION_BUTTON_XPATH, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (!modelSelectionButton) return false;

    modelSelectionButton.click();
    await new Promise(r => setTimeout(r, 500));

    const modelOption = document.evaluate(
      modelXPaths[resolvedModelKey], document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (!modelOption) return false;

    modelOption.click();
    await new Promise(r => setTimeout(r, 500));

    // --- Aspect ratio ---
    const aspectRatioDropdown = document.evaluate(
      selectors.ASPECT_RATIO_DROPDOWN_XPATH, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (!aspectRatioDropdown) return false;

    aspectRatioDropdown.click();
    await new Promise(r => setTimeout(r, 500));

    const ratioXPath = aspectRatio === 'portrait'
      ? selectors.PORTRAIT_ASPECT_RATIO_XPATH
      : selectors.LANDSCAPE_ASPECT_RATIO_XPATH;

    const ratioOption = document.evaluate(
      ratioXPath, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (!ratioOption) return false;

    ratioOption.click();
    await new Promise(r => setTimeout(r, 500));

    // Close the settings panel with Escape
    document.body.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', keyCode: 27, bubbles: true, cancelable: true, composed: true
    }));
    await new Promise(r => setTimeout(r, 1000));
    return true;
  } catch (_err) {
    try {
      document.body.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', keyCode: 27, bubbles: true, cancelable: true, composed: true
      }));
    } catch (_innerErr) {}
    return false;
  }
}

/**
 * Upload an image file via DataTransfer, optionally crop it, then enter a
 * prompt and click generate. Used for Image-to-Video mode.
 */
async function processImageAndPromptOnPage(imageDataUrl, fileName, fileType, promptText, orientation, selectors) {
  try {
    // Wait for the "Add Image" button to become enabled (up to 180s)
    let addImageButton = null;
    let addImageTimeout = 180000;
    const addImagePollInterval = 500;

    while (addImageTimeout > 0) {
      try {
        addImageButton = document.evaluate(
          selectors.START_IMAGE_ADD_BUTTON_XPATH, document, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
      } catch (_err) {}

      if (addImageButton && !addImageButton.disabled) {
        addImageButton.click();
        await new Promise(r => setTimeout(r, 2000));
        break;
      }
      await new Promise(r => setTimeout(r, addImagePollInterval));
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
          selectors.HIDDEN_FILE_INPUT_XPATH, document, null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
        );
      } catch (_err) {}

      if (inputSnapshot && inputSnapshot.snapshotLength > 0) {
        fileInput = inputSnapshot.snapshotItem(inputSnapshot.snapshotLength - 1);
        break;
      }
      await new Promise(r => setTimeout(r, fileInputPollInterval));
      fileInputTimeout -= fileInputPollInterval;
    }
    if (!fileInput) return false;

    // Fetch the image and set it on the file input via DataTransfer
    const fetchResponse = await fetch(imageDataUrl);
    const imageBlob = await fetchResponse.blob();
    const imageFile = new File([imageBlob], fileName, { type: fileType });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(imageFile);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Wait for upload spinner to disappear
    let spinner = null;
    try {
      spinner = document.evaluate(
        selectors.UPLOAD_SPINNER_XPATH, document, null,
        XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue;
    } catch (_err) {}

    if (spinner) {
      let spinnerTimeout = 180000;
      const spinnerPollInterval = 500;
      while (spinner && spinnerTimeout > 0) {
        await new Promise(r => setTimeout(r, spinnerPollInterval));
        spinnerTimeout -= spinnerPollInterval;
        try {
          spinner = document.evaluate(
            selectors.UPLOAD_SPINNER_XPATH, document, null,
            XPathResult.FIRST_ORDERED_NODE_TYPE, null
          ).singleNodeValue;
        } catch (_err) { spinner = null; }
      }
      if (spinnerTimeout <= 0) return false;
    } else {
      await new Promise(r => setTimeout(r, 2000));
    }

    // Handle crop ratio selection if dropdown exists
    let cropRatioDropdown = null;
    try {
      cropRatioDropdown = document.evaluate(
        selectors.IMAGE_CROP_RATIO_DROPDOWN_XPATH, document, null,
        XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue;
    } catch (_err) {}

    if (cropRatioDropdown) {
      cropRatioDropdown.click();
      await new Promise(r => setTimeout(r, 500));

      const cropRatioXPath = orientation === 'portrait'
        ? selectors.IMAGE_CROP_RATIO_PORTRAIT_XPATH
        : selectors.IMAGE_CROP_RATIO_LANDSCAPE_XPATH;

      let cropRatioOption = null;
      try {
        cropRatioOption = document.evaluate(
          cropRatioXPath, document, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
      } catch (_err) {}

      if (cropRatioOption) {
        cropRatioOption.click();
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Click "Crop and Save" if present
    let cropAndSaveButton = null;
    try {
      cropAndSaveButton = document.evaluate(
        selectors.CROP_AND_SAVE_BUTTON_XPATH, document, null,
        XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue;
    } catch (_err) {}

    if (cropAndSaveButton) {
      cropAndSaveButton.click();
      await new Promise(r => setTimeout(r, 1000));
    }

    // Enter the prompt
    const textarea = document.getElementById(selectors.PROMPT_TEXTAREA_ID);
    if (!textarea) return false;

    textarea.focus();
    await new Promise(r => setTimeout(r, 50));
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    ).set.call(textarea, promptText);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    textarea.blur();
    await new Promise(r => setTimeout(r, 50));

    // Wait before looking for generate button
    await new Promise(r => setTimeout(r, 4000));

    // Poll for generate button (up to 180s)
    let generateButton = null;
    let genTimeout = 180000;
    const genPollInterval = 1000;
    let genElapsed = 0;

    while (genElapsed < genTimeout) {
      // Check for image policy error
      try {
        if (document.evaluate(selectors.IMAGE_POLICY_ERROR_POPUP_XPATH, document, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue) return 'POLICY_IMAGE';
      } catch (_err) {}

      // Look for generate button
      try {
        generateButton = document.evaluate(
          selectors.GENERATE_BUTTON_XPATH, document, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
      } catch (_err) {}

      if (generateButton && !generateButton.disabled) {
        generateButton.click();
        await new Promise(r => setTimeout(r, 1000));

        // Check for error popups after clicking
        for (let checkIdx = 0; checkIdx < 10; checkIdx++) {
          try {
            if (document.evaluate(selectors.QUEUE_FULL_POPUP_XPATH, document, null,
              XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue) return 'QUEUE_FULL';
          } catch (_e) {}
          try {
            if (document.evaluate(selectors.PROMPT_POLICY_ERROR_POPUP_XPATH, document, null,
              XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue) return 'POLICY_PROMPT';
          } catch (_e) {}
          await new Promise(r => setTimeout(r, 1000));
        }
        return true;
      }

      await new Promise(r => setTimeout(r, genPollInterval));
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
 */
function findAndGroupNewVideos(knownVideoUrls, selectors) {
  const groups = [];
  const containerXPath = selectors.RESULT_CONTAINER_XPATH;
  const promptXPath = selectors.PROMPT_IN_CONTAINER_XPATH;
  const videosXPath = selectors.VIDEOS_IN_CONTAINER_XPATH;

  if (!containerXPath || !promptXPath || !videosXPath) return [];

  try {
    const containerIterator = document.evaluate(
      containerXPath, document, null,
      XPathResult.ORDERED_NODE_ITERATOR_TYPE, null
    );
    let container = containerIterator.iterateNext();

    while (container) {
      try {
        const promptElement = document.evaluate(
          promptXPath, container, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;

        if (promptElement && promptElement.textContent) {
          const promptText = promptElement.textContent.trim();
          const newVideos = [];

          const videoIterator = document.evaluate(
            videosXPath, container, null,
            XPathResult.ORDERED_NODE_ITERATOR_TYPE, null
          );
          let videoNode = videoIterator.iterateNext();

          while (videoNode) {
            const src = videoNode.getAttribute('src');
            if (src && src.startsWith('http')) {
              const baseUrl = src.split('?')[0];
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
function scanExistingVideos(selectors) {
  const urls = new Set();
  try {
    document.querySelectorAll('video[src^="http"]').forEach(video => {
      const src = video.getAttribute('src');
      if (src) urls.add(src.split('?')[0]);
    });
  } catch (_err) {}
  return Array.from(urls);
}

/**
 * Download video at specific resolution via Flow's UI (click download button,
 * select resolution from the menu).
 */
async function downloadVideoAtResolution(videoUrl, resolution, selectors) {
  try {
    // Find video element by URL
    const allVideos = document.querySelectorAll('video[src^="http"]');
    const urlBase = videoUrl?.split('?')[0];
    let targetVideo = null;

    for (const vid of allVideos) {
      const vidUrl = vid.getAttribute('src')?.split('?')[0];
      if (vidUrl === urlBase) {
        targetVideo = vid;
        break;
      }
    }

    if (!targetVideo) {
      return { success: false, error: 'Video not found' };
    }

    // Walk up DOM to find container with download button
    let container = targetVideo.parentElement;
    for (let i = 0; i < 10 && container; i++) {
      const downloadBtn = container.querySelector('button[aria-haspopup="menu"] i.google-symbols');
      if (downloadBtn && downloadBtn.textContent?.toLowerCase().includes('download')) {
        break;
      }
      container = container.parentElement;
    }

    if (!container) {
      return { success: false, error: 'Container not found' };
    }

    // Hover to reveal buttons
    targetVideo.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    targetVideo.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));

    // Find the download button
    let downloadBtn = null;
    const buttons = container.querySelectorAll('button[aria-haspopup="menu"]');
    for (const btn of buttons) {
      const icon = btn.querySelector('i.google-symbols');
      if (icon && icon.textContent?.toLowerCase().includes('download')) {
        downloadBtn = btn;
        break;
      }
    }

    // Fallback: any button with download icon
    if (!downloadBtn) {
      const icons = container.querySelectorAll('i.google-symbols');
      for (const icon of icons) {
        if (icon.textContent?.toLowerCase().includes('download')) {
          downloadBtn = icon.closest('button');
          break;
        }
      }
    }

    if (!downloadBtn) {
      return { success: false, error: 'Download button not found' };
    }

    downloadBtn.click();
    await new Promise(r => setTimeout(r, 500));

    // Map resolution to menu text
    const resMap = { '720p': 'Original', '1080p': '1080p', '4k': '4K' };
    const targetText = resMap[resolution] || 'Original';

    // Find and click menu item
    const menuItems = document.querySelectorAll('[role="menuitem"]');
    let found = false;
    for (const item of menuItems) {
      const text = item.textContent || '';
      if (text.includes(targetText)) {
        item.click();
        found = true;
        break;
      }
    }

    if (!found) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { success: false, error: 'Resolution option not found' };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Scroll-and-scan: collects all video URLs from the page by scrolling through
 * the virtualized list. Returns array of { url, prompt, scrollY }.
 */
function scrollAndScanAllVideos(selectors) {
  return new Promise(resolve => {
    const scrollContainer = document.querySelector('[data-virtuoso-scroller]') ||
      document.querySelector('main') || document.documentElement;
    const originalScroll = scrollContainer.scrollTop;
    const seenUrls = new Set();
    const allVideos = [];
    let scrollAttempts = 0;
    const maxAttempts = 200;

    function findPromptText(video) {
      let container = video.parentElement;
      for (let i = 0; i < 20 && container; i++) {
        const buttons = container.querySelectorAll('button');
        for (const btn of buttons) {
          const t = btn.textContent?.trim() || '';
          if (t.length > 15 && t.length < 300 &&
            !t.includes('Download') && !t.includes('Add To') &&
            !t.includes('more_vert') && !t.includes('favorite')) {
            return t;
          }
        }
        container = container.parentElement;
      }
      return '';
    }

    function scanCurrentView() {
      let foundNew = 0;
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        let src = video.getAttribute('src');
        if (!src || !src.startsWith('http')) {
          const source = video.querySelector('source');
          if (source) src = source.getAttribute('src');
        }
        if (!src || !src.startsWith('http')) return;

        const baseUrl = src.split('?')[0];
        if (seenUrls.has(baseUrl)) return;
        seenUrls.add(baseUrl);
        foundNew++;

        const promptText = findPromptText(video);
        allVideos.push({
          url: src,
          prompt: promptText ? promptText.substring(0, 150) : '',
          videoIndex: allVideos.length,
          scrollY: scrollContainer.scrollTop
        });
      });
      return foundNew;
    }

    function scrollStep() {
      scanCurrentView();
      scrollAttempts++;

      const atBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >=
        scrollContainer.scrollHeight - 20;

      if (scrollAttempts >= maxAttempts || atBottom) {
        scanCurrentView();
        scrollContainer.scrollTop = originalScroll;
        setTimeout(() => resolve(allVideos), 300);
        return;
      }

      scrollContainer.scrollTop += Math.floor(scrollContainer.clientHeight * 0.7);
      setTimeout(scrollStep, 350);
    }

    scrollContainer.scrollTop = 0;
    setTimeout(scrollStep, 400);
  });
}


// =============================================================================
// SECTION 4: FlowCriativos CLASS — Main controller
// =============================================================================

class FlowCriativos {

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------
  constructor() {
    console.log('[FlowCriativos] Initializing v2.0...');

    // State
    this.state = {
      isRunning: false,
      isPaused: false,
      stopRequested: false,
      skipRequested: false,
      MAX_RETRIES: 5,
      promptList: [],
      failedPromptsList: [],
      taskList: [],
      masterTaskList: [],
      masterQueue: [],
      currentJobIndex: 0,
      currentIndex: 0,
      currentMode: 'text-to-video',
      flowTabId: null,
      currentProjectId: null,
      downloadInterval: null,
      scanIntervalMs: 5000,
      finalScanTimerId: null,
      downloadedVideoUrls: new Set(),
      newlyDownloadedCount: 0,
      videoDownloadResolution: '720p',
      autoStartNextJob: true,
      nextProjectCounter: 1,
      autoDownloadEnabled: true,
      avatarDataUrl: null,
      avatarFileName: null,
      avatarFileType: null,
      delayMin: 2000,
      delayMax: 4000,
      retryTimeout: 90,
      maxRetries: 3,
      scanInterval: 5,
      model: 'default',
      outputs: '1',
      resolution: '720p'
    };

    // DOM element cache
    this.dom = {};

    // Initialize
    this._init();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  async _init() {
    try {
      // Determine current tab id
      await this._resolveFlowTabId();

      // Fetch and inject overlay HTML
      await this._injectOverlay();

      // Cache DOM elements
      this._cacheDOMElements();

      // Load saved settings
      await this._loadSettings();

      // Attach event listeners
      this._attachEventListeners();

      // Render initial UI state
      this._renderCriativoList();
      this._renderQueueList();
      this._updateButtonStates();
      this._updatePhraseCount();

      console.log('[FlowCriativos] Initialization complete.');
    } catch (err) {
      console.error('[FlowCriativos] Initialization failed:', err);
    }
  }

  /**
   * Resolve the current Flow tab ID by asking background.js.
   */
  async _resolveFlowTabId() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getActiveTab' });
      if (response?.success && response.tab?.url?.includes('/tools/flow')) {
        this.state.flowTabId = response.tab.id;
      }
    } catch (err) {
      console.warn('[FlowCriativos] Could not resolve tab ID:', err.message);
    }
  }

  /**
   * Fetch overlay.html and inject it into the page as a shadow-free div.
   * Also injects Material Symbols font and a toggle button.
   */
  async _injectOverlay() {
    // Inject Material Symbols Outlined font
    if (!document.querySelector('link[href*="Material+Symbols+Outlined"]')) {
      const fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';
      document.head.appendChild(fontLink);
    }

    // Fetch and inject overlay HTML
    const overlayUrl = chrome.runtime.getURL('overlay.html');
    const response = await fetch(overlayUrl);
    const html = await response.text();

    const wrapper = document.createElement('div');
    wrapper.id = 'fc-overlay-wrapper';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    // Create floating toggle button (to reopen overlay when hidden)
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'fc-toggle-btn';
    toggleBtn.textContent = 'FC';
    toggleBtn.title = 'Flow Criativos';
    toggleBtn.style.display = 'none';
    document.body.appendChild(toggleBtn);
  }

  /**
   * Cache references to all overlay DOM elements we need.
   */
  _cacheDOMElements() {
    const $ = (id) => document.getElementById(id);

    // Header
    this.dom.overlay = $('fc-overlay');
    this.dom.minimizeBtn = $('fcMinimize');
    this.dom.closeBtn = $('fcClose');

    // Tabs
    this.dom.tabs = document.querySelectorAll('.fc-tab');
    this.dom.tabPanes = document.querySelectorAll('.fc-tab-pane');

    // Batch tab
    this.dom.criativoName = $('fcCriativoName');
    this.dom.mode = $('fcMode');
    this.dom.avatarSection = $('fcAvatarSection');
    this.dom.uploadAvatarBtn = $('fcUploadAvatar');
    this.dom.avatarInput = $('fcAvatarInput');
    this.dom.avatarName = $('fcAvatarName');
    this.dom.avatarPreview = $('fcAvatarPreview');
    this.dom.avatarImg = $('fcAvatarImg');
    this.dom.removeAvatarBtn = $('fcRemoveAvatar');
    this.dom.orientation = $('fcOrientation');
    this.dom.template = $('fcTemplate');
    this.dom.saveTemplateBtn = $('fcSaveTemplate');
    this.dom.textBase = $('fcTextBase');
    this.dom.phrases = $('fcPhrases');
    this.dom.uploadPhrasesBtn = $('fcUploadPhrases');
    this.dom.phrasesInput = $('fcPhrasesInput');
    this.dom.phraseCount = $('fcPhraseCount');
    this.dom.addCriativoBtn = $('fcAddCriativo');
    this.dom.criativoCount = $('fcCriativoCount');
    this.dom.criativoList = $('fcCriativoList');

    // Fila (Queue) tab
    this.dom.startBtn = $('fcStart');
    this.dom.pauseBtn = $('fcPause');
    this.dom.stopBtn = $('fcStop');
    this.dom.skipBtn = $('fcSkip');
    this.dom.progressBar = $('fcProgressBar');
    this.dom.progressText = $('fcProgressText');
    this.dom.status = $('fcStatus');
    this.dom.resetAllBtn = $('fcResetAll');
    this.dom.clearQueueBtn = $('fcClearQueue');
    this.dom.queueList = $('fcQueueList');
    this.dom.log = $('fcLog');
    this.dom.failedCount = $('fcFailedCount');
    this.dom.failedList = $('fcFailedList');
    this.dom.retryFailedBtn = $('fcRetryFailed');
    this.dom.copyFailedBtn = $('fcCopyFailed');

    // Downloads tab
    this.dom.autoDownload = $('fcAutoDownload');
    this.dom.scannerStatus = $('fcScannerStatus');
    this.dom.downloadCount = $('fcDownloadCount');
    this.dom.downloadProjectBtn = $('fcDownloadProject');
    this.dom.manualDownloadStatus = $('fcManualDownloadStatus');

    // Config tab
    this.dom.configModel = $('fcModel');
    this.dom.configOutputs = $('fcOutputs');
    this.dom.configResolution = $('fcResolution');
    this.dom.configDelayMin = $('fcDelayMin');
    this.dom.configDelayMax = $('fcDelayMax');
    this.dom.configRetryTimeout = $('fcRetryTimeout');
    this.dom.configMaxRetries = $('fcMaxRetries');
    this.dom.configScanInterval = $('fcScanInterval');

    // Confirm modal
    this.dom.confirmModal = $('fcConfirmModal');
    this.dom.confirmClearBtn = $('fcConfirmClear');
    this.dom.cancelClearBtn = $('fcCancelClear');
  }

  // ---------------------------------------------------------------------------
  // Settings Persistence
  // ---------------------------------------------------------------------------
  async _loadSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get([
        'fc_masterQueue', 'fc_nextProjectCounter', 'fc_model', 'fc_outputs',
        'fc_resolution', 'fc_delayMin', 'fc_delayMax', 'fc_retryTimeout',
        'fc_maxRetries', 'fc_scanInterval', 'fc_autoDownload',
        'fc_autoStartNextJob', 'fc_customTemplates'
      ], (data) => {
        if (data.fc_masterQueue && Array.isArray(data.fc_masterQueue)) {
          this.state.masterQueue = data.fc_masterQueue;
        }
        if (data.fc_nextProjectCounter) {
          this.state.nextProjectCounter = data.fc_nextProjectCounter;
        }
        if (data.fc_model) {
          this.state.model = data.fc_model;
          if (this.dom.configModel) this.dom.configModel.value = data.fc_model;
        }
        if (data.fc_outputs) {
          this.state.outputs = data.fc_outputs;
          if (this.dom.configOutputs) this.dom.configOutputs.value = data.fc_outputs;
        }
        if (data.fc_resolution) {
          this.state.resolution = data.fc_resolution;
          this.state.videoDownloadResolution = data.fc_resolution;
          if (this.dom.configResolution) this.dom.configResolution.value = data.fc_resolution;
        }
        if (data.fc_delayMin) {
          this.state.delayMin = parseInt(data.fc_delayMin, 10);
          if (this.dom.configDelayMin) this.dom.configDelayMin.value = data.fc_delayMin;
        }
        if (data.fc_delayMax) {
          this.state.delayMax = parseInt(data.fc_delayMax, 10);
          if (this.dom.configDelayMax) this.dom.configDelayMax.value = data.fc_delayMax;
        }
        if (data.fc_retryTimeout) {
          this.state.retryTimeout = parseInt(data.fc_retryTimeout, 10);
          if (this.dom.configRetryTimeout) this.dom.configRetryTimeout.value = data.fc_retryTimeout;
        }
        if (data.fc_maxRetries) {
          this.state.MAX_RETRIES = parseInt(data.fc_maxRetries, 10);
          if (this.dom.configMaxRetries) this.dom.configMaxRetries.value = data.fc_maxRetries;
        }
        if (data.fc_scanInterval) {
          this.state.scanIntervalMs = parseInt(data.fc_scanInterval, 10) * 1000;
          this.state.scanInterval = parseInt(data.fc_scanInterval, 10);
          if (this.dom.configScanInterval) this.dom.configScanInterval.value = data.fc_scanInterval;
        }
        if (typeof data.fc_autoDownload === 'boolean') {
          this.state.autoDownloadEnabled = data.fc_autoDownload;
          if (this.dom.autoDownload) this.dom.autoDownload.checked = data.fc_autoDownload;
        }
        if (typeof data.fc_autoStartNextJob === 'boolean') {
          this.state.autoStartNextJob = data.fc_autoStartNextJob;
        }
        if (data.fc_customTemplates) {
          try {
            const custom = JSON.parse(data.fc_customTemplates);
            Object.assign(TEMPLATES, custom);
          } catch (_err) {}
        }
        resolve();
      });
    });
  }

  _saveSettings() {
    chrome.storage.local.set({
      fc_masterQueue: this.state.masterQueue,
      fc_nextProjectCounter: this.state.nextProjectCounter,
      fc_model: this.state.model,
      fc_outputs: this.state.outputs,
      fc_resolution: this.state.resolution,
      fc_delayMin: this.state.delayMin,
      fc_delayMax: this.state.delayMax,
      fc_retryTimeout: this.state.retryTimeout,
      fc_maxRetries: this.state.MAX_RETRIES,
      fc_scanInterval: this.state.scanInterval,
      fc_autoDownload: this.state.autoDownloadEnabled,
      fc_autoStartNextJob: this.state.autoStartNextJob
    });
  }

  _saveQueue() {
    chrome.storage.local.set({ fc_masterQueue: this.state.masterQueue });
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------
  _attachEventListeners() {
    // --- Header: Minimize / Close ---
    if (this.dom.minimizeBtn) {
      this.dom.minimizeBtn.addEventListener('click', () => this._toggleMinimize());
    }
    if (this.dom.closeBtn) {
      this.dom.closeBtn.addEventListener('click', () => this._toggleClose());
    }

    // --- Toggle button (reopen overlay) ---
    const toggleBtn = document.getElementById('fc-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this._toggleClose());
    }

    // --- Header: Draggable ---
    this._makeDraggable();

    // --- Tab switching ---
    this.dom.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        this.dom.tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.dom.tabPanes.forEach(pane => {
          pane.classList.toggle('active', pane.id === `fc-tab-${target}`);
        });
      });
    });

    // --- Batch tab ---
    if (this.dom.mode) {
      this.dom.mode.addEventListener('change', () => this._onModeChange());
    }
    if (this.dom.uploadAvatarBtn) {
      this.dom.uploadAvatarBtn.addEventListener('click', () => this.dom.avatarInput?.click());
    }
    if (this.dom.avatarInput) {
      this.dom.avatarInput.addEventListener('change', (e) => this._onAvatarSelected(e));
    }
    if (this.dom.removeAvatarBtn) {
      this.dom.removeAvatarBtn.addEventListener('click', () => this._removeAvatar());
    }
    if (this.dom.template) {
      this.dom.template.addEventListener('change', () => this._onTemplateChange());
    }
    if (this.dom.saveTemplateBtn) {
      this.dom.saveTemplateBtn.addEventListener('click', () => this._saveCustomTemplate());
    }
    if (this.dom.phrases) {
      this.dom.phrases.addEventListener('input', () => this._updatePhraseCount());
    }
    if (this.dom.uploadPhrasesBtn) {
      this.dom.uploadPhrasesBtn.addEventListener('click', () => this.dom.phrasesInput?.click());
    }
    if (this.dom.phrasesInput) {
      this.dom.phrasesInput.addEventListener('change', (e) => this._onPhrasesFileSelected(e));
    }
    if (this.dom.addCriativoBtn) {
      this.dom.addCriativoBtn.addEventListener('click', () => this._addCriativoToQueue());
    }

    // --- Fila tab ---
    if (this.dom.startBtn) {
      this.dom.startBtn.addEventListener('click', () => this._startQueue());
    }
    if (this.dom.pauseBtn) {
      this.dom.pauseBtn.addEventListener('click', () => this._togglePause());
    }
    if (this.dom.stopBtn) {
      this.dom.stopBtn.addEventListener('click', () => this._stopQueue());
    }
    if (this.dom.skipBtn) {
      this.dom.skipBtn.addEventListener('click', () => this._skipToNextJob());
    }
    if (this.dom.resetAllBtn) {
      this.dom.resetAllBtn.addEventListener('click', () => this._resetCompletedJobs());
    }
    if (this.dom.clearQueueBtn) {
      this.dom.clearQueueBtn.addEventListener('click', () => this._showClearConfirm());
    }
    if (this.dom.retryFailedBtn) {
      this.dom.retryFailedBtn.addEventListener('click', () => this._retryFailed());
    }
    if (this.dom.copyFailedBtn) {
      this.dom.copyFailedBtn.addEventListener('click', () => this._copyFailed());
    }

    // --- Clear confirm modal ---
    if (this.dom.confirmClearBtn) {
      this.dom.confirmClearBtn.addEventListener('click', () => this._clearQueue());
    }
    if (this.dom.cancelClearBtn) {
      this.dom.cancelClearBtn.addEventListener('click', () => this._hideClearConfirm());
    }

    // --- Downloads tab ---
    if (this.dom.autoDownload) {
      this.dom.autoDownload.addEventListener('change', () => {
        this.state.autoDownloadEnabled = this.dom.autoDownload.checked;
        this._saveSettings();
      });
    }
    if (this.dom.downloadProjectBtn) {
      this.dom.downloadProjectBtn.addEventListener('click', () => this._manualDownloadProject());
    }

    // --- Config tab ---
    if (this.dom.configModel) {
      this.dom.configModel.addEventListener('change', () => {
        this.state.model = this.dom.configModel.value;
        this._saveSettings();
      });
    }
    if (this.dom.configOutputs) {
      this.dom.configOutputs.addEventListener('change', () => {
        this.state.outputs = this.dom.configOutputs.value;
        this._saveSettings();
      });
    }
    if (this.dom.configResolution) {
      this.dom.configResolution.addEventListener('change', () => {
        this.state.resolution = this.dom.configResolution.value;
        this.state.videoDownloadResolution = this.dom.configResolution.value;
        this._saveSettings();
      });
    }
    if (this.dom.configDelayMin) {
      this.dom.configDelayMin.addEventListener('change', () => {
        this.state.delayMin = parseInt(this.dom.configDelayMin.value, 10) || 2000;
        this._saveSettings();
      });
    }
    if (this.dom.configDelayMax) {
      this.dom.configDelayMax.addEventListener('change', () => {
        this.state.delayMax = parseInt(this.dom.configDelayMax.value, 10) || 4000;
        this._saveSettings();
      });
    }
    if (this.dom.configRetryTimeout) {
      this.dom.configRetryTimeout.addEventListener('change', () => {
        this.state.retryTimeout = parseInt(this.dom.configRetryTimeout.value, 10) || 90;
        this._saveSettings();
      });
    }
    if (this.dom.configMaxRetries) {
      this.dom.configMaxRetries.addEventListener('change', () => {
        this.state.MAX_RETRIES = parseInt(this.dom.configMaxRetries.value, 10) || 3;
        this._saveSettings();
      });
    }
    if (this.dom.configScanInterval) {
      this.dom.configScanInterval.addEventListener('change', () => {
        this.state.scanInterval = parseInt(this.dom.configScanInterval.value, 10) || 5;
        this.state.scanIntervalMs = this.state.scanInterval * 1000;
        this._saveSettings();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // UI: Overlay management (minimize, close, drag)
  // ---------------------------------------------------------------------------
  _toggleMinimize() {
    const content = this.dom.overlay?.querySelector('.fc-content');
    const tabs = this.dom.overlay?.querySelector('.fc-tabs');
    if (content && tabs) {
      const isMinimized = content.style.display === 'none';
      content.style.display = isMinimized ? '' : 'none';
      tabs.style.display = isMinimized ? '' : 'none';
    }
  }

  _toggleClose() {
    const wrapper = document.getElementById('fc-overlay-wrapper');
    const toggleBtn = document.getElementById('fc-toggle-btn');
    if (wrapper) {
      const isHidden = wrapper.style.display === 'none';
      wrapper.style.display = isHidden ? '' : 'none';
      if (toggleBtn) toggleBtn.style.display = isHidden ? 'none' : 'flex';
    }
  }

  _makeDraggable() {
    const header = this.dom.overlay?.querySelector('.fc-header');
    if (!header || !this.dom.overlay) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      const rect = this.dom.overlay.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      header.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      this.dom.overlay.style.left = Math.max(0, x) + 'px';
      this.dom.overlay.style.top = Math.max(0, y) + 'px';
      this.dom.overlay.style.right = 'auto';
      this.dom.overlay.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = 'grab';
      }
    });
  }

  // ---------------------------------------------------------------------------
  // UI: Mode change
  // ---------------------------------------------------------------------------
  _onModeChange() {
    const mode = this.dom.mode.value;
    if (this.dom.avatarSection) {
      this.dom.avatarSection.style.display = (mode === 'image-to-video') ? '' : 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // UI: Avatar upload
  // ---------------------------------------------------------------------------
  _onAvatarSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      this.state.avatarDataUrl = evt.target.result;
      this.state.avatarFileName = file.name;
      this.state.avatarFileType = file.type;

      if (this.dom.avatarName) this.dom.avatarName.textContent = file.name;
      if (this.dom.avatarImg) this.dom.avatarImg.src = evt.target.result;
      if (this.dom.avatarPreview) this.dom.avatarPreview.style.display = '';
    };
    reader.readAsDataURL(file);
  }

  _removeAvatar() {
    this.state.avatarDataUrl = null;
    this.state.avatarFileName = null;
    this.state.avatarFileType = null;
    if (this.dom.avatarName) this.dom.avatarName.textContent = 'Nenhum avatar selecionado';
    if (this.dom.avatarPreview) this.dom.avatarPreview.style.display = 'none';
    if (this.dom.avatarInput) this.dom.avatarInput.value = '';
  }

  // ---------------------------------------------------------------------------
  // UI: Template
  // ---------------------------------------------------------------------------
  _onTemplateChange() {
    const key = this.dom.template.value;
    const tmpl = TEMPLATES[key];
    if (tmpl && this.dom.textBase) {
      this.dom.textBase.value = tmpl.textBase;
    }
  }

  _saveCustomTemplate() {
    const name = prompt('Nome do template:');
    if (!name) return;
    const key = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!key) return;

    TEMPLATES[key] = {
      name: name,
      textBase: this.dom.textBase?.value || ''
    };

    // Add option to select
    if (this.dom.template) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = name;
      this.dom.template.appendChild(option);
      this.dom.template.value = key;
    }

    // Persist custom templates
    const customTemplates = {};
    for (const [k, v] of Object.entries(TEMPLATES)) {
      if (!['custom', 'animar_fala', 'ugc_realista', 'skincare', 'unboxing',
        'depoimento', 'cinematografico', 'showcase_produto', 'talking_head',
        'antes_depois'].includes(k)) {
        customTemplates[k] = v;
      }
    }
    chrome.storage.local.set({ fc_customTemplates: JSON.stringify(customTemplates) });
    this._log('Template salvo: ' + name, 'success');
  }

  // ---------------------------------------------------------------------------
  // UI: Phrase management
  // ---------------------------------------------------------------------------
  _updatePhraseCount() {
    const text = this.dom.phrases?.value || '';
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (this.dom.phraseCount) {
      this.dom.phraseCount.textContent = String(lines.length);
    }
  }

  _onPhrasesFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (this.dom.phrases) {
        this.dom.phrases.value = evt.target.result;
        this._updatePhraseCount();
      }
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------------------
  // UI: Criativo list (Batch tab)
  // ---------------------------------------------------------------------------
  _addCriativoToQueue() {
    const name = this.dom.criativoName?.value?.trim() ||
      `Criativo-${String(this.state.nextProjectCounter).padStart(2, '0')}`;
    const mode = this.dom.mode?.value || 'text-to-video';
    const orientation = this.dom.orientation?.value || 'portrait';
    const textBase = this.dom.textBase?.value?.trim() || '';
    const phrasesRaw = this.dom.phrases?.value || '';
    const phrases = phrasesRaw.split('\n').filter(l => l.trim().length > 0).map(l => l.trim());

    if (phrases.length === 0) {
      this._log('Adicione pelo menos uma frase.', 'error');
      return;
    }

    // Build full prompts: textBase + " " + phrase
    const fullPrompts = phrases.map(phrase => {
      if (textBase) return textBase + ' ' + phrase;
      return phrase;
    });

    const criativo = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name,
      mode: mode,
      orientation: orientation,
      textBase: textBase,
      phrases: phrases,
      prompts: fullPrompts,
      model: this.state.model,
      outputs: this.state.outputs,
      aspectRatio: orientation === 'portrait' ? 'portrait' : 'landscape',
      repeatCount: this.state.outputs,
      avatarDataUrl: mode === 'image-to-video' ? this.state.avatarDataUrl : null,
      avatarFileName: mode === 'image-to-video' ? this.state.avatarFileName : null,
      avatarFileType: mode === 'image-to-video' ? this.state.avatarFileType : null,
      downloadFolder: `FlowCriativos/${name}`,
      status: 'pending',
      currentIndex: 0,
      progress: { completed: 0, total: fullPrompts.length }
    };

    if (mode === 'image-to-video' && !criativo.avatarDataUrl) {
      this._log('Selecione um avatar para o modo Image-to-Video.', 'error');
      return;
    }

    this.state.masterQueue.push(criativo);
    this.state.nextProjectCounter++;
    this._saveQueue();
    this._saveSettings();

    this._log(`Criativo "${name}" adicionado com ${phrases.length} frases.`, 'success');

    // Clear form
    if (this.dom.criativoName) this.dom.criativoName.value = '';
    if (this.dom.phrases) this.dom.phrases.value = '';
    this._updatePhraseCount();

    // Update UI
    this._renderCriativoList();
    this._renderQueueList();
  }

  _renderCriativoList() {
    if (!this.dom.criativoList) return;

    const pending = this.state.masterQueue.filter(c => c.status === 'pending');
    if (this.dom.criativoCount) {
      this.dom.criativoCount.textContent = String(this.state.masterQueue.length);
    }

    if (this.state.masterQueue.length === 0) {
      this.dom.criativoList.innerHTML = '<p class="fc-text-muted fc-text-center">Nenhum criativo adicionado</p>';
      return;
    }

    let html = '';
    this.state.masterQueue.forEach((c, idx) => {
      const statusIcon = c.status === 'done' ? '&#10003;' :
        c.status === 'running' ? '&#9654;' :
        c.status === 'failed' ? '&#10007;' : '&#9679;';
      const statusClass = c.status === 'done' ? 'fc-status-done' :
        c.status === 'running' ? 'fc-status-running' :
        c.status === 'failed' ? 'fc-status-failed' : 'fc-status-pending';

      html += `<div class="fc-criativo-item ${statusClass}" data-index="${idx}">
        <div class="fc-criativo-info">
          <span class="fc-criativo-status">${statusIcon}</span>
          <strong>${this._escapeHtml(c.name)}</strong>
          <span class="fc-text-muted">${c.prompts.length} frases | ${c.mode}</span>
        </div>
        <div class="fc-criativo-actions">
          ${c.status === 'pending' ? `<button class="fc-btn-icon-sm fc-remove-criativo" data-index="${idx}" title="Remover">
            <span class="material-symbols-outlined">delete</span>
          </button>` : ''}
        </div>
      </div>`;
    });

    this.dom.criativoList.innerHTML = html;

    // Attach remove handlers
    this.dom.criativoList.querySelectorAll('.fc-remove-criativo').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index, 10);
        this.state.masterQueue.splice(index, 1);
        this._saveQueue();
        this._renderCriativoList();
        this._renderQueueList();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // UI: Queue list (Fila tab)
  // ---------------------------------------------------------------------------
  _renderQueueList() {
    if (!this.dom.queueList) return;

    if (this.state.masterQueue.length === 0) {
      this.dom.queueList.innerHTML = '<p class="fc-text-muted fc-text-center">Fila vazia</p>';
      return;
    }

    let html = '';
    this.state.masterQueue.forEach((c, idx) => {
      const statusLabel = c.status === 'done' ? 'Concluido' :
        c.status === 'running' ? 'Executando...' :
        c.status === 'failed' ? 'Falhou' : 'Pendente';
      const statusClass = c.status === 'done' ? 'fc-status-done' :
        c.status === 'running' ? 'fc-status-running' :
        c.status === 'failed' ? 'fc-status-failed' : 'fc-status-pending';
      const progress = c.progress
        ? `${c.progress.completed}/${c.progress.total}`
        : `0/${c.prompts.length}`;

      html += `<div class="fc-queue-item ${statusClass}">
        <div class="fc-queue-info">
          <strong>${idx + 1}. ${this._escapeHtml(c.name)}</strong>
          <span class="fc-text-muted">${statusLabel} (${progress})</span>
        </div>
      </div>`;
    });

    this.dom.queueList.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // UI: Button states
  // ---------------------------------------------------------------------------
  _updateButtonStates() {
    const running = this.state.isRunning;
    const paused = this.state.isPaused;
    const hasPending = this.state.masterQueue.some(j => j.status === 'pending');

    if (this.dom.startBtn) this.dom.startBtn.disabled = running || !hasPending;
    if (this.dom.pauseBtn) {
      this.dom.pauseBtn.disabled = !running;
      this.dom.pauseBtn.textContent = '';
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.textContent = paused ? 'play_arrow' : 'pause';
      this.dom.pauseBtn.appendChild(icon);
      this.dom.pauseBtn.appendChild(document.createTextNode(paused ? ' Retomar' : ' Pausar'));
    }
    if (this.dom.stopBtn) this.dom.stopBtn.disabled = !running;
    if (this.dom.skipBtn) this.dom.skipBtn.disabled = !running && !this.state.finalScanTimerId;
    if (this.dom.retryFailedBtn) this.dom.retryFailedBtn.disabled = this.state.failedPromptsList.length === 0;
    if (this.dom.copyFailedBtn) this.dom.copyFailedBtn.disabled = this.state.failedPromptsList.length === 0;
  }

  // ---------------------------------------------------------------------------
  // UI: Failed prompts
  // ---------------------------------------------------------------------------
  _updateFailedUI() {
    if (this.dom.failedCount) {
      this.dom.failedCount.textContent = String(this.state.failedPromptsList.length);
    }
    if (this.dom.failedList) {
      if (this.state.failedPromptsList.length === 0) {
        this.dom.failedList.innerHTML = '';
      } else {
        let html = '';
        this.state.failedPromptsList.forEach((entry, i) => {
          const label = typeof entry.item === 'string'
            ? entry.item.substring(0, 60) + (entry.item.length > 60 ? '...' : '')
            : (entry.item?.name || 'unknown');
          html += `<div class="fc-failed-item">
            <span>${i + 1}. ${this._escapeHtml(label)}</span>
            <span class="fc-text-muted">${this._escapeHtml(entry.reason || '')}</span>
          </div>`;
        });
        this.dom.failedList.innerHTML = html;
      }
    }
    this._updateButtonStates();
  }

  _addFailedPrompt(promptItem, reason, taskIndex, jobIndex) {
    const key = `job${jobIndex + 1}_${typeof promptItem === 'string' ? promptItem : (promptItem?.name || 'unknown')}`;
    if (!this.state.failedPromptsList.some(e => e.key === key)) {
      this.state.failedPromptsList.push({
        key: key,
        item: promptItem,
        reason: reason,
        index: taskIndex
      });
      this._updateFailedUI();

      const job = this.state.masterQueue[jobIndex];
      if (job) {
        const task = this.state.masterTaskList.find(
          t => t.jobId === job.id && t.index === taskIndex
        );
        if (task) task.status = 'failed';
      }
    }
  }

  _retryFailed() {
    if (this.state.failedPromptsList.length === 0) return;

    const failedPrompts = this.state.failedPromptsList.map(e =>
      typeof e.item === 'string' ? e.item : (e.item?.name || '')
    ).filter(p => p.length > 0);

    if (failedPrompts.length === 0) return;

    // Create a new criativo with the failed prompts
    const criativo = {
      id: Date.now() + '_retry_' + Math.random().toString(36).substr(2, 5),
      name: `Retry-${String(this.state.nextProjectCounter).padStart(2, '0')}`,
      mode: this.state.currentMode,
      orientation: 'portrait',
      textBase: '',
      phrases: failedPrompts,
      prompts: failedPrompts,
      model: this.state.model,
      outputs: this.state.outputs,
      aspectRatio: 'portrait',
      repeatCount: this.state.outputs,
      avatarDataUrl: null,
      avatarFileName: null,
      avatarFileType: null,
      downloadFolder: `FlowCriativos/Retry-${String(this.state.nextProjectCounter).padStart(2, '0')}`,
      status: 'pending',
      currentIndex: 0,
      progress: { completed: 0, total: failedPrompts.length }
    };

    this.state.masterQueue.push(criativo);
    this.state.nextProjectCounter++;
    this.state.failedPromptsList = [];
    this._saveQueue();
    this._saveSettings();
    this._updateFailedUI();
    this._renderCriativoList();
    this._renderQueueList();
    this._log('Criativo de retry criado com ' + failedPrompts.length + ' frases.', 'info');
  }

  _copyFailed() {
    const text = this.state.failedPromptsList.map(e =>
      typeof e.item === 'string' ? e.item : (e.item?.name || '')
    ).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this._log('Frases falhadas copiadas para o clipboard.', 'success');
    }).catch(() => {
      this._log('Falha ao copiar para o clipboard.', 'error');
    });
  }

  // ---------------------------------------------------------------------------
  // UI: Clear / Reset queue
  // ---------------------------------------------------------------------------
  _showClearConfirm() {
    if (this.dom.confirmModal) this.dom.confirmModal.style.display = '';
  }

  _hideClearConfirm() {
    if (this.dom.confirmModal) this.dom.confirmModal.style.display = 'none';
  }

  _clearQueue() {
    this.state.masterQueue = [];
    this._saveQueue();
    this._renderCriativoList();
    this._renderQueueList();
    this._hideClearConfirm();
    this._log('Fila limpa.', 'info');
  }

  _resetCompletedJobs() {
    this.state.masterQueue.forEach(job => {
      if (job.status === 'done' || job.status === 'failed') {
        job.status = 'pending';
        job.currentIndex = 0;
        job.progress = { completed: 0, total: job.prompts.length };
      }
    });
    this._saveQueue();
    this._renderCriativoList();
    this._renderQueueList();
    this._updateButtonStates();
    this._log('Jobs concluidos resetados para pendente.', 'info');
  }

  // ---------------------------------------------------------------------------
  // UI: Progress and Status
  // ---------------------------------------------------------------------------
  _updateProgress(current, total, jobIndex, totalJobs) {
    const jobProgress = total > 0 ? (current / total) * 100 : 0;
    if (this.dom.progressBar) {
      this.dom.progressBar.value = jobProgress;
      this.dom.progressBar.max = 100;
    }
    if (this.dom.progressText) {
      this.dom.progressText.textContent =
        `Job ${jobIndex + 1}/${totalJobs} | ${current}/${total} (${Math.round(jobProgress)}%)`;
    }
  }

  _setStatus(message, type) {
    if (this.dom.status) {
      this.dom.status.textContent = message;
      this.dom.status.className = 'fc-status';
      if (type) this.dom.status.classList.add('fc-status-' + type);
    }
  }

  // ---------------------------------------------------------------------------
  // UI: Log
  // ---------------------------------------------------------------------------
  _log(message, level) {
    console.log(`[FlowCriativos][${level || 'info'}] ${message}`);
    if (!this.dom.log) return;

    const entry = document.createElement('div');
    entry.className = 'fc-log-entry fc-log-' + (level || 'info');

    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.innerHTML = `<span class="fc-log-time">${time}</span> ${this._escapeHtml(message)}`;

    this.dom.log.appendChild(entry);
    this.dom.log.scrollTop = this.dom.log.scrollHeight;

    // Limit log entries
    while (this.dom.log.childElementCount > 500) {
      this.dom.log.removeChild(this.dom.log.firstChild);
    }
  }

  // ---------------------------------------------------------------------------
  // Utility: HTML escape
  // ---------------------------------------------------------------------------
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------------
  // Utility: Sleep functions
  // ---------------------------------------------------------------------------
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async _interruptibleSleep(ms) {
    const endTime = Date.now() + ms;
    while (Date.now() < endTime) {
      await this._pauseIfNeeded();
      if (this.state.stopRequested) return true;
      const remaining = endTime - Date.now();
      await this._sleep(Math.min(250, remaining > 0 ? remaining : 0));
    }
    return false;
  }

  async _interruptibleSleepAndScan(ms) {
    const endTime = Date.now() + ms;
    let nextScanTime = Date.now() + 4000;

    while (Date.now() < endTime) {
      await this._pauseIfNeeded();
      if (this.state.stopRequested) return 'STOPPED';

      const now = Date.now();
      if (now >= nextScanTime) {
        try {
          if (await this.injectScript(scanForPolicyError)) return 'POLICY_ERROR';
        } catch (_ignoredError) {}
        nextScanTime = now + 1000;
      }

      const remaining = endTime - now;
      const sleepTime = Math.min(250, remaining > 0 ? remaining : 0, nextScanTime - now);
      await this._sleep(sleepTime > 0 ? sleepTime : 0);
    }
    return 'COMPLETED';
  }

  async _pauseIfNeeded() {
    while (this.state.isPaused && !this.state.stopRequested) {
      await this._sleep(500);
    }
  }

  _getRandomWait() {
    const minVal = parseInt(this.dom.configDelayMin?.value || '90', 10) || 90;
    const maxVal = parseInt(this.dom.configDelayMax?.value || '120', 10) || 120;
    const lower = Math.min(minVal, maxVal);
    const upper = Math.max(minVal, maxVal);
    return Math.max(1000, 1000 * (Math.floor(Math.random() * (upper - lower + 1)) + lower));
  }

  _getProjectIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/project\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  _readFileAsDataURL(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => {
        this._log('Erro ao ler arquivo: ' + (blob?.name || 'unknown'), 'error');
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  }

  // ---------------------------------------------------------------------------
  // Script Injection — sends function to background.js for MAIN world execution
  // ---------------------------------------------------------------------------
  async injectScript(func, args = []) {
    let tabId = this.state.flowTabId;

    if (!tabId) {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'getActiveTab' });
        if (response?.success && response.tab?.url?.includes('/tools/flow')) {
          tabId = response.tab.id;
          this.state.flowTabId = tabId;
        } else {
          this._log('Nenhuma aba Flow ativa encontrada.', 'error');
          return undefined;
        }
      } catch (_err) {
        this._log('Erro ao buscar aba ativa.', 'error');
        return undefined;
      }
    }

    // Append SELECTORS as the last argument
    const allArgs = [...args, SELECTORS];

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'executeInPage',
        tabId: tabId,
        funcBody: func.toString(),
        args: allArgs
      });

      if (response?.success) {
        return response.result;
      } else {
        const errorMsg = response?.error || 'Unknown error';
        // Tab-related errors: throw (like original) so callers can catch
        if (errorMsg.includes('No tab with id') ||
          errorMsg.includes('Receiving end does not exist')) {
          throw new Error(errorMsg);
        }
        if (!this.state.stopRequested) {
          this._log('Erro de inject: ' + errorMsg, 'error');
        }
        return undefined;
      }
    } catch (err) {
      // Re-throw tab-related errors
      if (err.message?.includes('No tab with id') ||
        err.message?.includes('Receiving end does not exist')) {
        throw err;
      }
      if (!this.state.stopRequested) {
        this._log('Erro ao executar script: ' + err.message, 'error');
      }
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Scanner: Auto-download
  // ---------------------------------------------------------------------------
  _startScanner() {
    this._stopScanner();
    this.state.downloadInterval = setInterval(() => this._performScan(), this.state.scanIntervalMs);
    if (this.dom.scannerStatus) this.dom.scannerStatus.textContent = 'Scanner ativo';
  }

  _stopScanner() {
    if (this.state.downloadInterval) {
      clearInterval(this.state.downloadInterval);
      this.state.downloadInterval = null;
    }
    if (this.dom.scannerStatus) this.dom.scannerStatus.textContent = 'Scanner parado';
  }

  async _performScan() {
    if (!this.state.autoDownloadEnabled || !this.state.flowTabId) return;

    const hasPendingTasks = this.state.masterTaskList.some(t => t.status === 'pending');
    if (!hasPendingTasks && !this.state.finalScanTimerId && !this.state.isRunning) return;

    let scanResults;
    try {
      scanResults = await this.injectScript(findAndGroupNewVideos, [
        Array.from(this.state.downloadedVideoUrls)
      ]);
    } catch (scanError) {
      if (scanError?.message?.includes('No tab with id') ||
        scanError?.message?.includes('Receiving end does not exist')) {
        if (!this.state.stopRequested) {
          this._log('Aba Flow fechada ou inacessivel.', 'error');
        }
        this._stopScanner();
      } else if (!this.state.stopRequested) {
        this._log('Erro no scanner: ' + (scanError?.message || 'unknown'), 'error');
      }
      return;
    }

    if (!Array.isArray(scanResults) || scanResults.length === 0) return;

    let currentJob = null;
    if (this.state.isRunning && this.state.masterQueue.length > 0 &&
      this.state.currentJobIndex < this.state.masterQueue.length) {
      currentJob = this.state.masterQueue[this.state.currentJobIndex];
    }

    for (const scannedGroup of scanResults) {
      const scannedPrompt = scannedGroup.prompt.trim();

      const matchingTask = this.state.masterTaskList.find(task => {
        if (task.status !== 'pending') return false;
        const taskPrompt = task.prompt.trim();
        return (
          taskPrompt === scannedPrompt ||
          taskPrompt.startsWith(scannedPrompt.replace(/\.{3}$/, '')) ||
          scannedPrompt.startsWith(taskPrompt.substring(0, 30))
        );
      });

      if (!matchingTask) continue;

      const matchingJob = this.state.masterQueue.find(job => job.id === matchingTask.jobId);
      if (!matchingJob) continue;

      const mediaItems = scannedGroup.videos || [];
      const newMediaUrls = mediaItems.filter(
        url => !this.state.downloadedVideoUrls.has(url.split('?')[0])
      );

      if (newMediaUrls.length === 0) continue;

      this._log(
        `Scanner: ${newMediaUrls.length} novo(s) video(s) para "${matchingTask.prompt.substring(0, 30)}..."`,
        'info'
      );

      const letterLabels = 'abcdefghijklmnopqrstuvwxyz';
      const resolution = this.state.videoDownloadResolution || '720p';

      for (const mediaUrl of newMediaUrls) {
        if (matchingTask.foundVideos >= matchingTask.expectedVideos) break;

        const baseUrl = mediaUrl.split('?')[0];
        if (this.state.downloadedVideoUrls.has(baseUrl)) continue;

        this.state.downloadedVideoUrls.add(baseUrl);
        matchingTask.foundVideos++;
        this.state.newlyDownloadedCount++;

        if (this.dom.downloadCount) {
          this.dom.downloadCount.textContent = String(this.state.newlyDownloadedCount);
        }

        const letterLabel = letterLabels[matchingTask.foundVideos - 1] || matchingTask.foundVideos;
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const filename = `${matchingTask.index}.${letterLabel}. ${timestamp}.mp4`;
        const filepath = `${matchingJob.downloadFolder || 'FlowCriativos'}/${filename}`;

        if (resolution !== '720p') {
          // Use Flow UI for higher resolution
          try {
            const result = await this.injectScript(downloadVideoAtResolution, [mediaUrl, resolution]);
            if (result?.success) {
              this._log(`Download ${resolution}: ${filepath}`, 'success');
              if (matchingTask.foundVideos >= matchingTask.expectedVideos) {
                matchingTask.status = 'complete';
                this._log(`Tarefa ${matchingTask.index} completa.`, 'success');
              }
            } else {
              this._log(`Falha download ${resolution}: ${result?.error || 'unknown'}`, 'warn');
              this.state.downloadedVideoUrls.delete(baseUrl);
              matchingTask.foundVideos--;
              this.state.newlyDownloadedCount--;
            }
          } catch (err) {
            this._log('Erro download: ' + err.message, 'error');
            this.state.downloadedVideoUrls.delete(baseUrl);
            matchingTask.foundVideos--;
            this.state.newlyDownloadedCount--;
          }
          await this._interruptibleSleep(2000);
        } else {
          // Direct URL download for 720p
          try {
            const dlResponse = await chrome.runtime.sendMessage({
              type: 'downloadFile',
              url: mediaUrl,
              filename: filepath
            });
            if (dlResponse?.success) {
              this._log(`Download: ${filepath}`, 'success');
              if (matchingTask.foundVideos >= matchingTask.expectedVideos) {
                matchingTask.status = 'complete';
                this._log(`Tarefa ${matchingTask.index} completa.`, 'success');
              }
            } else {
              this._log(`Falha download: ${dlResponse?.error || 'unknown'}`, 'error');
              this.state.downloadedVideoUrls.delete(baseUrl);
              matchingTask.foundVideos--;
              this.state.newlyDownloadedCount--;
            }
          } catch (dlErr) {
            if (!this.state.stopRequested) {
              this._log('Erro download: ' + dlErr.message, 'error');
            }
            this.state.downloadedVideoUrls.delete(baseUrl);
            matchingTask.foundVideos--;
            this.state.newlyDownloadedCount--;
          }
          await this._sleep(300);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Manual download: scroll + collect all videos from current project
  // ---------------------------------------------------------------------------
  async _manualDownloadProject() {
    if (!this.state.flowTabId) {
      await this._resolveFlowTabId();
    }
    if (!this.state.flowTabId) {
      this._log('Nenhuma aba Flow ativa.', 'error');
      return;
    }

    if (this.dom.manualDownloadStatus) {
      this.dom.manualDownloadStatus.textContent = 'Escaneando videos...';
    }

    try {
      const videos = await this.injectScript(scrollAndScanAllVideos, []);
      if (!Array.isArray(videos) || videos.length === 0) {
        this._log('Nenhum video encontrado no projeto.', 'warn');
        if (this.dom.manualDownloadStatus) {
          this.dom.manualDownloadStatus.textContent = 'Nenhum video encontrado.';
        }
        return;
      }

      this._log(`Encontrados ${videos.length} videos. Iniciando download...`, 'info');
      if (this.dom.manualDownloadStatus) {
        this.dom.manualDownloadStatus.textContent = `Baixando ${videos.length} videos...`;
      }

      let downloaded = 0;
      const resolution = this.state.videoDownloadResolution || '720p';

      for (let i = 0; i < videos.length; i++) {
        const vid = videos[i];
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').substring(0, 15);
        const filename = `ManualDL/video_${i + 1}_${timestamp}.mp4`;

        if (resolution !== '720p') {
          try {
            const result = await this.injectScript(downloadVideoAtResolution, [vid.url, resolution]);
            if (result?.success) {
              downloaded++;
              this._log(`Download ${downloaded}/${videos.length}`, 'info');
            }
          } catch (_err) {}
          await this._sleep(2000);
        } else {
          try {
            await chrome.runtime.sendMessage({
              type: 'downloadFile',
              url: vid.url,
              filename: filename
            });
            downloaded++;
            this._log(`Download ${downloaded}/${videos.length}`, 'info');
          } catch (_err) {}
          await this._sleep(500);
        }
      }

      this._log(`Download manual concluido: ${downloaded}/${videos.length} videos.`, 'success');
      if (this.dom.manualDownloadStatus) {
        this.dom.manualDownloadStatus.textContent = `Concluido: ${downloaded}/${videos.length} videos.`;
      }
    } catch (err) {
      this._log('Erro no download manual: ' + err.message, 'error');
      if (this.dom.manualDownloadStatus) {
        this.dom.manualDownloadStatus.textContent = 'Erro: ' + err.message;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queue: Apply page settings
  // ---------------------------------------------------------------------------
  async _applyPageSettings(jobConfig) {
    await this._interruptibleSleep(2000);

    // Set zoom to 50%
    try {
      await chrome.runtime.sendMessage({
        type: 'setZoom', tabId: this.state.flowTabId, zoom: 0.5
      });
    } catch (err) {
      this._log('Falha ao ajustar zoom.', 'warn');
    }

    // Apply grid view
    const gridResult = await this.injectScript(clickElementByXPath, [
      SELECTORS.GRID_VIEW_BUTTON_XPATH
    ]);
    if (gridResult === true) {
      this._log('Grid view ativado.', 'info');
      await this._interruptibleSleep(500);
    }

    // Apply videocam mode
    const videocamResult = await this.injectScript(clickElementByXPath, [
      SELECTORS.VIDEOCAM_BUTTON_XPATH
    ]);
    if (videocamResult === true) {
      this._log('Modo videocam ativado.', 'info');
      await this._interruptibleSleep(500);
    }

    // Scan existing videos to avoid re-downloading
    try {
      const existingVideos = await this.injectScript(scanExistingVideos);
      if (Array.isArray(existingVideos) && existingVideos.length > 0) {
        existingVideos.forEach(url => this.state.downloadedVideoUrls.add(url));
        this._log(`Videos existentes: ${existingVideos.length} encontrados.`, 'info');
      }
    } catch (_err) {
      this._log('Falha ao escanear videos existentes.', 'warn');
    }

    // Apply settings (output count, model, aspect ratio)
    const outputCount = parseInt(jobConfig.repeatCount || jobConfig.outputs || '1', 10);
    const model = jobConfig.model || this.state.model || 'default';
    const aspectRatio = jobConfig.aspectRatio || 'landscape';

    if (jobConfig.mode !== 'image-to-video') {
      const settingsResult = await this.injectScript(setInitialSettings, [
        outputCount, model, aspectRatio
      ]);
      if (!settingsResult) {
        this._log('Falha ao aplicar configuracoes.', 'error');
        return false;
      }
    } else {
      // For image-to-video, apply settings then select image mode
      await this.injectScript(setInitialSettings, [outputCount, model, aspectRatio]);
    }

    // Select the appropriate mode
    let modeSelected = false;
    if (jobConfig.mode === 'image-to-video') {
      modeSelected = await this.injectScript(selectImageMode);
    } else {
      modeSelected = await this.injectScript(selectTextMode);
    }

    if (modeSelected) {
      this._log('Configuracoes aplicadas com sucesso.', 'info');
      return true;
    } else {
      this._log('Falha ao selecionar modo: ' + jobConfig.mode, 'error');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Queue: Start
  // ---------------------------------------------------------------------------
  async _startQueue(isContinuation = false) {
    if (this.state.finalScanTimerId) {
      clearInterval(this.state.finalScanTimerId);
      this.state.finalScanTimerId = null;
    }

    const firstPendingIndex = this.state.masterQueue.findIndex(j => j.status === 'pending');
    if (firstPendingIndex === -1) {
      this._log('Nenhum job pendente na fila.', 'warn');
      return;
    }

    try {
      // Resolve tab ID
      await this._resolveFlowTabId();
      if (!this.state.flowTabId) {
        throw new Error('Nenhuma aba Flow ativa encontrada.');
      }

      this.state.isRunning = true;
      this.state.stopRequested = false;
      this.state.skipRequested = false;
      this.state.isPaused = false;
      this.state.currentJobIndex = firstPendingIndex;
      this.state.failedPromptsList = [];
      this.state.masterTaskList = [];

      this._updateButtonStates();
      this._updateFailedUI();
      if (this.dom.log) this.dom.log.innerHTML = '';
      this._log('Sessao iniciada.', 'system');

      await this._processNextJob(isContinuation);
    } catch (err) {
      this._log('Erro ao iniciar: ' + err.message, 'error');
      this._setStatus('Erro: ' + err.message, 'error');
      this._resetState('Erro ao iniciar.');
    }
  }

  // ---------------------------------------------------------------------------
  // Queue: Process next job
  // ---------------------------------------------------------------------------
  async _processNextJob(isSubsequentJob = false) {
    if (this.state.stopRequested) {
      this._resetState('Parado pelo usuario.');
      return;
    }

    if (this.state.finalScanTimerId) {
      clearInterval(this.state.finalScanTimerId);
      this.state.finalScanTimerId = null;
    }

    // Find next pending job
    this.state.currentJobIndex = this.state.masterQueue.findIndex(
      (job, idx) => job.status === 'pending' && idx >= this.state.currentJobIndex
    );

    if (this.state.currentJobIndex === -1) {
      this._log('Todos os jobs concluidos!', 'system');
      this._setStatus('Todos concluidos!', 'success');
      this._resetState(null);
      this._updateButtonStates();
      return;
    }

    // Auto-start check
    if (isSubsequentJob && !this.state.autoStartNextJob) {
      this._log('Auto-start desativado. Aguardando inicio manual.', 'info');
      this._setStatus('Job concluido. Clique Iniciar para o proximo.', 'info');
      this._resetState(null);
      this._updateButtonStates();
      return;
    }

    const currentJob = this.state.masterQueue[this.state.currentJobIndex];
    currentJob.status = 'running';
    this._renderCriativoList();
    this._renderQueueList();

    const repeatCount = parseInt(currentJob.repeatCount || currentJob.outputs || '1', 10);

    // Build task list
    this.state.taskList = [];
    for (let idx = 0; idx < currentJob.prompts.length; idx++) {
      const task = {
        index: idx + 1,
        item: currentJob.prompts[idx],
        prompt: currentJob.prompts[idx],
        status: 'pending',
        expectedVideos: repeatCount,
        foundVideos: 0,
        jobId: currentJob.id,
        avatarDataUrl: currentJob.avatarDataUrl,
        avatarFileName: currentJob.avatarFileName,
        avatarFileType: currentJob.avatarFileType
      };
      this.state.taskList.push(task);
      this.state.masterTaskList.push(task);
    }

    this.state.promptList = this.state.taskList.map(t => t.item);
    this.state.currentMode = currentJob.mode;
    this.state.currentIndex = currentJob.currentIndex || 0;

    // Setup and run the job
    try {
      await this._setupAndRunJob(currentJob, isSubsequentJob);
    } catch (jobErr) {
      this._log(`Erro critico no job ${this.state.currentJobIndex + 1}: ${jobErr.message}`, 'error');
      this._setStatus('Erro: ' + jobErr.message, 'error');
      currentJob.status = 'failed';
      this._renderCriativoList();
      this._renderQueueList();
      this._saveQueue();
      this.state.currentJobIndex++;
      await this._processNextJob(true);
    }
  }

  // ---------------------------------------------------------------------------
  // Queue: Setup and run a single job
  // ---------------------------------------------------------------------------
  async _setupAndRunJob(jobConfig, isSubsequent) {
    let alreadyOnProject = false;

    if (isSubsequent) {
      try {
        const tabUrlResponse = await chrome.runtime.sendMessage({
          type: 'getTabUrl', tabId: this.state.flowTabId
        });
        if (tabUrlResponse?.success && tabUrlResponse.url?.includes('/tools/flow/project')) {
          alreadyOnProject = true;
        }
      } catch (_err) {}
    }

    if (alreadyOnProject) {
      // Continue on current project
      try {
        const tabUrlResponse = await chrome.runtime.sendMessage({
          type: 'getTabUrl', tabId: this.state.flowTabId
        });
        this.state.currentProjectId = this._getProjectIdFromUrl(tabUrlResponse?.url);
      } catch (_err) {}
      this._log(`Continuando job ${this.state.currentJobIndex + 1} no projeto atual.`, 'system');
    } else {
      // Create new project
      this.state.downloadedVideoUrls.clear();
      this._setStatus('Criando novo projeto...', 'info');
      this._log(`Iniciando job ${this.state.currentJobIndex + 1}...`, 'system');

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'createNewProject',
          tabId: this.state.flowTabId,
          selectors: SELECTORS
        });

        if (!result?.success) {
          throw new Error(result?.error || 'Falha ao criar novo projeto');
        }

        this.state.currentProjectId = this._getProjectIdFromUrl(result.url);
        this._log(`Projeto criado: ${this.state.currentProjectId || 'N/A'}`, 'info');
      } catch (navErr) {
        throw new Error('Falha na navegacao: ' + navErr.message);
      }
    }

    if (this.state.stopRequested) {
      this._resetState('Parado pelo usuario.');
      return;
    }

    // Apply page settings
    if (!(await this._applyPageSettings(jobConfig))) {
      throw new Error('Falha ao aplicar configuracoes na pagina.');
    }

    if (this.state.stopRequested) {
      this._resetState('Parado pelo usuario.');
      return;
    }

    // Start auto-download scanner
    this._stopScanner();
    if (this.state.autoDownloadEnabled) {
      this._startScanner();
      this._log(`Scanner iniciado (intervalo: ${this.state.scanIntervalMs / 1000}s).`, 'info');
    }

    this.state.newlyDownloadedCount = 0;

    // Process all tasks
    await this._processAllTasks(jobConfig);
  }

  // ---------------------------------------------------------------------------
  // Queue: Process all tasks within a job
  // ---------------------------------------------------------------------------
  async _processAllTasks(jobConfig) {
    const totalTasks = this.state.taskList.length;
    const aspectRatio = jobConfig.aspectRatio || 'landscape';
    const orientation = jobConfig.orientation || 'portrait';

    while (this.state.currentIndex < totalTasks &&
      this.state.isRunning && !this.state.stopRequested) {
      await this._pauseIfNeeded();
      if (this.state.stopRequested) break;

      const currentTask = this.state.taskList[this.state.currentIndex];
      let taskFailed = false;
      let policyViolation = false;

      jobConfig.progress.completed = this.state.currentIndex;
      this._renderQueueList();

      for (let retryAttempt = 0; retryAttempt <= this.state.MAX_RETRIES; retryAttempt++) {
        await this._pauseIfNeeded();
        if (this.state.stopRequested) break;

        if (retryAttempt > 0) {
          this._log(`Retry ${retryAttempt} para tarefa ${currentTask.index}...`, 'warn');

          // Wait a scan interval before retry
          if (this.state.autoDownloadEnabled) {
            await this._interruptibleSleep(this.state.scanIntervalMs);
          }

          // Reload page for retry
          try {
            await chrome.runtime.sendMessage({
              type: 'reloadTab', tabId: this.state.flowTabId
            });
            await chrome.runtime.sendMessage({
              type: 'waitForTabLoad', tabId: this.state.flowTabId
            });
            if (!(await this._applyPageSettings(jobConfig))) {
              throw new Error('Falha ao reaplicar configuracoes.');
            }
          } catch (reloadErr) {
            this._log('Falha ao recarregar: ' + reloadErr.message, 'error');
            this._addFailedPrompt(currentTask.item, reloadErr.message,
              currentTask.index, this.state.currentJobIndex);
            taskFailed = true;
            break;
          }

          // Wait for queue to clear
          if (!(await this._waitForQueueClear())) {
            taskFailed = true;
            break;
          }
        }

        let statusMessage;
        let injectResult;

        this._updateProgress(
          this.state.currentIndex, totalTasks,
          this.state.currentJobIndex, this.state.masterQueue.length
        );

        if (jobConfig.mode === 'image-to-video') {
          // Image-to-video mode
          statusMessage = `Processando ${currentTask.index}/${totalTasks} (tentativa ${retryAttempt}/${this.state.MAX_RETRIES})`;
          this._log(statusMessage, 'info');
          this._setStatus(statusMessage, 'info');

          if (!currentTask.avatarDataUrl) {
            injectResult = 'FILE_READ_ERROR';
          } else {
            injectResult = await this.injectScript(processImageAndPromptOnPage, [
              currentTask.avatarDataUrl,
              currentTask.avatarFileName || 'avatar.png',
              currentTask.avatarFileType || 'image/png',
              currentTask.prompt,
              orientation
            ]);
          }
        } else {
          // Text-to-video mode
          statusMessage = `Processando ${currentTask.index}/${totalTasks} (tentativa ${retryAttempt}/${this.state.MAX_RETRIES})`;
          this._log(statusMessage, 'info');
          this._setStatus(statusMessage, 'info');

          injectResult = await this.injectScript(processPromptOnPage, [
            currentTask.prompt,
            SELECTORS.PROMPT_TEXTAREA_ID,
            SELECTORS.GENERATE_BUTTON_XPATH
          ]);
        }

        // Handle result
        if (injectResult === true) {
          this._log(`Tarefa ${currentTask.index} enviada com sucesso.`, 'success');
          taskFailed = false;
          break;
        }

        if (injectResult === 'QUEUE_FULL') {
          this._log('Fila cheia. Aguardando...', 'warn');
          if (await this._handleQueueFull()) {
            retryAttempt--;
            continue;
          }
          taskFailed = true;
          if (retryAttempt === this.state.MAX_RETRIES) {
            this._log('Fila cheia: desistindo apos retries.', 'error');
            this._addFailedPrompt(currentTask.item, 'Fila cheia',
              currentTask.index, this.state.currentJobIndex);
          }
          continue;
        }

        if (injectResult === 'RATE_LIMIT') {
          this._log('Rate limit atingido. Aguardando 30s...', 'warn');
          await this._interruptibleSleep(30000);
          retryAttempt--;
          continue;
        }

        // Handle other errors
        taskFailed = true;
        let errorReason = 'Erro desconhecido';

        if (injectResult === 'POLICY_IMAGE') {
          errorReason = 'Erro de politica: imagem rejeitada';
        } else if (injectResult === 'POLICY_PROMPT') {
          errorReason = 'Erro de politica: prompt rejeitado';
        } else if (injectResult === 'FILE_READ_ERROR') {
          errorReason = 'Erro ao ler arquivo de imagem';
        } else if (injectResult === false) {
          errorReason = jobConfig.mode === 'image-to-video'
            ? 'Falha ao processar imagem'
            : 'Falha ao enviar prompt';
        }

        this._log(errorReason, 'error');

        if (injectResult === 'POLICY_IMAGE' || injectResult === 'POLICY_PROMPT') {
          policyViolation = true;
          this._addFailedPrompt(currentTask.item, errorReason,
            currentTask.index, this.state.currentJobIndex);
          break;
        }

        if (retryAttempt === this.state.MAX_RETRIES) {
          this._log(`Tarefa ${currentTask.index} falhou apos ${this.state.MAX_RETRIES} tentativas.`, 'error');
          this._addFailedPrompt(currentTask.item, errorReason,
            currentTask.index, this.state.currentJobIndex);
        }
      }

      if (this.state.stopRequested) break;

      // Wait between tasks
      if (!taskFailed || policyViolation) {
        const waitTime = this._getRandomWait();
        this._log(`Aguardando ${Math.round(waitTime / 1000)}s...`, 'info');

        if (policyViolation) {
          await this._interruptibleSleep(waitTime);
        } else {
          const scanResult = await this._interruptibleSleepAndScan(waitTime);
          if (scanResult === 'STOPPED') break;
          if (scanResult === 'POLICY_ERROR') {
            this._log('Erro de politica detectado durante espera.', 'error');
            taskFailed = true;
          }
        }
      }

      if (this.state.stopRequested) break;

      if (!taskFailed) {
        this._log(`Tarefa ${currentTask.index} concluida.`, 'system');
      }

      this.state.currentIndex++;
      jobConfig.currentIndex = this.state.currentIndex;
    }

    // Job completion
    if (this.state.stopRequested) {
      jobConfig.status = 'pending';
      this._renderCriativoList();
      this._renderQueueList();
      this._resetState('Parado pelo usuario.');
    } else if (this.state.isRunning) {
      jobConfig.status = 'done';
      jobConfig.progress.completed = totalTasks;
      this._renderCriativoList();
      this._renderQueueList();
      this._saveQueue();

      // Final scan period
      if (this.state.autoDownloadEnabled) {
        this._log(`Job ${this.state.currentJobIndex + 1}: scan final...`, 'system');
        this._setStatus(`Scan final do job ${this.state.currentJobIndex + 1}...`, 'info');

        const scanStartTime = Date.now();
        const scanTimeoutMs = 90000;
        const scanCheckInterval = 5000;

        await new Promise((resolve) => {
          this.state.finalScanTimerId = setInterval(async () => {
            if (this.state.currentJobIndex >= this.state.masterQueue.length ||
              !this.state.masterQueue[this.state.currentJobIndex]) {
              clearInterval(this.state.finalScanTimerId);
              this.state.finalScanTimerId = null;
              resolve();
              return;
            }

            const jobId = this.state.masterQueue[this.state.currentJobIndex].id;
            const jobTasks = this.state.masterTaskList.filter(t => t.jobId === jobId);
            const allTasksSettled = jobTasks.length > 0 &&
              jobTasks.every(t => t.status === 'complete' || t.status === 'failed');
            const elapsed = Date.now() - scanStartTime;

            let shouldProceed = false;

            if (allTasksSettled) {
              this._log(`Job ${this.state.currentJobIndex + 1}: todos os tasks resolvidos.`, 'success');
              shouldProceed = true;
            } else if (elapsed >= scanTimeoutMs) {
              this._log(`Job ${this.state.currentJobIndex + 1}: timeout do scan final.`, 'warn');
              shouldProceed = true;
            }

            if (shouldProceed) {
              clearInterval(this.state.finalScanTimerId);
              this.state.finalScanTimerId = null;
              resolve();
            }
          }, scanCheckInterval);
        });

        this.state.currentJobIndex++;
        await this._processNextJob(true);
      } else {
        this.state.currentJobIndex++;
        await this._processNextJob(true);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queue: Queue full handling
  // ---------------------------------------------------------------------------
  async _pollQueueFullStatus(maxAttempts, delayMs, attemptOffset) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this._pauseIfNeeded();
      if (this.state.stopRequested) return 'STOPPED';

      const isQueueFull = await this.injectScript(scanForQueueFullPopup);
      if (isQueueFull === undefined) return 'ERROR';

      if (!isQueueFull) {
        this._log('Fila liberada.', 'info');
        return 'CLEARED';
      }

      this._log(`Fila cheia: tentativa ${attempt + attemptOffset}/30...`, 'warn');
      this._setStatus(`Fila cheia: aguardando... (${attempt + attemptOffset}/30)`, 'warn');
      await this._interruptibleSleep(delayMs);
    }
    return 'STILL_FULL';
  }

  async _handleQueueFull() {
    let result = await this._pollQueueFullStatus(10, 10000, 0);
    if (result === 'CLEARED') return true;
    if (result === 'STOPPED' || result === 'ERROR') return false;

    this._log('Fila ainda cheia. Aguardando 30s...', 'warn');
    await this._interruptibleSleep(30000);
    if (this.state.stopRequested) return false;

    result = await this._pollQueueFullStatus(10, 10000, 10);
    return result === 'CLEARED';
  }

  async _waitForQueueClear() {
    const result = await this._pollQueueFullStatus(10, 10000, 20);
    if (result === 'CLEARED') return true;
    if (result === 'STOPPED' || result === 'ERROR') return false;

    this._log('Fila cheia: desistindo.', 'error');
    this._resetState('Fila cheia: nao foi possivel continuar.');
    return false;
  }

  // ---------------------------------------------------------------------------
  // Queue: Pause / Stop / Skip
  // ---------------------------------------------------------------------------
  _togglePause() {
    this.state.isPaused = !this.state.isPaused;
    if (this.state.isPaused) {
      this._log('Pausado.', 'warn');
      this._setStatus('Pausado', 'warn');
    } else {
      this._log('Retomado.', 'info');
      this._setStatus('Executando...', 'info');
    }
    this._updateButtonStates();
  }

  _stopQueue() {
    this.state.stopRequested = true;
    this._log('Parando...', 'warn');
    this._setStatus('Parando...', 'warn');
  }

  _skipToNextJob() {
    if (this.state.finalScanTimerId) {
      clearInterval(this.state.finalScanTimerId);
      this.state.finalScanTimerId = null;
      this._log('Pulando scan, indo para proximo job...', 'info');
      this.state.currentJobIndex++;
      this._processNextJob(true);
    } else if (this.state.isRunning) {
      this._log('Pulando job atual...', 'info');
      this.state.stopRequested = true;
      setTimeout(() => {
        this.state.stopRequested = false;
        this.state.currentJobIndex++;
        const nextPending = this.state.masterQueue.findIndex(
          (job, idx) => idx >= this.state.currentJobIndex && job.status === 'pending'
        );
        if (nextPending >= 0) {
          this.state.currentJobIndex = nextPending;
          this._processNextJob(true);
        } else {
          this._log('Nenhum job pendente restante.', 'info');
          this._resetState(null);
        }
      }, 500);
    } else {
      this._log('Nenhum job em execucao para pular.', 'warn');
    }
  }

  // ---------------------------------------------------------------------------
  // Queue: Reset state
  // ---------------------------------------------------------------------------
  _resetState(statusMessage) {
    this._stopScanner();

    if (this.state.finalScanTimerId) {
      clearInterval(this.state.finalScanTimerId);
      this.state.finalScanTimerId = null;
    }

    // Reset zoom
    if (this.state.flowTabId) {
      const savedTabId = this.state.flowTabId;
      setTimeout(() => {
        try {
          chrome.runtime.sendMessage({
            type: 'setZoom', tabId: savedTabId, zoom: 1
          });
        } catch (_err) {}
      }, 500);
    }

    this.state.isRunning = false;
    this.state.stopRequested = false;
    this.state.skipRequested = false;
    this.state.isPaused = false;
    this.state.currentIndex = 0;
    this.state.currentJobIndex = 0;
    this.state.flowTabId = null;
    this.state.currentProjectId = null;
    this.state.newlyDownloadedCount = 0;
    this.state.promptList = [];
    this.state.taskList = [];
    this.state.masterTaskList = [];

    // Reset running jobs to pending
    this.state.masterQueue.forEach(job => {
      if (job.status === 'running') {
        job.status = 'pending';
      }
    });

    this._saveQueue();
    this._renderCriativoList();
    this._renderQueueList();
    this._updateButtonStates();

    if (this.dom.progressBar) this.dom.progressBar.value = 0;
    if (this.dom.progressText) this.dom.progressText.textContent = '0%';

    if (statusMessage) {
      this._log(statusMessage, 'system');
      this._setStatus(statusMessage, 'warn');
    } else {
      this._setStatus('Pronto', '');
    }
  }
}


// =============================================================================
// SECTION 5: ENTRY POINT
// =============================================================================

(function initFlowCriativos() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new FlowCriativos());
  } else {
    new FlowCriativos();
  }
})();
