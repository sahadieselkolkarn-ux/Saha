"use client";

import { useMemo, useState } from "react";
import { doc, collection, query, where, orderBy, writeBatch, serverTimestamp, updateDoc } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection, WithId } from "@/firebase/firestore/use-collection";
import { addMonths, subMonths, format, startOfYear, endOfYear, startOfMonth, endOfMonth, isWithinInterval, differenceInCalendarDays, max, min, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ChevronLeft, ChevronRight, FilePlus, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { HRSettings, UserProfile, LeaveRequest, PayrollRun, Payslip, PayslipDeduction } from "@/lib/types";

function getOverlapDays(range1: {start: Date, end: Date}, range2: {start: Date, end: Date}) {
  const start = max([range1.start, range2.start]);
  const end = min([range1.end, range2.end]);

  if (start > end) return 0;
  return differenceInCalendarDays(end, start) + 1;
}

// Main Payroll Component
export default function ManagementAccountingPayrollPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [period, setPeriod] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data fetching for calculation
  const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
  const { data: hrSettings } = useDoc<HRSettings>(settingsDocRef);
  
  const usersQuery = useMemo(() => db ? query(collection(db, 'users'), where('status', '==', 'ACTIVE'), orderBy('displayName', 'asc')) : null, [db]);
  const { data: activeUsers } = useCollection<WithId<UserProfile>>(usersQuery);

  const users = useMemo(() => {
    if (!activeUsers) return null;
    return activeUsers.filter(u => u.hr?.salaryMonthly && u.hr.salaryMonthly > 0);
  }, [activeUsers]);
  
  // Fetch all leaves for the year and filter by status on the client to avoid complex composite indexes.
  const yearLeavesQuery = useMemo(() => {
    if (!db) return null;
    return query(collection(db, 'hrLeaves'), 
        where('year', '==', currentMonthDate.getFullYear())
    );
  }, [db, currentMonthDate]);
  const { data: allYearLeaves, error: leavesError } = useCollection<LeaveRequest>(yearLeavesQuery);

  // Data fetching for existing payroll run
  const payrollRunId = useMemo(() => `${format(currentMonthDate, 'yyyy-MM')}-${period}`, [currentMonthDate, period]);
  const payrollRunRef = useMemo(() => db ? doc(db, 'payrollRuns', payrollRunId) : null, [db, payrollRunId]);
  const { data: payrollRun, isLoading: isLoadingRun } = useDoc<PayrollRun>(payrollRunRef);

  const payslipsQuery = useMemo(() => db && payrollRun ? query(collection(db, 'payrollRuns', payrollRunId, 'payslips')) : null, [db, payrollRun, payrollRunId]);
  const { data: payslips, isLoading: isLoadingPayslips } = useCollection<WithId<Payslip>>(payslipsQuery);

  const isLoading = !hrSettings || !users || !allYearLeaves || isLoadingRun || isLoadingPayslips;

  const calculatedPayrollData = useMemo(() => {
    if (!hrSettings || !users || !allYearLeaves) return [];

    const approvedLeaves = allYearLeaves.filter(l => l.status === 'APPROVED');
    const periodStartDate = period === 1 ? new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), hrSettings.payroll?.period1Start || 1) : new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), hrSettings.payroll?.period2Start || 16);
    const periodEndDate = period === 1 ? new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), hrSettings.payroll?.period1End || 15) : endOfMonth(currentMonthDate);
    const payPeriod = { start: periodStartDate, end: periodEndDate };

    return users.map(user => {
      const salary = user.hr?.salaryMonthly || 0;
      const baseSalaryForPeriod = salary / 2;
      const deductions: PayslipDeduction[] = [];

      // Leave Deduction Calculation
      const overLimitLeaves = approvedLeaves.filter(l => l.userId === user.id && l.overLimit === true);
      overLimitLeaves.forEach(leave => {
        const leaveDateRange = { start: parseISO(leave.startDate), end: parseISO(leave.endDate) };
        const overlappingDays = getOverlapDays(payPeriod, leaveDateRange);
        if (overlappingDays > 0) {
          const policy = hrSettings.leavePolicy?.leaveTypes?.[leave.leaveType];
          if (policy?.overLimitHandling?.mode === 'DEDUCT_SALARY') {
            const deductionBaseDays = policy.salaryDeductionBaseDays || 26;
            const dailyRate = salary / deductionBaseDays;
            const deductionAmount = overlappingDays * dailyRate;
            deductions.push({
              name: `Deduction: ${leave.leaveType} Leave`,
              amount: deductionAmount,
              notes: `${overlappingDays} over-limit day(s) in this period.`
            });
          }
        }
      });
      
      // SSO Calculation
      const ssoPolicy = hrSettings.sso;
      if (ssoPolicy?.employeePercent && ssoPolicy.monthlyCap) {
          const fullMonthSSO = Math.min((salary * (ssoPolicy.employeePercent / 100)), ssoPolicy.monthlyCap);
          const ssoEmployeeDeduction = fullMonthSSO / 2;
          deductions.push({ name: 'Social Security (SSO)', amount: ssoEmployeeDeduction, notes: `${ssoPolicy.employeePercent}% of salary, capped and split.` });
      }
      
      // Withholding Tax Calculation
      const whPolicy = hrSettings.withholding;
      if (whPolicy?.enabled && whPolicy.defaultPercent) {
          const whDeduction = (baseSalaryForPeriod * (whPolicy.defaultPercent / 100));
          deductions.push({ name: 'Withholding Tax', amount: whDeduction, notes: `Standard ${whPolicy.defaultPercent}% of base pay for period.` });
      }
      
      const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
      const netSalary = baseSalaryForPeriod - totalDeductions;
      
      return {
        userId: user.id,
        userName: user.displayName,
        baseSalary: baseSalaryForPeriod,
        deductions,
        netSalary,
        payrollRunId,
      };
    });
  }, [hrSettings, users, allYearLeaves, currentMonthDate, period, payrollRunId]);

  const handleCreateDraft = async () => {
    if (!db || calculatedPayrollData.length === 0) return;
    setIsSubmitting(true);
    try {
        const batch = writeBatch(db);

        // 1. Create payrollRun document
        const runRef = doc(db, 'payrollRuns', payrollRunId);
        batch.set(runRef, {
            id: payrollRunId,
            year: currentMonthDate.getFullYear(),
            month: currentMonthDate.getMonth() + 1,
            period,
            status: 'DRAFT_HR',
            createdAt: serverTimestamp(),
        });
        
        // 2. Create payslip sub-documents
        calculatedPayrollData.forEach(payslipData => {
            const payslipRef = doc(db, 'payrollRuns', payrollRunId, 'payslips', payslipData.userId);
            batch.set(payslipRef, { id: payslipRef.id, ...payslipData });
        });

        await batch.commit();
        toast({ title: 'Draft Created', description: 'Payroll draft has been saved.' });
    } catch(error: any) {
        toast({ variant: 'destructive', title: 'Error Creating Draft', description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  }

  const handleSendToEmployees = async () => {
    if (!db || !payrollRun) return;
     setIsSubmitting(true);
     try {
        await updateDoc(doc(db, 'payrollRuns', payrollRun.id), {
            status: 'SENT_TO_EMPLOYEE'
        });
        toast({ title: 'Sent to Employees', description: 'Draft has been sent for employee review.' });
     } catch(error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
     } finally {
        setIsSubmitting(false);
     }
  }

  const handlePrevMonth = () => setCurrentMonthDate(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonthDate(prev => addMonths(prev, 1));
  
  const getStatusBadge = (status: string) => {
    switch (status) {
        case 'DRAFT_HR': return <Badge variant="secondary">Draft</Badge>;
        case 'SENT_TO_EMPLOYEE': return <Badge>Sent to Employees</Badge>;
        case 'FINAL': return <Badge variant="default">Final</Badge>;
        default: return <Badge variant="outline">{status}</Badge>;
    }
  }

  const renderPayrollTable = (data: (WithId<Payslip> | (typeof calculatedPayrollData)[0])[]) => (
     <Accordion type="single" collapsible className="w-full">
        {data.length > 0 ? data.map(p => (
            <AccordionItem value={p.userId} key={p.userId}>
                    <AccordionTrigger>
                        <div className="flex justify-between w-full pr-4">
                            <span>{p.userName}</span>
                            <span className="font-mono text-primary">Net: {p.netSalary.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}</span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 bg-muted/50">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Amount (THB)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell className="font-medium">Base Salary (for period)</TableCell>
                                    <TableCell className="text-right">{p.baseSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                                {p.deductions.map((ded, i) => (
                                    <TableRow key={i}>
                                    <TableCell>
                                        <p className="font-medium text-destructive">(-) {ded.name}</p>
                                        {ded.notes && <p className="text-xs text-muted-foreground">{ded.notes}</p>}
                                    </TableCell>
                                    <TableCell className="text-right text-destructive">- {ded.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="bg-background font-bold text-base">
                                    <TableCell>Net Salary</TableCell>
                                    <TableCell className="text-right">{p.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </AccordionContent>
            </AccordionItem>
        )) : (
            <div className="text-center text-muted-foreground p-8">No active employees with salary found.</div>
        )}
    </Accordion>
  );

  return (
    <>
      <PageHeader title="Payroll" description="Calculate and manage employee payroll runs." />
      
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Payroll Management</CardTitle>
              <CardDescription>Select a period to calculate or view a payroll run.</CardDescription>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button variant="outline" size="icon" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="font-semibold text-lg text-center w-32">{format(currentMonthDate, 'MMMM yyyy')}</span>
              <Button variant="outline" size="icon" onClick={handleNextMonth}><ChevronRight className="h-4 w-4" /></Button>
              <Select value={period.toString()} onValueChange={(v) => setPeriod(Number(v) as 1 | 2)}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                      <SelectItem value="1">Period 1 (1-15)</SelectItem>
                      <SelectItem value="2">Period 2 (16-EOM)</SelectItem>
                  </SelectContent>
              </Select>
            </div>
          </div>
           {payrollRun && (
            <div className="pt-4 flex items-center gap-2">
                <span className="text-sm font-semibold">Status:</span>
                {getStatusBadge(payrollRun.status)}
            </div>
          )}
        </CardHeader>
        <CardContent>
            {isLoading ? (
                 <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>
            ) : leavesError ? (
                 <div className="text-destructive text-center p-8">Error loading leave data. A database index might be required for the query on 'hrLeaves'. Check console for details.</div>
            ) : payrollRun ? (
                renderPayrollTable(payslips || [])
            ) : (
                renderPayrollTable(calculatedPayrollData)
            )}
        </CardContent>
        {!isLoading && (
             <CardContent>
                {!payrollRun && (
                    <Button onClick={handleCreateDraft} disabled={isSubmitting || (calculatedPayrollData && calculatedPayrollData.length === 0)}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FilePlus className="mr-2 h-4 w-4"/>}
                        Create Draft
                    </Button>
                )}
                 {payrollRun && payrollRun.status === 'DRAFT_HR' && (
                    <Button onClick={handleSendToEmployees} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
                        Send to Employees for Review
                    </Button>
                )}
            </CardContent>
        )}
      </Card>
    </>
  );
}
