const qualityOptions = {
  video: [
    ["best", "Best available"],
    ["2160", "4K / 2160p"],
    ["1080", "Full HD / 1080p"],
    ["720", "HD / 720p"],
    ["480", "480p"],
  ],
  mp3: [
    ["best", "Best available"],
    ["320", "320 kb/s"],
    ["256", "256 kb/s"],
    ["192", "192 kb/s"],
    ["128", "128 kb/s"],
  ],
};

const elements = {
  form: document.querySelector("#download-form"),
  url: document.querySelector("#media-url"),
  clear: document.querySelector("#clear-url"),
  formats: [...document.querySelectorAll(".format-option")],
  quality: document.querySelector("#quality"),
  submit: document.querySelector("#submit-button"),
  progressPanel: document.querySelector("#progress-panel"),
  progressTrack: document.querySelector(".progress-track"),
  progressBar: document.querySelector("#progress-bar"),
  progressLabel: document.querySelector("#progress-label"),
  progressValue: document.querySelector("#progress-value"),
  cancel: document.querySelector("#cancel-button"),
  error: document.querySelector("#form-error"),
  service: document.querySelector(".service-status"),
  statusText: document.querySelector("#status-text"),
};

let selectedFormat = "video";
let activeJobId = null;

function renderQualityOptions() {
  elements.quality.replaceChildren(
    ...qualityOptions[selectedFormat].map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }),
  );
}

function setFormat(format) {
  selectedFormat = format;
  for (const button of elements.formats) {
    const active = button.dataset.format === format;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  renderQualityOptions();
}

function setError(message = "") {
  elements.error.textContent = message;
  elements.error.hidden = !message;
}

function setBusy(busy) {
  elements.submit.disabled = busy;
  elements.submit.classList.toggle("is-loading", busy);
  elements.url.disabled = busy;
  elements.quality.disabled = busy;
  for (const button of elements.formats) button.disabled = busy;
}

function setServiceStatus(kind, text) {
  elements.service.classList.toggle("is-ready", kind === "ready");
  elements.service.classList.toggle("is-error", kind === "error");
  elements.statusText.textContent = text;
}

function showProgress(state) {
  const progress = Math.max(0, Math.min(100, Number(state.progress) || 0));
  elements.progressPanel.hidden = false;
  elements.progressBar.style.width = `${progress}%`;
  elements.progressTrack.setAttribute("aria-valuenow", String(Math.round(progress)));
  elements.progressValue.textContent = `${Math.round(progress)} %`;
  elements.progressLabel.textContent =
    state.status === "preparing"
      ? "Preparing…"
      : state.status === "converting"
        ? "QuickTime conversion…"
        : "Downloading…";
  setBusy(true);
}

function resetProgress() {
  activeJobId = null;
  elements.progressPanel.hidden = true;
  elements.progressBar.style.width = "0%";
  elements.progressTrack.setAttribute("aria-valuenow", "0");
  setBusy(false);
}

function isValidMediaUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function sendMessage(message) {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return Promise.resolve({ ok: true, ready: true, demo: true });
  }
  return chrome.runtime.sendMessage(message);
}

async function checkHealth() {
  try {
    const response = await sendMessage({ type: "health" });
    if (response?.ready) {
      setServiceStatus("ready", "Service connected");
    } else {
      setServiceStatus("error", response?.error || "Local service unavailable");
    }
  } catch {
    setServiceStatus("error", "Start the FlexDL local service");
  }
}

function applyJobState(state) {
  if (!state) return;
  activeJobId = state.id || null;

  if (
    state.status === "preparing" ||
    state.status === "downloading" ||
    state.status === "converting"
  ) {
    showProgress(state);
    return;
  }

  if (state.status === "completed") {
    resetProgress();
    setError("");
    setServiceStatus("ready", "Download started");
    return;
  }

  if (state.status === "saved") {
    resetProgress();
    setError("");
    setServiceStatus("ready", "File saved");
    return;
  }

  if (state.status === "cancelled") {
    resetProgress();
    setServiceStatus("ready", "Service connected");
    return;
  }

  if (state.status === "error") {
    resetProgress();
    setError(state.error || "The download failed.");
  }
}

elements.url.addEventListener("input", () => {
  elements.clear.hidden = elements.url.value.length === 0;
  setError("");
});

elements.clear.addEventListener("click", () => {
  elements.url.value = "";
  elements.clear.hidden = true;
  elements.url.focus();
  setError("");
});

for (const button of elements.formats) {
  button.addEventListener("click", () => setFormat(button.dataset.format));
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = elements.url.value.trim();
  if (!isValidMediaUrl(url)) {
    setError("Paste a valid http or https link.");
    elements.url.focus();
    return;
  }

  setError("");
  setBusy(true);
  elements.progressPanel.hidden = false;
  elements.progressLabel.textContent = "Preparing…";
  elements.progressValue.textContent = "0 %";

  try {
    const response = await sendMessage({
      type: "start",
      payload: {
        url,
        format: selectedFormat,
        quality: elements.quality.value,
      },
    });
    if (!response?.ok) throw new Error(response?.error || "Unable to start.");
    activeJobId = response.job?.id || null;
    applyJobState(response.job);
  } catch (error) {
    resetProgress();
    setError(error.message || "Unable to start the download.");
  }
});

elements.cancel.addEventListener("click", async () => {
  if (!activeJobId) return;
  elements.cancel.disabled = true;
  try {
    await sendMessage({ type: "cancel", id: activeJobId });
    resetProgress();
    setServiceStatus("ready", "Service connected");
  } finally {
    elements.cancel.disabled = false;
  }
});

if (globalThis.chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.currentJob) {
      applyJobState(changes.currentJob.newValue);
    }
  });
}

renderQualityOptions();
checkHealth();
sendMessage({ type: "getState" })
  .then((response) => applyJobState(response?.job))
  .catch(() => {});
