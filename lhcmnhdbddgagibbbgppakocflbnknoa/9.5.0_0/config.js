import { state } from "./state.js";
import { dom } from "./dom.js";
import { logMessage, renderToolsList, updateLiveStatus } from "./ui.js";
import { i18n } from "./i18n.js";

const CONFIG_DATA = {
  selectors: {
    PROMPT_TEXTAREA_ID: "PINHOLE_TEXT_AREA_ELEMENT_ID",
    GENERATE_BUTTON_XPATH:
      "//button[.//i[text()='arrow_forward']] | (//button[.//i[normalize-space(text())='arrow_forward']])",
    NEW_PROJECT_BUTTON_XPATH:
      "//button[.//i[normalize-space(text())='add_2']] | (//button[.//i[normalize-space(.)='add_2']])",
    GRID_VIEW_BUTTON_XPATH:
      "(//button[@role='radio' and .//i[normalize-space(text())='grid_on']]) | (//button[.//i[normalize-space(.)='grid_view']])",
    VIDEOCAM_BUTTON_XPATH:
      "//button[@role='radio' and .//i[normalize-space()='videocam']]",
    PROMPT_POLICY_ERROR_POPUP_XPATH:
      "//li[@data-sonner-toast and .//i[normalize-space(text())='error'] and not(.//*[contains(., '5')])]",
    QUEUE_FULL_POPUP_XPATH:
      "//li[@data-sonner-toast and .//i[normalize-space(text())='error'] and .//*[contains(., '5')]]",
    RATE_LIMIT_POPUP_XPATH:
      "//li[@data-sonner-toast and .//*[contains(., 'too quickly')]]",
    START_IMAGE_ADD_BUTTON_XPATH:
      "(//button[.//div[@data-type='button-overlay'] and .//i[text()='add']])[1]",
    HIDDEN_FILE_INPUT_XPATH: '//input[@type="file"]',
    UPLOAD_SPINNER_XPATH: "//i[contains(text(), 'progress_activity')]",
    IMAGE_CROP_RATIO_DROPDOWN_XPATH:
      "//button[@role='combobox' and .//i[normalize-space(text())='arrow_drop_down'] and .//i[normalize-space(text())='crop_9_16' or normalize-space(text())='crop_16_9']]",
    IMAGE_CROP_RATIO_LANDSCAPE_XPATH:
      "//div[@role='option' and .//i[normalize-space(text())='crop_16_9']]",
    IMAGE_CROP_RATIO_PORTRAIT_XPATH:
      "//div[@role='option' and .//i[normalize-space(text())='crop_9_16']]",
    CROP_AND_SAVE_BUTTON_XPATH:
      "//button[.//i[normalize-space(text())='crop']]",
    IMAGE_POLICY_ERROR_POPUP_XPATH:
      "//li[@data-sonner-toast and .//i[normalize-space(text())='error'] and not(.//*[contains(., '5')])]",
    SETTINGS_BUTTON_XPATH:
      "//button[.//div[contains(., 'Veo')] and .//i[normalize-space(text())='volume_up' or normalize-space(text())='volume_off']]",
    OUTPUT_NUMBER_BUTTON_XPATH:
      "//button[@role='combobox' and .//span[not(.//i) and (normalize-space(.)='1' or normalize-space(.)='2' or normalize-space(.)='3' or normalize-space(.)='4')]]",
    OUTPUT_NUMBER_ONE_XPATH: "//div[@role='option' and .//span[text()='1']]",
    OUTPUT_NUMBER_TWO_XPATH: "//div[@role='option' and .//span[text()='2']]",
    OUTPUT_NUMBER_THREE_XPATH: "//div[@role='option' and .//span[text()='3']]",
    OUTPUT_NUMBER_FOUR_XPATH: "//div[@role='option' and .//span[text()='4']]",
    MODEL_SELECTION_BUTTON_XPATH:
      "//button[@role='combobox' and .//span[not(.//i)] and contains(normalize-space(),'Veo')]",
    MODEL_VEO_3_FAST_XPATH:
      "//div[@role='option' and contains(., 'Veo 3.1 - Fast')]",
    MODEL_VEO_3_FAST_LOW_XPATH:
      "//div[@role='option' and contains(., 'Veo 3.1 - Fast [Lower Priority]')]",
    MODEL_VEO_2_FAST_XPATH:
      "//div[@role='option' and contains(., 'Veo 2 - Fast')]",
    MODEL_VEO_3_QUALITY_XPATH:
      "//div[@role='option' and contains(., 'Veo 3.1 - Quality')]",
    MODEL_VEO_2_QUALITY_XPATH:
      "//div[@role='option' and contains(., 'Veo 2 - Quality')]",
    ASPECT_RATIO_DROPDOWN_XPATH:
      "//button[@role='combobox' and .//i[normalize-space(text())='crop_portrait' or normalize-space(text())='crop_landscape']]",
    LANDSCAPE_ASPECT_RATIO_XPATH:
      "//div[@role='option' and .//i[normalize-space(text())='crop_landscape']]",
    PORTRAIT_ASPECT_RATIO_XPATH:
      "//div[@role='option' and .//i[normalize-space(text())='crop_portrait']]",
    MODE_DROPDOWN_XPATH:
      "//button[@role='combobox' and .//i[normalize-space()='arrow_drop_down'] and .//div[@data-type='button-overlay']]",
    IMAGE_TO_VIDEO_MODE_XPATH:
      "//div[@role='option' and .//i[normalize-space(text())='photo_spark']]",
    TEXT_TO_VIDEO_MODE_XPATH:
      "//div[@role='option' and .//i[normalize-space(text())='text_analysis']]",
    CREATE_IMAGE_MODE_XPATH:
      "//div[@role='option' and .//i[normalize-space(text())='image']] | //div[@role='option' and contains(., 'Create Image')]",
    IMAGE_SETTINGS_BUTTON_XPATH:
      "//button[.//div[contains(., 'Nano')] or .//div[contains(., 'Imagen')]]",
    IMAGE_OUTPUT_NUMBER_BUTTON_XPATH:
      "//button[@role='combobox' and .//span[not(.//i) and (normalize-space(.)='1' or normalize-space(.)='2' or normalize-space(.)='3' or normalize-space(.)='4')] and not(.//span[contains(., 'Veo')])]",
    IMAGE_MODEL_BUTTON_XPATH:
      "//button[@role='combobox' and (.//span[contains(., 'Nano')] or .//span[contains(., 'Imagen')])]",
    IMAGE_MODEL_NANO_BANANA_XPATH:
      "//div[@role='option' and contains(., 'Nano Banana Pro')]",
    IMAGE_MODEL_IMAGEN_XPATH: "//div[@role='option' and contains(., 'Imagen')]",
    IMAGE_ASPECT_RATIO_DROPDOWN_XPATH:
      "//button[@role='combobox' and .//i[normalize-space(text())='crop_portrait' or normalize-space(text())='crop_landscape' or normalize-space(text())='crop_square']]",
    IMAGE_LANDSCAPE_RATIO_XPATH:
      "//div[@role='option' and .//i[normalize-space(text())='crop_landscape']]",
    IMAGE_PORTRAIT_RATIO_XPATH:
      "//div[@role='option' and .//i[normalize-space(text())='crop_portrait']]",
    IMAGE_SQUARE_RATIO_XPATH:
      "//div[@role='option' and .//i[normalize-space(text())='crop_square']]",
    IMAGES_IN_CONTAINER_XPATH:
      ".//img[starts-with(@src, 'http') or starts-with(@src, 'data:')]",
    RESULT_CONTAINER_XPATH: "//div[@data-index and @data-item-index]",
    PROMPT_IN_CONTAINER_XPATH:
      ".//button[normalize-space(.) != '' and following-sibling::div//text()[contains(., 'Veo')]]",
    VIDEOS_IN_CONTAINER_XPATH: ".//video[starts-with(@src, 'http')]",
  },
  authorInfo: {
    name: "Đặng Minh Đức",
    handle: "@duckmartians",
    website: "https://duckmartians.info",
    donateLink: "https://duckmartians.info",
    modifiedBy: "ergophobian",
    modifiedWebsite: "https://ergophobia.info",
  },
  otherTools: [
    {
      url: "https://discord.gg/munMZEBMw5",
      icon: "forum",
      title: { vi: "Cộng đồng Discord", en: "Discord Community" },
      description: {
        vi: "Nơi hỗ trợ, trao đổi và góp ý phát triển.",
        en: "A place for support, discussion, and feedback.",
      },
    },
    {
      url: "https://github.com/duckmartians/G-Labs-Automation",
      icon: "smart_toy",
      title: { vi: "G-Labs Automation", en: "G-Labs Automation" },
      description: {
        vi: "Tự động hóa cho Whisk & Flow.",
        en: "Automation for Whisk & Flow.",
      },
    },
    {
      url: "https://chromewebstore.google.com/detail/auto-meta-automation-for/bchhcfjoloinebjpbfklckgohpjehdmf",
      icon: "smart_toy",
      title: { vi: "Auto Meta (Extension)", en: "Auto Meta (Extension)" },
      description: {
        vi: "Tự động hóa cho Meta AI.",
        en: "Automation for Meta AI.",
      },
    },
    {
      url: "https://chromewebstore.google.com/detail/auto-flow-prompt-automati/lhcmnhdbddgagibbbgppakocflbnknoa",
      icon: "hub",
      title: { vi: "Auto Flow (Extension)", en: "Auto Flow (Extension)" },
      description: {
        vi: "Tự động hóa cho Flow AI.",
        en: "Automation for Flow AI.",
      },
    },
    {
      url: "https://chromewebstore.google.com/detail/auto-whisk-prompt-automat/gedfnhdibkfgacmkbjgpfjihacalnlpn",
      icon: "smart_toy",
      title: { vi: "Auto Whisk (Extension)", en: "Auto Whisk (Extension)" },
      description: {
        vi: "Tự động hóa cho Whisk AI.",
        en: "Automation for Whisk AI.",
      },
    },
    {
      url: "https://github.com/duckmartians/YouTube_Downloader",
      icon: "download",
      title: {
        vi: "YouTube Downloader (Local)",
        en: "YouTube Downloader (Local)",
      },
      description: {
        vi: "Tải video, âm thanh, playlist và kênh YouTube.",
        en: "Download YouTube videos, audio, playlists, and channels.",
      },
    },
    {
      url: "https://chromewebstore.google.com/detail/word-character-counter/ifpinabdnckhkojniimgnnmjgilkakbj",
      icon: "text_fields",
      title: {
        vi: "Đếm Từ & Ký Tự (Extension)",
        en: "Word & Character Counter (Extension)",
      },
      description: {
        vi: "Bộ đếm từ và ký tự thời gian thực.",
        en: "A real-time word and character counter.",
      },
    },
    {
      url: "https://chromewebstore.google.com/detail/cookie-exporter/fhnmmidekmgocpjdceeffppcodigillk",
      icon: "cookie",
      title: {
        vi: "Trình Xuất Cookie (Extension)",
        en: "Cookie Exporter (Extension)",
      },
      description: {
        vi: "Xuất cookie của trang web một cách dễ dàng.",
        en: "Export website cookies with ease.",
      },
    },
  ],
};

export async function fetchConfigAndAuthorInfo() {
  try {
    const config = CONFIG_DATA;

    state.selectors = config.selectors || {};
    state.fetchedToolsList = config.otherTools || [];

    if (dom.authorContainer && config.authorInfo) {
      const author = config.authorInfo;
      dom.authorContainer.innerHTML = `<a href="${author.website || "#"}" target="_blank" rel="noopener noreferrer">by @duckmartians</a>${author.modifiedBy ? `<br><a href="${author.modifiedWebsite || "#"}" target="_blank" rel="noopener noreferrer">co-dev @${author.modifiedBy}</a>` : ""}`;
    }

    if (dom.donateLinkAnchor && config.authorInfo) {
      dom.donateLinkAnchor.href = config.authorInfo.donateLink;
    }

    renderToolsList();

    if (Object.keys(state.selectors).length === 0) {
      logMessage(i18n("log_load_selectors_fail"), "CRITICAL");
      updateLiveStatus(i18n("log_load_selectors_fail"), "error");
      return false;
    }

    return true;
  } catch (error) {
    logMessage(
      i18n("log_config_fetch_exception", { error: error.message }),
      "CRITICAL",
    );
    updateLiveStatus(i18n("log_config_load_error"), "error");
    return false;
  }
}
