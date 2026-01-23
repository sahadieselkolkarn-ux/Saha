
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { collection, query, where, orderBy } from "firebase/firestore";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirebase } from "@/firebase";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { safeFormat } from "@/lib/date-utils";
import type { Document } from "@/lib/types";

export default function OfficeTaxInvoicePage() {
    const { db } = useFirebase();

    const q = useMemo(() => {
        if (!db) return null;
        return query(
            collection(db, 'documents'),
            where('docType', '==', 'TAX_INVOICE'),
            orderBy('docDate', 'desc')
        );
    }, [db]);

    const { data: invoices, isLoading } = useCollection<Document>(q);

  return (
    <>
      <PageHeader title="ใบกำกับภาษี" description="สร้างและจัดการใบกำกับภาษี">
        <Button asChild>
          <Link href="/app/office/jobs/management/done">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Invoice from Job
          </Link>
        </Button>
      </PageHeader>
       <Card>
            <CardHeader>
                <CardTitle>Tax Invoice List</CardTitle>
                <CardDescription>
                    This is where a list of all tax invoices will be displayed.
                </CardDescription>
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
                                <TableHead>Total</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoices && invoices.length > 0 ? invoices.map(inv => (
                                <TableRow key={inv.id}>
                                    <TableCell className="font-medium">{inv.docNo}</TableCell>
                                    <TableCell>{safeFormat(new Date(inv.docDate), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell>{inv.customerSnapshot.name}</TableCell>
                                    <TableCell className="text-right">{inv.grandTotal.toLocaleString()}</TableCell>
                                    <TableCell><Badge>{inv.status}</Badge></TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24">No invoices found.</TableCell>
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

    