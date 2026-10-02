// Собрано из server/src командой node web/build.mjs. Не редактируйте вручную.
var DalEngine = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // web/src/entry.ts
  var entry_exports = {};
  __export(entry_exports, {
    handle: () => handle,
    init: () => init,
    reset: () => reset
  });

  // web/src/shims/buffer.ts
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var Buffer2 = class _Buffer extends Uint8Array {
    static from(x, enc) {
      if (typeof x === "string") {
        if (enc === "base64" || enc === "base64url") {
          const s = atob(x.replace(/-/g, "+").replace(/_/g, "/"));
          const b3 = new _Buffer(s.length);
          for (let i = 0; i < s.length; i++) b3[i] = s.charCodeAt(i);
          return b3;
        }
        const u = new TextEncoder().encode(x);
        const b2 = new _Buffer(u.length);
        b2.set(u);
        return b2;
      }
      const b = new _Buffer(x.length);
      b.set(x);
      return b;
    }
    static byteLength(s) {
      return new TextEncoder().encode(s).length;
    }
    static concat(list) {
      const n = list.reduce((a, l) => a + l.length, 0), b = new _Buffer(n);
      let o = 0;
      for (const l of list) {
        b.set(l, o);
        o += l.length;
      }
      return b;
    }
    static isBuffer(x) {
      return x instanceof _Buffer;
    }
    toString(enc) {
      if (enc === "hex") return [...this].map((v) => v.toString(16).padStart(2, "0")).join("");
      if (enc === "base64" || enc === "base64url") {
        let s = "";
        for (let i = 0; i < this.length; i += 3) {
          const n = this[i] << 16 | (this[i + 1] ?? 0) << 8 | (this[i + 2] ?? 0);
          s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < this.length ? B64[n >> 6 & 63] : "=") + (i + 2 < this.length ? B64[n & 63] : "=");
        }
        return enc === "base64url" ? s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : s;
      }
      return new TextDecoder().decode(this);
    }
  };

  // web/src/shims/sqlite.ts
  var state = { SQL: null, initial: null, current: null };
  var DatabaseSync = class {
    constructor() {
      __publicField(this, "db");
      __publicField(this, "gen", 0);
      this.db = new state.SQL.Database(state.initial || void 0);
      state.current = this;
    }
    exec(sql) {
      this.db.exec(sql);
    }
    // sql.js при export() закрывает базу и освобождает подготовленные запросы: запоминаем поколение и готовим заново.
    export() {
      const b = this.db.export();
      this.gen++;
      this.db.exec("PRAGMA foreign_keys = ON;");
      return b;
    }
    prepare(sql) {
      const self = this;
      let st = null, gen = -1;
      const get = () => {
        if (gen !== self.gen || !st) {
          st = self.db.prepare(sql);
          gen = self.gen;
        }
        return st;
      };
      const use = (params, fn) => {
        const s = get();
        try {
          s.bind(params);
          return fn(s);
        } finally {
          s.reset();
        }
      };
      return {
        get: (...p) => use(p, (s) => s.step() ? s.getAsObject() : void 0),
        all: (...p) => use(p, (s) => {
          const rows = [];
          while (s.step()) rows.push(s.getAsObject());
          return rows;
        }),
        run: (...p) => use(p, (s) => {
          s.step();
          return { changes: self.db.getRowsModified(), lastInsertRowid: 0 };
        })
      };
    }
    close() {
      this.db.close();
    }
  };

  // web/src/shims/fs.ts
  var vfs = /* @__PURE__ */ new Map();
  var hooks = {};
  var norm = (p) => ("/" + String(p)).replace(/\/+/g, "/");
  var enoent = (p) => {
    const e = new Error(`ENOENT: ${p}`);
    e.code = "ENOENT";
    return e;
  };
  function setFile(p, v) {
    vfs.set(norm(p), v);
    hooks.onSet?.(norm(p), v);
  }
  function existsSync(p) {
    return vfs.has(norm(p));
  }
  function statSync(p) {
    const v = vfs.get(norm(p));
    if (v === void 0) throw enoent(p);
    return { size: typeof v === "string" ? new Blob([v]).size : v.size, isFile: () => true, isDirectory: () => false };
  }
  function readFileSync(p) {
    const v = vfs.get(norm(p));
    if (typeof v !== "string") throw enoent(p);
    return v;
  }
  function readdirSync(dir) {
    const d = norm(dir).replace(/\/$/, "") + "/";
    return [...vfs.keys()].filter((k) => k.startsWith(d) && !k.slice(d.length).includes("/")).map((k) => k.slice(d.length));
  }
  function mkdirSync() {
  }
  function rmSync(p) {
    const k = norm(p);
    if (vfs.delete(k)) hooks.onDelete?.(k);
  }
  function renameSync(a, b) {
    const v = vfs.get(norm(a));
    if (v === void 0) throw enoent(a);
    rmSync(a);
    setFile(b, v);
  }
  function createWriteStream(p) {
    return { __path: norm(p) };
  }
  function createReadStream(p) {
    return { pipe(res) {
      res.__blob = vfs.get(norm(p));
      res.end?.();
    } };
  }
  var fs_default = { existsSync, statSync, readFileSync, readdirSync, mkdirSync, rmSync, renameSync, createWriteStream, createReadStream };

  // web/src/shims/path.ts
  var normalize = (p) => {
    const abs = p.startsWith("/"), out = [];
    for (const s of p.split("/")) {
      if (!s || s === ".") continue;
      if (s === "..") out.pop();
      else out.push(s);
    }
    return (abs ? "/" : "") + out.join("/");
  };
  var sep = "/";
  var join = (...p) => normalize(p.filter(Boolean).join("/"));
  var resolve = (...p) => {
    let r = "";
    for (const s of p) r = s.startsWith("/") ? s : r + "/" + s;
    return normalize(r.startsWith("/") ? r : "/" + r) || "/";
  };
  var dirname = (p) => {
    const n = normalize(p);
    const i = n.lastIndexOf("/");
    return i <= 0 ? "/" : n.slice(0, i);
  };
  var basename = (p) => normalize(p).split("/").pop() || "";
  var extname = (p) => {
    const b = basename(p), i = b.lastIndexOf(".");
    return i > 0 ? b.slice(i) : "";
  };
  var path_default = { sep, join, resolve, dirname, basename, extname };

  // server/src/db.ts
  var norm2 = (p) => p.map((v) => v === void 0 ? null : typeof v === "boolean" ? v ? 1 : 0 : v);
  function openDb(file) {
    if (file !== ":memory:") fs_default.mkdirSync(path_default.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    const cache = /* @__PURE__ */ new Map();
    const stmt = (sql) => {
      let s = cache.get(sql);
      if (!s) {
        s = db.prepare(sql);
        cache.set(sql, s);
      }
      return s;
    };
    let depth = 0;
    return {
      all: (sql, ...p) => stmt(sql).all(...norm2(p)),
      get: (sql, ...p) => stmt(sql).get(...norm2(p)),
      run: (sql, ...p) => stmt(sql).run(...norm2(p)),
      exec: (sql) => db.exec(sql),
      // Транзакции синхронные: node:sqlite работает синхронно, внутри tx не должно быть await.
      tx(fn) {
        if (depth > 0) return fn();
        depth++;
        db.exec("BEGIN IMMEDIATE");
        try {
          const r = fn();
          db.exec("COMMIT");
          return r;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        } finally {
          depth--;
        }
      },
      close: () => db.close()
    };
  }
  function migrate(db, dir) {
    db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    const done = new Set(db.all("SELECT name FROM schema_migrations").map((r) => r.name));
    const applied = [];
    for (const name of fs_default.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(name)) continue;
      const sql = fs_default.readFileSync(path_default.join(dir, name), "utf8");
      db.tx(() => {
        db.exec(sql);
        db.run("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)", name, (/* @__PURE__ */ new Date()).toISOString());
      });
      applied.push(name);
    }
    return applied;
  }

  // web/src/shims/stream-promises.ts
  async function pipeline(req, counter, ws) {
    const blob = req.__blob;
    if (!blob) throw new Error("empty");
    await new Promise((res, rej) => counter._t({ length: blob.size }, null, (e) => e ? rej(e) : res()));
    setFile(ws.__path, blob);
  }

  // web/src/shims/stream.ts
  var Transform = class {
    constructor(o) {
      __publicField(this, "_t");
      this._t = o.transform;
    }
  };

  // server/src/http.ts
  var HttpError = class extends Error {
    constructor(status, code, message, details) {
      super(message);
      __publicField(this, "status");
      __publicField(this, "code");
      __publicField(this, "details");
      this.status = status;
      this.code = code;
      this.details = details;
    }
  };
  var notFound = (what = "Не найдено") => new HttpError(404, "not_found", what);
  var forbidden = (msg = "Недостаточно прав") => new HttpError(403, "forbidden", msg);
  var conflict = (code, msg) => new HttpError(409, code, msg);
  function createRouter() {
    const routes = [];
    return {
      routes,
      add(def) {
        const keys = [];
        const re = new RegExp("^" + def.path.replace(/\//g, "\\/").replace(/:(\w+)/g, (_, k) => {
          keys.push(k);
          return "([^\\/]+)";
        }) + "\\/?$");
        routes.push({ ...def, re, keys });
      },
      match(method, pathname) {
        let pathMatched = false;
        for (const r of routes) {
          const m = r.re.exec(pathname);
          if (!m) continue;
          pathMatched = true;
          if (r.method !== method && !(method === "HEAD" && r.method === "GET")) continue;
          const params = {};
          r.keys.forEach((k, i) => {
            params[k] = decodeURIComponent(m[i + 1]);
          });
          return { route: r, params };
        }
        return pathMatched ? "method" : null;
      }
    };
  }
  var CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name, X-Duration",
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
    "Access-Control-Max-Age": "600"
  };
  async function receiveFile(req, dest, maxBytes) {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > maxBytes) throw new HttpError(413, "too_large", `Файл больше допустимого размера (${Math.round(maxBytes / 1024 ** 2)} МБ)`);
    fs_default.mkdirSync(path_default.dirname(dest), { recursive: true });
    const tmp = dest + ".part";
    let size = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length;
        if (size > maxBytes) cb(new HttpError(413, "too_large", `Файл больше допустимого размера (${Math.round(maxBytes / 1024 ** 2)} МБ)`));
        else cb(null, chunk);
      }
    });
    try {
      await pipeline(req, counter, fs_default.createWriteStream(tmp));
    } catch (e) {
      fs_default.rmSync(tmp, { force: true });
      throw e instanceof HttpError ? e : new HttpError(400, "upload_failed", "Загрузка прервалась");
    }
    if (!size) {
      fs_default.rmSync(tmp, { force: true });
      throw new HttpError(400, "empty_file", "Файл пустой");
    }
    fs_default.renameSync(tmp, dest);
    return size;
  }
  var MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".m4v": "video/x-m4v"
  };
  function sendFile(req, res, file, type) {
    let stat;
    try {
      stat = fs_default.statSync(file);
    } catch {
      throw notFound("Файл не найден");
    }
    if (!stat.isFile()) throw notFound("Файл не найден");
    const mime = type || MIME[path_default.extname(file).toLowerCase()] || "application/octet-stream";
    const headers = { ...CORS, "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=0" };
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = m && m[1] ? Number(m[1]) : NaN, end = m && m[2] ? Number(m[2]) : stat.size - 1;
      if (m && !m[1] && m[2]) {
        start = Math.max(0, stat.size - Number(m[2]));
        end = stat.size - 1;
      }
      if (!m || isNaN(start) || start > end || start >= stat.size) {
        res.writeHead(416, { ...headers, "Content-Range": `bytes */${stat.size}` });
        res.end();
        return;
      }
      end = Math.min(end, stat.size - 1);
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": end - start + 1 });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      fs_default.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "Content-Length": stat.size });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs_default.createReadStream(file).pipe(res);
  }

  // web/src/shims/url.ts
  var fileURLToPath = (u) => String(u).replace(/^file:\/\//, "");

  // web/src/shims/crypto.ts
  var K = new Uint32Array([1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580, 3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986, 2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895, 666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037, 2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344, 430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779, 1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298]);
  function sha256(data) {
    const l = data.length, n = l + 9 + 63 >> 6 << 6, m = new Uint8Array(n);
    m.set(data);
    m[l] = 128;
    const dv = new DataView(m.buffer);
    dv.setUint32(n - 4, l * 8);
    dv.setUint32(n - 8, Math.floor(l / 536870912));
    const H = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]), W = new Uint32Array(64);
    const r = (x, s) => x >>> s | x << 32 - s;
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a2 = W[i - 15], b2 = W[i - 2];
        W[i] = W[i - 16] + (r(a2, 7) ^ r(a2, 18) ^ a2 >>> 3) + W[i - 7] + (r(b2, 17) ^ r(b2, 19) ^ b2 >>> 10) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + (e & f ^ ~e & g) + K[i] + W[i] | 0;
        const t2 = (r(a, 2) ^ r(a, 13) ^ r(a, 22)) + (a & b ^ a & c ^ b & c) | 0;
        h = g;
        g = f;
        f = e;
        e = d + t1 | 0;
        d = c;
        c = b;
        b = a;
        a = t1 + t2 | 0;
      }
      H[0] += a;
      H[1] += b;
      H[2] += c;
      H[3] += d;
      H[4] += e;
      H[5] += f;
      H[6] += g;
      H[7] += h;
    }
    const out = Buffer2.from(new Uint8Array(32)), ov = new DataView(out.buffer);
    H.forEach((v, i) => ov.setUint32(i * 4, v));
    return out;
  }
  var bytes = (x) => typeof x === "string" ? Buffer2.from(x) : x;
  function createHash() {
    let acc = [];
    const h = { update(x) {
      acc.push(bytes(x));
      return h;
    }, digest(enc) {
      const d = sha256(Buffer2.concat(acc));
      return enc ? d.toString(enc) : d;
    } };
    return h;
  }
  function randomBytes(n) {
    const b = new Buffer2(n);
    crypto.getRandomValues(b);
    return b;
  }
  function scryptSync(pw, salt, len) {
    let d = sha256(Buffer2.concat([bytes(salt), Buffer2.from(pw)]));
    const out = new Buffer2(len);
    for (let o = 0; o < len; o += 32) {
      out.set(d.subarray(0, Math.min(32, len - o)), o);
      d = sha256(Buffer2.concat([d, bytes(salt)]));
    }
    return out;
  }
  function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let x = 0;
    for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
    return x === 0;
  }
  function randomUUID() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const b = randomBytes(16);
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    const h = b.toString("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // server/src/rules.ts
  var RULES = {
    maxFreeLessons: 2,
    // бесплатных уроков в курсе для предпросмотра
    maxOpenForecasts: 5,
    // открытых прогнозов у эксперта одновременно
    maxVideoBytes: 4 * 1024 ** 3,
    // 4 ГБ на видео урока
    maxCoverBytes: 5 * 1024 ** 2,
    // 5 МБ на обложку
    commission: 0.2,
    // комиссия платформы с продажи
    refundDays: 14,
    // возврат возможен столько дней после покупки
    refundMaxProgress: 0.2,
    // ...и если пройдено меньше этой доли курса
    forecastMaxDays: 365,
    // срок прогноза: от завтра до года
    rationaleMin: 120,
    // минимальная длина обоснования прогноза
    sessionDays: 30,
    // срок жизни входа
    payoutDays: [5, 20],
    // числа месяца, когда идут выплаты
    loginAttempts: 10,
    // неудачных попыток входа за окно
    loginWindowMin: 15
  };
  var CATEGORIES = ["beginner", "advanced", "workshops"];
  var CATEGORY_NAMES = { beginner: "Для новичков", advanced: "Для продвинутых", workshops: "Вебинары и практикумы" };
  var COVER_LIBRARY = ["foundations", "analytics", "workshop"];
  var VIDEO_TYPES = { "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "video/x-m4v": ".m4v" };
  var IMAGE_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
  var MODES = ["courses", "experts", "community", "ideas"];
  var PRODUCT_TYPES = {
    consultation: { mode: "experts", name: "Разовая консультация", kind: "sessions" },
    personal: { mode: "experts", name: "Индивидуальные занятия", kind: "sessions" },
    mentorship: { mode: "experts", name: "Длительное сопровождение", kind: "sessions" },
    clubs: { mode: "community", name: "Закрытый клуб", kind: "subscription" },
    chats: { mode: "community", name: "Чат с экспертом и участниками", kind: "subscription" },
    investment: { mode: "ideas", name: "Инвестиционная идея", kind: "material" },
    reviews: { mode: "ideas", name: "Обзор рынка и компаний", kind: "material" }
  };
  var MODE_NAMES = { courses: "Курсы", experts: "Работа с экспертом", community: "Сообщество", ideas: "Идеи и аналитика" };
  var PRODUCT_RULES = {
    cancelHours: 24,
    // отменить запись на встречу можно не позже чем за сутки
    slotMaxDays: 180,
    // слоты расписания — не дальше чем на полгода вперёд
    minContent: 300,
    // минимальная длина материала идеи или обзора
    previewChars: 400,
    // сколько текста платного материала видно до покупки
    messageMax: 1e3,
    sessionRefundDays: 14
    // встречи: возврат до 14 дней, если ни одна встреча не назначена
  };
  var SOCIALS = ["telegram", "instagram", "youtube", "linkedin", "website"];

  // server/src/auth.ts
  var N = 16384;
  var R = 8;
  var P = 1;
  var LEN = 64;
  function hashPassword(password) {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, LEN, { N, r: R, p: P });
    return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
  }
  function verifyPassword(password, stored) {
    const [alg, n, r, p, salt, hash] = stored.split("$");
    if (alg !== "scrypt") return false;
    const expected = Buffer2.from(hash, "base64");
    const actual = scryptSync(password, Buffer2.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return timingSafeEqual(actual, expected);
  }
  var sha2562 = (s) => createHash("sha256").update(s).digest("hex");
  function createSession(db, userId) {
    const token = randomBytes(32).toString("base64url");
    const now = /* @__PURE__ */ new Date(), expires = new Date(now.getTime() + RULES.sessionDays * 864e5);
    db.run("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", sha2562(token), userId, now.toISOString(), expires.toISOString());
    return { token, expiresAt: expires.toISOString() };
  }
  function dropSession(db, token) {
    db.run("DELETE FROM sessions WHERE token_hash = ?", sha2562(token));
  }
  function tokenFrom(req, url) {
    const h = req.headers.authorization;
    if (h && h.startsWith("Bearer ")) return h.slice(7).trim();
    if ((req.method === "GET" || req.method === "HEAD") && url.searchParams.get("token")) return url.searchParams.get("token");
    return null;
  }
  function userFromToken(db, token) {
    if (!token) return null;
    const row = db.get(
      `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
      sha2562(token),
      (/* @__PURE__ */ new Date()).toISOString()
    );
    return row ?? null;
  }
  function createLoginLimiter() {
    const fails = /* @__PURE__ */ new Map();
    return {
      check(key) {
        const f = fails.get(key);
        if (f && f.until > Date.now() && f.count >= RULES.loginAttempts)
          throw new HttpError(429, "too_many_attempts", `Слишком много попыток входа. Попробуйте через ${RULES.loginWindowMin} минут.`);
      },
      fail(key) {
        const f = fails.get(key);
        if (!f || f.until < Date.now()) fails.set(key, { count: 1, until: Date.now() + RULES.loginWindowMin * 6e4 });
        else f.count++;
      },
      reset(key) {
        fails.delete(key);
      }
    };
  }

  // server/src/validate.ts
  var wrap = (o, fn) => Object.assign((v, n) => fn(v, n), o);
  var str = (o = {}) => wrap(o, (v) => {
    if (typeof v !== "string") return { ok: false, error: "Ожидается строка" };
    const s = o.trim === false ? v : v.trim();
    if (o.min !== void 0 && s.length < o.min) return { ok: false, error: `Не короче ${o.min} символов` };
    if (o.max !== void 0 && s.length > o.max) return { ok: false, error: `Не длиннее ${o.max} символов` };
    if (o.pattern && !o.pattern.test(s)) return { ok: false, error: o.patternMsg || "Неверный формат" };
    return { ok: true, value: s };
  });
  var num = (o = {}) => wrap(o, (v) => {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false, error: "Ожидается число" };
    if (o.int && !Number.isInteger(n)) return { ok: false, error: "Ожидается целое число" };
    if (o.min !== void 0 && n < o.min) return { ok: false, error: `Не меньше ${o.min}` };
    if (o.gt !== void 0 && n <= o.gt) return { ok: false, error: `Больше ${o.gt}` };
    if (o.max !== void 0 && n > o.max) return { ok: false, error: `Не больше ${o.max}` };
    return { ok: true, value: n };
  });
  var bool = (o = {}) => wrap(o, (v) => typeof v === "boolean" ? { ok: true, value: v } : { ok: false, error: "Ожидается true или false" });
  var oneOf = (values, o = {}) => wrap(o, (v) => typeof v === "string" && values.includes(v) ? { ok: true, value: v } : { ok: false, error: `Допустимо: ${values.join(", ")}` });
  var date = (o = {}) => wrap(o, (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? { ok: true, value: v } : { ok: false, error: "Ожидается дата в формате ГГГГ-ММ-ДД" });
  var strList = (o = {}) => wrap(o, (v) => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return { ok: false, error: "Ожидается список строк" };
    const list = v.map((x) => x.trim()).filter(Boolean);
    if (o.maxItems && list.length > o.maxItems) return { ok: false, error: `Не больше ${o.maxItems} пунктов` };
    if (o.maxLen && list.some((x) => x.length > o.maxLen)) return { ok: false, error: `Каждый пункт не длиннее ${o.maxLen} символов` };
    return { ok: true, value: list };
  });
  function parse(body, schema) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "bad_body", "Ожидается JSON-объект");
    const src = body, out = {}, errors = {};
    for (const [key, check] of Object.entries(schema)) {
      const v = src[key];
      if (v === void 0) {
        if (!check.optional) errors[key] = "Обязательное поле";
        continue;
      }
      if (v === null) {
        if (check.nullable) out[key] = null;
        else errors[key] = "Поле не может быть пустым";
        continue;
      }
      const r = check(v, key);
      if (r.ok) out[key] = r.value;
      else errors[key] = r.error;
    }
    if (Object.keys(errors).length) throw new HttpError(422, "validation", "Проверьте поля", errors);
    return out;
  }

  // server/src/util.ts
  var newId = () => randomUUID();
  var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
  var localDate = (d = /* @__PURE__ */ new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  var addDays = (n, from = /* @__PURE__ */ new Date()) => {
    const d = new Date(from);
    d.setDate(d.getDate() + n);
    return localDate(d);
  };
  var daysBetween = (fromIso, to = /* @__PURE__ */ new Date()) => (to.getTime() - new Date(fromIso).getTime()) / 864e5;
  var shortName = (name) => {
    const [first, last] = name.trim().split(/\s+/);
    return last ? `${first} ${last[0]}.` : first;
  };
  var nextPayoutDate = (days, from = /* @__PURE__ */ new Date()) => {
    for (let m = 0; m < 2; m++) {
      for (const day of days) {
        const d = new Date(from.getFullYear(), from.getMonth() + m, day);
        if (localDate(d) > localDate(from)) return localDate(d);
      }
    }
    return localDate(from);
  };

  // server/src/experts.ts
  var avatarUrl = (row) => row.avatar_file ? `/media/avatars/${row.avatar_file}` : row.avatar ? `/assets/${row.avatar}.jpg` : null;
  var expertBrief = (db, id) => {
    const r = db.get("SELECT u.id, u.name, u.avatar_file, p.avatar FROM users u LEFT JOIN expert_profiles p ON p.user_id = u.id WHERE u.id = ?", id);
    return { id: r.id, name: r.name, avatarUrl: avatarUrl(r) };
  };
  var round2 = (n) => n == null ? null : Math.round(n * 100) / 100;
  function expertRatings(db, id) {
    const courses = db.get(`SELECT AVG(r.rating) AS avg, COUNT(*) AS n FROM reviews r JOIN courses c ON c.id = r.course_id WHERE c.expert_id = ? AND r.hidden = 0`, id);
    const byMode = { courses: { value: round2(courses.avg), reviews: courses.n } };
    for (const m of MODES.slice(1)) {
      const r = db.get(`SELECT AVG(r.rating) AS avg, COUNT(*) AS n FROM product_reviews r JOIN products p ON p.id = r.product_id WHERE p.expert_id = ? AND p.mode = ? AND r.hidden = 0`, id, m);
      byMode[m] = { value: round2(r.avg), reviews: r.n };
    }
    const rated = Object.values(byMode).filter((x) => x.value != null).map((x) => x.value);
    return { byMode, overall: rated.length ? round2(rated.reduce((a, b) => a + b, 0) / rated.length) : null, reviews: Object.values(byMode).reduce((a, x) => a + x.reviews, 0) };
  }
  function expertStudents(db, id) {
    return db.get(
      `SELECT COUNT(DISTINCT user_id) AS n FROM (
       SELECT e.user_id FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.expert_id = ? AND e.status = 'active'
       UNION SELECT pp.user_id FROM product_purchases pp JOIN products p ON p.id = pp.product_id WHERE p.expert_id = ? AND pp.status = 'active')`,
      id,
      id
    ).n;
  }
  function forecastStats(db, id) {
    const f = db.get(`SELECT SUM(status = 'success') AS ok, SUM(status <> 'active') AS done, SUM(status = 'active') AS open FROM forecasts WHERE expert_id = ?`, id);
    return { open: f.open || 0, done: f.done || 0, success: f.ok || 0, successRate: f.done ? Math.round(f.ok / f.done * 1e3) / 10 : null };
  }
  function expertPublic(db, row) {
    const ratings = expertRatings(db, row.id);
    return {
      id: row.id,
      name: row.name,
      specialization: row.specialization,
      bio: row.bio,
      experience: row.experience,
      achievements: JSON.parse(row.achievements || "[]"),
      socials: JSON.parse(row.socials || "{}"),
      avatarUrl: avatarUrl(row),
      verified: !!row.verified_at,
      students: expertStudents(db, row.id),
      rating: ratings.overall,
      reviews: ratings.reviews,
      ratings: ratings.byMode,
      forecasts: forecastStats(db, row.id)
    };
  }

  // server/src/routes/auth.ts
  function registerAuth(app2) {
    const { db, router } = app2;
    const me = (id) => {
      const u = db.get("SELECT id, email, name, role, created_at, avatar_file FROM users WHERE id = ?", id);
      const p = u.role === "expert" ? db.get("SELECT verified_at, avatar FROM expert_profiles WHERE user_id = ?", id) : null;
      return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at, avatarUrl: avatarUrl({ avatar_file: u.avatar_file, avatar: p?.avatar }), ...p ? { verified: !!p.verified_at } : {} };
    };
    router.add({
      method: "POST",
      path: "/auth/register",
      group: "Вход",
      summary: "Регистрация ученика или эксперта. Сразу возвращает токен.",
      body: '{ email, password (от 8 символов), name, role: "student" | "expert" }',
      handler: ({ body }) => {
        const b = parse(body, {
          email: str({ max: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMsg: "Некорректный адрес почты" }),
          password: str({ min: 8, max: 200, trim: false }),
          name: str({ min: 2, max: 60 }),
          role: oneOf(["student", "expert"])
        });
        const id = newId();
        db.tx(() => {
          db.run("INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, b.email.toLowerCase(), hashPassword(b.password), b.name, b.role, nowIso());
          if (b.role === "expert") db.run("INSERT INTO expert_profiles (user_id) VALUES (?)", id);
        });
        return { ...createSession(db, id), user: me(id) };
      }
    });
    router.add({
      method: "POST",
      path: "/auth/login",
      group: "Вход",
      summary: "Вход по почте и паролю. Возвращает токен для заголовка Authorization: Bearer <токен>.",
      body: "{ email, password }",
      handler: ({ body }) => {
        const b = parse(body, { email: str({ max: 120 }), password: str({ max: 200, trim: false }) });
        const key = b.email.toLowerCase();
        app2.loginLimiter.check(key);
        const u = db.get("SELECT id, password_hash FROM users WHERE email = ?", key);
        if (!u || !verifyPassword(b.password, u.password_hash)) {
          app2.loginLimiter.fail(key);
          throw new HttpError(401, "bad_credentials", "Неверная почта или пароль");
        }
        app2.loginLimiter.reset(key);
        return { ...createSession(db, u.id), user: me(u.id) };
      }
    });
    router.add({
      method: "POST",
      path: "/auth/logout",
      group: "Вход",
      summary: "Выход: токен перестаёт действовать.",
      auth: "user",
      handler: ({ req }) => {
        const t = tokenFrom(req, new URL("http://x"));
        if (t) dropSession(db, t);
      }
    });
    router.add({
      method: "GET",
      path: "/me",
      group: "Вход",
      summary: "Текущий пользователь.",
      auth: "user",
      handler: ({ user }) => me(user.id)
    });
    router.add({
      method: "PATCH",
      path: "/me",
      group: "Вход",
      summary: "Изменить своё имя (ученик или модератор). Эксперт меняет имя через запрос на модерацию.",
      auth: ["student", "moderator"],
      body: "{ name }",
      handler: ({ user, body }) => {
        const b = parse(body, { name: str({ min: 2, max: 60 }) });
        db.run("UPDATE users SET name = ? WHERE id = ?", b.name, user.id);
        return me(user.id);
      }
    });
  }

  // server/src/anchor.ts
  function forecastMemo(f) {
    const h = createHash("sha256").update(String(f.rationale)).digest("hex");
    return `DAL forecast v1 | id=${f.id} | ${f.ticker} ${f.direction === "up" ? "UP" : "DOWN"} | start=${f.start_price} | target=${f.target_price} | deadline=${f.deadline} | published=${f.published_at} | rationale_sha256=${h}`;
  }
  function forecastAnchor(db, id) {
    const a = db.get("SELECT * FROM forecast_anchors WHERE forecast_id = ?", id);
    return a ? { cluster: a.cluster, signature: a.signature, wallet: a.wallet, createdAt: a.created_at, explorerUrl: `https://explorer.solana.com/tx/${a.signature}${a.cluster === "devnet" ? "?cluster=devnet" : ""}` } : null;
  }

  // server/src/courses.ts
  var isLive = (c) => c.status === "published" || c.status === "hidden";
  function coverUrl(cover) {
    if (!cover) return null;
    if (cover.startsWith("upload:")) return `/media/covers/${cover.slice(7)}`;
    return COVER_LIBRARY.includes(cover) ? `/assets/${cover}.jpg` : null;
  }
  function videoFile(app2, fileName) {
    return fileName.startsWith("seed:") ? path_default.join(app2.seedDir, fileName.slice(5)) : path_default.join(app2.storageDir, "videos", fileName);
  }
  function removeVideoFile(app2, fileName) {
    if (fileName && !fileName.startsWith("seed:")) fs_default.rmSync(videoFile(app2, fileName), { force: true });
  }
  function getCourse(db, id) {
    const c = db.get("SELECT * FROM courses WHERE id = ?", id);
    if (!c) throw notFound("Курс не найден");
    return c;
  }
  function ownCourse(db, user, id) {
    const c = getCourse(db, id);
    if (c.expert_id !== user.id) throw notFound("Курс не найден");
    return c;
  }
  function assertEditable(c) {
    if (c.status === "review") throw conflict("course_in_review", "Курс на модерации, редактирование закрыто. Отзовите его с модерации, чтобы внести изменения.");
  }
  function lessonContext(db, lessonId) {
    const row = db.get(
      `SELECT l.id AS l_id, m.id AS m_id, c.id AS c_id FROM lessons l JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id WHERE l.id = ?`,
      lessonId
    );
    if (!row) throw notFound("Урок не найден");
    return {
      lesson: db.get("SELECT * FROM lessons WHERE id = ?", row.l_id),
      module: db.get("SELECT * FROM modules WHERE id = ?", row.m_id),
      course: db.get("SELECT * FROM courses WHERE id = ?", row.c_id)
    };
  }
  function ownLesson(db, user, lessonId) {
    const ctx = lessonContext(db, lessonId);
    if (ctx.course.expert_id !== user.id) throw notFound("Урок не найден");
    return ctx;
  }
  function hasActiveEnrollment(db, userId, courseId) {
    return !!db.get(`SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ? AND status = 'active'`, userId, courseId);
  }
  function canWatch(db, user, course, lesson) {
    if (user?.role === "moderator") return true;
    if (user && course.expert_id === user.id) return true;
    if (user && hasActiveEnrollment(db, user.id, course.id) && isLive(course)) return true;
    return course.status === "published" && lesson.is_free === 1;
  }
  function lessonsOf(db, courseId) {
    return db.all(
      `SELECT l.*, m.id AS module_id, v.lesson_id AS has_video, v.duration, v.original_name, v.size, v.mime, v.uploaded_at, v.updated_after_publish
     FROM modules m JOIN lessons l ON l.module_id = m.id LEFT JOIN videos v ON v.lesson_id = l.id
     WHERE m.course_id = ? ORDER BY m.position, l.position`,
      courseId
    );
  }
  function structure(db, courseId, mode, completed) {
    const modules = db.all("SELECT * FROM modules WHERE course_id = ? ORDER BY position", courseId);
    const lessons = lessonsOf(db, courseId);
    return modules.map((m) => ({
      id: m.id,
      title: m.title,
      lessons: lessons.filter((l) => l.module_id === m.id).map((l) => ({
        id: l.id,
        title: l.title,
        isFree: l.is_free === 1,
        duration: l.duration ?? null,
        hasVideo: !!l.has_video,
        ...mode === "owner" && l.has_video ? { video: { name: l.original_name, size: l.size, mime: l.mime, duration: l.duration ?? null, uploadedAt: l.uploaded_at, updatedAfterPublish: l.updated_after_publish === 1 } } : {},
        ...mode === "student" ? { completed: completed?.has(l.id) ?? false, videoUrl: l.has_video ? `/lessons/${l.id}/video` : null } : {},
        ...mode === "public" && l.is_free === 1 && l.has_video ? { videoUrl: `/lessons/${l.id}/video` } : {}
      }))
    }));
  }
  function checklist(c, lessons) {
    return [
      { key: "title", label: "Название не короче 10 символов", ok: c.title.trim().length >= 10 },
      { key: "description", label: "Описание не короче 80 символов", ok: c.description.trim().length >= 80 },
      { key: "cover", label: "Выбрана обложка", ok: !!c.cover },
      { key: "price", label: "Указана цена", ok: c.price !== null },
      { key: "lessons", label: "Не меньше 3 уроков", ok: lessons.length >= 3 },
      { key: "lessonTitles", label: "У всех уроков есть названия", ok: lessons.length > 0 && lessons.every((l) => l.title.trim().length >= 3) },
      { key: "videos", label: "Видео загружено во все уроки", ok: lessons.length > 0 && lessons.every((l) => !!l.has_video) }
    ];
  }
  function courseStats(db, courseId) {
    const s = db.get(
      `SELECT COUNT(*) AS students, COALESCE(SUM(price_paid), 0) AS gross, COALESCE(SUM(commission), 0) AS commission
     FROM enrollments WHERE course_id = ? AND status = 'active'`,
      courseId
    );
    const r = db.get(`SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE course_id = ? AND hidden = 0`, courseId);
    return { students: s.students, revenue: s.gross, income: s.gross - s.commission, rating: r.avg ? Math.round(r.avg * 100) / 100 : null, reviews: r.n };
  }
  function courseCard(db, c) {
    const lessons = lessonsOf(db, c.id);
    const expert = expertBrief(db, c.expert_id);
    const stats = courseStats(db, c.id);
    return {
      id: c.id,
      title: c.title,
      category: c.category,
      categoryName: CATEGORY_NAMES[c.category],
      description: c.description,
      price: c.price,
      coverUrl: coverUrl(c.cover),
      status: c.status,
      expert,
      lessons: lessons.length,
      duration: Math.round(lessons.reduce((a, l) => a + (l.duration || 0), 0)),
      freeLessons: lessons.filter((l) => l.is_free === 1).length,
      ...stats,
      publishedAt: c.published_at,
      updatedAt: c.updated_at
    };
  }
  function progressOf(db, userId, courseId) {
    const total = lessonsOf(db, courseId).length;
    const done = db.get(
      `SELECT COUNT(*) AS n FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id JOIN modules m ON m.id = l.module_id
     WHERE p.user_id = ? AND m.course_id = ?`,
      userId,
      courseId
    ).n;
    return { done, total, percent: total ? Math.round(done / total * 100) : 0 };
  }
  function assertVerifiedExpert(db, user, action) {
    const p = db.get("SELECT verified_at FROM expert_profiles WHERE user_id = ?", user.id);
    if (!p?.verified_at) throw forbidden(`${action} можно после подтверждения личности и счёта для выплат.`);
  }
  var touch = (db, courseId) => db.run("UPDATE courses SET updated_at = ? WHERE id = ?", (/* @__PURE__ */ new Date()).toISOString(), courseId);

  // server/src/products.ts
  var kindOf = (p) => PRODUCT_TYPES[p.type].kind;
  var isLiveProduct = (p) => p.status === "published" || p.status === "hidden";
  var nowIso2 = () => (/* @__PURE__ */ new Date()).toISOString();
  function getProduct(db, id) {
    const p = db.get("SELECT * FROM products WHERE id = ?", id);
    if (!p) throw notFound("Продукт не найден");
    return p;
  }
  function ownProduct(db, user, id) {
    const p = getProduct(db, id);
    if (p.expert_id !== user.id) throw notFound("Продукт не найден");
    return p;
  }
  function assertProductEditable(p) {
    if (p.status === "review") throw conflict("product_in_review", "Продукт на модерации, редактирование закрыто. Отзовите его с модерации, чтобы внести изменения.");
  }
  function activePurchase(db, userId, productId) {
    return db.get(`SELECT * FROM product_purchases WHERE user_id = ? AND product_id = ? AND status = 'active'`, userId, productId);
  }
  var sessionsBooked = (db, purchaseId) => db.get("SELECT COUNT(*) AS n FROM product_slots WHERE purchase_id = ?", purchaseId).n;
  var subscriptionLive = (pu) => !!pu && (!pu.expires_at || pu.expires_at > nowIso2());
  function hasAccess(db, user, p) {
    if (user?.role === "moderator" || user && p.expert_id === user.id) return true;
    if (kindOf(p) === "material" && p.price === 0 && p.status === "published") return true;
    if (!user) return false;
    const pu = activePurchase(db, user.id, p.id);
    if (!pu) return false;
    return kindOf(p) === "subscription" ? subscriptionLive(pu) : !!pu;
  }
  function purchaseState(db, pu, p) {
    if (!pu) return null;
    const kind = kindOf(p);
    const used = kind === "sessions" ? sessionsBooked(db, pu.id) : 0;
    return {
      purchasedAt: pu.created_at,
      pricePaid: pu.price_paid,
      ...kind === "sessions" ? { sessionsTotal: pu.sessions_total, sessionsBooked: used, sessionsLeft: Math.max(0, pu.sessions_total - used) } : {},
      ...kind === "subscription" ? { expiresAt: pu.expires_at, active: subscriptionLive(pu) } : {}
    };
  }
  function metaText(p) {
    const k = kindOf(p);
    if (k === "sessions") return [p.duration_min ? `${p.duration_min} мин` : "", p.sessions > 1 ? `${p.sessions} ${plural(p.sessions, "встреча", "встречи", "встреч")}` : ""].filter(Boolean).join(" · ") || "Встреча";
    if (k === "subscription") return p.period_days ? `Подписка на ${p.period_days} ${plural(p.period_days, "день", "дня", "дней")}` : "Подписка";
    const words = String(p.content || "").split(/\s+/).filter(Boolean).length;
    return `${Math.max(1, Math.round(words / 180))} мин чтения`;
  }
  function plural(n, one, few, many) {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
  }
  function productStats(db, id) {
    const s = db.get(`SELECT COUNT(*) AS buyers, COALESCE(SUM(price_paid), 0) AS gross, COALESCE(SUM(commission), 0) AS fee FROM product_purchases WHERE product_id = ? AND status = 'active'`, id);
    const rn = db.get(`SELECT COALESCE(SUM(r.price_paid), 0) AS gross, COALESCE(SUM(r.commission), 0) AS fee FROM product_renewals r JOIN product_purchases pp ON pp.id = r.purchase_id WHERE pp.product_id = ?`, id);
    const r = db.get(`SELECT COUNT(*) AS n, AVG(rating) AS avg FROM product_reviews WHERE product_id = ? AND hidden = 0`, id);
    const gross = s.gross + rn.gross, fee = s.fee + rn.fee;
    return { buyers: s.buyers, revenue: gross, income: gross - fee, rating: r.avg ? Math.round(r.avg * 100) / 100 : null, reviews: r.n };
  }
  var futureFreeSlots = (db, productId, limit = 50) => db.all(`SELECT id, starts_at FROM product_slots WHERE product_id = ? AND booked_by IS NULL AND starts_at > ? ORDER BY starts_at LIMIT ?`, productId, new Date(Date.now() + 36e5).toISOString(), limit).map((s) => ({ id: s.id, startsAt: s.starts_at }));
  function productCard(db, p) {
    const info = PRODUCT_TYPES[p.type];
    const slots = info.kind === "sessions" ? futureFreeSlots(db, p.id, 1) : [];
    return {
      id: p.id,
      kind: "product",
      mode: p.mode,
      modeName: MODE_NAMES[p.mode],
      type: p.type,
      typeName: info.name,
      productKind: info.kind,
      title: p.title,
      description: p.description,
      price: p.price,
      coverUrl: coverUrl(p.cover),
      status: p.status,
      expert: expertBrief(db, p.expert_id),
      durationMin: p.duration_min,
      sessions: p.sessions,
      periodDays: p.period_days,
      meta: metaText(p),
      nextSlot: slots[0]?.startsAt ?? null,
      ...productStats(db, p.id),
      publishedAt: p.published_at,
      updatedAt: p.updated_at
    };
  }
  var URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;
  function productChecklist(db, p) {
    const kind = kindOf(p);
    const list = [
      { key: "title", label: "Название не короче 10 символов", ok: p.title.trim().length >= 10 },
      { key: "description", label: "Описание не короче 80 символов", ok: p.description.trim().length >= 80 },
      { key: "cover", label: "Выбрана обложка", ok: !!p.cover },
      { key: "price", label: "Указана цена", ok: p.price !== null }
    ];
    if (kind === "sessions") list.push(
      { key: "duration", label: "Указана длительность встречи", ok: !!p.duration_min },
      { key: "meeting", label: "Указана ссылка на видеозвонок", ok: URL_RE.test(p.meeting_url || "") },
      { key: "slots", label: "Есть хотя бы одно свободное время в расписании", ok: futureFreeSlots(db, p.id, 1).length > 0 }
    );
    if (kind === "subscription") list.push(
      { key: "period", label: "Указан срок подписки", ok: !!p.period_days },
      ...p.type === "clubs" ? [
        { key: "schedule", label: "Описано расписание встреч клуба", ok: (p.schedule_note || "").trim().length >= 10 },
        { key: "meeting", label: "Указана ссылка на встречи клуба", ok: URL_RE.test(p.meeting_url || "") }
      ] : []
    );
    if (kind === "material") list.push({ key: "content", label: `Текст материала не короче ${PRODUCT_RULES.minContent} символов`, ok: (p.content || "").trim().length >= PRODUCT_RULES.minContent });
    return list;
  }
  var isUrl = (s) => URL_RE.test(s);

  // server/src/routes/catalog.ts
  function registerCatalog(app2) {
    const { db, router } = app2;
    const expertRow = `SELECT u.id, u.name, u.avatar_file, p.* FROM users u JOIN expert_profiles p ON p.user_id = u.id`;
    const forecastPublic = (f) => ({
      id: f.id,
      ticker: f.ticker,
      name: f.name,
      direction: f.direction,
      startPrice: f.start_price,
      targetPrice: f.target_price,
      deadline: f.deadline,
      rationale: f.rationale,
      status: f.status,
      resultPrice: f.result_price,
      publishedAt: f.published_at,
      resolvedAt: f.resolved_at,
      expert: expertBrief(db, f.expert_id),
      comments: db.all("SELECT text, created_at AS createdAt FROM forecast_comments WHERE forecast_id = ? ORDER BY created_at", f.id),
      memo: forecastMemo(f),
      anchor: forecastAnchor(db, f.id)
    });
    router.add({
      method: "GET",
      path: "/health",
      group: "Служебное",
      summary: "Проверка, что сервер работает.",
      handler: () => ({ ok: true, time: (/* @__PURE__ */ new Date()).toISOString() })
    });
    router.add({
      method: "GET",
      path: "/catalog/courses",
      group: "Каталог",
      summary: "Курсы в каталоге. Параметры: category, q (поиск по названию и эксперту), sort = popular | price | price-desc | new, free=1.",
      handler: ({ query }) => {
        const cat = query.get("category"), q = (query.get("q") || "").trim().toLocaleLowerCase("ru"), sort = query.get("sort") || "popular";
        let rows = db.all(`SELECT c.*, u.name AS expert_name FROM courses c JOIN users u ON u.id = c.expert_id WHERE c.status = 'published'`);
        if (cat && CATEGORIES.includes(cat)) rows = rows.filter((r) => r.category === cat);
        if (query.get("free") === "1") rows = rows.filter((r) => r.price === 0);
        if (q) rows = rows.filter((r) => (r.title + " " + r.expert_name).toLocaleLowerCase("ru").includes(q));
        const cards = rows.map((r) => courseCard(db, r));
        const by = {
          popular: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.students - a.students,
          price: (a, b) => a.price - b.price,
          "price-desc": (a, b) => b.price - a.price,
          new: (a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))
        };
        return cards.sort(by[sort] || by.popular);
      }
    });
    router.add({
      method: "GET",
      path: "/catalog/courses/:id",
      group: "Каталог",
      summary: "Страница курса: описание, программа, бесплатные уроки.",
      handler: ({ params }) => {
        const c = getCourse(db, params.id);
        if (c.status !== "published") throw notFound("Курс не найден");
        return { ...courseCard(db, c), modules: structure(db, c.id, "public") };
      }
    });
    router.add({
      method: "GET",
      path: "/catalog/courses/:id/reviews",
      group: "Каталог",
      summary: "Отзывы о курсе с ответами эксперта.",
      handler: ({ params }) => {
        const c = getCourse(db, params.id);
        if (c.status !== "published") throw notFound("Курс не найден");
        return db.all(
          `SELECT r.id, u.name AS author, r.rating, r.text, r.created_at AS createdAt, r.reply, r.replied_at AS repliedAt
         FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.course_id = ? AND r.hidden = 0 ORDER BY r.created_at DESC`,
          c.id
        ).map((r) => ({ ...r, author: r.author.split(" ")[0] }));
      }
    });
    router.add({
      method: "GET",
      path: "/experts",
      group: "Каталог",
      summary: "Эксперты с рейтингом и статистикой прогнозов.",
      handler: () => db.all(`${expertRow} WHERE u.role = 'expert' AND p.verified_at IS NOT NULL ORDER BY u.name`).map((r) => expertPublic(db, r))
    });
    router.add({
      method: "GET",
      path: "/experts/:id",
      group: "Каталог",
      summary: "Страница учителя: профиль, соцсети, рейтинг в каждом режиме, курсы и продукты в каталоге, прогнозы.",
      handler: ({ params }) => {
        const row = db.get(`${expertRow} WHERE u.id = ? AND u.role = 'expert'`, params.id);
        if (!row) throw notFound("Эксперт не найден");
        const courses = db.all(`SELECT * FROM courses WHERE expert_id = ? AND status = 'published' ORDER BY published_at DESC`, row.id).map((c) => courseCard(db, c));
        const products = db.all(`SELECT * FROM products WHERE expert_id = ? AND status = 'published' ORDER BY published_at DESC`, row.id).map((p) => productCard(db, p));
        return { ...expertPublic(db, row), courses, products };
      }
    });
    router.add({
      method: "GET",
      path: "/forecasts",
      group: "Каталог",
      summary: "Журнал прогнозов. Параметры: expert, status = active | success | miss | done.",
      handler: ({ query }) => {
        const expert = query.get("expert"), status = query.get("status");
        let rows = db.all(`SELECT f.*, u.name AS expert_name FROM forecasts f JOIN users u ON u.id = f.expert_id ORDER BY f.published_at DESC`);
        if (expert) rows = rows.filter((r) => r.expert_id === expert);
        if (status === "done") rows = rows.filter((r) => r.status !== "active");
        else if (status) rows = rows.filter((r) => r.status === status);
        return rows.map(forecastPublic);
      }
    });
    router.add({
      method: "GET",
      path: "/media/covers/:file",
      group: "Служебное",
      summary: "Загруженные обложки курсов.",
      handler: (ctx) => {
        if (!/^[\w-]+\.(jpg|png|webp)$/.test(ctx.params.file)) throw notFound();
        sendFile(ctx.req, ctx.res, path_default.join(app2.storageDir, "covers", ctx.params.file));
        ctx.handled = true;
      }
    });
  }

  // server/src/routes/learning.ts
  function registerLearning(app2) {
    const { db, router } = app2;
    router.add({
      method: "POST",
      path: "/courses/:id/enroll",
      group: "Ученик",
      summary: "Получить доступ к курсу. Оплата пока не подключена: цена фиксируется, деньги не списываются.",
      auth: ["student"],
      handler: ({ user, params }) => {
        const c = getCourse(db, params.id);
        if (c.status !== "published") throw notFound("Курс не найден");
        return db.tx(() => {
          const e = db.get("SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?", user.id, c.id);
          if (e?.status === "active") throw conflict("already_enrolled", "У вас уже есть доступ к этому курсу");
          const commission = Math.round(c.price * RULES.commission);
          if (e) db.run(`UPDATE enrollments SET status = 'active', price_paid = ?, commission = ?, created_at = ?, refunded_at = NULL WHERE id = ?`, c.price, commission, nowIso(), e.id);
          else db.run("INSERT INTO enrollments (id, user_id, course_id, price_paid, commission, created_at) VALUES (?, ?, ?, ?, ?, ?)", newId(), user.id, c.id, c.price, commission, nowIso());
          return { courseId: c.id, pricePaid: c.price, status: "active" };
        });
      }
    });
    router.add({
      method: "POST",
      path: "/courses/:id/refund",
      group: "Ученик",
      summary: `Вернуть курс: в течение ${RULES.refundDays} дней и если пройдено меньше ${RULES.refundMaxProgress * 100}%.`,
      auth: ["student"],
      handler: ({ user, params }) => {
        const e = db.get(`SELECT * FROM enrollments WHERE user_id = ? AND course_id = ? AND status = 'active'`, user.id, params.id);
        if (!e) throw notFound("Активная покупка не найдена");
        if (daysBetween(e.created_at) > RULES.refundDays) throw conflict("refund_expired", `Возврат возможен в течение ${RULES.refundDays} дней после покупки`);
        const p = progressOf(db, user.id, params.id);
        if (p.total && p.done / p.total >= RULES.refundMaxProgress) throw conflict("refund_progress", `Возврат невозможен: пройдено ${p.percent}% курса`);
        db.run(`UPDATE enrollments SET status = 'refunded', refunded_at = ? WHERE id = ?`, nowIso(), e.id);
        return { courseId: params.id, refunded: e.price_paid };
      }
    });
    router.add({
      method: "GET",
      path: "/me/learning",
      group: "Ученик",
      summary: "Мои курсы с прогрессом и курс «в процессе».",
      auth: ["student"],
      handler: ({ user }) => {
        const rows = db.all(`SELECT c.*, e.created_at AS enrolled_at FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? AND e.status = 'active' ORDER BY e.created_at DESC`, user.id);
        const list = rows.map((c) => ({ ...courseCard(db, c), enrolledAt: c.enrolled_at, progress: progressOf(db, user.id, c.id) }));
        return { courses: list, inProgress: list.find((c) => c.progress.done < c.progress.total) ?? list[0] ?? null };
      }
    });
    router.add({
      method: "GET",
      path: "/learning/courses/:id",
      group: "Ученик",
      summary: "Содержимое купленного курса: уроки, отметки о прохождении, ссылки на видео.",
      auth: "user",
      handler: ({ user, params }) => {
        const c = getCourse(db, params.id);
        const allowed = user.role === "moderator" || c.expert_id === user.id || hasActiveEnrollment(db, user.id, c.id) && isLive(c);
        if (!allowed) throw forbidden("Сначала получите доступ к курсу");
        const done = new Set(db.all("SELECT lesson_id FROM lesson_progress WHERE user_id = ?", user.id).map((r) => r.lesson_id));
        return { ...courseCard(db, c), modules: structure(db, c.id, "student", done), progress: progressOf(db, user.id, c.id) };
      }
    });
    router.add({
      method: "POST",
      path: "/lessons/:id/complete",
      group: "Ученик",
      summary: "Отметить урок пройденным. Уроки проходятся по порядку.",
      auth: ["student"],
      handler: ({ user, params }) => {
        const { course } = lessonContext(db, params.id);
        if (!hasActiveEnrollment(db, user.id, course.id) || !isLive(course)) throw forbidden("Сначала получите доступ к курсу");
        const order = db.all(`SELECT l.id FROM modules m JOIN lessons l ON l.module_id = m.id WHERE m.course_id = ? ORDER BY m.position, l.position`, course.id).map((r) => r.id);
        const done = new Set(db.all("SELECT lesson_id FROM lesson_progress WHERE user_id = ?", user.id).map((r) => r.lesson_id));
        const idx = order.indexOf(params.id);
        if (order.slice(0, idx).some((id) => !done.has(id))) throw conflict("previous_lessons", "Сначала завершите предыдущие уроки");
        db.run("INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)", user.id, params.id, nowIso());
        return progressOf(db, user.id, course.id);
      }
    });
    router.add({
      method: "GET",
      path: "/lessons/:id/video",
      group: "Ученик",
      summary: "Видео урока с перемоткой (Range). Для тега <video> токен можно передать как ?token=. Бесплатные уроки опубликованных курсов доступны всем.",
      handler: (ctx) => {
        const { lesson, course } = lessonContext(db, ctx.params.id);
        const v = db.get("SELECT * FROM videos WHERE lesson_id = ?", lesson.id);
        if (!v) throw notFound("В уроке пока нет видео");
        if (!canWatch(db, ctx.user, course, lesson)) throw ctx.user ? forbidden("Видео доступно после покупки курса") : new HttpError(401, "unauthorized", "Нужно войти в аккаунт");
        sendFile(ctx.req, ctx.res, videoFile(app2, v.file_name), v.mime);
        ctx.handled = true;
      }
    });
    router.add({
      method: "POST",
      path: "/courses/:id/reviews",
      group: "Ученик",
      summary: "Оставить отзыв о купленном курсе (один на курс).",
      auth: ["student"],
      body: "{ rating: 1–5, text: 10–1500 символов }",
      handler: ({ user, params, body }) => {
        const c = getCourse(db, params.id);
        if (!hasActiveEnrollment(db, user.id, c.id)) throw forbidden("Отзыв может оставить только ученик, купивший курс");
        const b = parse(body, { rating: num({ int: true, min: 1, max: 5 }), text: str({ min: 10, max: 1500 }) });
        const id = newId();
        db.run("INSERT INTO reviews (id, course_id, user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, c.id, user.id, b.rating, b.text, nowIso());
        return { id, rating: b.rating, text: b.text };
      }
    });
  }

  // server/src/routes/studio-courses.ts
  var E = ["expert"];
  function registerStudioCourses(app2) {
    const { db, router } = app2;
    const detail = (id) => {
      const c = db.get("SELECT * FROM courses WHERE id = ?", id);
      const lessons = lessonsOf(db, id);
      const stats = courseStats(db, id);
      return {
        ...courseCard(db, c),
        moderationNote: c.moderation_note,
        submittedAt: c.submitted_at,
        modules: structure(db, id, "owner"),
        checklist: checklist(c, lessons),
        rules: {
          canEdit: c.status !== "review",
          canDeleteLessons: c.status === "draft",
          canDeleteVideo: c.status === "draft",
          canDelete: c.status !== "review" && stats.students === 0 && !db.get("SELECT 1 FROM enrollments WHERE course_id = ?", id),
          freeLessonsLeft: RULES.maxFreeLessons - lessons.filter((l) => l.is_free === 1).length
        }
      };
    };
    const ownModule = (user, moduleId) => {
      const m = db.get("SELECT * FROM modules WHERE id = ?", moduleId);
      if (!m) throw notFound("Модуль не найден");
      return { module: m, course: ownCourse(db, user, m.course_id) };
    };
    const deleteLessonFiles = (lessonIds) => {
      for (const id of lessonIds) removeVideoFile(app2, db.get("SELECT file_name FROM videos WHERE lesson_id = ?", id)?.file_name);
    };
    const assertDraft = (c, what) => {
      assertEditable(c);
      if (isLive(c)) throw conflict("course_live", `${what} нельзя: курс уже продаётся и ученики его проходят.`);
    };
    router.add({
      method: "GET",
      path: "/studio/courses",
      group: "Студия: курсы",
      summary: "Мои курсы во всех статусах.",
      auth: E,
      handler: ({ user, query }) => {
        const status = query.get("status");
        return db.all("SELECT * FROM courses WHERE expert_id = ? ORDER BY updated_at DESC", user.id).filter((c) => !status || c.status === status).map((c) => {
          const list = checklist(c, lessonsOf(db, c.id));
          return { ...courseCard(db, c), checklistLeft: list.filter((x) => !x.ok).length };
        });
      }
    });
    router.add({
      method: "POST",
      path: "/studio/courses",
      group: "Студия: курсы",
      summary: "Создать черновик курса (с первым модулем).",
      auth: E,
      body: "{ title?, category? }",
      handler: (ctx) => {
        const { user, body } = ctx;
        const b = parse(body, { title: str({ max: 90, optional: true }), category: oneOf(CATEGORIES, { optional: true }) });
        const id = newId(), now = nowIso();
        db.tx(() => {
          db.run("INSERT INTO courses (id, expert_id, title, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", id, user.id, b.title ?? "", b.category ?? "beginner", now, now);
          db.run("INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, 1)", newId(), id, "Модуль 1");
        });
        ctx.status = 201;
        return detail(id);
      }
    });
    router.add({
      method: "GET",
      path: "/studio/courses/:id",
      group: "Студия: курсы",
      summary: "Курс для редактора: программа, видео, чек-лист модерации, что сейчас разрешено.",
      auth: E,
      handler: ({ user, params }) => {
        ownCourse(db, user, params.id);
        return detail(params.id);
      }
    });
    router.add({
      method: "PATCH",
      path: "/studio/courses/:id",
      group: "Студия: курсы",
      summary: "Изменить название, направление, описание, цену или обложку из библиотеки. Закрыто, пока курс на модерации. Новая цена действует для новых покупок.",
      auth: E,
      body: '{ title?, category?, description?, price? (тенге, null — не указана), cover? ("foundations" | "analytics" | "workshop" | null) }',
      handler: ({ user, params, body }) => {
        const c = ownCourse(db, user, params.id);
        assertEditable(c);
        const b = parse(body, {
          title: str({ max: 90, optional: true }),
          category: oneOf(CATEGORIES, { optional: true }),
          description: str({ max: 1500, optional: true }),
          price: num({ int: true, min: 0, max: 1e7, optional: true, nullable: true }),
          cover: oneOf(COVER_LIBRARY, { optional: true, nullable: true })
        });
        const cols = { title: "title", category: "category", description: "description", price: "price", cover: "cover" };
        db.tx(() => {
          for (const [k, col] of Object.entries(cols)) if (k in b) db.run(`UPDATE courses SET ${col} = ? WHERE id = ?`, b[k], c.id);
          if ("cover" in b && c.cover?.startsWith("upload:")) fs_default.rmSync(path_default.join(app2.storageDir, "covers", c.cover.slice(7)), { force: true });
          touch(db, c.id);
        });
        return detail(c.id);
      }
    });
    router.add({
      method: "PUT",
      path: "/studio/courses/:id/cover",
      group: "Студия: курсы",
      summary: "Загрузить свою обложку. Тело запроса — сам файл (JPG, PNG или WEBP до 5 МБ), Content-Type картинки.",
      auth: E,
      raw: true,
      body: "двоичный файл картинки",
      handler: async ({ user, params, req }) => {
        const c = ownCourse(db, user, params.id);
        assertEditable(c);
        const type = String(req.headers["content-type"] || "").split(";")[0];
        const ext = IMAGE_TYPES[type];
        if (!ext) throw new HttpError(415, "unsupported_type", "Нужна картинка JPG, PNG или WEBP");
        const file = `${c.id}-${Date.now()}${ext}`;
        await receiveFile(req, path_default.join(app2.storageDir, "covers", file), RULES.maxCoverBytes);
        const old = db.get("SELECT cover FROM courses WHERE id = ?", c.id)?.cover;
        db.run("UPDATE courses SET cover = ?, updated_at = ? WHERE id = ?", "upload:" + file, nowIso(), c.id);
        if (old?.startsWith("upload:")) fs_default.rmSync(path_default.join(app2.storageDir, "covers", old.slice(7)), { force: true });
        return detail(c.id);
      }
    });
    router.add({
      method: "DELETE",
      path: "/studio/courses/:id",
      group: "Студия: курсы",
      summary: "Удалить курс вместе с видео. Нельзя, если курс купили или он на модерации.",
      auth: E,
      handler: ({ user, params }) => {
        const c = ownCourse(db, user, params.id);
        assertEditable(c);
        if (db.get("SELECT 1 FROM enrollments WHERE course_id = ?", c.id)) throw conflict("course_has_students", "Курс купили ученики, его можно только скрыть из каталога.");
        const files = db.all(`SELECT v.file_name FROM videos v JOIN lessons l ON l.id = v.lesson_id JOIN modules m ON m.id = l.module_id WHERE m.course_id = ?`, c.id);
        db.run("DELETE FROM courses WHERE id = ?", c.id);
        files.forEach((f) => removeVideoFile(app2, f.file_name));
        if (c.cover?.startsWith("upload:")) fs_default.rmSync(path_default.join(app2.storageDir, "covers", c.cover.slice(7)), { force: true });
      }
    });
    const transition = (p, summary, fn) => router.add({
      method: "POST",
      path: `/studio/courses/:id/${p}`,
      group: "Студия: курсы",
      summary,
      auth: E,
      handler: ({ user, params }) => {
        const c = ownCourse(db, user, params.id);
        db.tx(() => fn(c, user));
        return detail(c.id);
      }
    });
    transition("submit", "Отправить черновик на модерацию. Нужны подтверждённый профиль и выполненный чек-лист.", (c, user) => {
      if (c.status !== "draft") throw conflict("bad_status", "На модерацию отправляется только черновик");
      assertVerifiedExpert(db, user, "Отправлять курсы на модерацию");
      const left = checklist(c, lessonsOf(db, c.id)).filter((x) => !x.ok);
      if (left.length) throw new HttpError(422, "checklist", "Курс ещё не готов к модерации", left.map((x) => x.label));
      db.run(`UPDATE courses SET status = 'review', submitted_at = ?, moderation_note = NULL, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), c.id);
    });
    transition("withdraw", "Отозвать курс с модерации обратно в черновики.", (c) => {
      if (c.status !== "review") throw conflict("bad_status", "Курс не на модерации");
      db.run(`UPDATE courses SET status = 'draft', submitted_at = NULL, updated_at = ? WHERE id = ?`, nowIso(), c.id);
    });
    transition("hide", "Скрыть курс из каталога. Купившие сохраняют доступ.", (c) => {
      if (c.status !== "published") throw conflict("bad_status", "Скрыть можно только курс из каталога");
      db.run(`UPDATE courses SET status = 'hidden', updated_at = ? WHERE id = ?`, nowIso(), c.id);
    });
    transition("unhide", "Вернуть скрытый курс в каталог.", (c) => {
      if (c.status !== "hidden") throw conflict("bad_status", "Курс не скрыт");
      db.run(`UPDATE courses SET status = 'published', updated_at = ? WHERE id = ?`, nowIso(), c.id);
    });
    router.add({
      method: "POST",
      path: "/studio/courses/:id/modules",
      group: "Студия: программа",
      summary: "Добавить модуль. В опубликованный курс тоже можно.",
      auth: E,
      body: "{ title? }",
      handler: ({ user, params, body }) => {
        const c = ownCourse(db, user, params.id);
        assertEditable(c);
        const b = parse(body, { title: str({ max: 80, optional: true }) });
        const pos = (db.get("SELECT MAX(position) AS p FROM modules WHERE course_id = ?", c.id)?.p ?? 0) + 1;
        db.run("INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, ?)", newId(), c.id, b.title ?? `Модуль ${pos}`, pos);
        touch(db, c.id);
        return detail(c.id);
      }
    });
    router.add({
      method: "PATCH",
      path: "/studio/modules/:id",
      group: "Студия: программа",
      summary: "Переименовать модуль.",
      auth: E,
      body: "{ title }",
      handler: ({ user, params, body }) => {
        const { course } = ownModule(user, params.id);
        assertEditable(course);
        const b = parse(body, { title: str({ max: 80 }) });
        db.run("UPDATE modules SET title = ? WHERE id = ?", b.title, params.id);
        touch(db, course.id);
        return detail(course.id);
      }
    });
    router.add({
      method: "DELETE",
      path: "/studio/modules/:id",
      group: "Студия: программа",
      summary: "Удалить модуль с уроками и видео. Только в черновике; последний модуль удалить нельзя.",
      auth: E,
      handler: ({ user, params }) => {
        const { course } = ownModule(user, params.id);
        assertDraft(course, "Удалять модули");
        if (db.get("SELECT COUNT(*) AS n FROM modules WHERE course_id = ?", course.id).n <= 1) throw conflict("last_module", "В курсе должен остаться хотя бы один модуль");
        const ids = db.all("SELECT id FROM lessons WHERE module_id = ?", params.id).map((r) => r.id);
        deleteLessonFiles(ids);
        db.run("DELETE FROM modules WHERE id = ?", params.id);
        touch(db, course.id);
        return detail(course.id);
      }
    });
    router.add({
      method: "POST",
      path: "/studio/modules/:id/lessons",
      group: "Студия: программа",
      summary: "Добавить урок в модуль.",
      auth: E,
      body: "{ title? }",
      handler: ({ user, params, body }) => {
        const { course } = ownModule(user, params.id);
        assertEditable(course);
        const b = parse(body, { title: str({ max: 100, optional: true }) });
        const pos = (db.get("SELECT MAX(position) AS p FROM lessons WHERE module_id = ?", params.id)?.p ?? 0) + 1;
        const id = newId();
        db.run("INSERT INTO lessons (id, module_id, title, position, created_at) VALUES (?, ?, ?, ?, ?)", id, params.id, b.title ?? "", pos, nowIso());
        touch(db, course.id);
        return { lessonId: id, course: detail(course.id) };
      }
    });
    router.add({
      method: "PATCH",
      path: "/studio/lessons/:id",
      group: "Студия: программа",
      summary: `Переименовать урок или открыть его бесплатно (не больше ${RULES.maxFreeLessons} в курсе).`,
      auth: E,
      body: "{ title?, isFree? }",
      handler: ({ user, params, body }) => {
        const { lesson, course } = ownLesson(db, user, params.id);
        assertEditable(course);
        const b = parse(body, { title: str({ max: 100, optional: true }), isFree: bool({ optional: true }) });
        db.tx(() => {
          if (b.title !== void 0) db.run("UPDATE lessons SET title = ? WHERE id = ?", b.title, lesson.id);
          if (b.isFree === true && lesson.is_free === 0) {
            const free = lessonsOf(db, course.id).filter((l) => l.is_free === 1).length;
            if (free >= RULES.maxFreeLessons) throw conflict("free_limit", `Бесплатных уроков может быть не больше ${RULES.maxFreeLessons}`);
          }
          if (b.isFree !== void 0) db.run("UPDATE lessons SET is_free = ? WHERE id = ?", b.isFree, lesson.id);
          touch(db, course.id);
        });
        return detail(course.id);
      }
    });
    router.add({
      method: "POST",
      path: "/studio/lessons/:id/move",
      group: "Студия: программа",
      summary: "Переставить урок выше или ниже внутри модуля.",
      auth: E,
      body: '{ direction: "up" | "down" }',
      handler: ({ user, params, body }) => {
        const { lesson, course } = ownLesson(db, user, params.id);
        assertEditable(course);
        const b = parse(body, { direction: oneOf(["up", "down"]) });
        const list = db.all("SELECT id, position FROM lessons WHERE module_id = ? ORDER BY position", lesson.module_id);
        const i = list.findIndex((l) => l.id === lesson.id), j = i + (b.direction === "up" ? -1 : 1);
        if (j < 0 || j >= list.length) throw conflict("cannot_move", "Урок уже на краю модуля");
        db.tx(() => {
          db.run("UPDATE lessons SET position = ? WHERE id = ?", list[j].position, list[i].id);
          db.run("UPDATE lessons SET position = ? WHERE id = ?", list[i].position, list[j].id);
          touch(db, course.id);
        });
        return detail(course.id);
      }
    });
    router.add({
      method: "DELETE",
      path: "/studio/lessons/:id",
      group: "Студия: программа",
      summary: "Удалить урок с видео. Только в черновике: из опубликованного курса уроки не удаляются.",
      auth: E,
      handler: ({ user, params }) => {
        const { lesson, course } = ownLesson(db, user, params.id);
        assertDraft(course, "Удалять уроки");
        deleteLessonFiles([lesson.id]);
        db.run("DELETE FROM lessons WHERE id = ?", lesson.id);
        touch(db, course.id);
        return detail(course.id);
      }
    });
    router.add({
      method: "PUT",
      path: "/studio/lessons/:id/video",
      group: "Студия: видео",
      summary: "Загрузить или заменить видео урока. Тело запроса — сам файл (MP4, MOV или WEBM до 4 ГБ). Заголовки: Content-Type видео, X-File-Name (имя файла, закодированное encodeURIComponent), X-Duration (секунды, если известны).",
      auth: E,
      raw: true,
      body: "двоичный файл видео",
      handler: async ({ user, params, req }) => {
        const { lesson, course } = ownLesson(db, user, params.id);
        assertEditable(course);
        const type = String(req.headers["content-type"] || "").split(";")[0].trim();
        const ext = VIDEO_TYPES[type];
        if (!ext) throw new HttpError(415, "unsupported_type", "Нужен видеофайл MP4, MOV или WEBM");
        let original = "video" + ext;
        try {
          if (req.headers["x-file-name"]) original = decodeURIComponent(String(req.headers["x-file-name"])).slice(0, 200);
        } catch {
        }
        const dur = Number(req.headers["x-duration"]);
        const file = `${course.id}/${lesson.id}-${Date.now()}${ext}`;
        const size = await receiveFile(req, path_default.join(app2.storageDir, "videos", file), RULES.maxVideoBytes);
        const fresh = db.get("SELECT c.status FROM lessons l JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id WHERE l.id = ?", lesson.id);
        if (!fresh || fresh.status === "review") {
          removeVideoFile(app2, file);
          throw fresh ? conflict("course_in_review", "Курс отправлен на модерацию во время загрузки") : notFound("Урок удалён во время загрузки");
        }
        const old = db.get("SELECT file_name FROM videos WHERE lesson_id = ?", lesson.id);
        db.run(
          `INSERT INTO videos (lesson_id, file_name, original_name, mime, size, duration, uploaded_at, updated_after_publish) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (lesson_id) DO UPDATE SET file_name = excluded.file_name, original_name = excluded.original_name, mime = excluded.mime,
           size = excluded.size, duration = excluded.duration, uploaded_at = excluded.uploaded_at, updated_after_publish = excluded.updated_after_publish`,
          lesson.id,
          file,
          original,
          type,
          size,
          Number.isFinite(dur) && dur > 0 ? dur : null,
          nowIso(),
          isLive(course)
        );
        if (old) removeVideoFile(app2, old.file_name);
        touch(db, course.id);
        return { lessonId: lesson.id, name: original, size, mime: type, duration: Number.isFinite(dur) && dur > 0 ? dur : null, updatedAfterPublish: isLive(course) };
      }
    });
    router.add({
      method: "DELETE",
      path: "/studio/lessons/:id/video",
      group: "Студия: видео",
      summary: "Удалить видео урока. Только в черновике: в опубликованном курсе видео можно только заменить.",
      auth: E,
      handler: ({ user, params }) => {
        const { lesson, course } = ownLesson(db, user, params.id);
        assertEditable(course);
        if (isLive(course)) throw conflict("course_live", "В опубликованном курсе видео можно только заменить");
        const v = db.get("SELECT file_name FROM videos WHERE lesson_id = ?", lesson.id);
        if (!v) throw notFound("В уроке нет видео");
        db.run("DELETE FROM videos WHERE lesson_id = ?", lesson.id);
        removeVideoFile(app2, v.file_name);
        touch(db, course.id);
        return detail(course.id);
      }
    });
  }

  // server/src/routes/studio-forecasts.ts
  var E2 = ["expert"];
  var forecastView = (db, f) => ({
    id: f.id,
    ticker: f.ticker,
    name: f.name,
    direction: f.direction,
    startPrice: f.start_price,
    targetPrice: f.target_price,
    changePercent: Math.round((f.target_price - f.start_price) / f.start_price * 1e3) / 10,
    deadline: f.deadline,
    rationale: f.rationale,
    status: f.status,
    resultPrice: f.result_price,
    publishedAt: f.published_at,
    resolvedAt: f.resolved_at,
    condition: `Цена закрытия ${f.ticker} на ${f.deadline} ${f.direction === "up" ? "не ниже" : "не выше"} $${f.target_price}`,
    comments: db.all("SELECT id, text, created_at AS createdAt FROM forecast_comments WHERE forecast_id = ? ORDER BY created_at", f.id),
    memo: forecastMemo(f),
    anchor: forecastAnchor(db, f.id)
  });
  function registerStudioForecasts(app2) {
    const { db, router } = app2;
    router.add({
      method: "POST",
      path: "/studio/forecasts/:id/anchor",
      group: "Студия: прогнозы",
      summary: "Сохранить ссылку на транзакцию Solana, в которой зафиксированы условия прогноза (memo). Делается один раз.",
      auth: E2,
      body: '{ signature, wallet, cluster: "devnet" }',
      handler: ({ user, params, body }) => {
        const f = db.get("SELECT * FROM forecasts WHERE id = ? AND expert_id = ?", params.id, user.id);
        if (!f) throw notFound("Прогноз не найден");
        if (db.get("SELECT 1 FROM forecast_anchors WHERE forecast_id = ?", f.id)) throw conflict("already_anchored", "Прогноз уже зафиксирован в Solana");
        const b = parse(body, {
          signature: str({ min: 60, max: 100, pattern: /^[1-9A-HJ-NP-Za-km-z]+$/, patternMsg: "Некорректная подпись транзакции" }),
          wallet: str({ min: 30, max: 50, pattern: /^[1-9A-HJ-NP-Za-km-z]+$/, patternMsg: "Некорректный адрес кошелька" }),
          cluster: oneOf(["devnet", "mainnet-beta"])
        });
        db.run("INSERT INTO forecast_anchors (forecast_id, cluster, signature, wallet, memo, created_at) VALUES (?, ?, ?, ?, ?, ?)", f.id, b.cluster, b.signature, b.wallet, forecastMemo(f), nowIso());
        return forecastView(db, f);
      }
    });
    router.add({
      method: "GET",
      path: "/studio/forecasts",
      group: "Студия: прогнозы",
      summary: "Мои прогнозы и статистика.",
      auth: E2,
      handler: ({ user }) => {
        const rows = db.all("SELECT * FROM forecasts WHERE expert_id = ? ORDER BY published_at DESC", user.id);
        const done = rows.filter((r) => r.status !== "active"), ok = done.filter((r) => r.status === "success").length;
        return {
          stats: { open: rows.length - done.length, openLimit: RULES.maxOpenForecasts, done: done.length, success: ok, successRate: done.length ? Math.round(ok / done.length * 1e3) / 10 : null },
          forecasts: rows.map((f) => forecastView(db, f))
        };
      }
    });
    router.add({
      method: "POST",
      path: "/studio/forecasts",
      group: "Студия: прогнозы",
      summary: `Опубликовать прогноз. После публикации его нельзя изменить или удалить. Лимиты: ${RULES.maxOpenForecasts} открытых, по одному тикеру — один открытый.`,
      auth: E2,
      body: '{ ticker, name, direction: "up" | "down", startPrice, targetPrice, deadline: "ГГГГ-ММ-ДД" (от завтра до года), rationale (от 120 символов), acknowledged: true }',
      handler: (ctx) => {
        const user = ctx.user;
        assertVerifiedExpert(db, user, "Публиковать прогнозы");
        const b = parse(ctx.body, {
          ticker: str({ pattern: /^[A-Za-z0-9.]{1,6}$/, patternMsg: "От 1 до 6 латинских букв или цифр" }),
          name: str({ min: 2, max: 60 }),
          direction: oneOf(["up", "down"]),
          startPrice: num({ gt: 0, max: 1e7 }),
          targetPrice: num({ gt: 0, max: 1e7 }),
          deadline: date(),
          rationale: str({ min: RULES.rationaleMin, max: 2e3 }),
          acknowledged: bool()
        });
        const errors = {};
        if (!b.acknowledged) errors.acknowledged = "Подтвердите, что понимаете: прогноз нельзя изменить или удалить";
        if (b.direction === "up" && b.targetPrice <= b.startPrice) errors.targetPrice = "Для роста цель должна быть выше текущей цены";
        if (b.direction === "down" && b.targetPrice >= b.startPrice) errors.targetPrice = "Для снижения цель должна быть ниже текущей цены";
        if (b.deadline < addDays(1) || b.deadline > addDays(RULES.forecastMaxDays)) errors.deadline = `Дата проверки: от завтра до ${RULES.forecastMaxDays} дней вперёд`;
        if (Object.keys(errors).length) throw new HttpError(422, "validation", "Проверьте поля", errors);
        const ticker = b.ticker.toUpperCase(), id = newId();
        db.tx(() => {
          const open = db.get(`SELECT COUNT(*) AS n FROM forecasts WHERE expert_id = ? AND status = 'active'`, user.id).n;
          if (open >= RULES.maxOpenForecasts) throw conflict("forecast_limit", `Открыто ${open} прогнозов из ${RULES.maxOpenForecasts}. Новый можно опубликовать, когда завершится один из открытых.`);
          if (db.get(`SELECT 1 FROM forecasts WHERE expert_id = ? AND ticker = ? AND status = 'active'`, user.id, ticker)) throw conflict("forecast_ticker_open", `По ${ticker} уже есть открытый прогноз. Дождитесь его итога.`);
          db.run(
            `INSERT INTO forecasts (id, expert_id, ticker, name, direction, start_price, target_price, deadline, rationale, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id,
            user.id,
            ticker,
            b.name,
            b.direction,
            b.startPrice,
            b.targetPrice,
            b.deadline,
            b.rationale,
            nowIso()
          );
        });
        ctx.status = 201;
        return forecastView(db, db.get("SELECT * FROM forecasts WHERE id = ?", id));
      }
    });
    router.add({
      method: "POST",
      path: "/studio/forecasts/:id/comments",
      group: "Студия: прогнозы",
      summary: "Добавить комментарий к своему открытому прогнозу. Условия прогноза не меняются.",
      auth: E2,
      body: "{ text: 10–600 символов }",
      handler: ({ user, params, body }) => {
        const f = db.get("SELECT * FROM forecasts WHERE id = ?", params.id);
        if (!f || f.expert_id !== user.id) throw notFound("Прогноз не найден");
        if (f.status !== "active") throw conflict("forecast_resolved", "Комментировать можно только открытый прогноз");
        const b = parse(body, { text: str({ min: 10, max: 600 }) });
        db.run("INSERT INTO forecast_comments (id, forecast_id, text, created_at) VALUES (?, ?, ?, ?)", newId(), f.id, b.text, nowIso());
        return forecastView(db, f);
      }
    });
    for (const method of ["PATCH", "DELETE"]) router.add({
      method,
      path: "/studio/forecasts/:id",
      group: "Студия: прогнозы",
      summary: method === "PATCH" ? "Изменить прогноз нельзя — всегда 409." : "Удалить прогноз нельзя — всегда 409.",
      auth: E2,
      handler: () => {
        throw conflict("forecast_immutable", "Опубликованный прогноз нельзя изменить или удалить. Можно добавить комментарий.");
      }
    });
  }

  // server/src/routes/studio-other.ts
  var E3 = ["expert"];
  var MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  var SALES = `
  SELECT * FROM (
    SELECT e.created_at, e.price_paid, e.commission, c.id AS item_id, c.title, 'course' AS kind, u.name AS user_name, c.expert_id
      FROM enrollments e JOIN courses c ON c.id = e.course_id JOIN users u ON u.id = e.user_id WHERE e.status = 'active'
    UNION ALL
    SELECT pp.created_at, pp.price_paid, pp.commission, p.id, p.title, 'product', u.name, p.expert_id
      FROM product_purchases pp JOIN products p ON p.id = pp.product_id JOIN users u ON u.id = pp.user_id WHERE pp.status = 'active'
    UNION ALL
    SELECT r.created_at, r.price_paid, r.commission, p.id, p.title, 'renewal', u.name, p.expert_id
      FROM product_renewals r JOIN product_purchases pp ON pp.id = r.purchase_id JOIN products p ON p.id = pp.product_id JOIN users u ON u.id = pp.user_id WHERE pp.status = 'active'
  ) WHERE expert_id = ?`;
  var SOCIAL_HOSTS = { telegram: /^(t\.me|telegram\.me)$/, instagram: /(^|\.)instagram\.com$/, youtube: /(^|\.)(youtube\.com|youtu\.be)$/, linkedin: /(^|\.)linkedin\.com$/, website: /./ };
  var HANDLE_BASE = { telegram: "https://t.me/", instagram: "https://instagram.com/", youtube: "https://youtube.com/@" };
  function normalizeSocial(key, raw) {
    const v = raw.trim();
    if (!v) return "";
    const handle2 = /^@?([A-Za-z0-9_.]{2,40})$/.exec(v);
    if (handle2 && HANDLE_BASE[key]) return HANDLE_BASE[key] + handle2[1];
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(v) ? v : "https://" + v);
    } catch {
      throw new HttpError(422, "validation", "Проверьте поля", { [key]: "Нужна ссылка или @ник" });
    }
    if (!SOCIAL_HOSTS[key].test(url.hostname.replace(/^www\./, ""))) throw new HttpError(422, "validation", "Проверьте поля", { [key]: "Ссылка ведёт не на ту соцсеть" });
    url.protocol = "https:";
    return url.toString();
  }
  function registerStudioOther(app2) {
    const { db, router } = app2;
    const profile = (userId) => {
      const r = db.get("SELECT u.name, u.email, u.avatar_file, p.* FROM users u JOIN expert_profiles p ON p.user_id = u.id WHERE u.id = ?", userId);
      return {
        name: r.name,
        email: r.email,
        specialization: r.specialization,
        bio: r.bio,
        experience: r.experience,
        achievements: JSON.parse(r.achievements || "[]"),
        socials: JSON.parse(r.socials || "{}"),
        avatarUrl: avatarUrl(r),
        hasOwnAvatar: !!r.avatar_file,
        verified: !!r.verified_at,
        verifiedAt: r.verified_at,
        pendingRequests: db.all(`SELECT id, field, value, created_at AS createdAt FROM profile_requests WHERE expert_id = ? AND status = 'pending' ORDER BY created_at`, userId)
      };
    };
    const monthly = (userId, months = 6) => {
      const now = /* @__PURE__ */ new Date(), out = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const s = db.get(`SELECT COUNT(*) AS n, COALESCE(SUM(price_paid), 0) AS gross, COALESCE(SUM(commission), 0) AS fee FROM (${SALES}) WHERE substr(created_at, 1, 7) = ?`, userId, key);
        out.push({ month: key, label: MONTHS[d.getMonth()], gross: s.gross, commission: s.fee, net: s.gross - s.fee, sales: s.n });
      }
      return out;
    };
    router.add({
      method: "GET",
      path: "/studio/overview",
      group: "Студия: обзор",
      summary: "Сводка кабинета: ученики, продажи, рейтинг, ближайшие встречи и список «Требует внимания».",
      auth: E3,
      handler: ({ user }) => {
        const id = user.id;
        const courses = db.all("SELECT * FROM courses WHERE expert_id = ?", id);
        const products = db.all("SELECT * FROM products WHERE expert_id = ?", id);
        const live = [...courses, ...products].filter((c) => c.status === "published" || c.status === "hidden");
        const ratings = expertRatings(db, id);
        const months = monthly(id, 2);
        const attention = [];
        const items = [
          ...courses.map((c) => ({ row: c, left: checklist(c, lessonsOf(db, c.id)).filter((x) => !x.ok).length, link: `/studio/courses/${c.id}`, empty: "Новый курс" })),
          ...products.map((p) => ({ row: p, left: productChecklist(db, p).filter((x) => !x.ok).length, link: `/studio/products/${p.id}`, empty: "Новый продукт" }))
        ];
        for (const it of items.filter((x) => x.row.status === "draft")) {
          attention.push({ type: "draft", title: it.row.title || it.empty, detail: it.left ? `До модерации осталось пунктов: ${it.left}` : "Готов к отправке на модерацию", link: it.link });
          if (it.row.moderation_note) attention.push({ type: "rejected", title: it.row.title || it.empty, detail: `Модерация вернула: ${it.row.moderation_note}`, link: it.link });
        }
        for (const it of items.filter((x) => x.row.status === "review")) attention.push({ type: "review", title: it.row.title, detail: `На модерации с ${it.row.submitted_at?.slice(0, 10)}`, link: it.link });
        for (const fc of db.all(`SELECT * FROM forecasts WHERE expert_id = ? AND status = 'active' AND deadline <= ?`, id, addDays(14)))
          attention.push({ type: "forecast", title: `Прогноз ${fc.ticker}`, detail: `Проверка ${fc.deadline}`, link: "/studio/forecasts" });
        const unanswered = db.get(`SELECT COUNT(*) AS n FROM reviews r JOIN courses c ON c.id = r.course_id WHERE c.expert_id = ? AND r.reply IS NULL AND r.hidden = 0
          AND NOT EXISTS (SELECT 1 FROM review_reports rr WHERE rr.review_id = r.id AND rr.status = 'pending')`, id).n + db.get(`SELECT COUNT(*) AS n FROM product_reviews r JOIN products p ON p.id = r.product_id WHERE p.expert_id = ? AND r.reply IS NULL AND r.hidden = 0
          AND NOT EXISTS (SELECT 1 FROM product_review_reports rr WHERE rr.review_id = r.id AND rr.status = 'pending')`, id).n;
        if (unanswered) attention.push({ type: "reviews", title: `Отзывов без ответа: ${unanswered}`, detail: "Ответы видны всем ученикам", link: "/studio/reviews" });
        const bookings = db.all(
          `SELECT s.id, s.starts_at, p.id AS product_id, p.title, p.duration_min, p.meeting_url, u.name FROM product_slots s JOIN products p ON p.id = s.product_id JOIN users u ON u.id = s.booked_by
         WHERE p.expert_id = ? AND s.starts_at > ? AND s.starts_at < ? ORDER BY s.starts_at`,
          id,
          new Date(Date.now() - 2 * 36e5).toISOString(),
          new Date(Date.now() + 14 * 864e5).toISOString()
        ).map((s) => ({ slotId: s.id, startsAt: s.starts_at, productId: s.product_id, title: s.title, durationMin: s.duration_min, meetingUrl: s.meeting_url, student: shortName(s.name) }));
        return {
          verified: !!db.get("SELECT verified_at FROM expert_profiles WHERE user_id = ?", id)?.verified_at,
          students: expertStudents(db, id),
          liveCourses: live.length,
          salesThisMonth: months[1],
          salesLastMonth: months[0],
          rating: ratings.overall,
          ratings: ratings.byMode,
          reviews: ratings.reviews,
          forecasts: forecastStats(db, id),
          bookings,
          attention
        };
      }
    });
    router.add({
      method: "GET",
      path: "/studio/students",
      group: "Студия: ученики",
      summary: "Ученики курсов и покупатели продуктов: сокращённое имя и прогресс. Почта и телефоны не отдаются. Параметр item — курс или продукт.",
      auth: E3,
      handler: ({ user, query }) => {
        const item = query.get("item") || query.get("course");
        const courses = db.all(
          `SELECT e.user_id, e.course_id, e.created_at, u.name, c.title FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
         WHERE c.expert_id = ? AND e.status = 'active'`,
          user.id
        ).map((r) => {
          const last = db.get(`SELECT MAX(p.completed_at) AS t FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id JOIN modules m ON m.id = l.module_id WHERE p.user_id = ? AND m.course_id = ?`, r.user_id, r.course_id).t;
          const pr = progressOf(db, r.user_id, r.course_id);
          return { name: shortName(r.name), kind: "course", itemId: r.course_id, itemTitle: r.title, courseId: r.course_id, courseTitle: r.title, enrolledAt: r.created_at, lastActivity: last ?? r.created_at, progress: pr, status: `${pr.done} из ${pr.total} уроков` };
        });
        const products = db.all(
          `SELECT pp.*, u.name, p.title, p.type, p.mode FROM product_purchases pp JOIN users u ON u.id = pp.user_id JOIN products p ON p.id = pp.product_id
         WHERE p.expert_id = ? AND pp.status = 'active'`,
          user.id
        ).map((r) => {
          const st = purchaseState(db, r, r);
          const k = kindOf(r);
          const status = k === "sessions" ? `Назначено встреч: ${st.sessionsBooked} из ${st.sessionsTotal}` : k === "subscription" ? st.active ? `Подписка до ${String(st.expiresAt).slice(0, 10)}` : "Подписка закончилась" : "Материал открыт";
          const percent = k === "sessions" ? Math.round(st.sessionsBooked / Math.max(1, st.sessionsTotal) * 100) : k === "subscription" ? st.active ? 100 : 0 : 100;
          return { name: shortName(r.name), kind: "product", itemId: r.product_id, itemTitle: r.title, enrolledAt: r.created_at, lastActivity: r.created_at, progress: { percent }, status };
        });
        return [...courses, ...products].filter((r) => !item || r.itemId === item).sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)));
      }
    });
    router.add({
      method: "GET",
      path: "/studio/reviews",
      group: "Студия: отзывы",
      summary: "Отзывы о моих курсах и продуктах. Параметр unanswered=1 — только без ответа.",
      auth: E3,
      handler: ({ user, query }) => {
        const course = db.all(
          `SELECT r.*, u.name AS author, c.title AS item_title, c.id AS item_id, 'course' AS kind,
           (SELECT status FROM review_reports rr WHERE rr.review_id = r.id ORDER BY created_at DESC LIMIT 1) AS report_status
         FROM reviews r JOIN users u ON u.id = r.user_id JOIN courses c ON c.id = r.course_id WHERE c.expert_id = ?`,
          user.id
        );
        const product = db.all(
          `SELECT r.*, u.name AS author, p.title AS item_title, p.id AS item_id, 'product' AS kind,
           (SELECT status FROM product_review_reports rr WHERE rr.review_id = r.id ORDER BY created_at DESC LIMIT 1) AS report_status
         FROM product_reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id WHERE p.expert_id = ?`,
          user.id
        );
        return [...course, ...product].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((r) => query.get("unanswered") !== "1" || !r.reply && !r.report_status && !r.hidden).map((r) => ({ id: r.id, kind: r.kind, author: shortName(r.author), itemId: r.item_id, courseTitle: r.item_title, itemTitle: r.item_title, rating: r.rating, text: r.text, createdAt: r.created_at, reply: r.reply, repliedAt: r.replied_at, hidden: r.hidden === 1, report: r.report_status }));
      }
    });
    const ownReview = (userId, id) => {
      const c = db.get("SELECT r.* FROM reviews r JOIN courses c ON c.id = r.course_id WHERE r.id = ? AND c.expert_id = ?", id, userId);
      if (c) return { row: c, table: "reviews", reports: "review_reports" };
      const p = db.get("SELECT r.* FROM product_reviews r JOIN products p ON p.id = r.product_id WHERE r.id = ? AND p.expert_id = ?", id, userId);
      if (p) return { row: p, table: "product_reviews", reports: "product_review_reports" };
      throw notFound("Отзыв не найден");
    };
    router.add({
      method: "PUT",
      path: "/studio/reviews/:id/reply",
      group: "Студия: отзывы",
      summary: "Публичный ответ на отзыв (можно изменить). Сам отзыв эксперт изменить или удалить не может.",
      auth: E3,
      body: "{ text: 2–1000 символов }",
      handler: ({ user, params, body }) => {
        const r = ownReview(user.id, params.id);
        const b = parse(body, { text: str({ min: 2, max: 1e3 }) });
        db.run(`UPDATE ${r.table} SET reply = ?, replied_at = ? WHERE id = ?`, b.text, nowIso(), r.row.id);
        return { id: r.row.id, reply: b.text };
      }
    });
    router.add({
      method: "POST",
      path: "/studio/reviews/:id/report",
      group: "Студия: отзывы",
      summary: "Пожаловаться на отзыв. Он остаётся видимым, пока модерация не решит.",
      auth: E3,
      body: '{ reason: "spam" | "abuse" | "offtopic" | "other" }',
      handler: ({ user, params, body }) => {
        const r = ownReview(user.id, params.id);
        const b = parse(body, { reason: oneOf(["spam", "abuse", "offtopic", "other"]) });
        if (db.get(`SELECT 1 FROM ${r.reports} WHERE review_id = ? AND status = 'pending'`, r.row.id)) throw conflict("already_reported", "Жалоба уже на рассмотрении");
        db.run(`INSERT INTO ${r.reports} (id, review_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?)`, newId(), r.row.id, user.id, b.reason, nowIso());
        return { id: r.row.id, report: "pending" };
      }
    });
    for (const method of ["PATCH", "DELETE"]) router.add({
      method,
      path: "/studio/reviews/:id",
      group: "Студия: отзывы",
      summary: "Изменить или удалить отзыв эксперт не может — всегда 409.",
      auth: E3,
      handler: () => {
        throw conflict("review_immutable", "Отзывы нельзя изменить или удалить. Пожалуйтесь на отзыв, решение примет модерация.");
      }
    });
    router.add({
      method: "GET",
      path: "/studio/income",
      group: "Студия: доход",
      summary: "Продажи курсов и продуктов по месяцам, по каждому курсу и продукту, последние продажи и ближайшая выплата.",
      auth: E3,
      handler: ({ user }) => {
        const id = user.id;
        const byItem = [
          ...db.all(`SELECT * FROM courses WHERE expert_id = ? AND status IN ('published', 'hidden') ORDER BY published_at`, id).map((c) => ({ itemId: c.id, kind: "course", title: c.title, ...courseStats(db, c.id) })),
          ...db.all(`SELECT * FROM products WHERE expert_id = ? AND status IN ('published', 'hidden') ORDER BY published_at`, id).map((p) => {
            const s = productStats(db, p.id);
            return { itemId: p.id, kind: "product", title: p.title, students: s.buyers, ...s };
          })
        ];
        const recent = db.all(`${SALES} ORDER BY created_at DESC LIMIT 20`, id).map((r) => ({ date: r.created_at, kind: r.kind, itemId: r.item_id, courseId: r.item_id, courseTitle: r.title + (r.kind === "renewal" ? " · продление" : ""), student: shortName(r.user_name), amount: r.price_paid, commission: r.commission, net: r.price_paid - r.commission }));
        const refunds = db.get(`SELECT COUNT(*) AS n, COALESCE(SUM(price_paid), 0) AS sum FROM (
          SELECT e.price_paid FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.expert_id = ? AND e.status = 'refunded'
          UNION ALL SELECT pp.price_paid FROM product_purchases pp JOIN products p ON p.id = pp.product_id WHERE p.expert_id = ? AND pp.status = 'refunded')`, id, id);
        return {
          commissionRate: RULES.commission,
          months: monthly(id, 6),
          byCourse: byItem,
          byItem,
          recent,
          refunds: { count: refunds.n, amount: refunds.sum },
          nextPayout: nextPayoutDate(RULES.payoutDays),
          payoutsNote: "Выплаты подключаются после интеграции платёжной системы. Сейчас суммы расчётные."
        };
      }
    });
    router.add({
      method: "GET",
      path: "/studio/profile",
      group: "Студия: профиль",
      summary: "Мой публичный профиль, соцсети и запросы на изменение.",
      auth: E3,
      handler: ({ user }) => profile(user.id)
    });
    router.add({
      method: "PATCH",
      path: "/studio/profile",
      group: "Студия: профиль",
      summary: "Изменить специализацию, описание, достижения и соцсети. Видно ученикам сразу.",
      auth: E3,
      body: `{ specialization?, bio?, achievements?: string[], socials?: { ${SOCIALS.join(", ")} } — ссылка или @ник }`,
      handler: ({ user, body }) => {
        const b = parse(body, {
          specialization: str({ min: 2, max: 80, optional: true }),
          bio: str({ max: 800, optional: true }),
          achievements: strList({ optional: true, maxItems: 8, maxLen: 120 }),
          socials: Object.assign((v) => v && typeof v === "object" && !Array.isArray(v) ? { ok: true, value: v } : { ok: false, error: "Ожидается объект" }, { optional: true })
        });
        let socials;
        if (b.socials) {
          socials = {};
          for (const key of SOCIALS) {
            const raw = b.socials[key];
            if (typeof raw === "string" && raw.trim()) socials[key] = normalizeSocial(key, raw);
          }
        }
        db.tx(() => {
          if (b.specialization !== void 0) db.run("UPDATE expert_profiles SET specialization = ? WHERE user_id = ?", b.specialization, user.id);
          if (b.bio !== void 0) db.run("UPDATE expert_profiles SET bio = ? WHERE user_id = ?", b.bio, user.id);
          if (b.achievements !== void 0) db.run("UPDATE expert_profiles SET achievements = ? WHERE user_id = ?", JSON.stringify(b.achievements), user.id);
          if (socials) db.run("UPDATE expert_profiles SET socials = ? WHERE user_id = ?", JSON.stringify(socials), user.id);
        });
        return profile(user.id);
      }
    });
    router.add({
      method: "POST",
      path: "/studio/profile/requests",
      group: "Студия: профиль",
      summary: "Запросить изменение имени или стажа. Вступит в силу после модерации.",
      auth: E3,
      body: '{ field: "name" | "experience", value }',
      handler: ({ user, body }) => {
        const b = parse(body, { field: oneOf(["name", "experience"]), value: str({ min: 2, max: 60 }) });
        db.tx(() => {
          db.run(`UPDATE profile_requests SET status = 'rejected', decided_at = ? WHERE expert_id = ? AND field = ? AND status = 'pending'`, nowIso(), user.id, b.field);
          db.run("INSERT INTO profile_requests (id, expert_id, field, value, created_at) VALUES (?, ?, ?, ?, ?)", newId(), user.id, b.field, b.value, nowIso());
        });
        return profile(user.id);
      }
    });
  }

  // server/src/routes/moderation.ts
  var M = ["moderator"];
  function registerModeration(app2) {
    const { db, router } = app2;
    router.add({
      method: "GET",
      path: "/moderation/queue",
      group: "Модерация",
      summary: "Всё, что ждёт решения модератора.",
      auth: M,
      handler: () => ({
        courses: db.all(`SELECT * FROM courses WHERE status = 'review' ORDER BY submitted_at`).map((c) => ({ ...courseCard(db, c), submittedAt: c.submitted_at, checklist: checklist(c, lessonsOf(db, c.id)) })),
        products: db.all(`SELECT * FROM products WHERE status = 'review' ORDER BY submitted_at`).map((p) => ({ ...productCard(db, p), submittedAt: p.submitted_at, checklist: productChecklist(db, p) })),
        reports: [
          ...db.all(
            `SELECT rr.id, rr.reason, rr.created_at AS createdAt, r.id AS reviewId, r.text, r.rating, c.title AS courseTitle, u.name AS reportedBy
           FROM review_reports rr JOIN reviews r ON r.id = rr.review_id JOIN courses c ON c.id = r.course_id JOIN users u ON u.id = rr.reporter_id
           WHERE rr.status = 'pending'`
          ),
          ...db.all(
            `SELECT rr.id, rr.reason, rr.created_at AS createdAt, r.id AS reviewId, r.text, r.rating, p.title AS courseTitle, u.name AS reportedBy
           FROM product_review_reports rr JOIN product_reviews r ON r.id = rr.review_id JOIN products p ON p.id = r.product_id JOIN users u ON u.id = rr.reporter_id
           WHERE rr.status = 'pending'`
          )
        ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        profileRequests: db.all(
          `SELECT pr.id, pr.field, pr.value, pr.created_at AS createdAt, u.id AS expertId, u.name AS currentName, p.experience AS currentExperience
         FROM profile_requests pr JOIN users u ON u.id = pr.expert_id JOIN expert_profiles p ON p.user_id = u.id WHERE pr.status = 'pending' ORDER BY pr.created_at`
        ),
        unverifiedExperts: db.all(`SELECT u.id, u.name, u.email, u.created_at AS createdAt FROM users u JOIN expert_profiles p ON p.user_id = u.id WHERE p.verified_at IS NULL ORDER BY u.created_at`),
        forecastsToResolve: db.all(`SELECT f.*, u.name AS expert_name FROM forecasts f JOIN users u ON u.id = f.expert_id WHERE f.status = 'active' AND f.deadline <= ? ORDER BY f.deadline`, localDate()).map((f) => ({ ...forecastView(db, f), expert: { id: f.expert_id, name: f.expert_name } }))
      })
    });
    const reviewCourse = (id) => {
      const c = db.get("SELECT * FROM courses WHERE id = ?", id);
      if (!c) throw notFound("Курс не найден");
      if (c.status !== "review") throw conflict("bad_status", "Курс не на модерации");
      return c;
    };
    router.add({
      method: "POST",
      path: "/moderation/courses/:id/approve",
      group: "Модерация",
      summary: "Одобрить курс: он появится в каталоге.",
      auth: M,
      handler: ({ params }) => {
        const c = reviewCourse(params.id);
        db.run(`UPDATE courses SET status = 'published', published_at = COALESCE(published_at, ?), moderation_note = NULL, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), c.id);
        return courseCard(db, db.get("SELECT * FROM courses WHERE id = ?", c.id));
      }
    });
    router.add({
      method: "POST",
      path: "/moderation/courses/:id/reject",
      group: "Модерация",
      summary: "Вернуть курс эксперту с комментарием.",
      auth: M,
      body: "{ note: что исправить }",
      handler: ({ params, body }) => {
        const c = reviewCourse(params.id);
        const b = parse(body, { note: str({ min: 5, max: 1e3 }) });
        db.run(`UPDATE courses SET status = 'draft', moderation_note = ?, submitted_at = NULL, updated_at = ? WHERE id = ?`, b.note, nowIso(), c.id);
        return courseCard(db, db.get("SELECT * FROM courses WHERE id = ?", c.id));
      }
    });
    router.add({
      method: "POST",
      path: "/moderation/reports/:id/resolve",
      group: "Модерация",
      summary: "Решение по жалобе на отзыв: оставить отзыв или скрыть его.",
      auth: M,
      body: '{ action: "keep" | "remove" }',
      handler: ({ user, params, body }) => {
        let rr = db.get(`SELECT * FROM review_reports WHERE id = ?`, params.id), reports = "review_reports", reviews = "reviews";
        if (!rr) {
          rr = db.get(`SELECT * FROM product_review_reports WHERE id = ?`, params.id);
          reports = "product_review_reports";
          reviews = "product_reviews";
        }
        if (!rr) throw notFound("Жалоба не найдена");
        if (rr.status !== "pending") throw conflict("already_decided", "По жалобе уже есть решение");
        const b = parse(body, { action: oneOf(["keep", "remove"]) });
        db.tx(() => {
          db.run(`UPDATE ${reports} SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?`, b.action === "keep" ? "kept" : "removed", nowIso(), user.id, rr.id);
          if (b.action === "remove") db.run(`UPDATE ${reviews} SET hidden = 1 WHERE id = ?`, rr.review_id);
        });
        return { id: rr.id, status: b.action === "keep" ? "kept" : "removed" };
      }
    });
    router.add({
      method: "POST",
      path: "/moderation/profile-requests/:id/:decision",
      group: "Модерация",
      summary: "Одобрить (approve) или отклонить (reject) изменение имени или стажа эксперта.",
      auth: M,
      handler: ({ user, params }) => {
        if (!["approve", "reject"].includes(params.decision)) throw notFound();
        const pr = db.get("SELECT * FROM profile_requests WHERE id = ?", params.id);
        if (!pr) throw notFound("Запрос не найден");
        if (pr.status !== "pending") throw conflict("already_decided", "По запросу уже есть решение");
        db.tx(() => {
          const approved = params.decision === "approve";
          db.run("UPDATE profile_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?", approved ? "approved" : "rejected", nowIso(), user.id, pr.id);
          if (approved && pr.field === "name") db.run("UPDATE users SET name = ? WHERE id = ?", pr.value, pr.expert_id);
          if (approved && pr.field === "experience") db.run("UPDATE expert_profiles SET experience = ? WHERE user_id = ?", pr.value, pr.expert_id);
        });
        return { id: pr.id, status: params.decision === "approve" ? "approved" : "rejected" };
      }
    });
    router.add({
      method: "POST",
      path: "/moderation/experts/:id/verify",
      group: "Модерация",
      summary: "Подтвердить личность и счёт эксперта: после этого он может продавать курсы и публиковать прогнозы.",
      auth: M,
      handler: ({ params }) => {
        const p = db.get("SELECT * FROM expert_profiles WHERE user_id = ?", params.id);
        if (!p) throw notFound("Эксперт не найден");
        if (p.verified_at) throw conflict("already_verified", "Эксперт уже подтверждён");
        db.run("UPDATE expert_profiles SET verified_at = ? WHERE user_id = ?", nowIso(), params.id);
        return { id: params.id, verified: true };
      }
    });
    router.add({
      method: "POST",
      path: "/moderation/forecasts/:id/resolve",
      group: "Модерация",
      summary: "Записать цену закрытия на дату срока; итог определяется автоматически. Пока источник котировок не подключён, цену вносит модератор.",
      auth: M,
      body: "{ closePrice }",
      handler: ({ user, params, body }) => {
        const f = db.get("SELECT * FROM forecasts WHERE id = ?", params.id);
        if (!f) throw notFound("Прогноз не найден");
        if (f.status !== "active") throw conflict("forecast_resolved", "Итог прогноза уже определён");
        if (f.deadline > localDate()) throw conflict("too_early", `Итог можно записать не раньше даты проверки (${f.deadline})`);
        const b = parse(body, { closePrice: num({ gt: 0, max: 1e7 }) });
        const success = f.direction === "up" ? b.closePrice >= f.target_price : b.closePrice <= f.target_price;
        db.run("UPDATE forecasts SET status = ?, result_price = ?, resolved_at = ?, resolved_by = ? WHERE id = ?", success ? "success" : "miss", b.closePrice, nowIso(), user.id, f.id);
        return forecastView(db, db.get("SELECT * FROM forecasts WHERE id = ?", f.id));
      }
    });
  }

  // server/src/routes/products.ts
  var E4 = ["expert"];
  var S = ["student"];
  var TYPES = Object.keys(PRODUCT_TYPES);
  function registerProducts(app2) {
    const { db, router } = app2;
    const reviewsOf = (productId) => db.all(
      `SELECT r.id, u.name AS author, r.rating, r.text, r.created_at AS createdAt, r.reply, r.replied_at AS repliedAt
     FROM product_reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? AND r.hidden = 0 ORDER BY r.created_at DESC`,
      productId
    ).map((r) => ({ ...r, author: r.author.split(" ")[0] }));
    const contentFor = (p, full) => {
      if (kindOf(p) !== "material") return {};
      const text = String(p.content || "");
      if (full) return { content: text, contentLocked: false };
      const cut = text.slice(0, PRODUCT_RULES.previewChars);
      return { content: cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)) + "…", contentLocked: true };
    };
    router.add({
      method: "GET",
      path: "/catalog/products",
      group: "Каталог",
      summary: "Продукты режимов «Работа с экспертом», «Сообщество», «Идеи и аналитика». Параметры: mode, type, q, sort = popular | price | price-desc | new, free=1.",
      handler: ({ query }) => {
        const mode = query.get("mode"), type = query.get("type"), q = (query.get("q") || "").trim().toLocaleLowerCase("ru"), sort = query.get("sort") || "popular";
        let rows = db.all(`SELECT p.*, u.name AS expert_name FROM products p JOIN users u ON u.id = p.expert_id WHERE p.status = 'published'`);
        if (mode) rows = rows.filter((r) => r.mode === mode);
        if (type) rows = rows.filter((r) => r.type === type);
        if (query.get("free") === "1") rows = rows.filter((r) => r.price === 0);
        if (q) rows = rows.filter((r) => (r.title + " " + r.expert_name).toLocaleLowerCase("ru").includes(q));
        const cards = rows.map((r) => productCard(db, r));
        const by = {
          popular: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.buyers - a.buyers,
          price: (a, b) => a.price - b.price,
          "price-desc": (a, b) => b.price - a.price,
          new: (a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))
        };
        return cards.sort(by[sort] || by.popular);
      }
    });
    router.add({
      method: "GET",
      path: "/catalog/products/:id",
      group: "Каталог",
      summary: "Страница продукта: описание, ближайшие свободные слоты, начало материала, отзывы.",
      handler: ({ params, user }) => {
        const p = getProduct(db, params.id);
        if (p.status !== "published") throw notFound("Продукт не найден");
        const full = hasAccess(db, user, p);
        return {
          ...productCard(db, p),
          scheduleNote: p.schedule_note,
          ...contentFor(p, full),
          freeSlots: kindOf(p) === "sessions" ? futureFreeSlots(db, p.id, 30) : [],
          members: kindOf(p) === "subscription" ? db.get(`SELECT COUNT(*) AS n FROM product_purchases WHERE product_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)`, p.id, nowIso()).n : void 0,
          reviewsList: reviewsOf(p.id)
        };
      }
    });
    router.add({
      method: "POST",
      path: "/products/:id/buy",
      group: "Ученик: продукты",
      summary: "Купить продукт (оплата пока не подключена). Для подписки повторная покупка продлевает срок. Цена фиксируется в момент покупки.",
      auth: S,
      handler: ({ user, params }) => {
        const p = getProduct(db, params.id);
        if (p.status !== "published") throw notFound("Продукт не найден");
        const kind = kindOf(p), now = /* @__PURE__ */ new Date(), commission = Math.round(p.price * RULES.commission);
        return db.tx(() => {
          const pu = db.get("SELECT * FROM product_purchases WHERE user_id = ? AND product_id = ?", user.id, p.id);
          if (kind === "subscription") {
            const base = pu && pu.status === "active" && pu.expires_at > now.toISOString() ? new Date(pu.expires_at) : now;
            const expires = new Date(base.getTime() + p.period_days * 864e5).toISOString();
            if (pu?.status === "active") {
              const live = pu.expires_at > now.toISOString();
              db.run("UPDATE product_purchases SET expires_at = ? WHERE id = ?", expires, pu.id);
              db.run("INSERT INTO product_renewals (id, purchase_id, price_paid, commission, created_at) VALUES (?, ?, ?, ?, ?)", newId(), pu.id, p.price, commission, now.toISOString());
              return { productId: p.id, renewed: live, expiresAt: expires };
            }
            if (pu) db.run(`UPDATE product_purchases SET status = 'active', price_paid = ?, commission = ?, expires_at = ?, created_at = ?, refunded_at = NULL WHERE id = ?`, p.price, commission, expires, now.toISOString(), pu.id);
            else db.run("INSERT INTO product_purchases (id, user_id, product_id, price_paid, commission, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", newId(), user.id, p.id, p.price, commission, expires, now.toISOString());
            return { productId: p.id, renewed: false, expiresAt: expires };
          }
          if (pu?.status === "active") {
            if (kind === "sessions" && sessionsBooked(db, pu.id) >= pu.sessions_total) {
              const add = p.type === "consultation" ? 1 : p.sessions;
              db.run("UPDATE product_purchases SET sessions_total = sessions_total + ? WHERE id = ?", add, pu.id);
              db.run("INSERT INTO product_renewals (id, purchase_id, price_paid, commission, created_at) VALUES (?, ?, ?, ?, ?)", newId(), pu.id, p.price, commission, now.toISOString());
              return { productId: p.id, renewed: true };
            }
            throw conflict("already_bought", kind === "sessions" ? "У вас уже есть неиспользованные встречи по этому продукту" : "Этот материал уже у вас");
          }
          const sessions = kind === "sessions" ? p.type === "consultation" ? 1 : p.sessions : null;
          if (pu) db.run(`UPDATE product_purchases SET status = 'active', price_paid = ?, commission = ?, sessions_total = ?, created_at = ?, refunded_at = NULL WHERE id = ?`, p.price, commission, sessions, now.toISOString(), pu.id);
          else db.run("INSERT INTO product_purchases (id, user_id, product_id, price_paid, commission, sessions_total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", newId(), user.id, p.id, p.price, commission, sessions, now.toISOString());
          return { productId: p.id, renewed: false };
        });
      }
    });
    router.add({
      method: "POST",
      path: "/products/:id/refund",
      group: "Ученик: продукты",
      summary: `Вернуть пакет встреч: в течение ${PRODUCT_RULES.sessionRefundDays} дней, если ни одна встреча не назначена. Подписки и материалы не возвращаются.`,
      auth: S,
      handler: ({ user, params }) => {
        const p = getProduct(db, params.id), pu = activePurchase(db, user.id, p.id);
        if (!pu) throw notFound("Активная покупка не найдена");
        if (kindOf(p) !== "sessions") throw conflict("not_refundable", "Подписки и материалы не возвращаются: доступ открывается сразу.");
        if ((Date.now() - new Date(pu.created_at).getTime()) / 864e5 > PRODUCT_RULES.sessionRefundDays) throw conflict("refund_expired", `Возврат возможен в течение ${PRODUCT_RULES.sessionRefundDays} дней после покупки`);
        if (sessionsBooked(db, pu.id)) throw conflict("refund_used", "Возврат невозможен: встреча уже назначена. Отмените запись, если до встречи больше суток.");
        db.run(`UPDATE product_purchases SET status = 'refunded', refunded_at = ? WHERE id = ?`, nowIso(), pu.id);
        return { productId: p.id, refunded: pu.price_paid };
      }
    });
    const myBookings = (userId, productId) => db.all(
      `SELECT id, starts_at FROM product_slots WHERE product_id = ? AND booked_by = ? ORDER BY starts_at`,
      productId,
      userId
    ).map((s) => ({ id: s.id, startsAt: s.starts_at, canCancel: new Date(s.starts_at).getTime() - Date.now() >= PRODUCT_RULES.cancelHours * 36e5 }));
    router.add({
      method: "GET",
      path: "/me/products",
      group: "Ученик: продукты",
      summary: "Мои продукты по режимам: встречи и записи, подписки и сроки, материалы.",
      auth: S,
      handler: ({ user }) => db.all(`SELECT p.*, pp.id AS purchase_id FROM product_purchases pp JOIN products p ON p.id = pp.product_id WHERE pp.user_id = ? AND pp.status = 'active' ORDER BY pp.created_at DESC`, user.id).map((p) => {
        const pu = db.get("SELECT * FROM product_purchases WHERE id = ?", p.purchase_id);
        const upcoming = kindOf(p) === "sessions" ? myBookings(user.id, p.id).filter((b) => b.startsAt > nowIso()) : [];
        return { ...productCard(db, p), purchase: purchaseState(db, pu, p), upcoming };
      })
    });
    router.add({
      method: "GET",
      path: "/learning/products/:id",
      group: "Ученик: продукты",
      summary: "Купленный продукт: ссылка на встречи, мои записи и свободное время, полный текст материала.",
      auth: "user",
      handler: ({ user, params }) => {
        const p = getProduct(db, params.id);
        const pu = user.role === "student" ? activePurchase(db, user.id, p.id) : void 0;
        if (!hasAccess(db, user, p) && !pu) throw forbidden("Сначала получите доступ к продукту");
        const live = kindOf(p) !== "subscription" || subscriptionLive(pu) || user.role !== "student";
        return {
          ...productCard(db, p),
          scheduleNote: p.schedule_note,
          ...contentFor(p, true),
          meetingUrl: live ? p.meeting_url : null,
          purchase: purchaseState(db, pu, p),
          bookings: kindOf(p) === "sessions" && pu ? myBookings(user.id, p.id) : [],
          freeSlots: kindOf(p) === "sessions" ? futureFreeSlots(db, p.id, 60) : []
        };
      }
    });
    router.add({
      method: "POST",
      path: "/products/:id/book",
      group: "Ученик: продукты",
      summary: "Записаться на свободное время из расписания эксперта. Тратит одну встречу из пакета.",
      auth: S,
      body: "{ slotId }",
      handler: ({ user, params, body }) => {
        const p = getProduct(db, params.id);
        if (kindOf(p) !== "sessions") throw conflict("not_sessions", "У этого продукта нет записи на встречи");
        const b = parse(body, { slotId: str({ max: 64 }) });
        return db.tx(() => {
          const pu = activePurchase(db, user.id, p.id);
          if (!pu) throw forbidden("Сначала купите встречу");
          if (sessionsBooked(db, pu.id) >= pu.sessions_total) throw conflict("no_sessions_left", "Все встречи пакета уже назначены. Купите ещё одну, чтобы записаться.");
          const slot = db.get("SELECT * FROM product_slots WHERE id = ? AND product_id = ?", b.slotId, p.id);
          if (!slot) throw notFound("Время не найдено");
          if (slot.starts_at <= new Date(Date.now() + 36e5).toISOString()) throw conflict("slot_past", "На это время уже нельзя записаться");
          const r = db.run("UPDATE product_slots SET booked_by = ?, purchase_id = ?, booked_at = ? WHERE id = ? AND booked_by IS NULL", user.id, pu.id, nowIso(), slot.id);
          if (!Number(r.changes)) throw conflict("slot_taken", "Это время уже заняли. Выберите другое.");
          return { slotId: slot.id, startsAt: slot.starts_at, meetingUrl: p.meeting_url };
        });
      }
    });
    router.add({
      method: "POST",
      path: "/bookings/:slotId/cancel",
      group: "Ученик: продукты",
      summary: `Отменить запись. Ученик — не позже чем за ${PRODUCT_RULES.cancelHours} часа до встречи, эксперт — в любое время. Встреча возвращается в пакет.`,
      auth: ["student", "expert"],
      handler: ({ user, params }) => {
        const slot = db.get("SELECT s.*, p.expert_id FROM product_slots s JOIN products p ON p.id = s.product_id WHERE s.id = ?", params.slotId);
        if (!slot || slot.booked_by !== user.id && slot.expert_id !== user.id) throw notFound("Запись не найдена");
        if (!slot.booked_by) throw conflict("not_booked", "На это время никто не записан");
        if (user.role === "student" && new Date(slot.starts_at).getTime() - Date.now() < PRODUCT_RULES.cancelHours * 36e5)
          throw conflict("too_late", `Отменить запись можно не позже чем за ${PRODUCT_RULES.cancelHours} часа до встречи`);
        db.run("UPDATE product_slots SET booked_by = NULL, purchase_id = NULL, booked_at = NULL WHERE id = ?", slot.id);
        return { slotId: slot.id, cancelled: true };
      }
    });
    const canChat = (user, p) => {
      if (kindOf(p) !== "subscription") throw conflict("no_chat", "У этого продукта нет чата");
      if (user.role === "moderator" || p.expert_id === user.id) return;
      if (!subscriptionLive(activePurchase(db, user.id, p.id))) throw forbidden("Чат доступен участникам с действующей подпиской");
    };
    router.add({
      method: "GET",
      path: "/products/:id/messages",
      group: "Ученик: продукты",
      summary: "Сообщения клуба или чата (последние 200). Параметр after — только новые после указанного времени.",
      auth: "user",
      handler: ({ user, params, query }) => {
        const p = getProduct(db, params.id);
        canChat(user, p);
        const after = query.get("after") || "";
        return db.all(`SELECT * FROM (SELECT m.id, m.text, m.created_at, m.user_id, u.name, u.role FROM product_messages m JOIN users u ON u.id = m.user_id
        WHERE m.product_id = ? AND m.created_at > ? ORDER BY m.created_at DESC LIMIT 200) ORDER BY created_at`, p.id, after).map((m) => ({ id: m.id, text: m.text, createdAt: m.created_at, mine: m.user_id === user.id, author: m.user_id === p.expert_id ? m.name : shortName(m.name), isExpert: m.user_id === p.expert_id }));
      }
    });
    router.add({
      method: "POST",
      path: "/products/:id/messages",
      group: "Ученик: продукты",
      summary: "Написать в клуб или чат.",
      auth: "user",
      body: "{ text }",
      handler: ({ user, params, body }) => {
        const p = getProduct(db, params.id);
        canChat(user, p);
        const b = parse(body, { text: str({ min: 1, max: PRODUCT_RULES.messageMax }) });
        const id = newId(), at = nowIso();
        db.run("INSERT INTO product_messages (id, product_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)", id, p.id, user.id, b.text, at);
        return { id, text: b.text, createdAt: at, mine: true };
      }
    });
    router.add({
      method: "POST",
      path: "/products/:id/reviews",
      group: "Ученик: продукты",
      summary: "Отзыв о купленном продукте (один на продукт).",
      auth: S,
      body: "{ rating: 1–5, text: 10–1500 символов }",
      handler: ({ user, params, body }) => {
        const p = getProduct(db, params.id);
        if (!activePurchase(db, user.id, p.id)) throw forbidden("Отзыв может оставить только купивший ученик");
        const b = parse(body, { rating: num({ int: true, min: 1, max: 5 }), text: str({ min: 10, max: 1500 }) });
        const id = newId();
        try {
          db.run("INSERT INTO product_reviews (id, product_id, user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, p.id, user.id, b.rating, b.text, nowIso());
        } catch (e) {
          if (/UNIQUE/.test(e.message)) throw conflict("review_exists", "Вы уже оставили отзыв об этом продукте");
          throw e;
        }
        return { id, rating: b.rating, text: b.text };
      }
    });
    const detail = (id) => {
      const p = db.get("SELECT * FROM products WHERE id = ?", id);
      const purchases = db.get("SELECT COUNT(*) AS n FROM product_purchases WHERE product_id = ?", id).n;
      const slots = kindOf(p) === "sessions" ? db.all(`SELECT s.id, s.starts_at, s.booked_at, u.name FROM product_slots s LEFT JOIN users u ON u.id = s.booked_by WHERE s.product_id = ? AND s.starts_at > ? ORDER BY s.starts_at`, id, new Date(Date.now() - 864e5).toISOString()).map((s) => ({ id: s.id, startsAt: s.starts_at, bookedBy: s.name ? shortName(s.name) : null, bookedAt: s.booked_at })) : [];
      return {
        ...productCard(db, p),
        meetingUrl: p.meeting_url,
        scheduleNote: p.schedule_note,
        content: p.content ?? "",
        moderationNote: p.moderation_note,
        submittedAt: p.submitted_at,
        slots,
        checklist: productChecklist(db, p),
        rules: { canEdit: p.status !== "review", canDelete: p.status !== "review" && purchases === 0, canChangePackage: !isLiveProduct(p) }
      };
    };
    router.add({
      method: "GET",
      path: "/studio/products",
      group: "Студия: продукты",
      summary: "Мои продукты всех режимов. Параметры: mode, status.",
      auth: E4,
      handler: ({ user, query }) => db.all("SELECT * FROM products WHERE expert_id = ? ORDER BY updated_at DESC", user.id).filter((p) => (!query.get("mode") || p.mode === query.get("mode")) && (!query.get("status") || p.status === query.get("status"))).map((p) => ({ ...productCard(db, p), checklistLeft: productChecklist(db, p).filter((x) => !x.ok).length }))
    });
    router.add({
      method: "POST",
      path: "/studio/products",
      group: "Студия: продукты",
      summary: "Создать черновик продукта нужного типа.",
      auth: E4,
      body: `{ type: ${TYPES.join(" | ")}, title? }`,
      handler: (ctx) => {
        const b = parse(ctx.body, { type: oneOf(TYPES), title: str({ max: 90, optional: true }) });
        const info = PRODUCT_TYPES[b.type], id = newId(), now = nowIso();
        const sessions = { consultation: 1, personal: 4, mentorship: 12 }[b.type] ?? null;
        db.run(
          `INSERT INTO products (id, expert_id, mode, type, title, duration_min, sessions, period_days, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          ctx.user.id,
          info.mode,
          b.type,
          b.title ?? "",
          info.kind === "sessions" ? 60 : null,
          sessions,
          info.kind === "subscription" ? 30 : null,
          now,
          now
        );
        ctx.status = 201;
        return detail(id);
      }
    });
    router.add({
      method: "GET",
      path: "/studio/products/:id",
      group: "Студия: продукты",
      summary: "Продукт для редактора: поля, расписание с записями, чек-лист модерации.",
      auth: E4,
      handler: ({ user, params }) => {
        ownProduct(db, user, params.id);
        return detail(params.id);
      }
    });
    router.add({
      method: "PATCH",
      path: "/studio/products/:id",
      group: "Студия: продукты",
      summary: "Изменить продукт. Закрыто на модерации. Новая цена и размер пакета действуют для новых покупок.",
      auth: E4,
      body: "{ title?, description?, price?, cover?, durationMin?, sessions?, periodDays?, meetingUrl?, scheduleNote?, content? }",
      handler: ({ user, params, body }) => {
        const p = ownProduct(db, user, params.id);
        assertProductEditable(p);
        const b = parse(body, {
          title: str({ max: 90, optional: true }),
          description: str({ max: 1500, optional: true }),
          price: num({ int: true, min: 0, max: 1e7, optional: true, nullable: true }),
          cover: oneOf(COVER_LIBRARY, { optional: true, nullable: true }),
          durationMin: num({ int: true, min: 15, max: 240, optional: true }),
          sessions: num({ int: true, min: 1, max: 52, optional: true }),
          periodDays: num({ int: true, min: 7, max: 365, optional: true }),
          meetingUrl: str({ max: 300, optional: true, nullable: true }),
          scheduleNote: str({ max: 300, optional: true, nullable: true }),
          content: str({ max: 2e4, optional: true, trim: false })
        });
        const kind = kindOf(p);
        if (b.meetingUrl && !isUrl(b.meetingUrl)) throw new HttpError(422, "validation", "Проверьте поля", { meetingUrl: "Нужна ссылка, начинающаяся с https://" });
        if (b.sessions !== void 0 && (kind !== "sessions" || p.type === "consultation")) delete b.sessions;
        if (b.durationMin !== void 0 && kind !== "sessions") delete b.durationMin;
        if (b.periodDays !== void 0 && kind !== "subscription") delete b.periodDays;
        if (b.content !== void 0 && kind !== "material") delete b.content;
        const cols = { title: "title", description: "description", price: "price", cover: "cover", durationMin: "duration_min", sessions: "sessions", periodDays: "period_days", meetingUrl: "meeting_url", scheduleNote: "schedule_note", content: "content" };
        db.tx(() => {
          for (const [k, col] of Object.entries(cols)) if (k in b) db.run(`UPDATE products SET ${col} = ? WHERE id = ?`, b[k] === "" && k === "meetingUrl" ? null : b[k], p.id);
          if ("cover" in b && p.cover?.startsWith("upload:")) fs_default.rmSync(path_default.join(app2.storageDir, "covers", p.cover.slice(7)), { force: true });
          db.run("UPDATE products SET updated_at = ? WHERE id = ?", nowIso(), p.id);
        });
        return detail(p.id);
      }
    });
    router.add({
      method: "PUT",
      path: "/studio/products/:id/cover",
      group: "Студия: продукты",
      summary: "Своя обложка продукта: тело запроса — картинка JPG, PNG или WEBP до 5 МБ.",
      auth: E4,
      raw: true,
      body: "двоичный файл картинки",
      handler: async ({ user, params, req }) => {
        const p = ownProduct(db, user, params.id);
        assertProductEditable(p);
        const ext = IMAGE_TYPES[String(req.headers["content-type"] || "").split(";")[0]];
        if (!ext) throw new HttpError(415, "unsupported_type", "Нужна картинка JPG, PNG или WEBP");
        const file = `${p.id}-${Date.now()}${ext}`;
        await receiveFile(req, path_default.join(app2.storageDir, "covers", file), RULES.maxCoverBytes);
        if (p.cover?.startsWith("upload:")) fs_default.rmSync(path_default.join(app2.storageDir, "covers", p.cover.slice(7)), { force: true });
        db.run("UPDATE products SET cover = ?, updated_at = ? WHERE id = ?", "upload:" + file, nowIso(), p.id);
        return detail(p.id);
      }
    });
    router.add({
      method: "DELETE",
      path: "/studio/products/:id",
      group: "Студия: продукты",
      summary: "Удалить продукт. Нельзя, если его покупали или он на модерации.",
      auth: E4,
      handler: ({ user, params }) => {
        const p = ownProduct(db, user, params.id);
        assertProductEditable(p);
        if (db.get("SELECT 1 FROM product_purchases WHERE product_id = ?", p.id)) throw conflict("course_has_students", "Продукт уже покупали, его можно только скрыть из каталога.");
        db.run("DELETE FROM products WHERE id = ?", p.id);
        if (p.cover?.startsWith("upload:")) fs_default.rmSync(path_default.join(app2.storageDir, "covers", p.cover.slice(7)), { force: true });
      }
    });
    const transition = (name, summary, fn) => router.add({
      method: "POST",
      path: `/studio/products/:id/${name}`,
      group: "Студия: продукты",
      summary,
      auth: E4,
      handler: ({ user, params }) => {
        const p = ownProduct(db, user, params.id);
        db.tx(() => fn(p, user));
        return detail(p.id);
      }
    });
    transition("submit", "Отправить черновик на модерацию: нужны подтверждённый профиль и выполненный чек-лист.", (p, user) => {
      if (p.status !== "draft") throw conflict("bad_status", "На модерацию отправляется только черновик");
      assertVerifiedExpert(db, user, "Отправлять продукты на модерацию");
      const left = productChecklist(db, p).filter((x) => !x.ok);
      if (left.length) throw new HttpError(422, "checklist", "Продукт ещё не готов к модерации", left.map((x) => x.label));
      db.run(`UPDATE products SET status = 'review', submitted_at = ?, moderation_note = NULL, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), p.id);
    });
    transition("withdraw", "Отозвать продукт с модерации.", (p) => {
      if (p.status !== "review") throw conflict("bad_status", "Продукт не на модерации");
      db.run(`UPDATE products SET status = 'draft', submitted_at = NULL, updated_at = ? WHERE id = ?`, nowIso(), p.id);
    });
    transition("hide", "Скрыть из каталога. Купившие сохраняют доступ.", (p) => {
      if (p.status !== "published") throw conflict("bad_status", "Скрыть можно только продукт из каталога");
      db.run(`UPDATE products SET status = 'hidden', updated_at = ? WHERE id = ?`, nowIso(), p.id);
    });
    transition("unhide", "Вернуть скрытый продукт в каталог.", (p) => {
      if (p.status !== "hidden") throw conflict("bad_status", "Продукт не скрыт");
      db.run(`UPDATE products SET status = 'published', updated_at = ? WHERE id = ?`, nowIso(), p.id);
    });
    router.add({
      method: "POST",
      path: "/studio/products/:id/slots",
      group: "Студия: продукты",
      summary: `Добавить время в расписание встреч (от часа до ${PRODUCT_RULES.slotMaxDays} дней вперёд). Можно и в опубликованный продукт, и на модерации.`,
      auth: E4,
      body: "{ startsAt: дата и время ISO 8601 }",
      handler: ({ user, params, body }) => {
        const p = ownProduct(db, user, params.id);
        if (kindOf(p) !== "sessions") throw conflict("not_sessions", "Расписание есть только у встреч");
        const b = parse(body, { startsAt: str({ max: 40 }) });
        const t = new Date(b.startsAt);
        if (isNaN(t.getTime())) throw new HttpError(422, "validation", "Проверьте поля", { startsAt: "Нужны дата и время" });
        if (t.getTime() < Date.now() + 36e5 || t.getTime() > Date.now() + PRODUCT_RULES.slotMaxDays * 864e5)
          throw new HttpError(422, "validation", "Проверьте поля", { startsAt: `Время — от часа до ${PRODUCT_RULES.slotMaxDays} дней вперёд` });
        try {
          db.run("INSERT INTO product_slots (id, product_id, starts_at) VALUES (?, ?, ?)", newId(), p.id, t.toISOString());
        } catch (e) {
          if (/UNIQUE/.test(e.message)) throw conflict("slot_exists", "Это время уже есть в расписании");
          throw e;
        }
        return detail(p.id);
      }
    });
    router.add({
      method: "DELETE",
      path: "/studio/slots/:id",
      group: "Студия: продукты",
      summary: "Убрать свободное время из расписания. Занятое время сначала отмените — ученику вернётся встреча.",
      auth: E4,
      handler: ({ user, params }) => {
        const s = db.get("SELECT s.*, p.expert_id FROM product_slots s JOIN products p ON p.id = s.product_id WHERE s.id = ?", params.id);
        if (!s || s.expert_id !== user.id) throw notFound("Время не найдено");
        if (s.booked_by) throw conflict("slot_booked", "На это время записан ученик. Сначала отмените запись.");
        db.run("DELETE FROM product_slots WHERE id = ?", s.id);
        return detail(s.product_id);
      }
    });
    router.add({
      method: "GET",
      path: "/studio/bookings",
      group: "Студия: продукты",
      summary: "Ближайшие встречи со всеми записями учеников.",
      auth: E4,
      handler: ({ user }) => db.all(
        `SELECT s.id, s.starts_at, p.id AS product_id, p.title, p.duration_min, p.meeting_url, u.name FROM product_slots s JOIN products p ON p.id = s.product_id JOIN users u ON u.id = s.booked_by
       WHERE p.expert_id = ? AND s.starts_at > ? ORDER BY s.starts_at LIMIT 50`,
        user.id,
        new Date(Date.now() - 2 * 36e5).toISOString()
      ).map((s) => ({ slotId: s.id, startsAt: s.starts_at, productId: s.product_id, title: s.title, durationMin: s.duration_min, meetingUrl: s.meeting_url, student: shortName(s.name) }))
    });
    const inReview = (id) => {
      const p = getProduct(db, id);
      if (p.status !== "review") throw conflict("bad_status", "Продукт не на модерации");
      return p;
    };
    router.add({
      method: "GET",
      path: "/moderation/products/:id",
      group: "Модерация",
      summary: "Продукт целиком для проверки: текст, расписание, ссылки, чек-лист.",
      auth: ["moderator"],
      handler: ({ params }) => {
        getProduct(db, params.id);
        return detail(params.id);
      }
    });
    router.add({
      method: "POST",
      path: "/moderation/products/:id/approve",
      group: "Модерация",
      summary: "Одобрить продукт: он появится в каталоге.",
      auth: ["moderator"],
      handler: ({ params }) => {
        const p = inReview(params.id);
        db.run(`UPDATE products SET status = 'published', published_at = COALESCE(published_at, ?), moderation_note = NULL, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), p.id);
        return productCard(db, getProduct(db, p.id));
      }
    });
    router.add({
      method: "POST",
      path: "/moderation/products/:id/reject",
      group: "Модерация",
      summary: "Вернуть продукт эксперту с комментарием.",
      auth: ["moderator"],
      body: "{ note }",
      handler: ({ params, body }) => {
        const p = inReview(params.id);
        const b = parse(body, { note: str({ min: 5, max: 1e3 }) });
        db.run(`UPDATE products SET status = 'draft', moderation_note = ?, submitted_at = NULL, updated_at = ? WHERE id = ?`, b.note, nowIso(), p.id);
        return productCard(db, getProduct(db, p.id));
      }
    });
    router.add({
      method: "GET",
      path: "/me/favorites",
      group: "Вход",
      summary: "Избранное: идентификаторы курсов и продуктов.",
      auth: "user",
      handler: ({ user }) => db.all("SELECT item_id FROM favorites WHERE user_id = ? ORDER BY created_at", user.id).map((r) => r.item_id)
    });
    router.add({
      method: "PUT",
      path: "/me/favorites/:id",
      group: "Вход",
      summary: "Добавить курс или продукт в избранное.",
      auth: "user",
      handler: ({ user, params }) => {
        if (!db.get("SELECT 1 FROM courses WHERE id = ? UNION SELECT 1 FROM products WHERE id = ?", params.id, params.id)) throw notFound("Курс или продукт не найден");
        db.run("INSERT OR IGNORE INTO favorites (user_id, item_id, created_at) VALUES (?, ?, ?)", user.id, params.id, nowIso());
      }
    });
    router.add({
      method: "DELETE",
      path: "/me/favorites/:id",
      group: "Вход",
      summary: "Убрать из избранного.",
      auth: "user",
      handler: ({ user, params }) => {
        db.run("DELETE FROM favorites WHERE user_id = ? AND item_id = ?", user.id, params.id);
      }
    });
    router.add({
      method: "PUT",
      path: "/me/avatar",
      group: "Вход",
      summary: "Загрузить своё фото: тело запроса — картинка JPG, PNG или WEBP до 5 МБ.",
      auth: "user",
      raw: true,
      body: "двоичный файл картинки",
      handler: async ({ user, req }) => {
        const ext = IMAGE_TYPES[String(req.headers["content-type"] || "").split(";")[0]];
        if (!ext) throw new HttpError(415, "unsupported_type", "Нужна картинка JPG, PNG или WEBP");
        const file = `${user.id}-${Date.now()}${ext}`;
        await receiveFile(req, path_default.join(app2.storageDir, "avatars", file), RULES.maxCoverBytes);
        const old = db.get("SELECT avatar_file FROM users WHERE id = ?", user.id)?.avatar_file;
        db.run("UPDATE users SET avatar_file = ? WHERE id = ?", file, user.id);
        if (old) fs_default.rmSync(path_default.join(app2.storageDir, "avatars", old), { force: true });
        return { avatarUrl: `/media/avatars/${file}` };
      }
    });
    router.add({
      method: "DELETE",
      path: "/me/avatar",
      group: "Вход",
      summary: "Убрать своё фото.",
      auth: "user",
      handler: ({ user }) => {
        const old = db.get("SELECT avatar_file FROM users WHERE id = ?", user.id)?.avatar_file;
        db.run("UPDATE users SET avatar_file = NULL WHERE id = ?", user.id);
        if (old) fs_default.rmSync(path_default.join(app2.storageDir, "avatars", old), { force: true });
      }
    });
    router.add({
      method: "GET",
      path: "/media/avatars/:file",
      group: "Служебное",
      summary: "Фото профилей.",
      handler: (ctx) => {
        if (!/^[\w-]+\.(jpg|png|webp)$/.test(ctx.params.file)) throw notFound();
        sendFile(ctx.req, ctx.res, path_default.join(app2.storageDir, "avatars", ctx.params.file));
        ctx.handled = true;
      }
    });
  }

  // server/src/app.ts
  var SERVER_ROOT = path_default.resolve(path_default.dirname(fileURLToPath("file:///server/src/app.ts")), "..");
  var DB_ERRORS = [
    [/forecast_immutable/, 409, "forecast_immutable", "Опубликованный прогноз нельзя изменить или удалить."],
    [/forecast_already_resolved/, 409, "forecast_resolved", "Итог прогноза уже определён."],
    [/course_has_students/, 409, "course_has_students", "Курс купили ученики, его можно только скрыть из каталога."],
    [/review_immutable/, 409, "review_immutable", "Отзывы не удаляются. Пожалуйтесь на отзыв, решение примет модерация."],
    [/anchor_immutable/, 409, "anchor_immutable", "Фиксацию в блокчейне нельзя изменить или удалить."],
    [/slot_booked/, 409, "slot_booked", "На это время записан ученик. Сначала отмените запись."],
    [/UNIQUE constraint failed: forecasts\.expert_id, forecasts\.ticker/, 409, "forecast_ticker_open", "По этому тикеру уже есть открытый прогноз."],
    [/UNIQUE constraint failed: users\.email/, 409, "email_taken", "Этот адрес почты уже зарегистрирован."],
    [/UNIQUE constraint failed: reviews/, 409, "review_exists", "Вы уже оставили отзыв на этот курс."],
    [/FOREIGN KEY constraint failed/, 409, "conflict", "Действие нарушает связи данных."],
    [/CHECK constraint failed/, 422, "validation", "Данные не прошли проверку."]
  ];
  function mapError(e) {
    if (e instanceof HttpError) return e;
    const msg = e instanceof Error ? e.message : String(e);
    for (const [re, status, code, text] of DB_ERRORS) if (re.test(msg)) return new HttpError(status, code, text);
    return new HttpError(500, "internal", "Внутренняя ошибка сервера");
  }

  // web/src/shims/vm.ts
  function runInNewContext(src, ctx) {
    new Function("window", src)(ctx.window);
  }
  var vm_default = { runInNewContext };

  // server/src/seed.ts
  var DEMO_PASSWORD = "dal-demo-2026";
  var SEED_VIDEO = "demo-lesson.mp4";
  function loadWindowData(siteDir, file, key) {
    const src = path_default.join(siteDir, file);
    if (!fs_default.existsSync(src)) throw new Error(`Не найден ${src}. Папка server должна лежать внутри папки DAL рядом с ${file}.`);
    const ctx = { window: {} };
    vm_default.runInNewContext(fs_default.readFileSync(src, "utf8"), ctx);
    return ctx.window[key];
  }
  var ago = (days, hour = 12) => {
    const d = /* @__PURE__ */ new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  function seed(db, siteDir, seedDir) {
    const DAL = loadWindowData(siteDir, "data.js", "DAL");
    const STUDIO = loadWindowData(siteDir, "studio-data.js", "STUDIO");
    const videoSize = fs_default.statSync(path_default.join(seedDir, SEED_VIDEO)).size;
    const hash = hashPassword(DEMO_PASSWORD);
    const accounts = [];
    const addUser = (id, email, name, role, created = ago(200)) => {
      db.run("INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, email, hash, name, role, created);
      accounts.push({ email, role, name });
    };
    db.tx(() => {
      addUser("moderator", "moderator@dal.local", "Модератор Dal", "moderator");
      for (const e of DAL.experts) {
        const studio = e.id === STUDIO.expert.id ? STUDIO.expert : null;
        addUser(e.id, `${e.id}@dal.local`, e.name, "expert", ago(560));
        db.run(
          "INSERT INTO expert_profiles (user_id, specialization, bio, experience, achievements, avatar, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          e.id,
          e.role,
          studio?.bio ?? e.bio,
          e.experience,
          JSON.stringify(studio?.achievements ?? e.achievements),
          e.image,
          studio ? `${studio.verifiedAt}T09:00:00.000Z` : ago(500)
        );
      }
      const students = [
        ["student", "Дарын Асылбек"],
        ["aruzhan", "Аружан Касымова"],
        ["daniyar", "Данияр Сейткали"],
        ["madina", "Мадина Жумабаева"],
        ["erlan", "Ерлан Тулеев"],
        ["sabina", "Сабина Ахметова"],
        ["nurlan", "Нурлан Беков"],
        ["aigerim", "Айгерим Мусина"],
        ["timur-o", "Тимур Омаров"],
        ["kamila", "Камила Рахимова"],
        ["alibek", "Алибек Ержанов"],
        ["guest4821", "Гость 4821"]
      ];
      for (const [id, name] of students) addUser(id, `${id}@dal.local`, name, "student");
      let n = 0;
      const lessonIds = {};
      const addCourse = (c, expertId, modules, publishedDaysAgo) => {
        const created = ago((publishedDaysAgo ?? 3) + 20);
        db.run(
          `INSERT INTO courses (id, expert_id, title, category, description, price, cover, status, submitted_at, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          c.id,
          expertId,
          c.title,
          c.category,
          c.description,
          c.price ?? null,
          c.cover || null,
          c.status,
          c.status === "review" ? ago(2) : null,
          publishedDaysAgo !== null ? ago(publishedDaysAgo) : null,
          created,
          c.status === "draft" ? ago(1) : created
        );
        lessonIds[c.id] = [];
        modules.forEach((m, mi) => {
          const mid = `${c.id}-m${mi + 1}`;
          db.run("INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, ?)", mid, c.id, m.title, mi + 1);
          m.lessons.forEach((l, li) => {
            const lid = `${c.id}-l${++n}`;
            lessonIds[c.id].push(lid);
            db.run("INSERT INTO lessons (id, module_id, title, position, is_free, created_at) VALUES (?, ?, ?, ?, ?, ?)", lid, mid, l.title, li + 1, l.free, created);
            if (l.video) db.run(
              "INSERT INTO videos (lesson_id, file_name, original_name, mime, size, duration, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
              lid,
              "seed:" + SEED_VIDEO,
              l.video.name,
              "video/mp4",
              videoSize,
              l.video.duration,
              created
            );
          });
        });
      };
      const studioDays = { c4: 230, c2: 330, c7: 175, d1: null, d2: null };
      for (const c of STUDIO.courses) addCourse(c, STUDIO.expert.id, c.modules, studioDays[c.id] ?? null);
      const courseMode = DAL.modes.find((m) => m.id === "courses");
      const generic = ["Основные понятия и постановка задачи", "Исходные данные и допущения", "Проверяем гипотезу на примере", "Обсуждение результатов и ограничений"];
      for (const p of DAL.products.filter((p2) => p2.mode === "courses" && !STUDIO.courses.some((s) => s.id === p2.id))) {
        const cat = courseMode.categories.find((c) => c.id === p.category);
        const expert = DAL.experts.find((e) => e.id === p.expert);
        const titles = p.modules || Array.from({ length: p.lessons }, (_, i) => generic[i % 4] + (i >= 4 ? ` · часть ${Math.floor(i / 4) + 1}` : ""));
        const modules = [];
        for (let i = 0; i < titles.length; i += 4) modules.push({
          title: titles.length > 4 ? `Модуль ${i / 4 + 1}` : "Программа",
          lessons: titles.slice(i, i + 4).map((t, j) => ({ title: t, free: i + j === 0, video: { name: `urok-${i + j + 1}.mp4`, duration: 540 + (i + j) * 173 % 900 } }))
        });
        addCourse(
          { id: p.id, title: p.title, category: p.category, price: p.price, cover: p.image, status: "published", description: p.about || `${cat.description} ${expert.bio}` },
          p.expert,
          modules,
          120 + n % 90
        );
      }
      const enroll = (user, course, daysAgo, progress) => {
        const price = db.get("SELECT price FROM courses WHERE id = ?", course).price;
        db.run(
          "INSERT INTO enrollments (id, user_id, course_id, price_paid, commission, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          `${user}-${course}`,
          user,
          course,
          price,
          Math.round(price * RULES.commission),
          ago(daysAgo, 10)
        );
        const ids = lessonIds[course], done = Math.round(ids.length * progress);
        ids.slice(0, done).forEach((lid, i) => db.run("INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)", user, lid, ago(Math.max(0, daysAgo - 1 - i), 19)));
      };
      [
        ["student", "c1", 21, 0.25],
        ["aruzhan", "c4", 20, 0.72],
        ["daniyar", "c4", 7, 0.35],
        ["madina", "c2", 60, 1],
        ["erlan", "c4", 4, 0.12],
        ["sabina", "c2", 9, 0.64],
        ["nurlan", "c7", 150, 1],
        ["aigerim", "c2", 6, 0.48],
        ["timur-o", "c4", 1, 0.9],
        ["kamila", "c7", 165, 0.5],
        ["alibek", "c2", 0, 0.2],
        ["guest4821", "c2", 30, 0],
        ["aruzhan", "c2", 115, 1],
        ["daniyar", "c2", 80, 0.6],
        ["madina", "c4", 75, 0.3],
        ["kamila", "c4", 50, 0.8],
        ["nurlan", "c4", 100, 0.5],
        ["erlan", "c2", 170, 1],
        ["timur-o", "c2", 135, 0.7],
        ["sabina", "c4", 40, 0.4],
        ["aigerim", "c4", 35, 0.2],
        ["alibek", "c7", 140, 1],
        ["madina", "c1", 90, 1],
        ["daniyar", "c1", 45, 0.5],
        ["kamila", "c5", 70, 0.6],
        ["nurlan", "c3", 25, 0.3],
        ["sabina", "c6", 55, 0.4],
        ["aruzhan", "c8", 12, 1]
      ].forEach(([u, c, d, p]) => enroll(u, c, d, p));
      const authors = { "Аружан К.": "aruzhan", "Данияр С.": "daniyar", "Мадина Ж.": "madina", "Гость 4821": "guest4821", "Нурлан Б.": "nurlan" };
      STUDIO.reviews.forEach((r, i) => db.run(
        "INSERT INTO reviews (id, course_id, user_id, rating, text, created_at, reply, replied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        r.id,
        r.course,
        authors[r.name],
        r.rating,
        r.text,
        ago(4 + i * 6),
        r.reply,
        r.reply ? ago(3 + i * 6) : null
      ));
      db.run("INSERT INTO reviews (id, course_id, user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)", "r6", "c1", "madina", 5, "Понравилось, что можно последовательно разобраться в понятиях и задать вопросы. Особенно полезны примеры.", ago(30));
      db.run("INSERT INTO reviews (id, course_id, user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)", "r7", "c1", "daniyar", 4, "Стало понятнее, на какие исходные данные смотреть. Хотелось бы ещё больше задач для самостоятельного разбора.", ago(15));
      const addForecast = (f, expert) => {
        db.run(
          `INSERT INTO forecasts (id, expert_id, ticker, name, direction, start_price, target_price, deadline, rationale, status, result_price, published_at, resolved_at, resolved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          f.id,
          expert,
          f.ticker,
          f.name,
          f.direction,
          f.start,
          f.target,
          f.deadline,
          f.rationale,
          f.status,
          f.status === "active" ? null : f.current,
          `${f.publishedAt}T10:00:00.000Z`,
          f.status === "active" ? null : `${f.deadline}T23:00:00.000Z`,
          f.status === "active" ? null : "moderator"
        );
        for (const u of f.updates || []) db.run("INSERT INTO forecast_comments (id, forecast_id, text, created_at) VALUES (?, ?, ?, ?)", `${f.id}-c${u.date}`, f.id, u.text, `${u.date}T12:00:00.000Z`);
      };
      for (const f of STUDIO.forecasts) addForecast(f, STUDIO.expert.id);
      addForecast({ id: "s2", ticker: "MSFT", name: "Microsoft", direction: "up", start: 430, target: 460, current: 468, publishedAt: "2026-09-01", deadline: "2026-09-30", status: "success", rationale: "Условие: цена закрытия 30 сентября не ниже $460." }, "arman");
      addForecast({ id: "s3", ticker: "NVDA", name: "NVIDIA", direction: "up", start: 170, target: 190, current: 164, publishedAt: "2026-09-01", deadline: "2026-09-30", status: "miss", rationale: "Условие: цена закрытия 30 сентября не ниже $190. Неуспешный прогноз остаётся в истории." }, "timur");
      addForecast({ id: "s4", ticker: "SPY", name: "S&P 500 ETF", direction: "up", start: 620, target: 650, current: 632, publishedAt: "2026-09-20", deadline: "2026-10-20", status: "active", rationale: "Условие: цена закрытия 20 октября не ниже $650." }, "arman");
      seedProducts(db, DAL);
    });
    return { accounts };
  }
  var IDEAS = {
    i1: `Устойчивый бизнес видно не по одной удачной цифре, а по тому, как компания проходит плохие годы.

## Три признака устойчивости
Первый — повторяемая выручка: подписки, контракты, привычка клиентов. Второй — денежный поток, который стабильно покрывает капитальные затраты. Третий — умеренный долг: проценты по нему не съедают прибыль даже в слабый год.

## Как проверить самому
Откройте отчётность за пять–семь лет. Найдите самый слабый год и посмотрите, что стало с выручкой, маржой и долгом. Если компания осталась прибыльной и не нарастила долг, это хороший знак.

## Где граница вывода
Устойчивый бизнес может стоить слишком дорого. Качество компании и привлекательность цены — два разных вопроса, их нужно проверять отдельно.`,
    i2: `Диверсификация — это не «купить побольше разных бумаг», а распределить риск так, чтобы одна ошибка не разрушила весь портфель.

## Что на самом деле снижает риск
Важно, насколько по-разному активы ведут себя в одной ситуации. Десять банковских акций дают меньше разнообразия, чем три бумаги из разных отраслей и одна облигация.

## Частые ошибки
Покупать фонд и отдельно те же акции, которые в нём уже есть. Держать всё в одной валюте при расходах в другой. Считать диверсификацией количество позиций, а не их связь между собой.

## Простой вопрос для проверки
Что случится с портфелем, если упадёт один сектор на 30%? Если ответ «почти весь портфель упадёт вместе с ним», диверсификации нет.`,
    i3: `Сезон отчётности — время, когда рынок сверяет ожидания с фактами. Цена часто реагирует не на сами цифры, а на разницу между ними и прогнозом аналитиков.

## На что смотреть
Выручку и маржу в сравнении с прошлым годом, прогноз менеджмента на следующий период и комментарии о спросе. Разовые статьи лучше выносить за скобки.

## Почему цена может упасть на хорошем отчёте
Если ожидания были выше, даже рост прибыли разочарует рынок. Поэтому полезно заранее записать, какие цифры вы считаете хорошими, и сравнивать с ними, а не с реакцией цены.

## Что делать с этим знанием
Не принимать решений в первые часы после публикации. Сначала прочитать отчёт целиком и проверить, изменилась ли ваша исходная гипотеза.`,
    i4: `Выручка показывает, сколько компания продала, но не сколько денег у неё осталось. Путь от выручки к денежному потоку — главный навык в разборе любой компании.

## Шаг 1. От выручки к операционной прибыли
Вычитаем себестоимость и операционные расходы. Смотрим, как меняется маржа: растёт ли она вместе с выручкой или съедается расходами.

## Шаг 2. От прибыли к операционному потоку
Добавляем неденежные расходы, учитываем изменение запасов и дебиторской задолженности. Если прибыль растёт, а поток нет, деньги «застревают» в оборотном капитале.

## Шаг 3. Свободный денежный поток
Вычитаем капитальные затраты. Именно из свободного потока компания платит дивиденды, гасит долг и выкупает акции. Его стабильность важнее одного удачного года прибыли.`
  };
  function seedProducts(db, DAL) {
    const now = /* @__PURE__ */ new Date();
    const at = (days, hour) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const sched = {
      g1: "Встречи по средам в 19:00 (Алматы): каждую неделю разбираем одну компанию.",
      g2: "Раз в неделю, по воскресеньям в 18:00 (Алматы): обсуждаем главу книги."
    };
    const modeOf = {};
    for (const m of DAL.modes) modeOf[m.id] = m;
    for (const p of DAL.products.filter((x) => x.mode !== "courses")) {
      const mode = modeOf[p.mode], cat = mode.categories.find((c) => c.id === p.category);
      const expert = DAL.experts.find((e) => e.id === p.expert);
      const sessions = p.category === "consultation" ? 1 : p.category === "personal" ? 4 : p.category === "mentorship" ? 12 : null;
      const kind = sessions ? "sessions" : p.mode === "community" ? "subscription" : "material";
      const created = at(-150, 10);
      db.run(
        `INSERT INTO products (id, expert_id, mode, type, title, description, price, cover, status, duration_min, sessions, period_days, meeting_url, schedule_note, content, published_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id,
        p.expert,
        p.mode,
        p.category,
        p.title,
        `${cat.description} ${expert.bio}`,
        p.price,
        p.image,
        kind === "sessions" ? 60 : null,
        sessions,
        kind === "subscription" ? 30 : null,
        kind === "sessions" || p.category === "clubs" ? `https://meet.example.com/dal-${p.id}` : null,
        sched[p.id] ?? null,
        IDEAS[p.id] ?? null,
        at(-120, 10),
        created,
        created
      );
      if (kind === "sessions") for (let d = 2; d <= 20; d += 3) for (const h of [12, 18]) db.run("INSERT INTO product_slots (id, product_id, starts_at) VALUES (?, ?, ?)", `${p.id}-s${d}-${h}`, p.id, at(d, h));
    }
    const buy = (user, product, daysAgo, opts = {}) => {
      const p = db.get("SELECT * FROM products WHERE id = ?", product);
      const id = `${user}-${product}`;
      db.run(
        "INSERT INTO product_purchases (id, user_id, product_id, price_paid, commission, sessions_total, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        id,
        user,
        product,
        p.price,
        Math.round(p.price * RULES.commission),
        p.sessions,
        p.period_days ? at(opts.expiresIn ?? 30 - daysAgo, 23) : null,
        at(-daysAgo, 11)
      );
      return id;
    };
    const book = (purchase, product, user, days, hour) => db.run("INSERT INTO product_slots (id, product_id, starts_at, booked_by, purchase_id, booked_at) VALUES (?, ?, ?, ?, ?, ?)", `${product}-b-${user}-${days}`, product, at(days, hour), user, purchase, at(Math.min(days, 0) - 1, 9));
    const review = (product, user, rating, text, daysAgo, reply = null) => db.run(
      "INSERT INTO product_reviews (id, product_id, user_id, rating, text, created_at, reply, replied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      `pr-${product}-${user}`,
      product,
      user,
      rating,
      text,
      at(-daysAgo, 15),
      reply,
      reply ? at(-daysAgo + 1, 10) : null
    );
    const s1 = buy("student", "e1", 6);
    book(s1, "e1", "student", 3, 15);
    const a1 = buy("aruzhan", "e1", 40);
    book(a1, "e1", "aruzhan", -30, 18);
    review("e1", "aruzhan", 5, "За час разобрали мои цели и составили понятный план. Арман объясняет без давления.", 28, "Аружан, рад, что план получился понятным!");
    const d2 = buy("daniyar", "e2", 25);
    book(d2, "e2", "daniyar", -20, 19);
    review("e2", "daniyar", 5, "Алия задала вопросы, о которых я не думал. Стало ясно, где мой подход слабый.", 18);
    const m3 = buy("madina", "e3", 30);
    book(m3, "e3", "madina", -21, 18);
    book(m3, "e3", "madina", -14, 18);
    book(m3, "e3", "madina", 5, 15);
    review("e3", "madina", 5, "Четыре занятия — и я читаю отчётность сама. Домашние задания очень помогли.", 10);
    const k5 = buy("kamila", "e5", 50);
    book(k5, "e5", "kamila", -40, 12);
    book(k5, "e5", "kamila", -26, 12);
    review("e5", "kamila", 4, "Регулярные встречи дисциплинируют. Хотелось бы чуть больше материалов между встречами.", 20);
    buy("nurlan", "e6", 12);
    buy("aruzhan", "g1", 20);
    buy("erlan", "g1", 10);
    buy("timur-o", "g1", 45, { expiresIn: -15 });
    review("g1", "aruzhan", 5, "Разборы компаний в кругу единомышленников — лучшая часть недели.", 8);
    buy("sabina", "g2", 15);
    review("g2", "sabina", 4, "Хорошие обсуждения, но иногда не успеваю прочитать главу.", 5);
    buy("daniyar", "g3", 18);
    buy("madina", "g3", 9);
    review("g3", "daniyar", 5, "Алия отвечает по делу и с источниками. Чат без шума.", 7);
    buy("student", "g4", 4);
    buy("alibek", "g4", 3);
    const msg = (product, user, text, hoursAgo) => db.run("INSERT INTO product_messages (id, product_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)", `m-${product}-${user}-${hoursAgo}`, product, user, text, new Date(now.getTime() - hoursAgo * 36e5).toISOString());
    msg("g3", "aliya", "Добро пожаловать! Пишите вопросы о рынке, отвечаю каждый день до 21:00.", 200);
    msg("g3", "daniyar", "Как вы смотрите на компании, у которых выручка растёт, а свободный денежный поток падает?", 50);
    msg("g3", "aliya", "Первым делом смотрю на оборотный капитал и капитальные затраты. Если рост «съедает» деньги временно, это нормально. Если так годами — тревожный знак.", 48);
    msg("g3", "madina", "Спасибо, это как раз мой случай с одной компанией из портфеля.", 30);
    msg("g1", "timur", "На этой неделе разбираем Kaspi.kz: прочитайте раздел о платёжном сегменте до среды.", 70);
    msg("g1", "aruzhan", "Прочитала. Вопрос: как они считают выручку маркетплейса — валовым или чистым методом?", 20);
    msg("g4", "arman", "Здесь можно задавать любые вопросы о первых шагах. Глупых вопросов нет.", 300);
    msg("g4", "student", "С какой суммы имеет смысл начинать?", 26);
    msg("g4", "arman", "С той, которую вы готовы не трогать несколько лет после того, как отложили резерв на 3–6 месяцев расходов.", 25);
    buy("daniyar", "i1", 14);
    review("i1", "daniyar", 5, "Понятный чек-лист, применил к двум компаниям из портфеля.", 9);
    buy("student", "i2", 8);
    buy("aigerim", "i2", 6);
    review("i2", "aigerim", 4, "Коротко и по делу. Пример с секторами особенно полезен.", 4);
    buy("erlan", "i3", 11);
    buy("daniyar", "i4", 16);
    buy("kamila", "i4", 13);
    review("i4", "kamila", 5, "Наконец-то разобралась, почему прибыль и денежный поток — не одно и то же.", 10, "Камила, спасибо! Рада, что пример помог.");
    const socials = {
      arman: { telegram: "https://t.me/arman_invest_demo", youtube: "https://youtube.com/@arman_invest_demo" },
      aliya: { telegram: "https://t.me/aliya_analysis_demo", linkedin: "https://linkedin.com/in/aliya-demo", website: "https://example.com/aliya" },
      timur: { telegram: "https://t.me/timur_risk_demo", instagram: "https://instagram.com/timur_risk_demo" }
    };
    for (const [id, s] of Object.entries(socials)) db.run("UPDATE expert_profiles SET socials = ? WHERE user_id = ?", JSON.stringify(s), id);
  }

  // server/migrations/001_init.sql
  var init_default = "-- Dal: схема первого этапа.\n-- Пишется на SQL, близком к стандартному, чтобы перенос на PostgreSQL был механическим:\n-- TEXT-идентификаторы → uuid, INTEGER 0/1 → boolean, TEXT-даты → timestamptz/date,\n-- триггеры RAISE(ABORT) → функции plpgsql с RAISE EXCEPTION.\n\nCREATE TABLE users (\n  id            TEXT PRIMARY KEY,\n  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,\n  password_hash TEXT NOT NULL,\n  name          TEXT NOT NULL,\n  role          TEXT NOT NULL CHECK (role IN ('student', 'expert', 'moderator')),\n  created_at    TEXT NOT NULL\n);\n\nCREATE TABLE sessions (\n  token_hash TEXT PRIMARY KEY,\n  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  created_at TEXT NOT NULL,\n  expires_at TEXT NOT NULL\n);\nCREATE INDEX sessions_user ON sessions(user_id);\n\n-- Публичный профиль эксперта. Имя хранится в users.name и меняется только через модерацию.\nCREATE TABLE expert_profiles (\n  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,\n  specialization TEXT NOT NULL DEFAULT '',\n  bio            TEXT NOT NULL DEFAULT '',\n  experience     TEXT NOT NULL DEFAULT '',\n  achievements   TEXT NOT NULL DEFAULT '[]',  -- JSON-массив строк\n  avatar         TEXT,\n  verified_at    TEXT                          -- NULL: личность и счёт ещё не подтверждены\n);\n\nCREATE TABLE profile_requests (\n  id         TEXT PRIMARY KEY,\n  expert_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  field      TEXT NOT NULL CHECK (field IN ('name', 'experience')),\n  value      TEXT NOT NULL,\n  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),\n  created_at TEXT NOT NULL,\n  decided_at TEXT,\n  decided_by TEXT REFERENCES users(id)\n);\n\nCREATE TABLE courses (\n  id              TEXT PRIMARY KEY,\n  expert_id       TEXT NOT NULL REFERENCES users(id),\n  title           TEXT NOT NULL DEFAULT '',\n  category        TEXT NOT NULL DEFAULT 'beginner' CHECK (category IN ('beginner', 'advanced', 'workshops')),\n  description     TEXT NOT NULL DEFAULT '',\n  price           INTEGER CHECK (price IS NULL OR price >= 0),  -- в тенге; NULL — цена не указана\n  cover           TEXT,                                          -- ключ библиотеки или 'upload:<файл>'\n  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'hidden')),\n  moderation_note TEXT,\n  submitted_at    TEXT,\n  published_at    TEXT,\n  created_at      TEXT NOT NULL,\n  updated_at      TEXT NOT NULL\n);\nCREATE INDEX courses_expert ON courses(expert_id);\nCREATE INDEX courses_status ON courses(status);\n\nCREATE TABLE modules (\n  id        TEXT PRIMARY KEY,\n  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,\n  title     TEXT NOT NULL DEFAULT '',\n  position  INTEGER NOT NULL\n);\nCREATE INDEX modules_course ON modules(course_id, position);\n\nCREATE TABLE lessons (\n  id         TEXT PRIMARY KEY,\n  module_id  TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,\n  title      TEXT NOT NULL DEFAULT '',\n  position   INTEGER NOT NULL,\n  is_free    INTEGER NOT NULL DEFAULT 0 CHECK (is_free IN (0, 1)),\n  created_at TEXT NOT NULL\n);\nCREATE INDEX lessons_module ON lessons(module_id, position);\n\nCREATE TABLE videos (\n  lesson_id             TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,\n  file_name             TEXT NOT NULL,   -- путь внутри storage/videos или 'seed:<файл>'\n  original_name         TEXT NOT NULL,\n  mime                  TEXT NOT NULL,\n  size                  INTEGER NOT NULL CHECK (size > 0),\n  duration              REAL,            -- секунды, если удалось определить\n  uploaded_at           TEXT NOT NULL,\n  updated_after_publish INTEGER NOT NULL DEFAULT 0 CHECK (updated_after_publish IN (0, 1))\n);\n\n-- Покупка (в первом этапе без оплаты). Цена фиксируется в момент покупки:\n-- смена цены курса действует только для новых покупок.\nCREATE TABLE enrollments (\n  id          TEXT PRIMARY KEY,\n  user_id     TEXT NOT NULL REFERENCES users(id),\n  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,\n  price_paid  INTEGER NOT NULL CHECK (price_paid >= 0),\n  commission  INTEGER NOT NULL CHECK (commission >= 0),\n  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refunded')),\n  created_at  TEXT NOT NULL,\n  refunded_at TEXT,\n  UNIQUE (user_id, course_id)\n);\nCREATE INDEX enrollments_course ON enrollments(course_id);\n\nCREATE TABLE lesson_progress (\n  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  lesson_id    TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,\n  completed_at TEXT NOT NULL,\n  PRIMARY KEY (user_id, lesson_id)\n);\n\nCREATE TABLE reviews (\n  id         TEXT PRIMARY KEY,\n  course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,\n  user_id    TEXT NOT NULL REFERENCES users(id),\n  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),\n  text       TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  reply      TEXT,\n  replied_at TEXT,\n  hidden     INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),  -- скрыт модерацией по жалобе\n  UNIQUE (course_id, user_id)\n);\n\nCREATE TABLE review_reports (\n  id          TEXT PRIMARY KEY,\n  review_id   TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,\n  reporter_id TEXT NOT NULL REFERENCES users(id),\n  reason      TEXT NOT NULL,\n  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'kept', 'removed')),\n  created_at  TEXT NOT NULL,\n  decided_at  TEXT,\n  decided_by  TEXT REFERENCES users(id)\n);\n\nCREATE TABLE forecasts (\n  id           TEXT PRIMARY KEY,\n  expert_id    TEXT NOT NULL REFERENCES users(id),\n  ticker       TEXT NOT NULL,\n  name         TEXT NOT NULL,\n  direction    TEXT NOT NULL CHECK (direction IN ('up', 'down')),\n  start_price  REAL NOT NULL CHECK (start_price > 0),\n  target_price REAL NOT NULL CHECK (target_price > 0),\n  deadline     TEXT NOT NULL,              -- дата проверки, YYYY-MM-DD\n  rationale    TEXT NOT NULL,\n  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'success', 'miss')),\n  result_price REAL,\n  published_at TEXT NOT NULL,\n  resolved_at  TEXT,\n  resolved_by  TEXT REFERENCES users(id),\n  CHECK ((direction = 'up' AND target_price > start_price) OR (direction = 'down' AND target_price < start_price))\n);\nCREATE INDEX forecasts_expert ON forecasts(expert_id, status);\n-- По одному тикеру у эксперта может быть только один открытый прогноз.\nCREATE UNIQUE INDEX forecasts_one_active_per_ticker ON forecasts(expert_id, ticker) WHERE status = 'active';\n\n-- Опубликованный прогноз нельзя изменить или удалить. Итог выставляется один раз.\nCREATE TRIGGER forecasts_no_delete BEFORE DELETE ON forecasts\nBEGIN SELECT RAISE(ABORT, 'forecast_immutable'); END;\n\nCREATE TRIGGER forecasts_terms_immutable\nBEFORE UPDATE OF expert_id, ticker, name, direction, start_price, target_price, deadline, rationale, published_at ON forecasts\nBEGIN SELECT RAISE(ABORT, 'forecast_immutable'); END;\n\nCREATE TRIGGER forecasts_resolve_once BEFORE UPDATE OF status, result_price ON forecasts\nWHEN OLD.status <> 'active'\nBEGIN SELECT RAISE(ABORT, 'forecast_already_resolved'); END;\n\nCREATE TABLE forecast_comments (\n  id          TEXT PRIMARY KEY,\n  forecast_id TEXT NOT NULL REFERENCES forecasts(id),\n  text        TEXT NOT NULL,\n  created_at  TEXT NOT NULL\n);\n\n-- Курс, который кто-то купил, удалить нельзя (только скрыть).\nCREATE TRIGGER courses_keep_purchased BEFORE DELETE ON courses\nWHEN EXISTS (SELECT 1 FROM enrollments WHERE course_id = OLD.id)\nBEGIN SELECT RAISE(ABORT, 'course_has_students'); END;\n\n-- Отзывы не удаляются: при нарушении модерация скрывает их флагом hidden.\n-- Отзыв оставляет только купивший ученик, а купленный курс удалить нельзя, поэтому каскад сюда не доходит.\nCREATE TRIGGER reviews_no_delete BEFORE DELETE ON reviews\nBEGIN SELECT RAISE(ABORT, 'review_immutable'); END;\n";

  // server/migrations/002_products.sql
  var products_default = "-- Dal, этап 2: общая модель продуктов для режимов «Работа с экспертом», «Сообщество» и «Идеи и аналитика».\n-- Курсы остаются в своих таблицах (у них модули, уроки и видео). Все остальные продукты устроены одинаково:\n-- автор, название, описание, цена, обложка, отзывы, рейтинг, модерация. Различаются только типом.\n--   experts:   consultation (одна встреча), personal (пакет встреч), mentorship (сопровождение — пакет встреч)\n--   community: clubs (закрытый клуб: встречи и чат), chats (чат с экспертом и участниками) — подписка\n--   ideas:     investment (инвестиционная идея), reviews (обзор рынка или компании) — материал, бесплатный или платный\n\nCREATE TABLE products (\n  id              TEXT PRIMARY KEY,\n  expert_id       TEXT NOT NULL REFERENCES users(id),\n  mode            TEXT NOT NULL CHECK (mode IN ('experts', 'community', 'ideas')),\n  type            TEXT NOT NULL CHECK (type IN ('consultation', 'personal', 'mentorship', 'clubs', 'chats', 'investment', 'reviews')),\n  title           TEXT NOT NULL DEFAULT '',\n  description     TEXT NOT NULL DEFAULT '',\n  price           INTEGER CHECK (price IS NULL OR price >= 0),\n  cover           TEXT,\n  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'hidden')),\n  duration_min    INTEGER CHECK (duration_min IS NULL OR duration_min BETWEEN 15 AND 240),  -- длительность встречи\n  sessions        INTEGER CHECK (sessions IS NULL OR sessions BETWEEN 1 AND 52),            -- встреч в пакете\n  period_days     INTEGER CHECK (period_days IS NULL OR period_days BETWEEN 7 AND 365),     -- срок подписки\n  meeting_url     TEXT,     -- ссылка на звонок или встречи клуба: видна только купившим\n  schedule_note   TEXT,     -- расписание встреч клуба словами\n  content         TEXT,     -- текст материала идеи или обзора\n  moderation_note TEXT,\n  submitted_at    TEXT,\n  published_at    TEXT,\n  created_at      TEXT NOT NULL,\n  updated_at      TEXT NOT NULL,\n  CHECK ((mode = 'experts' AND type IN ('consultation', 'personal', 'mentorship'))\n      OR (mode = 'community' AND type IN ('clubs', 'chats'))\n      OR (mode = 'ideas' AND type IN ('investment', 'reviews')))\n);\nCREATE INDEX products_expert ON products(expert_id);\nCREATE INDEX products_status ON products(status, mode);\n\n-- Покупка продукта. Для встреч — число встреч в пакете, для подписок — срок действия.\nCREATE TABLE product_purchases (\n  id             TEXT PRIMARY KEY,\n  user_id        TEXT NOT NULL REFERENCES users(id),\n  product_id     TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,\n  price_paid     INTEGER NOT NULL CHECK (price_paid >= 0),\n  commission     INTEGER NOT NULL CHECK (commission >= 0),\n  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refunded')),\n  sessions_total INTEGER,\n  expires_at     TEXT,\n  created_at     TEXT NOT NULL,\n  refunded_at    TEXT,\n  UNIQUE (user_id, product_id)\n);\nCREATE INDEX product_purchases_product ON product_purchases(product_id);\n\n-- Продление подписки — отдельная продажа (для дохода эксперта).\nCREATE TABLE product_renewals (\n  id          TEXT PRIMARY KEY,\n  purchase_id TEXT NOT NULL REFERENCES product_purchases(id),\n  price_paid  INTEGER NOT NULL CHECK (price_paid >= 0),\n  commission  INTEGER NOT NULL CHECK (commission >= 0),\n  created_at  TEXT NOT NULL\n);\n\n-- Слоты расписания эксперта для встреч. Занятый слот нельзя удалить.\nCREATE TABLE product_slots (\n  id          TEXT PRIMARY KEY,\n  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n  starts_at   TEXT NOT NULL,\n  booked_by   TEXT REFERENCES users(id),\n  purchase_id TEXT REFERENCES product_purchases(id),\n  booked_at   TEXT,\n  UNIQUE (product_id, starts_at)\n);\nCREATE INDEX product_slots_user ON product_slots(booked_by);\n\nCREATE TRIGGER product_slots_keep_booked BEFORE DELETE ON product_slots\nWHEN OLD.booked_by IS NOT NULL AND EXISTS (SELECT 1 FROM products WHERE id = OLD.product_id)\nBEGIN SELECT RAISE(ABORT, 'slot_booked'); END;\n\nCREATE TABLE product_messages (\n  id         TEXT PRIMARY KEY,\n  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n  user_id    TEXT NOT NULL REFERENCES users(id),\n  text       TEXT NOT NULL,\n  created_at TEXT NOT NULL\n);\nCREATE INDEX product_messages_product ON product_messages(product_id, created_at);\n\nCREATE TABLE product_reviews (\n  id         TEXT PRIMARY KEY,\n  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n  user_id    TEXT NOT NULL REFERENCES users(id),\n  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),\n  text       TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  reply      TEXT,\n  replied_at TEXT,\n  hidden     INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),\n  UNIQUE (product_id, user_id)\n);\nCREATE TRIGGER product_reviews_no_delete BEFORE DELETE ON product_reviews\nBEGIN SELECT RAISE(ABORT, 'review_immutable'); END;\n\nCREATE TABLE product_review_reports (\n  id          TEXT PRIMARY KEY,\n  review_id   TEXT NOT NULL REFERENCES product_reviews(id),\n  reporter_id TEXT NOT NULL REFERENCES users(id),\n  reason      TEXT NOT NULL,\n  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'kept', 'removed')),\n  created_at  TEXT NOT NULL,\n  decided_at  TEXT,\n  decided_by  TEXT REFERENCES users(id)\n);\n\nCREATE TRIGGER products_keep_purchased BEFORE DELETE ON products\nWHEN EXISTS (SELECT 1 FROM product_purchases WHERE product_id = OLD.id)\nBEGIN SELECT RAISE(ABORT, 'course_has_students'); END;\n\n-- Избранное: курсы и продукты.\nCREATE TABLE favorites (\n  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  item_id    TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  PRIMARY KEY (user_id, item_id)\n);\n\n-- Загруженное фото профиля (ученика или эксперта) и соцсети эксперта.\nALTER TABLE users ADD COLUMN avatar_file TEXT;\nALTER TABLE expert_profiles ADD COLUMN socials TEXT NOT NULL DEFAULT '{}';\n";

  // server/migrations/003_solana.sql
  var solana_default = "-- Фиксация прогнозов в блокчейне Solana (devnet): подпись транзакции с записью (memo) условий прогноза.\n-- Сама запись в блокчейне неизменяема; здесь хранится ссылка на неё. Запись делается один раз и не меняется.\nCREATE TABLE forecast_anchors (\n  forecast_id TEXT PRIMARY KEY REFERENCES forecasts(id) ON DELETE RESTRICT,\n  cluster     TEXT NOT NULL CHECK (cluster IN ('devnet', 'mainnet-beta')),\n  signature   TEXT NOT NULL UNIQUE,\n  wallet      TEXT NOT NULL,\n  memo        TEXT NOT NULL,\n  created_at  TEXT NOT NULL\n);\nCREATE TRIGGER forecast_anchors_immutable BEFORE UPDATE ON forecast_anchors\nBEGIN SELECT RAISE(ABORT, 'anchor_immutable'); END;\nCREATE TRIGGER forecast_anchors_no_delete BEFORE DELETE ON forecast_anchors\nBEGIN SELECT RAISE(ABORT, 'anchor_immutable'); END;\n";

  // web/src/entry.ts
  var SEED_VIDEO2 = "/server/seed-assets/demo-lesson.mp4";
  var IDB = "dal-browser";
  var VERSION = 1;
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(IDB, VERSION);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("kv");
        r.result.createObjectStore("files");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  var tx = (db, store2, mode, fn) => new Promise((res, rej) => {
    const t = db.transaction(store2, mode), r = fn(t.objectStore(store2));
    t.oncomplete = () => res(r?.result);
    t.onerror = () => rej(t.error);
  });
  var app;
  var store;
  async function init(SQL) {
    state.SQL = SQL;
    store = await idb();
    const saved = await tx(store, "kv", "readonly", (s) => s.get("db"));
    await new Promise((res, rej) => {
      const r = store.transaction("files").objectStore("files").openCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return res();
        vfs.set(String(c.key), c.value);
        c.continue();
      };
      r.onerror = () => rej(r.error);
    });
    hooks.onSet = (p, v) => {
      if (p.startsWith("/storage/")) tx(store, "files", "readwrite", (s) => s.put(v, p));
    };
    hooks.onDelete = (p) => {
      if (p.startsWith("/storage/")) tx(store, "files", "readwrite", (s) => s.delete(p));
    };
    vfs.set("/server/migrations/001_init.sql", init_default);
    vfs.set("/server/migrations/002_products.sql", products_default);
    vfs.set("/server/migrations/003_solana.sql", solana_default);
    const video = await fetch(SEED_VIDEO2).then((r) => r.ok ? r.blob() : new Blob([])).catch(() => new Blob([]));
    vfs.set(SEED_VIDEO2, video);
    state.initial = saved ? new Uint8Array(saved) : null;
    const db = openDb("/data/dal.db");
    migrate(db, "/server/migrations");
    if (!saved) {
      const [dal, studio] = await Promise.all(["data.js", "studio-data.js"].map((f) => fetch("/" + f).then((r) => r.text())));
      vfs.set("/site/data.js", dal);
      vfs.set("/site/studio-data.js", studio);
      db.tx(() => seed(db, "/site", "/server/seed-assets"));
    }
    app = { db, router: createRouter(), storageDir: "/storage", siteDir: "/site", seedDir: "/server/seed-assets", loginLimiter: createLoginLimiter() };
    for (const reg of [registerAuth, registerCatalog, registerLearning, registerStudioCourses, registerStudioForecasts, registerStudioOther, registerModeration, registerProducts]) reg(app);
    await save();
  }
  async function save() {
    const bytes2 = state.current.export();
    await tx(store, "kv", "readwrite", (s) => s.put(bytes2, "db"));
  }
  async function reset() {
    store?.close();
    await new Promise((r) => {
      const q = indexedDB.deleteDatabase(IDB);
      q.onsuccess = q.onerror = q.onblocked = r;
    });
  }
  async function handle(method, rawUrl, headers = {}, body) {
    const url = new URL(rawUrl, "http://local");
    const h = {};
    for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = String(v);
    const req = { method, headers: h, url: url.pathname + url.search, __blob: body instanceof Blob ? body : void 0 };
    const res = { headersSent: false, status: 200, headers: {}, writeHead(s, hd) {
      this.status = s;
      this.headers = hd || {};
      this.headersSent = true;
    }, setHeader() {
    }, end() {
    }, destroy() {
    }, on() {
    } };
    try {
      const m = app.router.match(method, url.pathname);
      if (m === null) throw notFound("Такого адреса нет");
      if (m === "method") throw new HttpError(405, "method_not_allowed", "Метод не поддерживается для этого адреса");
      const { route, params } = m;
      const ctx = { req, res, params, query: url.searchParams, body: {}, user: userFromToken(app.db, tokenFrom(req, url)) };
      if (route.auth) {
        if (!ctx.user) throw new HttpError(401, "unauthorized", "Нужно войти в аккаунт");
        if (Array.isArray(route.auth) && !route.auth.includes(ctx.user.role)) throw forbidden();
      }
      if (!route.raw && ["POST", "PUT", "PATCH", "DELETE"].includes(route.method)) ctx.body = body && typeof body === "object" && !(body instanceof Blob) ? JSON.parse(JSON.stringify(body)) : {};
      const result = await route.handler(ctx);
      if (method !== "GET") await save();
      if (ctx.handled) return { status: res.status, blob: res.__blob, type: res.headers["Content-Type"] };
      const status = ctx.status ?? (result === void 0 ? 204 : 200);
      return { status, data: result === void 0 ? void 0 : JSON.parse(JSON.stringify(result)) };
    } catch (e) {
      const err = mapError(e);
      if (err.status >= 500) console.error(e);
      return { status: err.status, data: { error: { code: err.code, message: err.message, ...err.details ? { details: err.details } : {} } } };
    }
  }
  return __toCommonJS(entry_exports);
})();
