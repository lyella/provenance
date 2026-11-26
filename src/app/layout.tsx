import type { Metadata } from "next";
import { Fira_Sans, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Colophon, Header } from "@/components/header";

/**
 * Three families, used exactly as the reference site uses them:
 *
 *  - Fira Sans 900 — every headline. Heavy, tight, left-aligned.
 *  - Inter        — all running text, at 18px. Neutral and quiet, so the
 *                   headline weights carry the page.
 *  - JetBrains Mono — technical text: hashes, labels, figures, code, and the
 *                   small caps-style eyebrow labels.
 */
const firaSans = Fira_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "900"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Provenance — decision records that cannot be quietly rewritten",
    template: "%s · Provenance",
  },
  description:
    "A decision ledger with a hash-linked history and a confidence-weighted exposure ledger. Declare how sure you were; get a verifiable record either way.",
  metadataBase: new URL(process.env.PROVENANCE_ORIGIN ?? "http://localhost:3000"),
  openGraph: {
    title: "Provenance",
    description: "Commit to decisions. Keep the record verifiable. Issue the slip when you slip.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${firaSans.variable} ${inter.variable} ${jetbrains.variable} antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="flex min-h-dvh flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <Colophon />
      </body>
    </html>
  );
}
