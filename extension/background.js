const API_URL = "http://127.0.0.1:43110";
const MONITOR_ALARM = "dl-monitor";
const monitoringJobs = new Set();

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Some successful endpoints intentionally have no response body.
  }

  if (!response.ok) {
    throw new Error(data.error || `Service error (${response.status})`);
  }
  return data;
}

async function getCurrentJob() {
  const { currentJob = null } = await chrome.storage.local.get("currentJob");
  return currentJob;
}

async function saveCurrentJob(job) {
  await chrome.storage.local.set({ currentJob: job });
  chrome.runtime.sendMessage({ type: "jobState", job }).catch(() => {});
}

function normalizeFilename(filename = "media") {
  return filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);
}

async function launchBrowserDownload(job) {
  const downloadId = await chrome.downloads.download({
    url: `${API_URL}${job.downloadUrl}`,
    filename: normalizeFilename(job.filename),
    conflictAction: "uniquify",
    saveAs: false,
  });
  await saveCurrentJob({ ...job, status: "completed", downloadId });
}

async function monitorJob(jobId) {
  if (!jobId || monitoringJobs.has(jobId)) return;
  monitoringJobs.add(jobId);

  try {
    while (true) {
      const job = await api(`/jobs/${jobId}`);
      await saveCurrentJob(job);

      if (job.status === "ready") {
        await launchBrowserDownload(job);
        return;
      }
      if (job.status === "error" || job.status === "cancelled") return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    const current = await getCurrentJob();
    await saveCurrentJob({
      ...(current || { id: jobId }),
      status: "error",
      error: error.message || "The local service stopped responding.",
    });
  } finally {
    monitoringJobs.delete(jobId);
  }
}

async function startDownload(payload) {
  const job = await api("/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await saveCurrentJob(job);
  chrome.alarms.create(MONITOR_ALARM, { periodInMinutes: 0.5 });
  monitorJob(job.id);
  return job;
}

async function cancelDownload(jobId) {
  if (!jobId) return;
  await api(`/jobs/${jobId}`, { method: "DELETE" });
  await saveCurrentJob({ id: jobId, status: "cancelled", progress: 0 });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "health": {
        const health = await api("/health");
        return {
          ready: health.ready,
          error: health.ready
            ? null
            : "Run Start.command, Start.bat, or npm run service:start",
        };
      }
      case "start":
        return { ok: true, job: await startDownload(message.payload) };
      case "getState":
        return { ok: true, job: await getCurrentJob() };
      case "cancel":
        await cancelDownload(message.id);
        return { ok: true };
      default:
        return { ok: false, error: "Unknown message." };
    }
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== MONITOR_ALARM) return;
  const job = await getCurrentJob();
  if (
    job?.id &&
    ["preparing", "downloading", "converting"].includes(job.status)
  ) {
    monitorJob(job.id);
  } else {
    chrome.alarms.clear(MONITOR_ALARM);
  }
});

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state || delta.state.current !== "complete") return;
  const job = await getCurrentJob();
  if (job?.downloadId === delta.id) {
    await saveCurrentJob({ ...job, status: "saved" });
    chrome.alarms.clear(MONITOR_ALARM);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const job = await getCurrentJob();
  if (
    job?.id &&
    ["preparing", "downloading", "converting"].includes(job.status)
  ) {
    monitorJob(job.id);
  }
});
