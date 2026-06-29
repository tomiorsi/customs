import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import type { PublicUser } from "./types";

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;

export type { Rol } from "./types";

export type DBUser = PublicUser & { password_hash: string };

export type SafeUser = PublicUser;

export function toSafeUser(u: DBUser): SafeUser {
  const { password_hash: _omit, ...rest } = u;
  return rest;
}

export function createSession(userId: string): { token: string; expires: Date } {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(token, userId, expires.toISOString());
  return { token, expires };
}

export function destroySession(token: string) {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(token);
}

export function getUserByToken(token: string | undefined | null): DBUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now')`,
    )
    .get(token) as DBUser | undefined;
  return row ?? null;
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const user = getUserByToken(token);
  return user ? toSafeUser(user) : null;
}
