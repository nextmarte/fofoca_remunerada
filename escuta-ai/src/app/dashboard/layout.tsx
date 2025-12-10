import { auth, signOut } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">E</span>
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Escuta AI
              </span>
            </Link>

            <nav className="hidden sm:flex items-center gap-6">
              <Link
                href="/dashboard"
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium"
              >
                Nova Transcrição
              </Link>
              <Link
                href="/dashboard/history"
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium"
              >
                Histórico
              </Link>
              {session.user?.role === "ADMIN" && (
                <Link
                  href="/admin/users"
                  className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium"
                >
                  Admin
                </Link>
              )}
            </nav>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-300 hidden sm:block">
                {session.user?.name || session.user?.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <nav className="sm:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex">
          <Link
            href="/dashboard"
            className="flex-1 py-3 text-center text-gray-600 dark:text-gray-300 font-medium border-b-2 border-transparent hover:border-blue-500"
          >
            Nova
          </Link>
          <Link
            href="/dashboard/history"
            className="flex-1 py-3 text-center text-gray-600 dark:text-gray-300 font-medium border-b-2 border-transparent hover:border-blue-500"
          >
            Histórico
          </Link>
          {session.user?.role === "ADMIN" && (
            <Link
              href="/admin/users"
              className="flex-1 py-3 text-center text-indigo-600 dark:text-indigo-400 font-medium border-b-2 border-transparent hover:border-indigo-500"
            >
              Admin
            </Link>
          )}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
