import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { deDE } from "@clerk/localizations";
import CookieBanner from "./components/CookieBanner";
import InstallPrompt from "./components/InstallPrompt";
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
    <ClerkProvider
      localization={deDE}
      appearance={{
        variables: {
          colorPrimary: "#4a7c59",
          colorText: "#f5eed6",
          colorTextSecondary: "rgba(245,238,214,0.65)",
          colorBackground: "#1f3a1f",
          colorInputBackground: "rgba(255,255,255,0.08)",
          colorInputText: "#f5eed6",
          colorDanger: "#ef4444",
          borderRadius: "0.75rem",
          fontFamily: "var(--font-geist-sans), sans-serif",
        },
        elements: {
          card: {
            backgroundColor: "rgba(26, 46, 26, 0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
          },
          headerTitle: { color: "#f5eed6" },
          headerSubtitle: { color: "rgba(245,238,214,0.6)" },
          formFieldLabel: { color: "rgba(245,238,214,0.85)" },
          formFieldInput: {
            backgroundColor: "rgba(255,255,255,0.08)",
            borderColor: "rgba(255,255,255,0.15)",
            color: "#f5eed6",
          },
          formButtonPrimary: {
            background: "linear-gradient(135deg, #4a7c59, #3d6b4a)",
            color: "#f5eed6",
            fontWeight: "600",
            boxShadow: "0 4px 16px rgba(61,107,74,0.3)",
          },
          footerActionLink: { color: "#a8d5b8" },
          footerActionText: { color: "rgba(245,238,214,0.5)" },
          dividerLine: { backgroundColor: "rgba(255,255,255,0.1)" },
          dividerText: { color: "rgba(245,238,214,0.4)" },
          socialButtonsBlockButton: {
            backgroundColor: "rgba(255,255,255,0.05)",
            borderColor: "rgba(255,255,255,0.12)",
            color: "#f5eed6",
          },
          identityPreview: {
            backgroundColor: "rgba(255,255,255,0.05)",
            borderColor: "rgba(255,255,255,0.1)",
          },
          identityPreviewText: { color: "#f5eed6" },
          identityPreviewEditButton: { color: "#a8d5b8" },
          otpCodeFieldInput: {
            backgroundColor: "rgba(255,255,255,0.08)",
            borderColor: "rgba(255,255,255,0.15)",
            color: "#f5eed6",
          },
          userButtonPopoverCard: {
            backgroundColor: "#1a2e1a",
            borderColor: "rgba(255,255,255,0.1)",
          },
          userButtonPopoverActionButton: { color: "#f5eed6" },
          userButtonPopoverActionButtonText: { color: "#f5eed6" },
          userButtonPopoverFooter: {
            borderColor: "rgba(255,255,255,0.1)",
          },
        },
      }}
    >
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
          {children}
          <CookieBanner />
          <InstallPrompt />
        </body>
      </html>
    </ClerkProvider>
  );
}
