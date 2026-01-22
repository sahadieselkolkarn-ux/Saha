
"use client";

import { useMemo, useState } from "react";
import { doc, collection, query, where, orderBy } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection, WithId } from "@/firebase/firestore/use-collection";
import { addMonths, subMonths, format, startOfYear, endOfYear, isWithinInterval, differenceInCalendarDays, max, min } from "date-fns";
import { parseISO } from "date-fns";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type { HRSettings, UserProfile, LeaveRequest } from "@/lib/types";

function getOverlapDays(range1: {start: Date, end: Date}, range2: {start: Date, end: Date}) {
  const start = max([range1.start, range2.start]);
  const end = min([range1.end, range2.end]);

  if (start > end) {
    return 0;
  }
  
  return differenceInCalendarDays(end, start) + 1;
}


// Main Payroll Component
export default function ManagementAccountingPayrollPage() {
  const { db } = useFirebase();
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [period, setPeriod] = useState<1 | 2>(1);

  // Data fetching
  const settingsDocRef = useMemo(() => db ? doc(db, 'settings', 'hr') : null, [db]);
  const { data: hrSettings, isLoading: isLoadingSettings } = useDoc<HRSettings>(settingsDocRef);
  
  const usersQuery = useMemo(() => db ? query(collection(db, 'users'), where('status', '==', 'ACTIVE'), where('hr.salaryMonthly', '>', 0), orderBy('displayName', 'asc')) : null, [db]);
  const { data: users, isLoading: isLoadingUsers } = useCollection<WithId<UserProfile>>(usersQuery);
  
  const leavesQuery = useMemo(() => {
    if (!db) return null;
    const yearStart = startOfYear(currentMonthDate);
    const yearEnd = endOfYear(currentMonthDate);
    return query(collection(db, 'hrLeaves'), 
        where('status', '==', 'APPROVED'),
        where('startDate', '>=', format(yearStart, 'yyyy-MM-dd')),
        where('endDate', '<=', format(yearEnd, 'yyyy-MM-dd'))
    );
  }, [db, currentMonthDate]);
  const { data: approvedLeaves, isLoading: isLoadingLeaves, error: leavesError } = useCollection<LeaveRequest>(leavesQuery);

  const isLoading = isLoadingSettings || isLoadingUsers || isLoadingLeaves;

  const payrollData = useMemo(() => {
    if (isLoading || !hrSettings || !users || !approvedLeaves) return [];

    const periodStartDate = period === 1 ? new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1) : new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 16);
    const periodEndDate = period === 1 ? new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 15) : new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0);
    const payPeriod = { start: periodStartDate, end: periodEndDate };

    return users.map(user => {
      const salary = user.hr?.salaryMonthly || 0;
      const baseSalaryForPeriod = salary / 2;
      let totalDeductions = 0;
      const deductionDetails: {name: string, amount: number, notes: string}[] = [];

      // Leave Deduction Calculation from over-limit leaves
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
            totalDeductions += deductionAmount;
            deductionDetails.push({
              name: `Deduction: ${leave.leaveType} Leave`,
              amount: deductionAmount,
              notes: `${overlappingDays} over-limit day(s) in this period.`
            });
          }
        }
      });
      
      // SSO Calculation
      const ssoPolicy = hrSettings.sso;
      let ssoEmployeeDeduction = 0;
      if (ssoPolicy?.employeePercent && ssoPolicy.monthlyCap) {
          const fullMonthSSO = Math.min((salary * (ssoPolicy.employeePercent / 100)), ssoPolicy.monthlyCap);
          ssoEmployeeDeduction = fullMonthSSO / 2; // Split SSO deduction over two periods
          totalDeductions += ssoEmployeeDeduction;
          deductionDetails.push({ name: 'Social Security (SSO)', amount: ssoEmployeeDeduction, notes: `${ssoPolicy.employeePercent}% of salary, capped and split.` });
      }
      
      // Withholding Tax Calculation
      const whPolicy = hrSettings.withholding;
      let whDeduction = 0;
      if (whPolicy?.enabled && whPolicy.defaultPercent) {
          whDeduction = (baseSalaryForPeriod * (whPolicy.defaultPercent / 100));
          totalDeductions += whDeduction;
          deductionDetails.push({ name: 'Withholding Tax', amount: whDeduction, notes: `Standard ${whPolicy.defaultPercent}% of base pay for period.` });
      }
      
      const netSalary = baseSalaryForPeriod - totalDeductions;
      
      return {
        userId: user.id,
        userName: user.displayName,
        baseSalaryForPeriod,
        totalDeductions,
        netSalary,
        deductionDetails,
      };
    });

  }, [isLoading, hrSettings, users, approvedLeaves, currentMonthDate, period]);

  const handlePrevMonth = () => setCurrentMonthDate(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonthDate(prev => addMonths(prev, 1));

  return (
    <>
      <PageHeader title="Payroll" description="Calculate and review employee payroll." />
      
      <Card>
        <CardHeader>
          <CardTitle>Payroll Calculator</CardTitle>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardDescription>Select a period to calculate draft payroll data.</CardDescription>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button variant="outline" size="icon" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="font-semibold text-lg text-center w-32">{format(currentMonthDate, 'MMMM yyyy')}</span>
              <Button variant="outline" size="icon" onClick={handleNextMonth}><ChevronRight className="h-4 w-4" /></Button>
              <Select value={period.toString()} onValueChange={(v) => setPeriod(Number(v) as 1 | 2)}>
                  <SelectTrigger className="w-[180px]">
                      <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="1">Period 1 (1-15)</SelectItem>
                      <SelectItem value="2">Period 2 (16-EOM)</SelectItem>
                  </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
            {isLoading ? (
                 <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin h-8 w-8" /></div>
            ) : leavesError ? (
                 <div className="text-destructive text-center p-8">Error loading leave data. A database index might be required for the query on 'hrLeaves'. Check console for details.</div>
            ) : (
                <Accordion type="single" collapsible className="w-full">
                    {payrollData.length > 0 ? payrollData.map(p => (
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
                                             <TableCell className="text-right">{p.baseSalaryForPeriod.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</TableCell>
                                         </TableRow>
                                         {p.deductionDetails.map((ded, i) => (
                                             <TableRow key={i}>
                                                <TableCell>
                                                    <p className="font-medium text-destructive">(-) {ded.name}</p>
                                                    <p className="text-xs text-muted-foreground">{ded.notes}</p>
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
            )}
        </CardContent>
      </Card>
    </>
  );
}
