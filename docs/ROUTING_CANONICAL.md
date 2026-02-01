# Canonical Routing Policy (SahaDiesel Service)

## Objective
Establish a consistent routing structure for the application.

## Canonical Rule
The application uses the `/app` URL prefix for all authenticated user-facing pages. To achieve this, the canonical file structure is `app/app/...`.

-   **URL:** `/app/dashboard`
-   **File Path:** `app/app/dashboard/page.tsx`

## Legacy Routes
Legacy routes under other paths (e.g., `/management/...`) should redirect to their canonical counterparts under `/app/...`.

-   **Legacy File:** `app/management/dashboard/page.tsx`
-   **Content:** `import { redirect } from "next/navigation"; export default function Page() { redirect("/app/management/dashboard"); }`

## Definition of “Duplicate”
A route is duplicated if the same URL can be served by more than one `page.tsx`. Redirects from legacy paths are not considered duplicates.

---
Last updated: 2026-01-28
