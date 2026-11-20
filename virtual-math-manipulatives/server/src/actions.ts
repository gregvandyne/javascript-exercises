import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "./schema";

function makeCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)] ?? "A";
  return s;
}

const sessionOut = z.object({
  id: z.number(),
  code: z.string(),
  tool_slug: z.string(),
  title: z.string(),
  teacher_state_json: z.string(),
  pushed_state_json: z.string().nullable(),
  status: z.string(),
  created_at: z.string(),
});
const subOut = z.object({
  id: z.number(),
  student_name: z.string(),
  state_json: z.string(),
  updated_at: z.string(),
});
type SessionRow = typeof schema.liveSessions.$inferSelect;
function sessionToOut(r: SessionRow): z.infer<typeof sessionOut> {
  return { id: r.id, code: r.code, tool_slug: r.toolSlug, title: r.title, teacher_state_json: r.teacherStateJson, pushed_state_json: r.pushedStateJson, status: r.status, created_at: r.createdAt.toISOString() };
}
const okResponse = z.object({ ok: z.literal(true) });

/* AI lesson draft: the model returns a board layout in board-fraction
   coordinates (0..1 per axis) so the client can place pieces, sticky notes
   and pen strokes on any screen size. Pieces may only use kinds from the
   vocabulary the client sends (the tool's own palette definitions). */
const draftShape = z.object({
  board_title: z.string(),
  pieces: z.array(z.object({ kind: z.string(), x: z.number(), y: z.number() })),
  notes: z.array(z.object({ text: z.string(), x: z.number(), y: z.number() })),
  strokes: z.array(z.object({ color: z.string(), points: z.array(z.object({ x: z.number(), y: z.number() })) })),
});
type DraftShape = z.infer<typeof draftShape>;
const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
function sanitizeDraft(d: DraftShape, vocabKinds: Set<string>): DraftShape {
  return {
    board_title: d.board_title.slice(0, 120) || "AI lesson draft",
    pieces: (vocabKinds.size ? d.pieces.filter((p) => vocabKinds.has(p.kind)) : [])
      .slice(0, 30)
      .map((p) => ({ kind: p.kind, x: clamp01(p.x), y: clamp01(p.y) })),
    notes: d.notes
      .filter((n) => n.text.trim().length > 0)
      .slice(0, 6)
      .map((n) => ({ text: n.text.slice(0, 300), x: clamp01(n.x), y: clamp01(n.y) })),
    strokes: d.strokes
      .slice(0, 4)
      .map((s) => ({
        color: /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : "#FF6B4A",
        points: s.points.slice(0, 40).map((pt) => ({ x: clamp01(pt.x), y: clamp01(pt.y) })),
      }))
      .filter((s) => s.points.length > 1),
  };
}

const wsOut = z.object({
  id: z.number(),
  code: z.string(),
  tool_slug: z.string(),
  title: z.string(),
  state_json: z.string(),
  created_at: z.string(),
});

