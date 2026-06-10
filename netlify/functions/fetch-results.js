const { getStore } = require("@netlify/blobs");

const EMPTY_RESULTS = {
  lastUpdated: null,
  matches: []
};

exports.handler = async () => {
  try {
    const store = getStore("results");
    const cached = await store.get("manual-results", { type: "json" });
    const results = cached || EMPTY_RESULTS;

    await store.setJSON("manual-results", results);

    return json({
      ok: true,
      initialized: !cached,
      cacheExists: true,
      cacheKey: "manual-results",
      results
    });
  } catch (error) {
    return json({
      ok: true,
      initialized: false,
      cacheExists: false,
      cacheKey: "manual-results",
      results: EMPTY_RESULTS,
      note: "Netlify Blobs is not configured in this environment."
    });
  }
};

function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}
