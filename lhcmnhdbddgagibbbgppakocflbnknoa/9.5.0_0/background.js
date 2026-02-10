chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "openDownloadsSettings") {
    chrome.tabs.create({ url: "chrome://settings/downloads" });
  }

  if (message.type === "downloadFile") {
    if (message.url && message.filename) {
      chrome.downloads.download(
        {
          url: message.url,
          filename: message.filename,
          conflictAction: "uniquify",
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else if (downloadId === undefined) {
            sendResponse({
              success: false,
              error: "Download failed: downloadId is undefined.",
            });
          } else {
            sendResponse({ success: true, downloadId: downloadId });
          }
        },
      );
      return true; // Keep message channel open for async sendResponse
    }

    sendResponse({
      success: false,
      error: "Invalid message parameters (missing url or filename)",
    });
  }
});
