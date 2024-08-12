async function requestPermissions() {
  const permissionGranted = await chrome.permissions.request({
    permissions: ["activeTab"],
  });

  if (!permissionGranted) {
    alert(
      "You can't summarize without allowing access to the currently active tab.",
    );
    return false;
  }

  return true;
}

async function getActiveTab() {
  const platformInfo = await chrome.runtime.getPlatformInfo();
  const browserInfo =
    typeof chrome.runtime.getBrowserInfo === 'function' &&
    (await chrome.runtime.getBrowserInfo());

  // Note, _hoping_ by 119 this works, but there's no guarantee.
  if (
    platformInfo.os === 'android' &&
    browserInfo?.version &&
    Number.parseInt(browserInfo.version, 10) <= 118
  ) {
    return null;
  }

  const tabs = await chrome.tabs.query(
    {
      active: true,
      lastFocusedWindow: true,
    }
  );

  const tab =
    tabs.find(
      (tab) =>
        tab?.url?.startsWith('http://') || tab?.url?.startsWith('https://'),
    ) || tabs[0];

  if (tab?.url?.startsWith('about:reader?url=')) {
    const newUrl = new URL(tab.url);
    tab.url = newUrl.searchParams.get('url');
  }

  if (!tab || !tab.url) {
    return null;
  }

  return tab;
}


async function setup() {
  const summarizeSection = document.querySelector("#summarize");
  const permissionsSection = document.querySelector("#permissions");

  const hasPermissions = await chrome.permissions.contains({
    permissions: ["activeTab"],
  });
  permissionsSection.hidden = hasPermissions;
  summarizeSection.hidden = !hasPermissions;

  const requestButton = document.querySelector("#request_permissions");
  requestButton.addEventListener("click", async () => {
    const res = await requestPermissions();
    if (res) {
      // This seems to be required to reload things and make the permission become 'active'.
      window.close();
    }
  });

  const summarizePageButton = document.querySelector("#summarize_page");
  summarizePageButton.addEventListener("click", handleSummarizeClick);

  const summaryType = document.querySelector("#summary_type");
  const targetLanguage = document.querySelector("#target_language");
  const apiEngine = document.querySelector("#engine");
  const apiToken = document.querySelector("#api_key");

  const settings = [
    summaryType,
    targetLanguage,
    apiEngine,
  ];

  const save = async () => {
    await chrome.runtime.sendMessage({
      type: "save_settings",
      engine: apiEngine.value,
      summary_type: summaryType.value,
      target_language: targetLanguage.value,
      api_token: apiToken.value,
    });
  };

  settings.forEach((setting) => {
    setting.addEventListener("change", async () => {
      await save();
    });
  });

  const saveButton = document.querySelector("#save_api_token");
  saveButton.addEventListener("click", async () => {
    await save();
  });

  const storageSettings = await chrome.storage.local.get("summarizer_settings");
  const savedSettings = storageSettings?.summarizer_settings || {};
  if (savedSettings.summary_type) {
    summaryType.value = savedSettings.summary_type;
  }

  if (savedSettings.api_token) {
    apiToken.value = savedSettings.api_token;
  }

  if (savedSettings.engine) {
    // If the api token is not set - we default to free since it will be implied anyways.
    if (apiToken.value.trim().length !== 0) {
      apiEngine.value = savedSettings.engine;
    }
  }

  if (savedSettings.target_language) {
    targetLanguage.value = savedSettings.target_language;
  }
}

async function handleSummarizeClick() {
  let tab = await getActiveTab();
  if (!tab) {
    const res = await requestPermissions();
    // cant do anything if we don't have tab perms.
    if (!res) {
      return;
    }
  }

  if (!tab) return;
  const {url} = tab;

  const searchParams = new URLSearchParams();
  searchParams.set("url", url);

  await chrome.windows.create({
    url: `${chrome.runtime.getURL(
      'summarize_popup.html',
    )}?${searchParams.toString()}`,
    focused: true,
    width: 600,
    height: 500,
    type: 'popup',
  });
}

document.addEventListener('DOMContentLoaded', setup);
