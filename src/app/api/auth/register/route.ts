import { normalizeHandle, hashPassword, verifyPassword } from "@/server/auth";
import { HttpError, errorResponse, readJson } from "@/server/http";
import { getStore } from "@/server/store";
import { issueSession } from "@/server/session";


const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface Body {
  email?: string;
  password?: string;
  name?: string;
  handle?: string;
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Body>(request);
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !EMAIL_RE.test(email)) throw new HttpError(422, "enter a valid email address");

    const store = getStore();

    // In development the same form doubles as sign-in, so a demo account can be
    // reclaimed after a restart without a second form.
    if (process.env.NODE_ENV !== "production") {
      const existing = await store.findUserByEmail(email);
      if (existing && (await verifyPassword(password, existing.passwordHash))) {
        return issueSession(existing.id, existing.name);
      }
    }

    const name = body.name?.trim().slice(0, 80);
    if (!name) throw new HttpError(422, "tell us your name");
    if (password.length < 8) throw new HttpError(422, "passwords need at least 8 characters");

    const handle = normalizeHandle(body.handle?.trim() || email.split("@")[0]);
    if (handle.length < 2) throw new HttpError(422, "handle needs at least two letters");
    if (await store.findUserByEmail(email)) throw new HttpError(409, "that email is already registered — sign in instead");
    if (await store.findUserByHandle(handle)) throw new HttpError(409, `the handle "${handle}" is taken`);

    const id = crypto.randomUUID();
    await store.insertUser({
      id,
      email,
      name,
      handle,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    });
    return issueSession(id, name);
  } catch (err) {
    return errorResponse(err);
  }
}
