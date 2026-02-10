export let state = {
  // Run control
  isRunning: false,
  isPaused: false,
  stopRequested: false,
  activeRunMode: null,
  MAX_RETRIES: 5,

  // Prompt & task lists
  promptList: [],
  failedPromptsList: [],
  taskList: [],
  masterTaskList: [],
  masterQueue: [],
  currentJobIndex: 0,
  currentIndex: 0,

  // Image files
  imageFileList: [],
  imageToVideoPromptMap: {},
  videoQueueImages: [],

  // Mode & language
  currentMode: "text-to-video",
  currentLang: "vi",

  // Tab & project tracking
  flowTabId: null,
  currentProjectId: null,

  // Timers & scanning
  zoomResetTimerId: null,
  downloadInterval: null,
  scanIntervalMs: 5000,
  finalScanTimerId: null,

  // Video downloads
  downloadedVideoUrls: new Set(),
  newlyDownloadedCount: 0,
  videoDownloadResolution: "720p",

  // Selectors & config
  selectors: {},
  fetchedToolsList: [],

  // Project counter
  nextProjectCounter: 1,

  // Image gallery
  galleryImages: [],
  selectedImages: new Set(),
  downloadQueue: [],
  isDownloading: false,
  downloadCancelled: false,

  // Reference images
  selectedRefImage: null,
  selectedRefImages: [],
  refImagesUploaded: false,
  lastUploadedRefIds: [],
  promptRefMap: {},

  // Image auto-download
  imageAutoDownloadResolution: "4k",

  // Auto-start next job
  autoStartNextJob: true,
};
