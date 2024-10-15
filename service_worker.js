chrome.runtime.onMessage.addListener(async (data) => {
  switch (data.type) {
    case "summarize_page": {
      await summarizePage(data);
      break;
    }
    case "save_settings": {
      await saveSettings(data);
      break;
    }
  }
});

async function getSettings() {
  const settings = await chrome.storage.local.get("summarizer_settings");
  return settings?.summarizer_settings || {};
}

async function saveSettings(options) {
  const engine = options?.engine || "cecil";
  const summary_type = options?.summary_type || "summary";
  const target_language = options?.target_language || null;
  const api_token = options?.api_token || "";

  try {
    await chrome.storage.local.set({
      summarizer_settings: {
        engine: engine,
        summary_type: summary_type,
        target_language: target_language,
        api_token: api_token,
      }
    });
  } catch (error) {
    console.error(error);
  }
}

async function summarizePage(options) {
  const { summary, success, timeSavedInMinutes } =
    await summarizeContent(options);

  if (summary) {
    await chrome.runtime.sendMessage({
      type: 'summary_finished',
      summary,
      success,
      url: options.url,
      timeSavedInMinutes,
    });
  }
}

chrome.contextMenus.create({
  id: 'kagi-summarize',
  title: 'Kagi Summarize',
  contexts: ['link', 'page'],
});

chrome.contextMenus.onClicked.addListener(async (info, _tab) => {
  if (info.menuItemId === 'kagi-summarize') {
  // The linkUrl will be undefined if function is triggered by a page event. In that case, the url is taken from pageUrl
    const url = info.linkUrl || info.pageUrl;

    await chrome.windows.create({
      url: chrome.runtime.getURL(
        `summarize_popup.html?url=${encodeURIComponent(url)}`,
      ),
      focused: true,
      width: 600,
      height: 500,
      type: 'popup',
    });
  }
});

export async function summarizeContent({
  url,
  text,
}) {
  const settings = await getSettings();

  let summary = 'Unknown error';
  let success = false;
  let timeSavedInMinutes = 0;
  const useApi = Boolean(
    settings.api_token && ((settings.engine && settings.engine !== "cecil") || text),
  );

  try {
    const requestParams = {
      url,
      summary_type: settings.summary_type || "summary",
    };

    if (settings.target_language) {
      requestParams.target_language = settings.target_language;
    }

    if (useApi) {
      if (settings.engine) {
        requestParams.engine = settings.engine;
      }

      if (text) {
        requestParams.text = text;
        requestParams.url = undefined;
      }
    }

    const searchParams = new URLSearchParams(requestParams);
    const headers = {
      "Content-Type": "application/json"
    };
    if (useApi)
      headers["Authorization"] = `Bot ${settings.api_token}`;

    const requestOptions = {
      method: 'GET',
      headers: headers,
      credentials: 'include',
    };

    const response = await fetch(
      `${
        useApi
          ? 'https://kagi.com/api/v0/summarize'
          : 'https://kagi.com/mother/summary_labs'
      }?${searchParams.toString()}`,
      requestOptions,
    );

    if (response.status === 200) {
      const result = await response.json();

      if (useApi) {
        if (result.data?.output) {
          summary = result.data.output;
        } else if (result.error) {
          summary = JSON.stringify(result.error);
        }
      } else {
        summary = result?.output_text || 'Unknown error';
        timeSavedInMinutes = result?.output_data?.word_stats?.time_saved || 0;
      }

      success = Boolean(result) && !Boolean(result.error);
    } else {
      console.error('summarize error', response.status, response.statusText);

      if (response.status === 401) {
        summary = 'Invalid Token! Please set a new one.';
      } else {
        if (!response.statusText && response.headers.get('Content-Type') == 'application/json') {
          const result = await response.json();

          if (result.error && result.error.length != 0) {
            const error = result.error[0];
            summary = `Error: ${error.code} - ${error.msg}`;
          }
        } else {
          summary = `Error: ${response.status} - ${response.statusText}`;
        }
      }
    }
  } catch (error) {
    summary = error.message ? `Error: ${error.message}` : JSON.stringify(error);
  }

  return {
    summary,
    success,
    timeSavedInMinutes,
  };
}

