export function getYearFromDateOnly(dateStr: string): number {
  const y = Number(String(dateStr || "").slice(0, 4));
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

export function archiveCollectionNameByYear(year: number): string {
  return `jobsArchive_${year}`;
}
