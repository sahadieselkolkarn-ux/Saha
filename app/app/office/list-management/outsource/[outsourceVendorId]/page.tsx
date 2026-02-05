"use client";

import { redirect } from 'next/navigation';

export default function LegacyEditOutsourcePage() {
  // Since IDs are different across collections, we redirect to the main list
  redirect('/app/office/parts/vendors');
  return null;
}
