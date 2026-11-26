import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Colophon, Header } from "@/components/header";

/**
 * Three voices:
 *   - Fraunces: a "wonky" variable serif for large display type.
 *   - Instrument Serif: a high-contrast italic for the single emphasised phrase.
 *   - Geist Mono: evidence — hashes, labels, numbers, code.
 *   - Geist: body copy, kept quiet so the serif stays the loudest thing on screen.
 */
const fraunces = Fraunces({
   variable: "--font-display",
   subsets: ["latin"],
   display: "swap",
   axes: ["SOFT", "WONK"],
});

const instrument = Instrument_Serif({
   variable: "--font-accent-serif",
   subsets: ["latin"],
   weight: "400",
   style: ["normal", "italic"],
   display: "swap",
});

const geistSans = Geist({
   variable: "--font-ui",
   subsets: ["latin"],
   display: "swap",
});

const geistMono = Geist_Mono({
   variable: "--font-mono",
   subsets: ["latin"],
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
         className={`${fraunces.variable} ${instrument.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
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
