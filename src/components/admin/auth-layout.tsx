import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import type { ReactNode } from "react";

export function AuthLayout({
  children,
  footer,
  wide = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="admin-dashboard relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 text-foreground sm:py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 bg-primary/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] bg-primary/5 blur-3xl" />
      <div className={`relative z-10 w-full ${wide ? "max-w-[1040px]" : "max-w-[440px]"}`}>
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2.5 text-sm font-semibold transition hover:text-primary"
        >
          <span className="grid h-9 w-9 place-items-center rounded-none bg-primary text-primary-foreground">
            <MapPin className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-display">Lubumbashi Connect</span>
            <span className="block text-[11px] font-normal text-muted-foreground">Votre ville, vos services</span>
          </span>
        </Link>
        <section className={`rounded-none border border-border bg-card/95 shadow-2xl shadow-black/20 ${wide ? "p-5 sm:p-7" : "p-6 sm:p-8"}`}>
          {children}
        </section>
        {footer && <div className="mt-5 text-center text-xs text-muted-foreground">{footer}</div>}
        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} Lubumbashi Connect · Haut-Katanga, RDC
        </p>
      </div>
    </main>
  );
}

export function AuthStatus({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="mt-4 flex gap-2 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-none bg-primary" />
      <span>{children}</span>
    </div>
  );
}
