import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnDashboard = req.nextUrl.pathname.startsWith("/dashboard");
  const isOnAuth = req.nextUrl.pathname.startsWith("/login") || 
                   req.nextUrl.pathname.startsWith("/register");
  const isOnApi = req.nextUrl.pathname.startsWith("/api");
  const isOnHome = req.nextUrl.pathname === "/";

  // Redirecionar para dashboard se logado e tentando acessar home
  if (isOnHome && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  // Redirecionar para login se não logado e tentando acessar dashboard
  if (isOnDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // Redirecionar para dashboard se logado e tentando acessar páginas de auth
  if (isOnAuth && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
