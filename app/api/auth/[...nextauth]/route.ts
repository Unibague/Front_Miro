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
  image?: string | null;
  isImpersonating?: boolean;
  originalUserId?: string;
  originalUserEmail?: string;
  originalUserName?: string;
  originalUserImage?: string | null;
};

type ExtendedSessionUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
  isImpersonating?: boolean;
  originalUserId?: string;
  originalUserEmail?: string;
  originalUserName?: string;
  originalUserImage?: string | null;
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
        userImage: { label: "User Image", type: "text" },
        isImpersonating: {
          label: "Indicator of impersonating an user",
          type: "text",
        },
        originalUserId: { label: "Original User Id", type: "text" },
        originalUserEmail: { label: "Original User Email", type: "text" },
        originalUserName: { label: "Original User Name", type: "text" },
        originalUserImage: { label: "Original User Image", type: "text" },
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
          image: credentials.userImage || null,
          isImpersonating: credentials.isImpersonating === "true",
          originalUserId: credentials.originalUserId,
          originalUserEmail: credentials.originalUserEmail,
          originalUserName: credentials.originalUserName,
          originalUserImage: credentials.originalUserImage || null,
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
        token.originalUserId = u.originalUserId ?? null;
        token.originalUserEmail = u.originalUserEmail ?? null;
        token.originalUserName = u.originalUserName ?? null;
        token.originalUserImage = u.originalUserImage ?? null;

        if (u.image !== undefined) {
          token.picture = u.image;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        const u = session.user as ExtendedSessionUser;
        u.isImpersonating = token.isImpersonating ?? false;
        u.originalUserId = typeof token.originalUserId === "string" ? token.originalUserId : undefined;
        u.originalUserEmail = typeof token.originalUserEmail === "string" ? token.originalUserEmail : undefined;
        u.originalUserName = typeof token.originalUserName === "string" ? token.originalUserName : undefined;
        u.originalUserImage = typeof token.originalUserImage === "string" ? token.originalUserImage : null;

        if (token.picture) {
          u.image = String(token.picture);
        }

        try {
          const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/users`,
            {
              params: { email: session.user.email },
            }
          );
          const user = response.data;
          if (user) {
            u.id = user._id;
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
