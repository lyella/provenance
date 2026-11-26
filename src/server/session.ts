import { newSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/auth";
import { json } from "@/server/http";
import { getStore } from "@/server/store";

/** Create a session row and return a response that carries the session cookie. */
export async function issueSession(userId: string, name: string): Promise<Response> {
  const { token, hash } = newSessionToken();
  const now = new Date();
  await getStore().insertSession({
    hash,
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
  });
  const res = json({ ok: true, name });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  );
  return res;
}
