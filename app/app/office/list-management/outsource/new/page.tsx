"use client";

import { redirect } from 'next/navigation';

export default function LegacyNewOutsourcePage() {
  // Redirect to the new vendor creation page
  redirect('/app/office/parts/vendors/new');
  return null;
}
