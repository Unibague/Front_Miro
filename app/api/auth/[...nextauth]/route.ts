import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { NextAuthOptions } from "next-auth";
import axios from "axios";

// 🧱 Tipos extendidos para el user y la sesión
type ExtendedUser = {
  id: string;
  name: string;
  email: string;
  isImpersonating?: boolean;
};

type ExtendedSessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
  isImpersonating?: boolean;
};

const options: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),

    CredentialsProvider({
      name: "impersonate",
      id: "impersonate",
      credentials: {
        id: { label: "User id", type: "text" },
        userEmail: { label: "User Email", type: "text" },
        userName: { label: "User Name", type: "text" },
        isImpersonating: {
          label: "Indicator of impersonating an user",
          type: "text",
        },
      },

      async authorize(credentials) {
        if (
          !credentials?.id ||
          !credentials?.userEmail ||
          !credentials?.userName
        ) {
          throw new Error("Missing required fields");
        }

        return {
          id: credentials.id,
          name: credentials.userName,
          email: credentials.userEmail,
          isImpersonating: credentials.isImpersonating === "true",
        };
      },
    }),
  ],

  pages: {
    signIn: "/",
  },

  session: {
    maxAge: 3600 * 8,
  },

  callbacks: {
    async signIn({ user }) {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/users`,
          {
            params: { email: user.email },
          }
        );
        const existingUser = response.data;

        if (!existingUser || existingUser.isActive === false) {
          return false;
        }

        return true;
      } catch (error) {
        console.error("Error checking user:", error);
        return false;
      }
    },

    async redirect({ url, baseUrl }) {
      return process.env.APP_ENV === "development"
        ? "/dev/dashboard"
        : "/dashboard";
    },

    async jwt({ token, user }) {
      if (user) {
        const u = user as ExtendedUser;
        token.isImpersonating = u.isImpersonating === true;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        const u = session.user as ExtendedSessionUser;
        u.isImpersonating = token.isImpersonating ?? false;

        try {
          const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/users`,
            {
              params: { email: session.user.email },
            }
          );
          const user = response.data;
          if (user) {
            u.role = user.activeRole;
          }
        } catch (error) {
          console.error("Error fetching user roles:", error);
        }
      }

      return session;
    },
  },
};

const handler = NextAuth(options);

export { handler as GET, handler as POST };
