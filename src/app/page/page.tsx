
export default function PageAlias() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>/page route</h1>
      <p>This page exists to prevent a "route not found" error.</p>
      <a href="/" style={{ display: "inline-block", padding: 12, border: "1px solid #ccc" }}>
        Go to Home
      </a>
    </main>
  );
}
