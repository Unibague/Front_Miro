// types/next-auth.d.ts

import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      isImpersonating?: boolean;
    };
  }

  interface User {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    isImpersonating?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    isImpersonating?: boolean;
  }
}
