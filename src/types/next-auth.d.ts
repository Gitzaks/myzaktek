import type { UserRole } from "@/types";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      dealerIds: string[];
      regionId?: string;
    };
  }

  interface User {
    role: UserRole;
    dealerIds: string[];
    regionId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole;
    dealerIds: string[];
    regionId?: string;
  }
}
