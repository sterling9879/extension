export const dom = {
  // Core action buttons
  mainActionButton: null,
  stopButton: null,
  startNewProjectButton: null,
  startCurrentProjectButton: null,
  skipJobButton: null,

  // Prompt input
  promptsTextarea: null,
  uploadPromptButton: null,
  fileInput: null,
  promptListTitle: null,
  promptContainer: null,

  // Progress & status
  progressBar: null,
  liveStatus: null,
  logDisplay: null,

  // Interface containers
  mainInterface: null,
  wrongPageInterface: null,
  wrongPageMessageElement: null,
  navigateToFlowButton: null,

  // General settings inputs
  startFromInput: null,
  languageSelector: null,
  repeatCountInput: null,
  minInitialWaitTimeInput: null,
  maxInitialWaitTimeInput: null,

  // Failed prompts
  failedPromptsDisplay: null,
  copyFailedButton: null,
  retryFailedButton: null,
  failedSummary: null,

  // Download settings
  autoDownloadCheckbox: null,
  openDownloadsSettingsLink: null,

  // Mode & model selection
  modeSelector: null,
  imageModeContainer: null,
  aspectRatioSelector: null,
  modelSelector: null,
  imageSortSelector: null,

  // Image upload
  imageInput: null,
  uploadImageButton: null,
  imageFileSummary: null,
  imageCount: null,

  // Tools & author
  toolListContainer: null,
  authorContainer: null,
  donateLinkAnchor: null,

  // Queue UI
  openQueueButton: null,
  queueTaskCount: null,
  addToQueueButton: null,
  clearQueueButton: null,
  queueModalOverlay: null,
  closeQueueModal: null,
  queueListDisplay: null,
  queueTableBody: null,
  jobDownloadFolderInput: null,

  // Confirm clear queue modal
  confirmClearQueueModal: null,
  confirmClearQueueButton: null,
  cancelClearQueueButton: null,
  confirmClearQueueMessage: null,
  queueResetAllButton: null,
  queueDeleteAllButton: null,

  // Image generation settings
  imageRepeatCountInput: null,
  imageModelSelector: null,

  // Image gallery
  galleryContainer: null,
  downloadResolution: null,
  refreshGalleryBtn: null,
  galleryCount: null,
  downloadSelectedBtn: null,
  addToVideoQueueBtn: null,
  selectedCount: null,

  // Video gallery
  videoDownloadResolution: null,
  refreshVideoGalleryBtn: null,
  videoGalleryContainer: null,
  videoGalleryCount: null,
  downloadSelectedVideosBtn: null,
  cancelVideoDownloadBtn: null,
  videoDownloadProgress: null,
  videoDownloadProgressText: null,
  videoDownloadProgressCount: null,
  videoDownloadProgressBar: null,
  selectedVideoCount: null,
  videoSpeedSlider: null,
  videoSpeedInput: null,
  videoDownloadRes: null,

  // Reference images
  uploadRefImageBtn: null,
  clearRefImagesBtn: null,
  refImageInput: null,
  refImagesGrid: null,
  selectedRefImage: null,
  selectedRefName: null,
  clearSelectedRef: null,

  // Auto-download images
  autoDownloadImagesCheckbox: null,
  imageAutoDownloadResolution: null,

  // Prompt-to-ref assignment
  assignRefsBtn: null,
  assignDoneBtn: null,
  promptAssignList: null,
  assignStatus: null,
  refAssignHint: null,

  // Auto-start toggle
  autoStartNextJob: null,

  // Merge queue modal
  mergeQueueModal: null,
  mergeJobList: null,
  cancelMergeBtn: null,
  newJobInsteadBtn: null,
  mergeToQueueBtn: null,

  // Tutorial
  tutorialBtn: null,
  tutorialOverlay: null,
  tutorialSpotlight: null,
  tutorialTooltip: null,
  tutorialTitle: null,
  tutorialText: null,
  tutorialStepCount: null,
  tutorialNextBtn: null,
  tutorialSkipBtn: null,
};

