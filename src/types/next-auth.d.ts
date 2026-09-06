import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      businessId: string
      roleName: string
      onboarded: boolean
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    businessId: string
    roleName: string
    onboarded: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    businessId: string
    roleName: string
    onboarded: boolean
  }
}
