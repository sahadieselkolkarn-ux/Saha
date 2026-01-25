
"use client";

import {
  collection,
  query,
  where,
  getDocs,
  type Firestore,
  orderBy,
  limit,
} from "firebase/firestore";
import type { Vendor } from "@/lib/types";
import { WithId } from "./firestore/use-collection";

/**
 * Searches for active vendors by short name or company name.
 * @param db The Firestore instance.
 * @param searchText The text to search for.
 * @returns A promise that resolves to an array of matching vendors.
 */
export async function searchVendors(
  db: Firestore,
  searchText: string,
  resultLimit: number = 10
): Promise<WithId<Vendor>[]> {
  if (!searchText.trim()) {
    return [];
  }

  const lowercasedSearch = searchText.toLowerCase();
  
  // Note: This performs a client-side filter after a broad query.
  // For very large datasets, a more scalable search solution like Algolia would be better.
  const q = query(
    collection(db, "vendors"),
    where("isActive", "==", true),
    orderBy("shortName"),
    limit(resultLimit * 5) // Fetch more to allow for client-side filtering
  );

  const querySnapshot = await getDocs(q);
  
  const results = querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as WithId<Vendor>))
    .filter(vendor => 
      vendor.shortName.toLowerCase().includes(lowercasedSearch) ||
      vendor.companyName.toLowerCase().includes(lowercasedSearch)
    );

  return results.slice(0, resultLimit);
}
