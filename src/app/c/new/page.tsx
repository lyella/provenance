import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NewCaseForm } from "@/components/new-case-form";
import { currentUser } from "@/server/http";

export const metadata = { title: "New case" };

async function Gate() {
  const user = await currentUser();
  if (!user) redirect("/#start");
  return <NewCaseForm />;
}

export default function NewCasePage() {
  return (
    <main className="shell py-12 sm:py-16">
      <div className="border-b border-ink pb-4">
        <p className="label">01 / Open a case</p>
        <h1 className="h-xl mt-3 max-w-[20ch]">What is on the line?</h1>
      </div>
      <div className="mt-10">
        <Suspense fallback={<p className="label">Checking your session…</p>}>
          <Gate />
        </Suspense>
      </div>
    </main>
  );
}
