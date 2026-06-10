const { getStore } = require("@netlify/blobs");

const EMPTY_RESULTS = {
  lastUpdated: null,
  matches: []
};

exports.handler = async () => {
  try {
    const store = getStore("results");
    const cached = await store.get("manual-results", { type: "json" });

    return json(cached || EMPTY_RESULTS);
  } catch (error) {
    return json(EMPTY_RESULTS);
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
