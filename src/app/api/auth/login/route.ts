import { issueSession } from "@/server/session";
import { HttpError, errorResponse, readJson } from "@/server/http";
import { verifyPassword } from "@/server/auth";
import { getStore } from "@/server/store";


interface Body {
  email?: string;
  password?: string;
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Body>(request);
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) throw new HttpError(422, "email and password are required");

    const store = getStore();
    const user = await store.findUserByEmail(email);
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) throw new HttpError(401, "email or password is incorrect");

    return issueSession(user.id, user.name);
  } catch (err) {
    return errorResponse(err);
  }
}
