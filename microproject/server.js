const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 8080);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeThisAdminPassword123!";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "buses.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const sessions = new Map();
const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"application/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".ico":"image/x-icon" };

async function ensureData() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(DATA_FILE); }
  catch {
    await fs.writeFile(DATA_FILE, JSON.stringify([
      {id:1,busNumber:"B101",routeName:"City Centre Express",busType:"Express · AC",from:"Central Station",to:"City Centre",arrival:"09:10",departure:"09:20",platform:"P-01",status:"On Time",direction:"departure"},
      {id:2,busNumber:"B204",routeName:"University Loop",busType:"Local · Non-AC",from:"North Terminal",to:"University",arrival:"09:25",departure:"09:35",platform:"P-03",status:"Boarding",direction:"departure"},
      {id:3,busNumber:"B315",routeName:"Airport Link",busType:"Airport · Express",from:"Airport",to:"Central Station",arrival:"09:40",departure:"09:45",platform:"P-02",status:"On Time",direction:"arrival"}
    ], null, 2));
  }
}
async function readBuses() {
  const value = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  if (!Array.isArray(value)) throw new Error("Bus data file must contain a JSON array");
  return value;
}
async function writeBuses(buses) {
  const temp = DATA_FILE + ".tmp";
  await fs.writeFile(temp, JSON.stringify(buses, null, 2));
  await fs.rename(temp, DATA_FILE);
}
function send(res, status, data, headers={}) {
  res.writeHead(status, { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", ...headers });
  res.end(JSON.stringify(data));
}
function cookieValue(req, name) {
  const cookie = req.headers.cookie || "";
  const part = cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith(name+"="));
  return part ? decodeURIComponent(part.slice(name.length+1)) : "";
}
function isAdmin(req) {
  const token = cookieValue(req, "bustrack_session");
  const expiry = sessions.get(token);
  if (!token || !expiry || expiry < Date.now()) { sessions.delete(token); return false; }
  return true;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 100000) { reject(new Error("Request too large")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}
function cleanBus(input, id) {
  const fields = ["busNumber","routeName","busType","from","to","arrival","departure","platform","status","direction"];
  const bus = { id };
  for (const field of fields) bus[field] = String(input[field] ?? "").trim();
  for (const field of ["busNumber","routeName","from","to","arrival","departure","platform","status","direction"]) {
    if (!bus[field]) throw new Error(`${field} is required`);
  }
  if (!/^\d{2}:\d{2}$/.test(bus.arrival) || !/^\d{2}:\d{2}$/.test(bus.departure)) throw new Error("Arrival and departure must use HH:MM format");
  if (!["arrival","departure","both"].includes(bus.direction)) throw new Error("Direction must be arrival, departure, or both");
  if (!["On Time","Delayed","Boarding","Departed","Cancelled"].includes(bus.status)) throw new Error("Select a valid status");
  return bus;
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (req.method === "GET" && pathname === "/api/buses") {
      const buses = await readBuses();
      return send(res, 200, buses);
    }
    if (req.method === "POST" && pathname === "/api/admin/login") {
      const body = await readBody(req);
      const supplied = String(body.password || "");
      const a = Buffer.from(supplied), b = Buffer.from(ADMIN_PASSWORD);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(res, 401, {error:"Incorrect admin password"});
      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
      return send(res, 200, {ok:true}, { "Set-Cookie":`bustrack_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` });
    }
    if (req.method === "POST" && pathname === "/api/admin/logout") {
      const token = cookieValue(req, "bustrack_session");
      sessions.delete(token);
      return send(res, 200, {ok:true}, { "Set-Cookie":"bustrack_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
    }
    if (pathname.startsWith("/api/admin/")) {
      if (!isAdmin(req)) return send(res, 401, {error:"Please sign in as admin"});
      if (req.method === "POST" && pathname === "/api/admin/buses") {
        const body = await readBody(req), buses = await readBuses();
        const nextId = buses.reduce((max, b) => Math.max(max, Number(b.id)||0), 0) + 1;
        const bus = cleanBus(body, nextId);
        buses.push(bus); await writeBuses(buses);
        return send(res, 201, bus);
      }
      const match = pathname.match(/^\/api\/admin\/buses\/(\d+)$/);
      if (match && req.method === "PUT") {
        const id = Number(match[1]), buses = await readBuses(), index = buses.findIndex(b => Number(b.id) === id);
        if (index < 0) return send(res, 404, {error:"Bus not found"});
        buses[index] = cleanBus(await readBody(req), id); await writeBuses(buses);
        return send(res, 200, buses[index]);
      }
      if (match && req.method === "DELETE") {
        const id = Number(match[1]), buses = await readBuses(), remaining = buses.filter(b => Number(b.id) !== id);
        if (remaining.length === buses.length) return send(res, 404, {error:"Bus not found"});
        await writeBuses(remaining); return send(res, 200, {ok:true});
      }
      return send(res, 404, {error:"Admin endpoint not found"});
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, {error:"Method not allowed"});
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = path.resolve(PUBLIC_DIR, relative);
    if (!filePath.startsWith(path.resolve(PUBLIC_DIR) + path.sep) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
      res.writeHead(403); return res.end("Forbidden");
    }
    let content;
    try { content = await fs.readFile(filePath); }
    catch { res.writeHead(404, {"Content-Type":"text/plain; charset=utf-8"}); return res.end("Not found"); }
    res.writeHead(200, {"Content-Type":MIME[path.extname(filePath)] || "application/octet-stream", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"strict-origin-when-cross-origin"});
    return req.method === "HEAD" ? res.end() : res.end(content);
  } catch (err) {
    console.error(err);
    return send(res, err.message === "Request too large" ? 413 : 400, {error:err.message || "Request failed"});
  }
});
ensureData().then(() => server.listen(PORT, "0.0.0.0", () => console.log(`BusTrack listening on ${PORT}; JSON: ${DATA_FILE}`))).catch(err => { console.error("Startup failed", err); process.exit(1); });
