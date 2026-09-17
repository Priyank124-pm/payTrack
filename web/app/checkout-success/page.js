import Link from "next/link";

export const metadata = {
  title: "You're all set — StackReady",
  robots: { index: false },
};

export default function CheckoutSuccess() {
  return (
    <main style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: "50%", background: "var(--bg-blue-soft)", color: "var(--blue)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: 26, fontWeight: 800,
          }}
        >
          ✓
        </div>
        <h1 style={{ fontSize: 26, marginBottom: 10 }}>You&rsquo;re all set!</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 15, lineHeight: 1.6 }}>
          Thanks for signing up. Your payment was received and our team will be in touch shortly to get your
          managed hosting environment set up.
        </p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 22, display: "inline-flex" }}>Back to Home</Link>
      </div>
    </main>
  );
}
