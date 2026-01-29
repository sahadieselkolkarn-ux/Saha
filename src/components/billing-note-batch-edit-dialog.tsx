
"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Document, Customer } from '@/lib/types';

interface GroupedInvoices {
  included: Document[];
  deferred: Document[];
  separate: Record<string, Document[]>;
}

interface EditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  invoices: Document[];
  onSave: (customerId: string, deferred: Record<string, boolean>, separate: Record<string, string>) => void;
}

export function BillingNoteBatchEditDialog({ isOpen, onClose, customer, invoices, onSave }: EditDialogProps) {
  const [invoiceStates, setInvoiceStates] = useState<Record<string, { group: 'include' | 'defer' | 'separate', separateKey: string }>>({});

  useEffect(() => {
    const initialStates: Record<string, { group: 'include' | 'defer' | 'separate', separateKey: string }> = {};
    invoices.forEach(inv => {
      initialStates[inv.id] = { group: 'include', separateKey: '' };
    });
    setInvoiceStates(initialStates);
  }, [invoices, isOpen]);

  const handleSave = () => {
    const deferred: Record<string, boolean> = {};
    const separate: Record<string, string> = {};

    Object.entries(invoiceStates).forEach(([invoiceId, state]) => {
      if (state.group === 'defer') {
        deferred[invoiceId] = true;
      } else if (state.group === 'separate') {
        separate[invoiceId] = state.separateKey || 'SINGLE';
      }
    });

    onSave(customer.id, deferred, separate);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>แก้ไขรายการวางบิล: {customer.name}</DialogTitle>
          <DialogDescription>
            จัดการใบกำกับภาษีที่จะรวมในใบวางบิล หรือเลื่อนไปเดือนถัดไป
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เลขที่ Invoice</TableHead>
                <TableHead>วันที่</TableHead>
                <TableHead className="text-right">ยอดเงิน</TableHead>
                <TableHead>การดำเนินการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map(invoice => (
                <TableRow key={invoice.id}>
                  <TableCell>{invoice.docNo}</TableCell>
                  <TableCell>{invoice.docDate}</TableCell>
                  <TableCell className="text-right">{invoice.grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>
                    <RadioGroup
                      value={invoiceStates[invoice.id]?.group}
                      onValueChange={(value) =>
                        setInvoiceStates(prev => ({
                          ...prev,
                          [invoice.id]: { ...prev[invoice.id], group: value as any },
                        }))
                      }
                      className="flex space-x-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="include" id={`include-${invoice.id}`} />
                        <Label htmlFor={`include-${invoice.id}`}>รวม</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="defer" id={`defer-${invoice.id}`} />
                        <Label htmlFor={`defer-${invoice.id}`}>เลื่อน</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="separate" id={`separate-${invoice.id}`} />
                        <Label htmlFor={`separate-${invoice.id}`}>แยก</Label>
                      </div>
                    </RadioGroup>
                     {invoiceStates[invoice.id]?.group === 'separate' && (
                        <Input
                            placeholder="กลุ่ม (เช่น A, B)"
                            className="mt-1 h-8"
                            value={invoiceStates[invoice.id]?.separateKey}
                            onChange={(e) => setInvoiceStates(prev => ({...prev, [invoice.id]: {...prev[invoice.id], separateKey: e.target.value}}))}
                        />
                     )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
