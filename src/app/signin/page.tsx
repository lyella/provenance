import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="shell grid max-w-5xl gap-12 py-14 md:grid-cols-[1fr_24rem] md:items-start">
      <div>
        <p className="label">Your ledger</p>
        <h1 className="display-xl mt-4 max-w-[14ch]">Open it, or reclaim it.</h1>
        <p className="mt-5 max-w-[38ch] text-sm leading-relaxed text-ink-soft">
          Every case you keep is private until you seal it. Sealed records are public, permalinkable, and verifiable
          without an account.
        </p>
      </div>
      <AuthForm />
    </main>
  );
}
