// This page exists to satisfy the Next.js router.
// The actual redirect is handled by middleware.ts.
export default function PageAlias() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Redirecting...</h1>
      <p>
        You are being redirected. If you are not redirected automatically,
        please <a href="/app/jobs">click here</a>.
      </p>
    </div>
  );
}
