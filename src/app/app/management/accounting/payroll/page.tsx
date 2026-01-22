
"use client";

import { useMemo, useState, useEffect } from "react";
import { doc, collection, query, where, orderBy, writeBatch, serverTimestamp, updateDoc, getDocs } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useAuth } from "@/context/auth-context";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection, WithId } from "@/firebase/firestore/use-collection";
import { addMonths, subMonths, format, startOfMonth, endOfMonth, isWithinInterval, differenceInCalendarDays, max, min, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ChevronLeft, ChevronRight, FilePlus, Send, AlertCircle, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { HRSettings, UserProfile, LeaveRequest, PayrollRun, Payslip, PayslipDeduction } from "@/lib/types";

function getOverlapDays(range1: {start: Date, end: Date}, range2: {start: Date, end: Date}) {
  const start = max([range1.start, range2.start]);
  const end = min([range1.end, range2.end]);

  if (start > end) return 0;
  return differenceInCalendarDays(end, start) + 1;
}

const PayslipStatusBadge = ({ status }: { status: Payslip['employeeStatus'] }) => {
    switch (status) {
        case 'PENDING_REVIEW':
            return <Badge variant="secondary">Pending Review</Badge>;
        case 'ACCEPTED':
            return <Badge variant="default" className="bg-green-600 hover:bg-green-600/80">Accepted</Badge>;
        case 'REJECTED':
            return <Badge variant="destructive">Needs Fix</Badge>;
        default:
            return null;
    }
};

// Main Payroll Component
export default function ManagementAccountingPayrollPage() {
  const { db } = useFirebase();
  const { toast } = useToast();
  const { profile: adminProfile } = useAuth();
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [period, setPeriod] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for one-time fetches
  const [manualLoading, setManualLoading] = useState(true);
  const [manualError, setManualError] = useState<Error | null>(null);
  const [users, setUsers] = useState<WithId<UserProfile>[] | null>(null);
  const [allYearLeaves, setAllYearLeaves] = useState<LeaveRequest[] | null>(null);

  // State for editing HR Notes
  const [editingPayslipId, setEditingPayslipId] = useState<string | null>(null);
  const [currentHrNote, setCurrentHrNote] = useState("");

  const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
  const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);

  useEffect(() => {
    if (!db) return;

    const fetchPayrollPrerequisites = async () => {
      setManualLoading(true);
      setManualError(null);
      try {
        const year = currentMonthDate.getFullYear();
        
        const usersQuery = query(collection(db, 'users'), orderBy('displayName', 'asc'));
        const leavesQuery = query(collection(db, 'hrLeaves'), where('year', '==', year));

        const [usersSnapshot, leavesSnapshot] = await Promise.all([
            getDocs(usersQuery),
            getDocs(leavesQuery)
        ]);

        const allUsersData = usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithId<UserProfile>));
        const activeUsersWithSalary = allUsersData.filter(u => u.status === 'ACTIVE' && u.hr?.salaryMonthly && u.hr.salaryMonthly > 0);
        setUsers(activeUsersWithSalary);
        
        const leavesData = leavesSnapshot.docs.map(d => d.data() as LeaveRequest);
        setAllYearLeaves(leavesData);

      } catch (e: any) {
        setManualError(e);
        toast({ variant: 'destructive', title: 'Error Fetching Prerequisite Data', description: e.message });
      } finally {
        setManualLoading(false);
      }
    };
    
    fetchPayrollPrerequisites();
  }, [db, currentMonthDate, toast]);


  const payrollRunId = useMemo(() => `${format(currentMonthDate, 'yyyy-MM')}-${period}`, [currentMonthDate, period]);
  const payrollRunRef = useMemo(() => db ? doc(db, 'payrollRuns', payrollRunId) : null, [db, payrollRunId]);
  const { data: payrollRun, isLoading: isLoadingRun } = useDoc<PayrollRun>(payrollRunRef);

  const payslipsQuery = useMemo(() => db && payrollRun ? query(collection(db, 'payrollRuns', payrollRunId, 'payslips')) : null, [db, payrollRun, payrollRunId]);
  const { data: payslips, isLoading: isLoadingPayslips } = useCollection<WithId<Payslip>>(payslipsQuery);

  const isLoading = isLoadingSettings || manualLoading || isLoadingRun || isLoadingPayslips;

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
      
      const ssoPolicy = hrSettings.sso;
      if (ssoPolicy?.employeePercent && ssoPolicy.monthlyCap) {
          const fullMonthSSO = Math.min((salary * (ssoPolicy.employeePercent / 100)), ssoPolicy.monthlyCap);
          const ssoEmployeeDeduction = fullMonthSSO / 2;
          deductions.push({ name: 'Social Security (SSO)', amount: ssoEmployeeDeduction, notes: `${ssoPolicy.employeePercent}% of salary, capped and split.` });
      }
      
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
    if (!db || calculatedPayrollData.length === 0 || !adminProfile) return;
    setIsSubmitting(true);
    try {
        const batch = writeBatch(db);

        const runRef = doc(db, 'payrollRuns', payrollRunId);
        batch.set(runRef, {
            id: payrollRunId,
            year: currentMonthDate.getFullYear(),
            month: currentMonthDate.getMonth() + 1,
            period,
            status: 'DRAFT_HR',
            createdAt: serverTimestamp(),
        });
        
        calculatedPayrollData.forEach(payslipData => {
            const payslipRef = doc(db, 'payrollRuns', payrollRunId, 'payslips', payslipData.userId);
            batch.set(payslipRef, { 
                id: payslipRef.id, 
                ...payslipData,
                employeeStatus: "PENDING_REVIEW",
                employeeAccepted: false,
                employeeAcceptedAt: null,
                employeeNote: null,
                hrCheckedByName: adminProfile.displayName,
                hrCheckedAt: serverTimestamp(),
                hrNote: null,
            });
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
    if (!db || !payrollRun || !payslipsQuery) return;
     setIsSubmitting(true);
     try {
        const batch = writeBatch(db);

        // 1. Update the main run status
        const runRef = doc(db, 'payrollRuns', payrollRun.id);
        batch.update(runRef, {
            status: 'SENT_TO_EMPLOYEE'
        });

        // 2. Get all current payslips and update them
        const payslipsSnapshot = await getDocs(payslipsQuery);
        payslipsSnapshot.forEach(payslipDoc => {
            batch.update(payslipDoc.ref, {
                sentToEmployeeAt: serverTimestamp()
            });
        });

        await batch.commit();
        
        toast({ title: 'Sent to Employees', description: 'Payslips have been sent for employee review.' });
     } catch(error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
     } finally {
        setIsSubmitting(false);
     }
  }

  const handleSaveHrNote = async (payslipId: string) => {
    if (!db || !payrollRun) return;
    const payslipRef = doc(db, 'payrollRuns', payrollRun.id, 'payslips', payslipId);
    try {
      await updateDoc(payslipRef, {
        hrNote: currentHrNote,
      });
      toast({ title: "Note saved successfully." });
    } catch(e: any) {
      toast({ variant: 'destructive', title: 'Error saving note', description: e.message });
    } finally {
      setEditingPayslipId(null);
    }
  };

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
                        <div className="flex justify-between w-full pr-4 items-center">
                            <span className="font-medium">{p.userName}</span>
                            <div className="flex items-center gap-4">
                                {payrollRun && payrollRun.status !== 'DRAFT_HR' && 'employeeStatus' in p && (
                                    <PayslipStatusBadge status={p.employeeStatus} />
                                )}
                                <span className="font-mono text-primary">Net: {p.netSalary.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}</span>
                            </div>
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
                         {payrollRun && payrollRun.status === 'DRAFT_HR' && 'hrNote' in p && (
                            <div className="mt-4 pt-4 border-t">
                            <h5 className="font-semibold text-sm mb-2">HR Notes & Adjustments</h5>
                            {editingPayslipId === p.userId ? (
                                <div className="space-y-2">
                                <Textarea
                                    defaultValue={p.hrNote || ""}
                                    onChange={(e) => setCurrentHrNote(e.target.value)}
                                    placeholder="Add manual adjustments or notes..."
                                />
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={() => handleSaveHrNote(p.userId)}>Save Note</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setEditingPayslipId(null)}>Cancel</Button>
                                </div>
                                </div>
                            ) : (
                                <div className="space-y-2 group">
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded-md p-2 bg-background min-h-10">
                                    {p.hrNote || "No notes added."}
                                </p>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                    setEditingPayslipId(p.userId);
                                    setCurrentHrNote(p.hrNote || "");
                                    }}
                                >
                                    <Edit className="mr-2 h-3 w-3"/>
                                    Edit Note
                                </Button>
                                </div>
                            )}
                            </div>
                        )}
                    </AccordionContent>
            </AccordionItem>
        )) : (
            <div className="text-center text-muted-foreground p-8">No active employees with salary found for this period.</div>
        )}
    </Accordion>
  );

  const renderContent = () => {
    if (isLoading) {
      return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>
    }
    if (manualError) {
      return (
        <div className="text-destructive text-center p-8 bg-destructive/10 rounded-lg">
            <AlertCircle className="mx-auto h-8 w-8 mb-2" />
            <h3 className="font-semibold">Error Loading Payroll Data</h3>
            <p className="text-sm">{manualError.message}</p>
        </div>
      );
    }
    return payrollRun ? renderPayrollTable(payslips || []) : renderPayrollTable(calculatedPayrollData);
  }

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
            {renderContent()}
        </CardContent>
        {!isLoading && !manualError && (
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
