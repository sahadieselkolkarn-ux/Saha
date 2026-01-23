
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where, orderBy, QueryConstraint } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, AlertCircle } from "lucide-react";
import { safeFormat } from '@/lib/date-utils';
import type { Document, DocType } from "@/lib/types";

interface DocumentListProps {
  docType: DocType;
}

export function DocumentList({ docType }: DocumentListProps) {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!db) return;
    setLoading(true);

    const q = query(
      collection(db, "documents"),
      where("docType", "==", docType),
      orderBy("docDate", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Document));
      setDocuments(docsData);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError(err);
      setLoading(false);
      toast({ variant: "destructive", title: "Error loading documents." });
    });

    return () => unsubscribe();
  }, [db, docType, toast]);

  const filteredDocuments = useMemo(() => {
    if (!searchTerm) return documents;
    const lowercasedTerm = searchTerm.toLowerCase();
    return documents.filter(doc =>
      doc.docNo.toLowerCase().includes(lowercasedTerm) ||
      doc.customerSnapshot.name?.toLowerCase().includes(lowercasedTerm) ||
      doc.customerSnapshot.phone?.includes(lowercasedTerm) ||
      doc.jobId?.toLowerCase().includes(lowercasedTerm) ||
      doc.carSnapshot?.licensePlate?.toLowerCase().includes(lowercasedTerm)
    );
  }, [documents, searchTerm]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by doc #, customer, phone, car plate, or job ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin h-8 w-8" /></div>
        ) : error ? (
          <div className="text-center text-destructive flex flex-col items-center gap-2 h-48 justify-center">
            <AlertCircle />
            <p>Error loading documents.</p>
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Job ID</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.length > 0 ? filteredDocuments.map(doc => (
                  <TableRow key={doc.id} className="cursor-pointer" onClick={() => window.location.href = `/app/office/documents/${doc.id}`}>
                    <TableCell className="font-medium">{doc.docNo}</TableCell>
                    <TableCell>{safeFormat(new Date(doc.docDate), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>{doc.customerSnapshot.name}</TableCell>
                    <TableCell>{doc.jobId ? doc.jobId.substring(0, 8) + '...' : 'N/A'}</TableCell>
                    <TableCell className="text-right">{doc.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell><Badge>{doc.status}</Badge></TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      {searchTerm ? "No documents match your search." : "No documents found."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
