
"use client";

import { useMemo } from "react";
import { collection, query, where, orderBy } from "firebase/firestore";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirebase } from "@/firebase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { safeFormat } from "@/lib/date-utils";
import type { Document } from "@/lib/types";

export default function OfficeDeliveryNotePage() {
  const { db } = useFirebase();

    const q = useMemo(() => {
        if (!db) return null;
        return query(
            collection(db, 'documents'),
            where('docType', '==', 'DELIVERY_NOTE'),
            orderBy('docDate', 'desc')
        );
    }, [db]);

    const { data: documents, isLoading } = useCollection<Document>(q);

  return (
    <>
      <PageHeader title="ใบส่งสินค้า" description="สร้างและจัดการใบส่งสินค้า" />
      <Card>
        <CardHeader>
          <CardTitle>Delivery Notes List</CardTitle>
        </CardHeader>
        <CardContent>
           {isLoading ? (
              <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin" /></div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Doc No.</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {documents && documents.length > 0 ? documents.map(doc => (
                            <TableRow key={doc.id}>
                                <TableCell className="font-medium">{doc.docNo}</TableCell>
                                <TableCell>{safeFormat(new Date(doc.docDate), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{doc.customerSnapshot.name}</TableCell>
                                <TableCell><Badge>{doc.status}</Badge></TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center h-24">No delivery notes found.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            )}
        </CardContent>
      </Card>
    </>
  );
}

    