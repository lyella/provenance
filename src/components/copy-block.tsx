"use client";

import { useState } from "react";

export function CopyBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-2">
      <button
        className="absolute top-2 right-2 label !text-paper/60 hover:!text-paper"
        onClick={async () => {
          await navigator.clipboard.writeText(code).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        aria-label={`Copy ${language} snippet`}
      >
        {copied ? "copied" : "copy"}
      </button>
      <pre className="overflow-x-auto border border-rule-strong bg-ink p-4 pr-16 text-xs leading-relaxed text-paper">
        <code>{code}</code>
      </pre>
    </div>
  );
}
