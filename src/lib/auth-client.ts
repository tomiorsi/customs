"use client";

import type { PublicUser } from "./types";

type LoginInput = { identifier: string; password: string };

type SignupInput = {
  companyName: string;
  personType?: string;
  email: string;
  password: string;
  cuit?: string;
  ivaCondition?: string;
  certExencion?: string;
  contactName?: string;
  phone?: string;
  address?: string;
};

type AuthResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: string };

export async function loginRequest(input: LoginInput): Promise<AuthResult> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? "Error al ingresar." };
  return { ok: true, user: data.user };
}

export async function signupRequest(input: SignupInput): Promise<AuthResult> {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? "Error al registrarse." };
  return { ok: true, user: data.user };
}

export async function logoutRequest(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
