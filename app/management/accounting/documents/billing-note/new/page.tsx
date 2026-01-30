"use client";

import { redirect } from 'next/navigation';

// This page is now consolidated into the main billing note page with tabs.
// Redirecting to the main page.
export default function DeprecatedNewBillingNotePage() {
    redirect('/management/accounting/documents/billing-note?tab=new');
    return null;
}
