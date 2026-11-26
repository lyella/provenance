import { Suspense } from "react";
import { VerifyPanel } from "@/components/verify-panel";

export const metadata = { title: "Verify a proof" };

async function Panel({ searchParams }: Pick<PageProps<"/verify">, "searchParams">) {
  const params = await searchParams;
  const ref = typeof params.ref === "string" ? params.ref : undefined;
  return <VerifyPanel initialRef={ref} />;
}

export default function VerifyPage(props: PageProps<"/verify">) {
  return (
    <main className="shell py-12 sm:py-16">
      <div className="border-b border-ink pb-5">
        <p className="label">Trust, checkable</p>
        <h1 className="display-xl mt-4 max-w-[20ch]">
          Verify a proof <span className="em-serif text-ink-faint">without trusting us.</span>
        </h1>
        <p className="mt-5 max-w-[52ch] text-sm leading-relaxed text-ink-soft">
          Load a case&rsquo;s proof bundle or paste one you were given. Every hash is recomputed in this browser with the
          Web Crypto API; nothing leaves this page.
        </p>
      </div>
      <div className="mt-10">
        <Suspense fallback={<p className="label">Loading…</p>}>
          <Panel searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
