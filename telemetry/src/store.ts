// 事件存储：基于 Bun 内置 SQLite（bun:sqlite），零外部依赖。
import { Database } from "bun:sqlite";
import type { PlanSnapshot, TelemetryEvent } from "./schema.ts";

export interface ActorRecord {
  actor_id: string;
  display_name: string;
  role: string;
}

export interface UserPrefs {
  actor_id: string;
  watched_projects: string[];
  role_view: string;
}

export class EventStore {
  private db: Database;
  private actorsBackfilled = false;

  /** path 为 ":memory:" 时使用内存库（测试用）。 */
  constructor(path: string) {
    this.db = new Database(path);
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run(`
      CREATE TABLE IF NOT EXISTS events (
        event_id       TEXT PRIMARY KEY,
        ts             TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        actor_role     TEXT NOT NULL,
        actor_id       TEXT NOT NULL,
        tool           TEXT NOT NULL,
        project_id     TEXT NOT NULL,
        milestone      TEXT,
        skill          TEXT,
        phase          TEXT,
        event_type     TEXT NOT NULL,
        outcome        TEXT,
        attrs          TEXT NOT NULL,
        received_at    TEXT NOT NULL
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);");
    this.migrate();
  }

  /** 轻量迁移：为旧库补齐后加的列（CREATE TABLE IF NOT EXISTS 不会改已存在的表）。 */
  private migrate(): void {
    const cols = this.db.query("PRAGMA table_info(events)").all() as { name: string }[];
    const have = new Set(cols.map((c) => c.name));
    if (!have.has("milestone")) {
      this.db.run("ALTER TABLE events ADD COLUMN milestone TEXT");
    }
    this.db.run(`
      CREATE TABLE IF NOT EXISTS actors (
        actor_id     TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        role         TEXT NOT NULL DEFAULT 'dev',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_prefs (
        actor_id         TEXT PRIMARY KEY,
        watched_projects TEXT NOT NULL DEFAULT '[]',
        role_view        TEXT NOT NULL DEFAULT 'dev',
        updated_at       TEXT NOT NULL
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_actors_role ON actors(role);");
    this.backfillActorsIfEmpty();
  }

  private backfillActorsIfEmpty(): void {
    if (this.actorsBackfilled) return;
    const count = this.db.query("SELECT COUNT(*) AS n FROM actors").get() as { n: number };
    if (count.n > 0) {
      this.actorsBackfilled = true;
      return;
    }
    const now = new Date().toISOString();
    const rows = this.db.query("SELECT DISTINCT actor_id FROM events").all() as { actor_id: string }[];
    const insert = this.db.query(
      `INSERT OR IGNORE INTO actors (actor_id, display_name, role, created_at, updated_at)
       VALUES ($actor_id, 'Allen', 'dev', $created_at, $updated_at)`,
    );
    for (const row of rows) {
      insert.run({ $actor_id: row.actor_id, $created_at: now, $updated_at: now });
    }
    if (rows.length > 0) this.actorsBackfilled = true;
  }

  /** 幂等插入（event_id 重复则忽略，支持离线补传重发）。返回是否为新事件。 */
  insert(e: TelemetryEvent): boolean {
    const res = this.db
      .query(
        `INSERT OR IGNORE INTO events
         (event_id, ts, schema_version, actor_role, actor_id, tool, project_id, milestone, skill, phase, event_type, outcome, attrs, received_at)
         VALUES ($event_id,$ts,$schema_version,$actor_role,$actor_id,$tool,$project_id,$milestone,$skill,$phase,$event_type,$outcome,$attrs,$received_at)`,
      )
      .run({
        $event_id: e.event_id,
        $ts: e.ts,
        $schema_version: e.schema_version,
        $actor_role: e.actor_role,
        $actor_id: e.actor_id,
        $tool: e.tool,
        $project_id: e.project_id,
        $milestone: e.milestone,
        $skill: e.skill,
        $phase: e.phase,
        $event_type: e.event_type,
        $outcome: e.outcome,
        $attrs: JSON.stringify(e.attrs),
        $received_at: new Date().toISOString(),
      });
    const inserted = res.changes > 0;
    if (inserted) this.backfillActorsIfEmpty();
    return inserted;
  }

  all(filter?: { project_id?: string; since?: string }): TelemetryEvent[] {
    let sql = "SELECT * FROM events";
    const conds: string[] = [];
    const params: Record<string, string> = {};
    if (filter?.project_id) {
      conds.push("project_id = $project_id");
      params.$project_id = filter.project_id;
    }
    if (filter?.since) {
      conds.push("ts >= $since");
      params.$since = filter.since;
    }
    if (conds.length) sql += " WHERE " + conds.join(" AND ");
    sql += " ORDER BY ts ASC";
    const rows = this.db.query(sql).all(params) as Record<string, unknown>[];
    return rows.map((row) => ({
      schema_version: row.schema_version as number,
      event_id: row.event_id as string,
      ts: row.ts as string,
      actor_role: row.actor_role as TelemetryEvent["actor_role"],
      actor_id: row.actor_id as string,
      tool: row.tool as TelemetryEvent["tool"],
      project_id: row.project_id as string,
      milestone: (row.milestone as string) ?? "",
      skill: row.skill as string,
      phase: row.phase as string,
      event_type: row.event_type as TelemetryEvent["event_type"],
      outcome: (row.outcome as TelemetryEvent["outcome"]) ?? null,
      attrs: JSON.parse((row.attrs as string) || "{}"),
    }));
  }

  count(): number {
    const row = this.db.query("SELECT COUNT(*) AS n FROM events").get() as { n: number };
    return row.n;
  }

  latestPlanSnapshots(project_id?: string): PlanSnapshot[] {
    const events = this.all(project_id ? { project_id } : undefined)
      .filter((event) => event.event_type === "plan_sync")
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const latest = new Map<string, PlanSnapshot>();
    for (const event of events) {
      const plan = (event.attrs as { plan?: PlanSnapshot }).plan;
      if (!plan?.root) continue;
      latest.set(`${event.project_id}\u0000${plan.root}`, plan);
    }
    return Array.from(latest.values());
  }

  listActors(): ActorRecord[] {
    this.backfillActorsIfEmpty();
    return this.db
      .query("SELECT actor_id, display_name, role FROM actors ORDER BY actor_id ASC")
      .all() as ActorRecord[];
  }

  upsertActor(actor: { actor_id: string; display_name?: string; role?: string }): ActorRecord {
    const actorId = actor.actor_id.trim();
    const displayName = actor.display_name ?? actorId;
    const role = actor.role ?? "dev";
    const now = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO actors (actor_id, display_name, role, created_at, updated_at)
         VALUES ($actor_id, $display_name, $role, $created_at, $updated_at)
         ON CONFLICT(actor_id) DO UPDATE SET
           display_name = excluded.display_name,
           role = excluded.role,
           updated_at = excluded.updated_at`,
      )
      .run({
        $actor_id: actorId,
        $display_name: displayName,
        $role: role,
        $created_at: now,
        $updated_at: now,
      });
    return this.db
      .query("SELECT actor_id, display_name, role FROM actors WHERE actor_id = $actor_id")
      .get({ $actor_id: actorId }) as ActorRecord;
  }

  resolveName(id: string): string {
    const row = this.db
      .query("SELECT display_name FROM actors WHERE actor_id = $actor_id")
      .get({ $actor_id: id }) as { display_name: string } | null;
    return row?.display_name ?? id;
  }

  getPrefs(id: string): UserPrefs {
    const row = this.db
      .query("SELECT actor_id, watched_projects, role_view FROM user_prefs WHERE actor_id = $actor_id")
      .get({ $actor_id: id }) as { actor_id: string; watched_projects: string; role_view: string } | null;
    if (row) {
      return {
        actor_id: row.actor_id,
        watched_projects: parseStringArray(row.watched_projects),
        role_view: row.role_view,
      };
    }

    const projects = this.db
      .query("SELECT DISTINCT project_id FROM events WHERE actor_id = $actor_id ORDER BY project_id ASC")
      .all({ $actor_id: id }) as { project_id: string }[];
    const actor = this.db
      .query("SELECT role FROM actors WHERE actor_id = $actor_id")
      .get({ $actor_id: id }) as { role: string } | null;

    return {
      actor_id: id,
      watched_projects: projects.map((project) => project.project_id),
      role_view: roleToView(actor?.role),
    };
  }

  upsertPrefs(id: string, patch: { watched_projects?: string[]; role_view?: string }): UserPrefs {
    const current = this.getPrefs(id);
    const next: UserPrefs = {
      actor_id: id,
      watched_projects: patch.watched_projects ?? current.watched_projects,
      role_view: patch.role_view ?? current.role_view,
    };
    this.db
      .query(
        `INSERT INTO user_prefs (actor_id, watched_projects, role_view, updated_at)
         VALUES ($actor_id, $watched_projects, $role_view, $updated_at)
         ON CONFLICT(actor_id) DO UPDATE SET
           watched_projects = excluded.watched_projects,
           role_view = excluded.role_view,
           updated_at = excluded.updated_at`,
      )
      .run({
        $actor_id: id,
        $watched_projects: JSON.stringify(next.watched_projects),
        $role_view: next.role_view,
        $updated_at: new Date().toISOString(),
      });
    return next;
  }

  close(): void {
    this.db.close();
  }
}

function parseStringArray(json: string): string[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function roleToView(role: string | undefined): string {
  if (role === "pm" || role === "ops") return "boss";
  return role || "dev";
}
