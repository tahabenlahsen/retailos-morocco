import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/shell/app-shell"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")
  if (!session.user.onboarded) redirect("/auth/onboarding")
  return <AppShell>{children}</AppShell>
}
