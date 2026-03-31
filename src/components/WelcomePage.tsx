import Image from "next/image";
import Link from "next/link";

export function WelcomePage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      {/* Background watermark */}
      <div
        aria-hidden
        className="fixed inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
      >
        <span className="text-[22rem] font-black text-foreground/[0.025] leading-none tracking-tighter">
          F
        </span>
      </div>

      <div className="relative flex flex-col items-center text-center max-w-sm w-full">
        {/* Logo badge */}
        <div className="w-20 h-20 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center mb-8">
          <Image
            src="/formellia-logo-transparent.png"
            alt="Formellia"
            width={52}
            height={52}
            priority
          />
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-bold text-foreground mb-3 tracking-tight">
          Bienvenue sur Formellia
        </h1>

        {/* Tagline */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-xs">
          Votre plateforme de formulaires intelligents.
          <br />
          Log in to the admin area to get started.
        </p>

        {/* CTA */}
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Go to admin
        </Link>

        {/* Footer */}
        <p className="mt-12 text-xs text-muted-foreground/40">
          Formellia
        </p>
      </div>
    </main>
  );
}
