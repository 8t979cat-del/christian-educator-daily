"use client";

/**
 * Last-resort boundary that replaces the root layout. It cannot rely on the
 * app's CSS, so it uses minimal inline styles.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fbfaf6", color: "#1b1a17", margin: 0 }}>
        <main id="main" style={{ maxWidth: 480, margin: "0 auto", padding: "96px 16px", textAlign: "center" }}>
          <h1 style={{ fontFamily: "Georgia, serif" }}>Something went wrong</h1>
          <p>The application hit an unexpected error. Please try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: "0 20px",
              fontSize: 16,
              fontWeight: 600,
              color: "#fff",
              background: "#1c2a47",
              border: 0,
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
