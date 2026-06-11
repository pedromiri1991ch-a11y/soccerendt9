const { connectLambda, getStore } = require("@netlify/blobs");

const EMPTY_RESULTS = {
  lastUpdated: null,
  matches: []
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ ok: false, message: "Method not allowed." }, 405);
  }

  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken) {
    return json({ ok: false, message: "Admin access is not configured." }, 500);
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return json({ ok: false, message: "Invalid JSON body." }, 400);
  }

  if (body.adminToken !== expectedToken) {
    return json({ ok: false, message: "Unauthorized." }, 401);
  }

  const matchId = Number(body.matchId);
  const action = body.action === "delete" ? "delete" : "save";

  if (!Number.isInteger(matchId) || matchId <= 0) {
    return json({ ok: false, message: "Invalid matchId." }, 400);
  }

  const updatedAt = new Date().toISOString();

  try {
    connectLambda(event);
    const store = getStore("worldcup-results");
    const current = (await store.get("latest-results", { type: "json" })) || EMPTY_RESULTS;
    const byId = new Map((Array.isArray(current.matches) ? current.matches : []).map((item) => [String(item.matchId), item]));

    if (action === "delete") {
      byId.delete(String(matchId));
    } else {
      const homeScore90 = Number(body.homeScore90);
      const awayScore90 = Number(body.awayScore90);

      if (!Number.isFinite(homeScore90) || !Number.isFinite(awayScore90) || homeScore90 < 0 || awayScore90 < 0) {
        return json({ ok: false, message: "Invalid score." }, 400);
      }
      if (!body.homeTeam || !body.awayTeam) {
        return json({ ok: false, message: "Invalid teams." }, 400);
      }

      byId.set(String(matchId), {
        matchId,
        stage: body.stage || "group",
        homeTeam: String(body.homeTeam),
        awayTeam: String(body.awayTeam),
        homeScore90,
        awayScore90,
        status: "finished",
        source: "manual-admin",
        updatedAt
      });
    }

    const data = {
      lastUpdated: updatedAt,
      matches: Array.from(byId.values()).sort((a, b) => Number(a.matchId) - Number(b.matchId))
    };

    await store.set("latest-results", JSON.stringify(data));

    return json({
      ok: true,
      message: action === "delete" ? "Result deleted." : "Result saved.",
      data
    });
  } catch (error) {
    console.error("save-result blob write failed", {
      name: error && error.name,
      message: error && error.message
    });

    return json({
      ok: false,
      message: "Unable to save result.",
      errorCode: error && error.name ? error.name : "BlobWriteError"
    }, 500);
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
