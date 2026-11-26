import type { Metadata } from "next";
import { Fira_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Colophon, Header } from "@/components/header";

/**
 * Two voices, both borrowed from the reference's language:
 *  - Fira Sans at 900 for every headline. Heavy, tight, left-aligned.
 *  - JetBrains Mono for anything technical — hashes, labels, figures, code.
 * Body copy stays Fira Sans so the page has one type family and no decoration.
 */
const firaSans = Fira_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
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
    <html lang="en" className={`${firaSans.variable} ${jetbrains.variable} antialiased`} data-scroll-behavior="smooth">
      <body className="flex min-h-dvh flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <Colophon />
      </body>
    </html>
  );
}
