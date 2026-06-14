const { connectLambda, getStore } = require("@netlify/blobs");

const EMPTY_RESULTS = {
  lastUpdated: null,
  matches: []
};

const TEAM_ALIASES = {
  "mexico": ["مکزیک"],
  "south africa": ["آفریقای جنوبی"],
  "korea republic": ["کره جنوبی"],
  "south korea": ["کره جنوبی"],
  "czechia": ["چک", "جمهوری چک"],
  "czech republic": ["چک", "جمهوری چک"],
  "canada": ["کانادا"],
  "bosnia and herzegovina": ["بوسنی", "بوسنی و هرزگوین"],
  "bosnia": ["بوسنی", "بوسنی و هرزگوین"],
  "united states": ["آمریکا", "ایالات متحده آمریکا"],
  "usa": ["آمریکا", "ایالات متحده آمریکا"],
  "usmnt": ["آمریکا", "ایالات متحده آمریکا"],
  "paraguay": ["پاراگوئه"],
  "qatar": ["قطر"],
  "switzerland": ["سوئیس"],
  "brazil": ["برزیل"],
  "morocco": ["مراکش"],
  "haiti": ["هائیتی"],
  "scotland": ["اسکاتلند"],
  "australia": ["استرالیا"],
  "turkiye": ["ترکیه"],
  "turkey": ["ترکیه"],
  "türkiye": ["ترکیه"],
  "germany": ["آلمان"],
  "curacao": ["کوراسائو", "کوراکائو"],
  "curaçao": ["کوراسائو", "کوراکائو"],
  "netherlands": ["هلند"],
  "japan": ["ژاپن"],
  "ivory coast": ["ساحل عاج"],
  "cote d'ivoire": ["ساحل عاج"],
  "côte d’ivoire": ["ساحل عاج"],
  "côte d'ivoire": ["ساحل عاج"],
  "ecuador": ["اکوادور"],
  "sweden": ["سوئد"],
  "tunisia": ["تونس"],
  "spain": ["اسپانیا"],
  "cape verde": ["کیپ ورد", "کیپ‌ورد"],
  "belgium": ["بلژیک"],
  "egypt": ["مصر"],
  "saudi arabia": ["عربستان", "عربستان سعودی"],
  "uruguay": ["اروگوئه"],
  "iran": ["ایران"],
  "new zealand": ["نیوزیلند"],
  "france": ["فرانسه"],
  "senegal": ["سنگال"],
  "iraq": ["عراق"],
  "norway": ["نروژ"],
  "argentina": ["آرژانتین"],
  "algeria": ["الجزایر"],
  "austria": ["اتریش"],
  "jordan": ["اردن"],
  "portugal": ["پرتغال"],
  "dr congo": ["کنگو", "جمهوری دموکراتیک کنگو"],
  "congo dr": ["کنگو", "جمهوری دموکراتیک کنگو"],
  "democratic republic of the congo": ["کنگو", "جمهوری دموکراتیک کنگو"],
  "england": ["انگلیس"],
  "croatia": ["کرواسی"],
  "ghana": ["غنا"],
  "panama": ["پاناما"],
  "uzbekistan": ["ازبکستان"],
  "colombia": ["کلمبیا"]
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

  const incoming = Array.isArray(body.matches) ? body.matches : [];
  if (!incoming.length) {
    return json({ ok: false, message: "No matches were provided." }, 400);
  }

  const dashboard = await loadDashboardData(event);
  const appMatches = Array.isArray(dashboard.matches) ? dashboard.matches : [];
  if (!appMatches.length) {
    return json({ ok: false, message: "Could not load app match list." }, 500);
  }

  const prepared = [];
  const unmatched = [];

  incoming.forEach((item) => {
    const match = findAppMatch(appMatches, item);
    if (!match) {
      unmatched.push({
        homeTeam: item.homeTeam,
        awayTeam: item.awayTeam,
        reason: "No matching fixture found."
      });
      return;
    }

    const homeScore90 = Number(item.homeScore90 ?? item.homeScore);
    const awayScore90 = Number(item.awayScore90 ?? item.awayScore);
    if (!Number.isFinite(homeScore90) || !Number.isFinite(awayScore90) || homeScore90 < 0 || awayScore90 < 0) {
      unmatched.push({
        homeTeam: item.homeTeam,
        awayTeam: item.awayTeam,
        matchId: match.id,
        reason: "Invalid score."
      });
      return;
    }

    prepared.push({
      matchId: Number(match.id),
      stage: item.stage || "group",
      homeTeam: match.team1,
      awayTeam: match.team2,
      homeScore90,
      awayScore90,
      status: item.status || "finished",
      source: item.source || "official-import",
      sourceUrl: item.sourceUrl || null,
      updatedAt: item.updatedAt || new Date().toISOString()
    });
  });

  if (body.dryRun) {
    return json({ ok: true, dryRun: true, matched: prepared, unmatched });
  }

  if (!prepared.length) {
    return json({ ok: false, message: "No results could be matched.", unmatched }, 400);
  }

  try {
    connectLambda(event);
    const store = getStore("worldcup-results");
    const current = (await store.get("latest-results", { type: "json" })) || EMPTY_RESULTS;
    const byId = new Map((Array.isArray(current.matches) ? current.matches : []).map((item) => [String(item.matchId), item]));

    prepared.forEach((item) => {
      byId.set(String(item.matchId), item);
    });

    const updatedAt = new Date().toISOString();
    const data = {
      lastUpdated: updatedAt,
      matches: Array.from(byId.values()).sort((a, b) => Number(a.matchId) - Number(b.matchId))
    };

    await store.set("latest-results", JSON.stringify(data));

    return json({
      ok: true,
      message: "Results imported.",
      imported: prepared,
      unmatched,
      data
    });
  } catch (error) {
    console.error("import-results blob write failed", {
      name: error && error.name,
      message: error && error.message
    });

    return json({
      ok: false,
      message: "Unable to import results.",
      errorCode: error && error.name ? error.name : "BlobWriteError"
    }, 500);
  }
};

async function loadDashboardData(event) {
  const host = event.headers.host || event.headers.Host;
  const protocol = event.headers["x-forwarded-proto"] || "https";
  const response = await fetch(`${protocol}://${host}/index.html`, { cache: "no-store" });
  const html = await response.text();
  const dataStart = html.indexOf("const D = ") + "const D = ".length;
  if (dataStart < "const D = ".length) return { matches: [] };
  let dataEnd = html.indexOf(";\r\nconst $", dataStart);
  if (dataEnd < 0) dataEnd = html.indexOf(";\nconst $", dataStart);
  if (dataEnd < 0) return { matches: [] };
  return JSON.parse(html.slice(dataStart, dataEnd));
}

function findAppMatch(appMatches, incoming) {
  if (Number.isInteger(Number(incoming.matchId)) && Number(incoming.matchId) > 0) {
    const byId = appMatches.find((match) => Number(match.id) === Number(incoming.matchId));
    if (byId) return byId;
  }

  const homeNames = namesFor(incoming.homeTeam);
  const awayNames = namesFor(incoming.awayTeam);

  return appMatches.find((match) => {
    const appHome = normalize(match.team1);
    const appAway = normalize(match.team2);
    return homeNames.includes(appHome) && awayNames.includes(appAway);
  });
}

function namesFor(value) {
  const normalized = normalize(value);
  const aliases = TEAM_ALIASES[normalized] || [];
  return [normalized, ...aliases.map(normalize)];
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u200c\u200f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[\s._-]+/g, " ")
    .trim();
}

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
