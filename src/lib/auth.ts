import type { NextAuthOptions } from "next-auth"
import { getServerSession } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "./prisma"
import { signInSchema } from "@/utils/validation"
import { writeAuditLog } from "./audit"
import { checkRateLimit } from "./rate-limit"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const parsed = signInSchema.safeParse(credentials)
        if (!parsed.success) return null

        const ip = (req?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? "unknown"
        // Brute-force protection: N attempts per 15 minutes per IP+email (LOGIN_RATE_LIMIT, default 10).
        const limit = Number(process.env.LOGIN_RATE_LIMIT) || 10
        if (!(await checkRateLimit(`login:${ip}:${parsed.data.email.toLowerCase()}`, limit, 15 * 60 * 1000))) {
          throw new Error("RATE_LIMITED")
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          include: { business: true, role: true },
        })

        if (!user || user.deletedAt) return null

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) return null

        if (user.status === "SUSPENDED" || user.status === "INACTIVE") {
          throw new Error("ACCOUNT_INACTIVE")
        }
        if (user.business.status === "SUSPENDED" || user.business.deletedAt) {
          throw new Error("ACCOUNT_INACTIVE")
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
        await writeAuditLog({
          businessId: user.businessId,
          userId: user.id,
          action: "LOGIN",
          entityType: "User",
          entityId: user.id,
          ipAddress: ip,
        })

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          businessId: user.businessId,
          roleName: user.role.name,
          onboarded: user.business.onboarded,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.businessId = user.businessId
        token.roleName = user.roleName
        token.onboarded = user.onboarded
      }
      // Refresh onboarded/role flags from the DB when the client calls `update()`
      // or on a periodic basis so role changes propagate without re-login.
      if (trigger === "update" && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: { select: { name: true } }, business: { select: { onboarded: true } }, status: true },
        })
        if (fresh) {
          token.roleName = fresh.role.name
          token.onboarded = fresh.business.onboarded
        }
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id
      session.user.businessId = token.businessId
      session.user.roleName = token.roleName
      session.user.onboarded = token.onboarded
      return session
    },
  },
  pages: { signIn: "/auth/signin", error: "/auth/signin" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export const auth = () => getServerSession(authOptions)
