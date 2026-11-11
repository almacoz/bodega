import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "WhyBuy",
  description: "A memory of your purchasing decisions: remember why you wanted something, and see when it connects to what you already considered.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" translate="no" className={`notranslate ${sans.variable} ${display.variable}`}>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="min-h-screen bg-white font-sans text-fg antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
