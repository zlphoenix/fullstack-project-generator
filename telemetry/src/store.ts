// 事件存储：基于 Bun 内置 SQLite（bun:sqlite），零外部依赖。
import { Database } from "bun:sqlite";
import type { TelemetryEvent } from "./schema.ts";

export class EventStore {
  private db: Database;

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
    return res.changes > 0;
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

  close(): void {
    this.db.close();
  }
}
