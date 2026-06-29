import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, destroySession } from "@/lib/auth-server";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
