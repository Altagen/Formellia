"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      {/* Watermark 404 */}
      <div
        aria-hidden
        className="fixed inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
      >
        <span className="text-[28rem] font-black text-foreground/[0.025] leading-none">
          404
        </span>
      </div>

      {/* Card */}
      <div className="relative flex flex-col items-center text-center max-w-xs w-full">
        {/* Logo badge */}
        <div className="w-16 h-16 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center mb-8">
          <Image
            src="/formellia-logo-transparent.png"
            alt="Formellia"
            width={40}
            height={40}
            priority
          />
        </div>

        {/* Label */}
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Error 404
        </p>

        {/* Heading */}
        <h1 className="text-2xl font-semibold text-foreground mb-3">
          Page not found
        </h1>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-10">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
          <button
            onClick={() => history.back()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        {/* Footer */}
        <p className="mt-12 text-xs text-muted-foreground/50">
          Formellia
        </p>
      </div>
    </main>
  );
}
