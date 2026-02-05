"use client";

import { redirect } from 'next/navigation';

export default function LegacyOutsourcePage() {
  // Redirect to the new consolidated vendors list with the contractor filter applied
  redirect('/app/office/parts/vendors?type=CONTRACTOR');
  return null;
}
