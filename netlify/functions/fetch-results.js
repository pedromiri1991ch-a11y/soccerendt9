const { connectLambda, getStore } = require("@netlify/blobs");

const EMPTY_RESULTS = {
  lastUpdated: null,
  matches: []
};

exports.handler = async (event) => {
  try {
    connectLambda(event);
    const store = getStore("worldcup-results");
    const cached = await store.get("latest-results", { type: "json" });
    const results = cached || EMPTY_RESULTS;

    await store.setJSON("latest-results", results);

    return json({
      ok: true,
      initialized: !cached,
      cacheExists: true,
      cacheKey: "latest-results",
      results
    });
  } catch (error) {
    return json({
      ok: true,
      initialized: false,
      cacheExists: false,
      cacheKey: "latest-results",
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