export const Actions = {
  saveWorkspace: defineAction({
    description: "Saves a manipulative workspace and returns its 8-character share code.",
    request: z.object({
      tool_slug: z.string().min(1).max(60),
      title: z.string().min(1).max(120),
      state_json: z.string().min(2).max(200000),
    }),
    response: z.object({ id: z.number(), code: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const code = makeCode();
      const result = await db
        .insert(schema.workspaces)
        .values({ code, toolSlug: args.tool_slug, title: args.title, stateJson: args.state_json })
        .returning({ id: schema.workspaces.id });
      const row = result[0];
      if (!row) throw new Error("saveWorkspace: insert returned no rows");
      ctx.invalidateQueries();
      return { id: row.id, code };
    },
  }),
  loadWorkspace: defineAction({
    description: "Loads a saved workspace by its 8-character share code.",
    request: z.object({ code: z.string().min(4).max(12) }),
    response: z.object({ workspace: wsOut.nullable() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.workspaces).where(eq(schema.workspaces.code, args.code.trim().toUpperCase())).limit(1);
      const r = rows[0];
      if (!r) return { workspace: null };
      return { workspace: { id: r.id, code: r.code, tool_slug: r.toolSlug, title: r.title, state_json: r.stateJson, created_at: r.createdAt.toISOString() } };
    },
  }),
  listWorkspaces: defineAction({
    description: "Lists recently saved workspaces, newest first.",
    request: z.object({ limit: z.number().int().positive().max(100).default(30) }),
    response: z.object({ workspaces: z.array(wsOut) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.workspaces).orderBy(desc(schema.workspaces.id)).limit(args.limit);
      return { workspaces: rows.map((r) => ({ id: r.id, code: r.code, tool_slug: r.toolSlug, title: r.title, state_json: r.stateJson, created_at: r.createdAt.toISOString() })) };
    },
  }),
  createLiveSession: defineAction({
    description: "Creates a LIVE classroom session for a tool and returns its join code.",
    request: z.object({
      tool_slug: z.string().min(1).max(60),
      title: z.string().min(1).max(120),
      teacher_state_json: z.string().max(200000).default("{}"),
    }),
    response: z.object({ id: z.number(), code: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const code = makeCode();
      const result = await db
        .insert(schema.liveSessions)
        .values({ code, toolSlug: args.tool_slug, title: args.title, teacherStateJson: args.teacher_state_json, status: "active" })
        .returning({ id: schema.liveSessions.id });
      const row = result[0];
      if (!row) throw new Error("createLiveSession: insert returned no rows");
      ctx.invalidateQueries();
      return { id: row.id, code };
    },
  }),
  joinLiveSession: defineAction({
    description: "Joins a student to a LIVE session by code and display name; returns the session.",
    request: z.object({ code: z.string().min(4).max(12), student_name: z.string().trim().min(1).max(40) }),
    response: z.object({ session: sessionOut.nullable() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.liveSessions).where(eq(schema.liveSessions.code, args.code.trim().toUpperCase())).limit(1);
      const s = rows[0];
      if (!s) return { session: null };
      if (s.status === "active") {
        const existing = await db.select().from(schema.liveSubmissions).where(eq(schema.liveSubmissions.sessionId, s.id));
        const mine = existing.find((e) => e.studentName.toLowerCase() === args.student_name.toLowerCase());
        if (!mine) {
          await db.insert(schema.liveSubmissions).values({ sessionId: s.id, studentName: args.student_name, stateJson: "{}", updatedAt: new Date() });
        }
        ctx.invalidateQueries();
      }
      return { session: sessionToOut(s) };
    },
  }),
  submitLiveWork: defineAction({
    description: "Saves a student's current workspace state into their LIVE session.",
    request: z.object({ code: z.string().min(4).max(12), student_name: z.string().trim().min(1).max(40), state_json: z.string().min(2).max(200000) }),
    response: okResponse,
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.liveSessions).where(eq(schema.liveSessions.code, args.code.trim().toUpperCase())).limit(1);
      const s = rows[0];
      if (!s) throw new Error("No LIVE session found for that code.");
      if (s.status !== "active") throw new Error("This LIVE session has ended.");
      const existing = await db.select().from(schema.liveSubmissions).where(eq(schema.liveSubmissions.sessionId, s.id));
      const mine = existing.find((e) => e.studentName.toLowerCase() === args.student_name.toLowerCase());
      if (mine) {
        await db.update(schema.liveSubmissions).set({ stateJson: args.state_json, updatedAt: new Date() }).where(eq(schema.liveSubmissions.id, mine.id));
      } else {
        await db.insert(schema.liveSubmissions).values({ sessionId: s.id, studentName: args.student_name, stateJson: args.state_json, updatedAt: new Date() });
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
  getLiveSession: defineAction({
    description: "Returns a LIVE session and every student's latest submitted work.",
    request: z.object({ code: z.string().min(4).max(12) }),
    response: z.object({ session: sessionOut.nullable(), participants: z.array(subOut) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.liveSessions).where(eq(schema.liveSessions.code, args.code.trim().toUpperCase())).limit(1);
      const s = rows[0];
      if (!s) return { session: null, participants: [] };
      const subs = await db.select().from(schema.liveSubmissions).where(eq(schema.liveSubmissions.sessionId, s.id)).orderBy(desc(schema.liveSubmissions.updatedAt));
      return { session: sessionToOut(s), participants: subs.map((r) => ({ id: r.id, student_name: r.studentName, state_json: r.stateJson, updated_at: r.updatedAt.toISOString() })) };
    },
  }),
  pushLiveWorkspace: defineAction({
    description: "Pushes the teacher's workspace state to every student in a LIVE session.",
    request: z.object({ code: z.string().min(4).max(12), state_json: z.string().min(2).max(200000) }),
    response: okResponse,
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.liveSessions).where(eq(schema.liveSessions.code, args.code.trim().toUpperCase())).limit(1);
      const s = rows[0];
      if (!s) throw new Error("No LIVE session found for that code.");
      if (s.status !== "active") throw new Error("This LIVE session has ended.");
      await db.update(schema.liveSessions).set({ teacherStateJson: args.state_json, pushedStateJson: args.state_json }).where(eq(schema.liveSessions.id, s.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
  endLiveSession: defineAction({
    description: "Ends a LIVE session so students can no longer submit work.",
    request: z.object({ code: z.string().min(4).max(12) }),
    response: okResponse,
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.liveSessions).where(eq(schema.liveSessions.code, args.code.trim().toUpperCase())).limit(1);
      const s = rows[0];
      if (!s) throw new Error("No LIVE session found for that code.");
      await db.update(schema.liveSessions).set({ status: "ended" }).where(eq(schema.liveSessions.id, s.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
  draftLesson: defineAction({
    description: "Uses AI to draft a lesson board for a manipulative workspace: pieces placed, sticky notes with instructions and questions, and pen annotations, from a teacher's description or a library task.",
    request: z.object({
      tool_slug: z.string().min(1).max(60),
      tool_name: z.string().min(1).max(80),
      grades: z.string().max(20).default(""),
      brief: z.string().trim().min(3).max(1000),
      task: z.string().max(600).default(""),
      vocab: z.array(z.object({ kind: z.string().min(1).max(40), label: z.string().min(1).max(60), value: z.number() })).max(24).default([]),
    }),
    response: draftShape,
    async handler(ctx, args): Promise<DraftShape> {
      const vocabLines = args.vocab.map((v) => `- kind "${v.kind}": ${v.label} (value ${v.value})`).join("\n");
      const prompt = [
        `You are setting up a virtual math manipulative board for a teacher, Miro-board style: pieces placed on the board, sticky notes with the instructions and questions, and a few pen annotations. The teacher will teach straight from this board, then save it and assign it to students.`,
        `Tool: ${args.tool_name}${args.grades ? ` (grades ${args.grades})` : ""}.`,
        `Teacher's lesson description: ${args.brief}`,
        args.task ? `Base it on this task from the tool's library: ${args.task}` : "",
        args.vocab.length
          ? `Placeable pieces (use ONLY these kinds, spelled exactly):\n${vocabLines}`
          : `This tool has no placeable pieces: return an empty pieces list and carry the whole lesson in the sticky notes.`,
        `Coordinates: x and y are fractions of the board, 0 is left/top, 1 is right/bottom. Keep pieces inside x 0.02..0.9 and y 0.05..0.85, arranged in tidy groups or rows with small gaps so nothing overlaps. Reserve the corners and edges for the sticky notes.`,
        `board_title: a short title for the lesson (under 60 characters).`,
        `pieces: exactly the pieces the lesson needs (at most 30). For a build-a-number lesson place the pieces that make the target; for an explore lesson place a useful working set grouped by kind.`,
        `notes: 2 to 4 sticky notes. The first note carries the lesson title and what students should do. The others carry questions, challenges or a "show your working" prompt. Keep each note under 140 characters, plain and friendly for kids. Position notes at clear corners or edges (for example x 0.03 or 0.6, y 0.03 or 0.7), away from the pieces.`,
        `strokes: 0 to 3 simple pen annotations in hex colours like #FF6B4A: a ring around a group of pieces (12 to 16 points forming a closed loop around it), an arrow (2 points), or an underline (2 points). Points are board fractions.`,
      ].filter(Boolean).join("\n");
      const raw = await ctx.inference.complete(prompt, { schema: draftShape });
      return sanitizeDraft(raw, new Set(args.vocab.map((v) => v.kind)));
    },
  }),
  deleteWorkspace: defineAction({
    description: "Deletes a saved workspace by id.",
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.workspaces).where(eq(schema.workspaces.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
