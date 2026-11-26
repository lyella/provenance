import { cookies } from "next/headers";
import { hashSessionToken, SESSION_COOKIE } from "@/server/auth";
import { errorResponse, json } from "@/server/http";
import { getStore } from "@/server/store";


export async function POST() {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) await getStore().deleteSession(hashSessionToken(token));
    const res = json({ ok: true });
    res.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
