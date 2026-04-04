import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import Providers from "./components/Providers";
import CookieBanner from "./components/CookieBanner";
import InstallPrompt from "./components/InstallPrompt";
import ServiceWorker from "./components/ServiceWorker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "KoalaTree — Personalisierte KI-Geschichten für Kinder & Erwachsene",
    template: "%s | KoalaTree",
  },
  description:
    "KoalaTree erstellt personalisierte Gute-Nacht-Geschichten und Audio-Hörspiele mit KI. Der weise Koala Koda erzählt Geschichten, die dein Kind stärken — Selbstbewusstsein, Mut und Dankbarkeit.",
  keywords: [
    "Gute-Nacht-Geschichten",
    "personalisierte Geschichten",
    "KI Geschichten",
    "Hörspiele für Kinder",
    "Kindergeschichten",
    "Audio-Hörspiel",
    "KoalaTree",
    "Einschlafgeschichten",
    "Traumreise Kinder",
  ],
  openGraph: {
    title: "KoalaTree — Personalisierte KI-Geschichten für Kinder & Erwachsene",
    description:
      "Der weise Koala Koda erzählt personalisierte Gute-Nacht-Geschichten als Audio-Hörspiel. Jede Geschichte ist einzigartig — mit dem Namen, den Interessen und den Themen deines Kindes.",
    url: "https://koalatree.com",
    siteName: "KoalaTree",
    locale: "de_DE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "KoalaTree — Personalisierte KI-Geschichten",
    description:
      "Personalisierte Gute-Nacht-Geschichten und Audio-Hörspiele, erzählt vom weisen Koala Koda.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${geistSans.variable} h-full antialiased`}>
      <head>
        <meta name="theme-color" content="#1a2e1a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="KoalaTree" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <SessionProvider>
          <Providers>
            {children}
          </Providers>
        </SessionProvider>
        <CookieBanner />
        <InstallPrompt />
        <ServiceWorker />
      </body>
    </html>
  );
}
