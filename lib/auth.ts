import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret:
    process.env.NEXTAUTH_SECRET ??
    process.env.OPENAI_API_KEY ??
    "local-development-only-secret",
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ account, user }) {
      if (account?.provider === "google" && user.id) {
        await prisma.account.updateMany({
          where: {
            userId: user.id,
            provider: "google",
            providerAccountId: account.providerAccountId,
          },
          data: {
            access_token: account.access_token,
            refresh_token: account.refresh_token ?? undefined,
            expires_at: account.expires_at,
            token_type: account.token_type,
            scope: account.scope,
            id_token: account.id_token,
          },
        });
      }
      return true;
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
};
