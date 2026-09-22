"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { User, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import { EmblemIndia } from "@/components/landing/EmblemIndia";
import { useAuth, DEMO_OPERATORS } from "@/lib/authStore";

function LoginFormCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect");
  const redirectTarget = !rawRedirect || rawRedirect === "/gis-map" ? "/dashboard" : rawRedirect;

  const { login, isAuthenticated } = useAuth();

  // If already logged in, navigate straight to the destination dashboard
  useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirectTarget);
    }
  }, [isAuthenticated, redirectTarget, router]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      // Pick or create the operator session
      const matchingDemo = DEMO_OPERATORS[0];
      const sessionUser = {
        ...matchingDemo,
        name: username.trim()
          ? username.includes(" ")
            ? username
            : `Officer ${username}`
          : matchingDemo.name,
        badgeNumber: username.trim() ? username.toUpperCase() : matchingDemo.badgeNumber,
        authenticatedAt: new Date().toISOString(),
      };

      login(sessionUser);
      router.push(redirectTarget);
    }, 400);
  };

  return (
    <div className="w-full max-w-[420px] mx-auto">
      {/* Clean White Card matching reference design */}
      <div className="bg-white/95 backdrop-blur-md rounded-[32px] p-8 sm:p-10 shadow-2xl shadow-black/30 border border-white/60 text-slate-900 transition-all">
        {/* Nirikshan Emblem & Title */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-sky-50/80 border border-sky-200/80 p-2.5 shadow-sm flex items-center justify-center mb-3 group">
            <img
              src="/assets/gujarat_police_logo_small.png"
              alt="Nirikshan Crest"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-wider">
            NIRIKSHAN
          </h1>
          <p className="text-[11px] font-bold text-[#0284c7] tracking-[0.18em] uppercase mt-0.5">
            City Video Analytics
          </p>
          <span className="text-xs text-slate-500 mt-1">
            Sign in to operator console
          </span>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Field */}
          <div className="relative">
            <User className="w-4 h-4 text-slate-600 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full pl-11 pr-4 py-3 bg-[#f3f4f6] hover:bg-[#ebeef1] focus:bg-white rounded-2xl border border-transparent focus:border-emerald-700/30 focus:ring-2 focus:ring-emerald-800/15 text-slate-900 text-sm font-medium placeholder:text-slate-600 focus:outline-none transition-all"
            />
          </div>

          {/* Password Field */}
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-600 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full pl-11 pr-11 py-3 bg-[#f3f4f6] hover:bg-[#ebeef1] focus:bg-white rounded-2xl border border-transparent focus:border-emerald-700/30 focus:ring-2 focus:ring-emerald-800/15 text-slate-900 text-sm font-medium placeholder:text-slate-600 focus:outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-[#0f172a] hover:bg-[#1e293b] active:scale-[0.99] text-white text-sm font-semibold tracking-wide shadow-md shadow-slate-900/20 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Login</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Remember me & Forgot Password */}
          <div className="flex items-center justify-between pt-2 text-xs">
            <label className="flex items-center gap-2 text-slate-600 hover:text-slate-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#0284c7] focus:ring-[#0284c7]"
              />
              <span>Remember me</span>
            </label>

            <button
              type="button"
              onClick={() => {
                setUsername("POLICE-SURV-101");
                setPassword("Nirikshan2026");
              }}
              className="text-slate-600 hover:text-slate-900 underline transition-colors"
            >
              Forgot password?
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden select-none">
      {/* 1. Full Smart City Background */}
      <div className="absolute inset-0 z-0">
        <img
          src="/images/city-monitoring-hero.jpg"
          alt="City Monitoring Background"
          className="w-full h-full object-cover object-center"
        />
        {/* Soft atmospheric gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/15 to-black/50" />
      </div>

      {/* 2. Top Header with Lion Emblem & Government Title */}
      <header className="relative z-10 pt-10 sm:pt-12 px-6 flex flex-col items-center text-center">
        <Link href="/" className="flex flex-col items-center group">
          {/* Emblem of India in black/dark charcoal */}
          <EmblemIndia className="w-12 h-14 text-slate-900 drop-shadow-xs" />
          <span className="text-xs font-semibold text-slate-900 tracking-wide mt-2">
            Government of India
          </span>
          <span className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            City Monitoring & Surveillance Portal
          </span>
        </Link>
      </header>

      {/* 3. Center Login Card */}
      <main className="relative z-10 px-4 py-6 flex items-center justify-center">
        <Suspense
          fallback={
            <div className="w-full max-w-[420px] h-[340px] bg-white/90 rounded-[32px] animate-pulse" />
          }
        >
          <LoginFormCard />
        </Suspense>
      </main>

      {/* 4. Bottom Motto & Indian Tricolor Bar */}
      <footer className="relative z-10 pb-8 sm:pb-10 px-8 sm:px-14 flex flex-col items-start">
        <div className="space-y-0.5">
          <div className="text-[11px] sm:text-xs font-bold tracking-[0.22em] text-white/95 uppercase drop-shadow-md">
            SAFE CITIES
          </div>
          <div className="text-[11px] sm:text-xs font-bold tracking-[0.22em] text-white/95 uppercase drop-shadow-md">
            SMARTER SURVEILLANCE
          </div>
        </div>

        {/* Indian Tricolor Bar (Saffron, White, Green) */}
        <div
          className="h-[3px] w-40 mt-2 rounded-full shadow-sm"
          style={{
            background: "linear-gradient(to right, #ff9933 0%, #ffffff 50%, #138808 100%)",
          }}
        />
      </footer>
    </div>
  );
}
