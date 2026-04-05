import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import { Resend as ResendClient } from "resend";
import { prisma } from "@/lib/db";

const resend = new ResendClient(process.env.RESEND_API_KEY);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in?verify=1",
  },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || "KoalaTree <noreply@koalatree.ai>",
      generateVerificationToken() {
        // 6-stelliger Code statt langer Token-URL
        return String(Math.floor(100000 + Math.random() * 900000));
      },
      async sendVerificationRequest({ identifier: email, token, provider }) {
        const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://www.koalatree.ai";
        await resend.emails.send({
          from: provider.from as string,
          to: email,
          subject: `${token} — Dein KoalaTree Login-Code`,
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f0e8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f0e8; padding: 40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="420" cellpadding="0" cellspacing="0" style="background-color: #1a2e1a; border-radius: 20px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.15);">
        <!-- Header -->
        <tr><td style="padding: 32px 32px 16px; text-align: center;">
          <img src="${baseUrl}/api/icons/logo.png" alt="KoalaTree" width="140" style="display: inline-block;" />
        </td></tr>
        <!-- Greeting -->
        <tr><td style="padding: 0 32px 8px; text-align: center;">
          <p style="color: rgba(245,238,214,0.6); font-size: 15px; margin: 0;">Hallo! Hier ist dein Login-Code:</p>
        </td></tr>
        <!-- Code -->
        <tr><td style="padding: 16px 32px;">
          <div style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 24px; text-align: center;">
            <span style="color: #f5eed6; font-size: 36px; font-weight: 700; letter-spacing: 10px; font-family: 'SF Mono', 'Fira Code', monospace;">${token}</span>
          </div>
        </td></tr>
        <!-- Instruction -->
        <tr><td style="padding: 8px 32px 24px; text-align: center;">
          <p style="color: rgba(245,238,214,0.5); font-size: 13px; margin: 0; line-height: 1.5;">
            Gib diesen Code auf der Website ein, um dich anzumelden.<br/>
            Der Code ist 24 Stunden gültig.
          </p>
        </td></tr>
        <!-- Divider -->
        <tr><td style="padding: 0 32px;">
          <div style="height: 1px; background: rgba(255,255,255,0.08);"></div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding: 20px 32px; text-align: center;">
          <p style="color: rgba(245,238,214,0.25); font-size: 11px; margin: 0; line-height: 1.6;">
            Du hast diesen Code nicht angefordert? Ignoriere diese Email einfach.<br/>
            <a href="${baseUrl}/impressum" style="color: rgba(245,238,214,0.3); text-decoration: underline;">Impressum</a> · <a href="${baseUrl}/datenschutz" style="color: rgba(245,238,214,0.3); text-decoration: underline;">Datenschutz</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
          `,
        });
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
