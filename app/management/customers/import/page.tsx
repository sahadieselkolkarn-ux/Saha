"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { collection, writeBatch, serverTimestamp, doc } from "firebase/firestore";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Upload, FileCheck2 } from "lucide-react";

interface CustomerData {
  name: string;
  phone: string;
  detail?: string;
  useTax?: string; // from csv will be string
  taxName?: string;
  taxAddress?: string;
  taxId?: string;
}

export default function ImportCustomersPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<CustomerData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'text/csv') {
        setError("Invalid file type. Please upload a CSV file.");
        setFile(null);
        setParsedData([]);
        return;
      }
      setFile(selectedFile);
      parseCsv(selectedFile);
    }
  };

  const parseCsv = (fileToParse: File) => {
    setIsProcessing(true);
    setError(null);
    setParsedData([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const lines = text.trim().split(/\r\n|\n/);
        if (lines.length < 2) {
          throw new Error("CSV file must have a header row and at least one data row.");
        }
        
        const headers = lines[0].split(',').map(h => h.trim());
        const requiredHeaders = ["name", "phone"];
        for (const requiredHeader of requiredHeaders) {
            if (!headers.includes(requiredHeader)) {
                throw new Error(`Missing required header: ${requiredHeader}`);
            }
        }

        const data: CustomerData[] = lines.slice(1).map((line, rowIndex) => {
          if (!line.trim()) return null; // Skip empty lines
          const values = line.split(',');
          const customer: any = {};
          headers.forEach((header, index) => {
            customer[header] = values[index]?.trim() || "";
          });

          if (!customer.name || !customer.phone) {
              throw new Error(`Row ${rowIndex + 2}: 'name' and 'phone' are required.`);
          }
          return customer;
        }).filter(Boolean) as CustomerData[];
        
        setParsedData(data);
      } catch (err: any) {
        setError(`Error parsing CSV: ${err.message}`);
        setParsedData([]);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
        setError("Failed to read the file.");
        setIsProcessing(false);
    };
    // Default to UTF-8, which is the standard for web and modern applications.
    reader.readAsText(fileToParse);
  };

  const handleImport = async () => {
    if (!db || parsedData.length === 0) return;

    setIsProcessing(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      parsedData.forEach(customer => {
        const customerRef = doc(collection(db, "customers"));
        batch.set(customerRef, {
          name: customer.name,
          phone: customer.phone,
          detail: customer.detail || "",
          useTax: customer.useTax?.toLowerCase() === 'true',
          taxName: customer.taxName || "",
          taxAddress: customer.taxAddress || "",
          taxId: customer.taxId || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();

      toast({
        title: "Import Successful",
        description: `${parsedData.length} customers have been imported.`,
      });
      router.push("/management/customers");

    } catch (err: any) {
      setError(`Import failed: ${err.message}`);
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: err.message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <PageHeader title="Import Customers" description="Upload a CSV file to bulk-import customer data." />
      
      <div className="space-y-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>CSV File Format</CardTitle>
            <CardDescription>Your CSV file must follow this format. The header row is required.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-semibold">Required Headers:</p>
            <code className="text-sm p-2 bg-muted rounded-md block my-2">name,phone</code>
            <p className="text-sm font-semibold mt-4">Optional Headers:</p>
            <code className="text-sm p-2 bg-muted rounded-md block my-2">detail,useTax,taxName,taxAddress,taxId</code>
            <p className="text-sm text-muted-foreground mt-2">
              - `useTax` should be `true` or `false`.
              <br />
              - Ensure there are no commas within individual fields.
              <br />
              - **Important:** For Thai language, please ensure the file is saved with **UTF-8 encoding**.
            </p>
            <p className="text-sm font-semibold mt-4">Example:</p>
            <code className="text-sm p-2 bg-muted rounded-md block my-2">
                name,phone,detail,useTax,taxName,taxAddress,taxId<br />
                John Doe,0812345678,V-Cross 2020,false,,, <br />
                Jane Smith,0987654321,,true,Smith Co.,123 Main St,1234567890123
            </code>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload and Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
                <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} disabled={isProcessing} />
            </div>

            {error && (
                 <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {isProcessing && !error && (
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="animate-spin h-4 w-4" />
                    <span>Processing file...</span>
                </div>
            )}

            {parsedData.length > 0 && (
                <div className="space-y-4">
                    <Alert variant="default" className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
                        <FileCheck2 className="h-4 w-4 text-green-600" />
                        <AlertTitle className="text-green-800 dark:text-green-300">File Parsed Successfully</AlertTitle>
                        <AlertDescription className="text-green-700 dark:text-green-400">
                            Found {parsedData.length} customers to import. Please review the data below before confirming.
                        </AlertDescription>
                    </Alert>
                    <div className="rounded-md border max-h-96 overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Phone</TableHead>
                                    <TableHead>Use Tax</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {parsedData.map((customer, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{customer.name}</TableCell>
                                        <TableCell>{customer.phone}</TableCell>
                                        <TableCell>{customer.useTax?.toLowerCase() === 'true' ? 'Yes' : 'No'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <Button onClick={handleImport} disabled={isProcessing}>
                        {isProcessing ? <Loader2 className="animate-spin mr-2"/> : <Upload className="mr-2"/>}
                        Confirm Import
                    </Button>
                </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
