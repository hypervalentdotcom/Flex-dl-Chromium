export function isHttpPageUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function getActiveTabUrl(tabsApi) {
  if (!tabsApi?.query) return "";
  const [tab] = await tabsApi.query({
    active: true,
    currentWindow: true,
  });
  const url = tab?.url || tab?.pendingUrl || "";
  return isHttpPageUrl(url) ? url : "";
}
