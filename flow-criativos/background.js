// =============================================================================
// Flow Criativos v2.0 — Service Worker (background.js)
// Responsabilidades:
//   - downloadFile: baixa arquivos via chrome.downloads.download
//   - executeInPage: executa funções no contexto MAIN da página via chrome.scripting
//   - createNewProject: navega para homepage → clica "New Project" → espera /project/
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ─── Download de arquivo ───
  if (message.type === 'downloadFile') {
    if (!message.url || !message.filename) {
      sendResponse({ success: false, error: 'Parâmetros inválidos (falta url ou filename)' });
      return false;
    }
    chrome.downloads.download(
      {
        url: message.url,
        filename: message.filename,
        conflictAction: 'uniquify'
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else if (downloadId === undefined) {
          sendResponse({ success: false, error: 'Download falhou: downloadId indefinido.' });
        } else {
          sendResponse({ success: true, downloadId });
        }
      }
    );
    return true; // manter canal aberto para sendResponse assíncrono
  }

  // ─── Executar script no contexto MAIN da página ───
  if (message.type === 'executeInPage') {
    const { tabId, funcBody, args } = message;
    if (!tabId || !funcBody) {
      sendResponse({ success: false, error: 'Parâmetros inválidos para executeInPage' });
      return false;
    }

    // Reconstrói a função a partir do body string
    const wrappedFunc = new Function('return ' + funcBody)();

    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: wrappedFunc,
        args: args || [],
        world: 'MAIN'
      },
      (results) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        if (results && results[0]) {
          if (results[0].error) {
            sendResponse({ success: false, error: results[0].error.message || String(results[0].error) });
          } else {
            sendResponse({ success: true, result: results[0].result });
          }
        } else {
          sendResponse({ success: true, result: undefined });
        }
      }
    );
    return true;
  }

  // ─── Criar novo projeto ───
  if (message.type === 'createNewProject') {
    const { tabId } = message;
    if (!tabId) {
      sendResponse({ success: false, error: 'tabId não fornecido' });
      return false;
    }

    (async () => {
      try {
        // 1. Navega para homepage do Flow
        await chrome.tabs.update(tabId, { url: 'https://labs.google/fx/tools/flow' });

        // 2. Espera homepage carregar
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Timeout ao navegar para homepage'));
          }, 60000);

          const listener = (updatedTabId, changeInfo, tab) => {
            if (updatedTabId === tabId &&
                tab.url?.includes('/tools/flow') &&
                !tab.url?.includes('/project') &&
                changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              clearTimeout(timeout);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });

        await new Promise(r => setTimeout(r, 2000));

        // 3. Clica no botão "New Project"
        const clickResult = await chrome.scripting.executeScript({
          target: { tabId },
          func: (selectors) => {
            const xpath = selectors?.NEW_PROJECT_BUTTON_XPATH ||
              "//button[.//i[normalize-space(text())='add_2']] | (//button[.//i[normalize-space(.)='add_2']])";
            try {
              const btn = document.evaluate(xpath, document, null,
                XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
              if (btn) { btn.click(); return true; }
              return false;
            } catch (e) { return false; }
          },
          args: [message.selectors || {}],
          world: 'MAIN'
        });

        if (!clickResult?.[0]?.result) {
          sendResponse({ success: false, error: 'Falha ao clicar em New Project' });
          return;
        }

        // 4. Espera página do projeto carregar
        const projectUrl = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Timeout aguardando página do projeto'));
          }, 60000);

          const listener = (updatedTabId, changeInfo, tab) => {
            if (updatedTabId === tabId &&
                tab.url?.includes('/project/') &&
                changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              clearTimeout(timeout);
              resolve(tab.url);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });

        sendResponse({ success: true, url: projectUrl });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // ─── Obter tab ativa ───
  if (message.type === 'getActiveTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        sendResponse({ success: true, tab: { id: tabs[0].id, url: tabs[0].url } });
      } else {
        sendResponse({ success: false, error: 'Nenhuma tab ativa encontrada' });
      }
    });
    return true;
  }

  // ─── Zoom da tab ───
  if (message.type === 'setZoom') {
    chrome.tabs.setZoom(message.tabId, message.zoom).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // ─── Recarregar tab ───
  if (message.type === 'reloadTab') {
    chrome.tabs.reload(message.tabId, { bypassCache: true }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }

  // ─── Esperar tab carregar ───
  if (message.type === 'waitForTabLoad') {
    const { tabId } = message;
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      sendResponse({ success: false, error: 'Timeout aguardando carregamento' });
    }, 60000);

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId &&
          tab.status === 'complete' &&
          tab.url?.includes('/project/')) {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        sendResponse({ success: true, url: tab.url });
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    return true;
  }

  // ─── Obter URL da tab ───
  if (message.type === 'getTabUrl') {
    chrome.tabs.get(message.tabId, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, url: tab.url });
      }
    });
    return true;
  }
});
