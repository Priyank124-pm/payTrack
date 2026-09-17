import "./globals.css";

export const metadata = {
  title: "StackReady — Managed Server Hosting",
  description:
    "Fully managed server hosting for businesses that want reliability, security and peace of mind. Server setup, monitoring, updates, backups and security — handled for you.",
  openGraph: {
    title: "StackReady — Managed Server Hosting",
    description:
      "Fully managed server hosting for businesses that want reliability, security and peace of mind.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    // Browser extensions (Grammarly, password managers/autofill, etc.) inject
    // attributes into <html>/<body> before React hydrates — suppressing the
    // warning here is the standard Next.js fix; it doesn't hide real mismatches
    // elsewhere in the tree, only on these two root elements.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
