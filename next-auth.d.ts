import NextAuth, { DefaultSession } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      role?: string;
      isImpersonating?: boolean;
      originalUserId?: string;
      originalUserEmail?: string;
      originalUserName?: string;
      originalUserImage?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    isImpersonating?: boolean;
    originalUserId?: string | null;
    originalUserEmail?: string | null;
    originalUserName?: string | null;
    originalUserImage?: string | null;
  }
}
