// 中心遥测收集器（Bun HTTP 服务）。
// 接收 emit.sh 发来的事件并入库；提供健康检查与即时指标查询。
//
// 启动：bun run src/server.ts
// 环境变量：
//   FPG_TELEMETRY_PORT    监听端口（默认 10000）
//   FPG_TELEMETRY_DB      SQLite 文件路径（默认 ./data/events.db）
//   FPG_TELEMETRY_TOKEN   若设置，则 /events 需带 Authorization: Bearer <token>
import { EventStore } from "./store.ts";
import { validateEvent } from "./schema.ts";
import { computeMetrics } from "./metrics.ts";
import { renderDashboard } from "./dashboard.ts";

const PORT = Number(process.env.FPG_TELEMETRY_PORT ?? 10000);
const DB_PATH = process.env.FPG_TELEMETRY_DB ?? "./data/events.db";
const TOKEN = process.env.FPG_TELEMETRY_TOKEN ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authorized(req: Request, token: string): boolean {
  if (!token) return true;
  const h = req.headers.get("authorization") ?? "";
  return h === `Bearer ${token}`;
}

async function readJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function createTelemetryHandler(store: EventStore, token: string) {
  return async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok", events: store.count() });
    }

    if (req.method === "GET" && url.pathname === "/stats") {
      const project = url.searchParams.get("project") ?? undefined;
      return json(computeMetrics(store.all(project ? { project_id: project } : undefined)));
    }

    // 度量看板：浏览器打开 http://localhost:10000/report[?project=xxx]
    if (req.method === "GET" && (url.pathname === "/report" || url.pathname === "/")) {
      const project = url.searchParams.get("project") ?? undefined;
      const m = computeMetrics(store.all(project ? { project_id: project } : undefined));
      return new Response(renderDashboard(m, project ? `project=${project}` : "全部项目"), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (req.method === "GET" && url.pathname === "/api/actors") {
      return json(store.listActors());
    }

    if (req.method === "PUT" && url.pathname.startsWith("/api/actors/")) {
      if (!authorized(req, token)) return json({ error: "unauthorized" }, 401);
      const actorId = decodeURIComponent(url.pathname.slice("/api/actors/".length));
      const body = await readJson(req);
      if (typeof body !== "object" || body === null) return json({ error: "invalid json" }, 400);
      const patch = body as { display_name?: unknown; role?: unknown };
      if (typeof patch.display_name === "string" && patch.display_name.trim() === "") {
        return json({ error: "display_name empty" }, 400);
      }
      return json(
        store.upsertActor({
          actor_id: actorId,
          display_name: typeof patch.display_name === "string" ? patch.display_name : undefined,
          role: typeof patch.role === "string" ? patch.role : undefined,
        }),
      );
    }

    if (req.method === "POST" && url.pathname === "/events") {
      if (!authorized(req, token)) return json({ error: "unauthorized" }, 401);
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid json" }, 400);
      }
      // 支持单条或批量
      const items = Array.isArray(body) ? body : [body];
      let accepted = 0;
      const rejected: { index: number; errors: string[] }[] = [];
      items.forEach((item, i) => {
        const v = validateEvent(item);
        if (v.ok && v.event) {
          store.insert(v.event);
          accepted++;
        } else {
          rejected.push({ index: i, errors: v.errors });
        }
      });
      return json({ accepted, rejected }, rejected.length && !accepted ? 422 : 202);
    }

    return json({ error: "not found" }, 404);
  };
}

// 确保 DB 目录存在
if (import.meta.main) {
  if (DB_PATH !== ":memory:") {
    const dir = DB_PATH.split("/").slice(0, -1).join("/");
    if (dir) await Bun.$`mkdir -p ${dir}`.quiet().nothrow();
  }

  const store = new EventStore(DB_PATH);
  const server = Bun.serve({
    port: PORT,
    fetch: createTelemetryHandler(store, TOKEN),
  });

  console.log(`[fpg-telemetry] collector listening on http://localhost:${server.port}`);
  console.log(`[fpg-telemetry] db=${DB_PATH} auth=${TOKEN ? "on" : "off"}`);
}