export function queryDOMElements() {
  dom.mainActionButton = document.getElementById("mainActionButton");
  dom.stopButton = document.getElementById("stopButton");
  dom.startNewProjectButton = document.getElementById("startNewProjectButton");
  dom.startCurrentProjectButton = document.getElementById(
    "startCurrentProjectButton",
  );
  dom.promptsTextarea = document.getElementById("prompts");
  dom.uploadPromptButton = document.getElementById("uploadPromptButton");
  dom.fileInput = document.getElementById("fileInput");
  dom.progressBar = document.getElementById("progressBar");
  dom.liveStatus = document.getElementById("liveStatus");
  dom.logDisplay = document.getElementById("logDisplay");
  dom.mainInterface = document.getElementById("main-interface");
  dom.wrongPageInterface = document.getElementById("wrong-page-interface");
  dom.navigateToFlowButton = document.getElementById("navigateToFlowButton");
  dom.startFromInput = document.getElementById("startFromInput");
  dom.languageSelector = document.getElementById("languageSelector");
  dom.repeatCountInput = document.getElementById("repeatCountInput");
  dom.minInitialWaitTimeInput = document.getElementById("minInitialWaitTime");
  dom.maxInitialWaitTimeInput = document.getElementById("maxInitialWaitTime");
  dom.failedPromptsDisplay = document.getElementById("failedPromptsDisplay");
  dom.copyFailedButton = document.getElementById("copyFailedButton");
  dom.retryFailedButton = document.getElementById("retryFailedButton");
  dom.failedSummary = document.getElementById("failedSummary");
  dom.autoDownloadCheckbox = document.getElementById("autoDownloadCheckbox");
  dom.openDownloadsSettingsLink = document.getElementById(
    "openDownloadsSettingsLink",
  );
  dom.wrongPageMessageElement = document.getElementById("wrong-page-message");
  dom.modeSelector = document.getElementById("modeSelector");
  dom.imageModeContainer = document.getElementById("imageModeContainer");
  dom.imageInput = document.getElementById("imageInput");
  dom.uploadImageButton = document.getElementById("uploadImageButton");
  dom.imageFileSummary = document.getElementById("imageFileSummary");
  dom.imageCount = document.getElementById("imageCount");
  dom.promptListTitle = document.getElementById("promptListTitle");
  dom.promptContainer = document.getElementById("promptContainer");
  dom.aspectRatioSelector = document.getElementById("aspectRatioSelector");
  dom.modelSelector = document.getElementById("modelSelector");
  dom.imageSortSelector = document.getElementById("imageSortSelector");
  dom.toolListContainer = document.querySelector("#content-tools .tool-list");
  dom.authorContainer = document.getElementById("author-info");
  dom.donateLinkAnchor = document.getElementById("donate-link-anchor");
  dom.openQueueButton = document.getElementById("openQueueButton");
  dom.queueTaskCount = document.getElementById("queueTaskCount");
  dom.addToQueueButton = document.getElementById("addToQueueButton");
  dom.clearQueueButton = document.getElementById("clearQueueButton");
  dom.queueModalOverlay = document.getElementById("queueModalOverlay");
  dom.closeQueueModal = document.getElementById("closeQueueModal");
  dom.queueListDisplay = document.getElementById("queue-list-display");
  dom.queueTableBody = document.getElementById("queueTableBody");
  dom.jobDownloadFolderInput = document.getElementById(
    "jobDownloadFolderInput",
  );
  dom.confirmClearQueueModal = document.getElementById(
    "confirmClearQueueModal",
  );
  dom.confirmClearQueueButton = document.getElementById(
    "confirmClearQueueButton",
  );
  dom.cancelClearQueueButton = document.getElementById(
    "cancelClearQueueButton",
  );
  dom.confirmClearQueueMessage = document.querySelector(
    ".confirm-modal-message",
  );
  dom.queueResetAllButton = document.getElementById("queueResetAllButton");
  dom.queueDeleteAllButton = document.getElementById("queueDeleteAllButton");
  dom.imageRepeatCountInput = document.getElementById("imageRepeatCountInput");
  dom.imageModelSelector = document.getElementById("imageModelSelector");
  dom.galleryContainer = document.getElementById("galleryContainer");
  dom.downloadResolution = document.getElementById("downloadResolution");
  dom.refreshGalleryBtn = document.getElementById("refreshGalleryBtn");
  dom.galleryCount = document.getElementById("galleryCount");
  dom.downloadSelectedBtn = document.getElementById("downloadSelectedBtn");
  dom.addToVideoQueueBtn = document.getElementById("addToVideoQueueBtn");
  dom.selectedCount = document.getElementById("selectedCount");
  dom.skipJobButton = document.getElementById("skipJobButton");
  dom.videoDownloadResolution = document.getElementById(
    "videoDownloadResolution",
  );
  dom.refreshVideoGalleryBtn = document.getElementById(
    "refreshVideoGalleryBtn",
  );
  dom.videoGalleryContainer = document.getElementById("videoGalleryContainer");
  dom.videoGalleryCount = document.getElementById("videoGalleryCount");
  dom.downloadSelectedVideosBtn = document.getElementById(
    "downloadSelectedVideosBtn",
  );
  dom.selectedVideoCount = document.getElementById("selectedVideoCount");
  dom.cancelVideoDownloadBtn = document.getElementById("cancelVideoDownloadBtn");
  dom.videoDownloadProgress = document.getElementById("videoDownloadProgress");
  dom.videoDownloadProgressText = document.getElementById("videoDownloadProgressText");
  dom.videoDownloadProgressCount = document.getElementById("videoDownloadProgressCount");
  dom.videoDownloadProgressBar = document.getElementById("videoDownloadProgressBar");
  dom.videoSpeedSlider = document.getElementById("videoSpeedSlider");
  dom.videoSpeedInput = document.getElementById("videoSpeedInput");
  dom.videoDownloadRes = document.getElementById("videoDownloadRes");
  dom.uploadRefImageBtn = document.getElementById("uploadRefImageBtn");
  dom.clearRefImagesBtn = document.getElementById("clearRefImagesBtn");
  dom.refImageInput = document.getElementById("refImageInput");
  dom.refImagesGrid = document.getElementById("refImagesGrid");
  dom.selectedRefImage = document.getElementById("selectedRefImage");
  dom.selectedRefName = document.getElementById("selectedRefName");
  dom.clearSelectedRef = document.getElementById("clearSelectedRef");
  dom.autoDownloadImagesCheckbox = document.getElementById(
    "autoDownloadImagesCheckbox",
  );
  dom.imageAutoDownloadResolution = document.getElementById(
    "imageAutoDownloadResolution",
  );
  dom.assignRefsBtn = document.getElementById("assignRefsBtn");
  dom.assignDoneBtn = document.getElementById("assignDoneBtn");
  dom.promptAssignList = document.getElementById("promptAssignList");
  dom.assignStatus = document.getElementById("assignStatus");
  dom.refAssignHint = document.getElementById("refAssignHint");
  dom.autoStartNextJob = document.getElementById("autoStartNextJob");
  dom.mergeQueueModal = document.getElementById("mergeQueueModal");
  dom.mergeJobList = document.getElementById("mergeJobList");
  dom.cancelMergeBtn = document.getElementById("cancelMergeBtn");
  dom.newJobInsteadBtn = document.getElementById("newJobInsteadBtn");
  dom.mergeToQueueBtn = document.getElementById("mergeToQueueBtn");
  dom.tutorialBtn = document.getElementById("tutorialBtn");
  dom.tutorialOverlay = document.getElementById("tutorialOverlay");
  dom.tutorialSpotlight = document.getElementById("tutorialSpotlight");
  dom.tutorialTooltip = document.getElementById("tutorialTooltip");
  dom.tutorialTitle = document.getElementById("tutorialTitle");
  dom.tutorialText = document.getElementById("tutorialText");
  dom.tutorialStepCount = document.getElementById("tutorialStepCount");
  dom.tutorialNextBtn = document.getElementById("tutorialNextBtn");
  dom.tutorialSkipBtn = document.getElementById("tutorialSkipBtn");
}
