
"use client";

import { useMemo } from "react";
import type { PayslipSnapshot, PayType, UserProfile, AttendanceDayLog } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { PlusCircle, Trash2, AlertCircle, Clock, FileText, Edit, BadgeCheck, Calculator, FilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// --- Helper Functions ---
const formatCurrency = (value: number | undefined) => (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safeParseFloat = (value: any): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const num = parseFloat(value);
        return isNaN(num) ? 0 : num;
    }
    return 0;
};


export const calcTotals = (snapshot: PayslipSnapshot | null | undefined) => {
    if (!snapshot) return { basePay: 0, addTotal: 0, dedTotal: 0, netPay: 0 };
    const basePay = safeParseFloat(snapshot?.basePay);
    const addTotal = (snapshot?.additions || []).reduce((sum, item) => sum + safeParseFloat(item.amount), 0);
    const dedTotal = (snapshot?.deductions || []).reduce((sum, item) => sum + safeParseFloat(item.amount), 0);
    const netPay = basePay + addTotal - dedTotal;
    return { basePay, addTotal, dedTotal, netPay };
};

// --- Props ---
interface PayslipSlipViewProps {
  userName: string;
  periodLabel: string;
  snapshot: PayslipSnapshot;
  otherPeriodSnapshot?: PayslipSnapshot | null;
  currentPeriodNo?: number;
  userProfile?: UserProfile;
  mode: "read" | "edit";
  payType?: PayType;
  onChange?: (nextSnapshot: PayslipSnapshot) => void;
  onAdjustAttendance?: () => void;
  onAdjustLeave?: () => void;
  className?: string;
}

// --- Main Component ---
export function PayslipSlipView({ 
  userName, 
  periodLabel, 
  snapshot, 
  otherPeriodSnapshot,
  currentPeriodNo,
  userProfile,
  mode, 
  payType, 
  onChange, 
  onAdjustAttendance, 
  onAdjustLeave,
  className 
}: PayslipSlipViewProps) {
  const isEdit = mode === 'edit';
  
  const currentTotals = useMemo(() => calcTotals(snapshot), [snapshot]);
  const otherTotals = useMemo(() => calcTotals(otherPeriodSnapshot), [otherPeriodSnapshot]);

  // Determine P1 vs P2 snapshots for side-by-side display
  const p1Data = currentPeriodNo === 1 ? snapshot : otherPeriodSnapshot;
  const p2Data = currentPeriodNo === 2 ? snapshot : otherPeriodSnapshot;
  
  const p1Totals = currentPeriodNo === 1 ? currentTotals : otherTotals;
  const p2Totals = currentPeriodNo === 2 ? currentTotals : otherTotals;

  const monthlyTotalNet = p1Totals.netPay + p2Totals.netPay;

  const handleFieldChange = (field: keyof PayslipSnapshot | `additions.${number}.${string}` | `deductions.${number}.${string}`, value: any) => {
    if (!onChange) return;

    const newSnapshot: PayslipSnapshot = JSON.parse(JSON.stringify(snapshot));
    const parts = field.split('.');

    if (parts.length === 3) {
        const [arrayName, indexStr, propName] = parts as ['additions' | 'deductions', string, 'name' | 'amount' | 'notes'];
        const index = parseInt(indexStr, 10);
        if (!newSnapshot[arrayName]) newSnapshot[arrayName] = [];
        if (!newSnapshot[arrayName]![index]) newSnapshot[arrayName]![index] = {name:'',amount:0, notes:''};
        (newSnapshot[arrayName]![index] as any)[propName] = value;
    } else {
        (newSnapshot as any)[field as keyof PayslipSnapshot] = value;
    }

    onChange(newSnapshot);
  };
  
  const handleAddRow = (type: 'additions' | 'deductions') => {
    if (!onChange) return;
    const newSnapshot = { ...snapshot };
    if (!newSnapshot[type]) newSnapshot[type] = [];
    newSnapshot[type] = [...(newSnapshot[type] || []), {name: '', amount: 0, notes: ''}];
    onChange(newSnapshot);
  }

  const handleRemoveRow = (type: 'additions' | 'deductions', index: number) => {
     if (!onChange) return;
     const newSnapshot = { ...snapshot };
     if (newSnapshot[type]) {
        newSnapshot[type] = newSnapshot[type]!.filter((_, i) => i !== index);
        onChange(newSnapshot);
     }
  }

  const renderEditableRow = (type: 'additions' | 'deductions', item: any, index: number) => (
     <div key={index} className="grid grid-cols-[1fr_120px_40px] gap-2 items-start">
        <Input placeholder="รายการ" value={item.name} onChange={(e) => handleFieldChange(`${type}.${index}.name`, e.target.value)} />
        <Input type="number" placeholder="จำนวนเงิน" className="text-right" value={item.amount || ''} onChange={(e) => handleFieldChange(`${type}.${index}.amount`, safeParseFloat(e.target.value))} />
        <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveRow(type, index)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
     </div>
  );

  return (
    <div className={cn("space-y-6 pb-8", className)}>
        <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold text-primary">{userName}</h2>
            <p className="text-muted-foreground font-medium">{periodLabel}</p>
        </div>

        {snapshot.attendanceSummary?.warnings && snapshot.attendanceSummary.warnings.length > 0 && (
            <Alert variant="destructive" className="animate-pulse">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>คำเตือนระบบ</AlertTitle>
                <AlertDescription>
                    <ul className="list-disc pl-4 text-xs">
                       {snapshot.attendanceSummary.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                    </ul>
                </AlertDescription>
            </Alert>
        )}

        {/* --- Monthly Overview --- */}
        <Card className="border-primary/20 bg-primary/5 shadow-md">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-primary" />
                    ภาพรวมรายเดือน (Monthly Overview)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-between items-end border-b border-dashed pb-3">
                    <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">เงินเดือนรวม / ค่าแรงทั้งหมด</p>
                        <p className="text-2xl font-black text-primary">฿{formatCurrency(userProfile?.hr?.salaryMonthly || userProfile?.hr?.salaryDaily ? (userProfile.hr.salaryMonthly || 0) : 0)}</p>
                    </div>
                    <div className="text-right space-y-0.5">
                        <p className="text-xs text-muted-foreground">ยอดรับสุทธิรวมทั้งเดือน</p>
                        <p className="text-2xl font-black text-green-600">฿{formatCurrency(monthlyTotalNet)}</p>
                    </div>
                </div>

                {/* Period Comparison Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className={cn("p-3 rounded-lg border bg-background", currentPeriodNo === 1 && "ring-2 ring-primary shadow-sm")}>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">งวดที่ 1 (1-15)</span>
                            {currentPeriodNo === 1 && <Badge className="h-4 text-[8px] px-1">แก้ไขอยู่</Badge>}
                        </div>
                        {p1Data ? (
                            <div className="space-y-1 text-xs">
                                <div className="flex justify-between"><span>ฐานเงินเดือน:</span><span className="font-bold">{formatCurrency(p1Totals.basePay)}</span></div>
                                <div className="flex justify-between text-green-600"><span>รับเพิ่ม:</span><span>+{formatCurrency(p1Totals.addTotal)}</span></div>
                                <div className="flex justify-between text-destructive"><span>รายการหัก:</span><span>-{formatCurrency(p1Totals.dedTotal)}</span></div>
                                <Separator className="my-1"/>
                                <div className="flex justify-between font-bold text-sm text-primary"><span>สุทธิ:</span><span>{formatCurrency(p1Totals.netPay)}</span></div>
                            </div>
                        ) : (
                            <div className="flex h-20 items-center justify-center text-[10px] text-muted-foreground italic bg-muted/20 rounded border-dashed border">รอประมวลผล</div>
                        )}
                    </div>

                    <div className={cn("p-3 rounded-lg border bg-background", currentPeriodNo === 2 && "ring-2 ring-primary shadow-sm")}>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">งวดที่ 2 (16-สิ้นเดือน)</span>
                            {currentPeriodNo === 2 && <Badge className="h-4 text-[8px] px-1">แก้ไขอยู่</Badge>}
                        </div>
                        {p2Data ? (
                            <div className="space-y-1 text-xs">
                                <div className="flex justify-between"><span>ฐานเงินเดือน:</span><span className="font-bold">{formatCurrency(p2Totals.basePay)}</span></div>
                                <div className="flex justify-between text-green-600"><span>รับเพิ่ม:</span><span>+{formatCurrency(p2Totals.addTotal)}</span></div>
                                <div className="flex justify-between text-destructive"><span>รายการหัก:</span><span>-{formatCurrency(p2Totals.dedTotal)}</span></div>
                                <Separator className="my-1"/>
                                <div className="flex justify-between font-bold text-sm text-primary"><span>สุทธิ:</span><span>{formatCurrency(p2Totals.netPay)}</span></div>
                            </div>
                        ) : (
                            <div className="flex h-20 items-center justify-center text-[10px] text-muted-foreground italic bg-muted/20 rounded border-dashed border">รอประมวลผล</div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>

        {/* --- Current Period Detailed Breakdown --- */}
        <Card className="shadow-sm">
            <CardHeader className="bg-muted/30 pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    รายละเอียดรายรับ/หัก (งวดปัจจุบัน)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
                <div className="flex justify-between items-center">
                    <Label htmlFor="basePay" className={cn(isEdit ? "text-base font-bold" : "text-sm text-muted-foreground")}>ฐานเงินเดือน (ในงวดนี้)</Label>
                    {isEdit ? (
                        <div className="relative">
                            <Input id="basePay" type="number" className="w-40 text-right font-bold text-lg bg-muted/20 focus:bg-background transition-colors" value={snapshot?.basePay || ''} onChange={(e) => handleFieldChange('basePay', safeParseFloat(e.target.value))}/>
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-bold">฿</span>
                        </div>
                    ) : (
                         <span className="font-bold text-lg">{formatCurrency(currentTotals.basePay)}</span>
                    )}
                </div>

                <Separator />

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-green-600 flex items-center gap-2"><PlusCircle className="h-4 w-4"/> รายรับเพิ่มเติม</h4>
                        {isEdit && <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => handleAddRow('additions')}>+ เพิ่ม</Button>}
                    </div>
                    <div className="space-y-2">
                        {isEdit ? (
                            snapshot.additions?.map((item, index) => renderEditableRow('additions', item, index))
                        ) : (
                            (snapshot.additions && snapshot.additions.length > 0) ? snapshot.additions.map((item, i)=><div key={i} className="flex justify-between text-sm py-1 border-b last:border-0 border-dashed"><p>{item.name}</p><p className="font-medium text-green-600">+{formatCurrency(item.amount)}</p></div>) : <p className="text-xs text-muted-foreground italic">- ไม่มีรายการรับเพิ่ม -</p>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-destructive flex items-center gap-2"><Trash2 className="h-4 w-4"/> รายการหัก</h4>
                        {isEdit && <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => handleAddRow('deductions')}>+ เพิ่ม</Button>}
                    </div>
                    <div className="space-y-2">
                        {isEdit ? (
                            snapshot.deductions?.map((item, index) => renderEditableRow('deductions', item, index))
                        ) : (
                            (snapshot.deductions && snapshot.deductions.length > 0) ? snapshot.deductions.map((item, i)=><div key={i} className="flex justify-between text-sm py-1 border-b last:border-0 border-dashed"><p>{item.name}</p><p className="font-medium text-destructive">-{formatCurrency(item.amount)}</p></div>) : <p className="text-xs text-muted-foreground italic">- ไม่มีรายการหัก -</p>
                        )}
                    </div>
                </div>

                <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                    <div className="flex justify-between items-center text-xl font-black">
                        <span className="text-primary">ยอดสุทธิที่ได้รับงวดนี้</span>
                        <span className="text-primary underline decoration-double underline-offset-4">฿{formatCurrency(currentTotals.netPay)}</span>
                    </div>
                </div>
            </CardContent>
        </Card>

        {/* Attendance Day Log Section */}
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4"/> รายละเอียดการ สาย ขาด ลา (งวดปัจจุบัน)</CardTitle>
            </CardHeader>
            <CardContent>
                {snapshot.attendanceSummary?.dayLogs && snapshot.attendanceSummary.dayLogs.length > 0 ? (
                    <div className="space-y-2">
                        {snapshot.attendanceSummary.dayLogs.map((log, i) => (
                            <div key={i} className="flex justify-between items-center text-xs border-b border-dashed pb-1.5 last:border-0 hover:bg-muted/20 transition-colors px-1">
                                <div className="flex items-center gap-3">
                                    <Badge variant={log.type === 'ABSENT' ? 'destructive' : log.type === 'LATE' ? 'secondary' : 'outline'} className="text-[9px] px-1.5 h-4 font-bold shadow-sm">
                                        {log.type === 'ABSENT' ? 'ขาด' : log.type === 'LATE' ? 'สาย' : 'ลา'}
                                    </Badge>
                                    <span className="font-bold text-foreground/80">{log.date}</span>
                                </div>
                                <span className="text-muted-foreground italic">{log.detail}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-center py-6 text-xs text-muted-foreground italic flex items-center justify-center gap-2">
                        <BadgeCheck className="h-4 w-4 text-green-500"/>
                        ไม่มีรายการ สาย ขาด หรือ ลา ในงวดนี้ค่ะ เยี่ยมมาก!
                    </p>
                )}
            </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {payType !== 'MONTHLY_NOSCAN' && snapshot.attendanceSummary && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-[13px] font-bold uppercase tracking-wide">สรุปการลงเวลา</CardTitle>
                        {isEdit && onAdjustAttendance && (
                            <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="h-6 text-[9px] px-2 gap-1 border-primary/30 text-primary hover:bg-primary/5"
                                onClick={onAdjustAttendance}
                            >
                                <Edit className="h-3 w-3" />
                                ปรับปรุงเวลา
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow className="h-8 border-b">
                                    <TableHead className="p-1 text-[10px] font-bold">รายการ</TableHead>
                                    <TableHead className="p-1 text-[10px] font-bold text-right">งวดนี้</TableHead>
                                    <TableHead className="p-1 text-[10px] font-bold text-right">สะสมปีนี้</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="text-[11px]">
                                <TableRow className="h-8">
                                    <TableCell className="p-1">วันทำงานตามตาราง</TableCell>
                                    <TableCell className="text-right font-medium p-1">{snapshot.attendanceSummary?.scheduledWorkDays ?? '-'}</TableCell>
                                    <TableCell className="text-right font-medium p-1 text-muted-foreground">{snapshot.attendanceSummaryYtd?.scheduledWorkDays ?? '-'}</TableCell>
                                </TableRow>
                                <TableRow className="h-8">
                                    <TableCell className="p-1">วันทำงานจริง</TableCell>
                                    <TableCell className="text-right font-medium p-1">{snapshot.attendanceSummary?.presentDays ?? '-'}</TableCell>
                                    <TableCell className="text-right font-medium p-1 text-muted-foreground">{snapshot.attendanceSummaryYtd?.presentDays ?? '-'}</TableCell>
                                </TableRow>
                                <TableRow className="h-8">
                                    <TableCell className="p-1">วันมาสาย</TableCell>
                                    <TableCell className="text-right font-medium text-destructive p-1">{snapshot.attendanceSummary?.lateDays ?? '-'}</TableCell>
                                    <TableCell className="text-right font-medium p-1 text-muted-foreground">{snapshot.attendanceSummaryYtd?.lateDays ?? '-'}</TableCell>
                                </TableRow>
                                <TableRow className="h-8">
                                    <TableCell className="p-1">หน่วยที่ขาด</TableCell>
                                    <TableCell className="text-right font-medium text-destructive p-1">{snapshot.attendanceSummary?.absentUnits ?? '-'}</TableCell>
                                    <TableCell className="text-right font-medium p-1 text-muted-foreground">{snapshot.attendanceSummaryYtd?.absentUnits ?? '-'}</TableCell>
                                </TableRow>
                                <TableRow className="h-8 border-0">
                                    <TableCell className="p-1">วันลาที่อนุมัติ</TableCell>
                                    <TableCell className="text-right font-medium p-1">{snapshot.attendanceSummary?.leaveDays ?? '-'}</TableCell>
                                    <TableCell className="text-right font-medium p-1 text-muted-foreground">{snapshot.attendanceSummaryYtd?.leaveDays ?? '-'}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-[13px] font-bold uppercase tracking-wide">สรุปการลา</CardTitle>
                    {isEdit && onAdjustLeave && (
                        <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            className="h-6 text-[9px] px-2 gap-1 border-primary/30 text-primary hover:bg-primary/5"
                            onClick={onAdjustLeave}
                        >
                            <FilePlus className="h-3 w-3" />
                            ปรับปรุงการลา
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow className="h-8 border-b">
                                <TableHead className="p-1 text-[10px] font-bold">รายการ</TableHead>
                                <TableHead className="p-1 text-[10px] font-bold text-right">งวดนี้</TableHead>
                                <TableHead className="p-1 text-[10px] font-bold text-right">สะสมปีนี้</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="text-[11px]">
                            <TableRow className="h-8"><TableCell className="p-1">ลาป่วย</TableCell><TableCell className="text-right p-1">{snapshot.leaveSummary?.sickDays ?? 0}</TableCell><TableCell className="text-right p-1 text-muted-foreground">{snapshot.leaveSummaryYtd?.sickDays ?? 0}</TableCell></TableRow>
                            <TableRow className="h-8"><TableCell className="p-1">ลากิจ</TableCell><TableCell className="text-right p-1">{snapshot.leaveSummary?.businessDays ?? 0}</TableCell><TableCell className="text-right p-1 text-muted-foreground">{snapshot.leaveSummaryYtd?.businessDays ?? 0}</TableCell></TableRow>
                            <TableRow className="h-8"><TableCell className="p-1">ลาพักร้อน</TableCell><TableCell className="text-right p-1">{snapshot.leaveSummary?.vacationDays ?? 0}</TableCell><TableCell className="text-right p-1 text-muted-foreground">{snapshot.leaveSummaryYtd?.vacationDays ?? 0}</TableCell></TableRow>
                            <TableRow className="h-8 border-0"><TableCell className="p-1">ลาเกินสิทธิ์</TableCell><TableCell className="text-right text-destructive font-bold p-1">{snapshot.leaveSummary?.overLimitDays ?? 0}</TableCell><TableCell className="text-right p-1 text-muted-foreground">{snapshot.leaveSummaryYtd?.overLimitDays ?? 0}</TableCell></TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>

        {isEdit && (
            <Card className="border-amber-200 bg-amber-50/20">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold text-amber-700 flex items-center gap-2">
                        <FileText className="h-4 w-4"/> หมายเหตุจาก HR
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Textarea 
                        placeholder="ระบุสูตรการคำนวณ หรือบันทึกเพื่อคุยกับพนักงาน..." 
                        className="bg-background text-sm min-h-[100px]"
                        value={snapshot.calcNotes || ''} 
                        onChange={(e) => handleFieldChange('calcNotes', e.target.value)} 
                    />
                </CardContent>
            </Card>
        )}

        {!isEdit && snapshot.calcNotes && (
            <Card className="border-muted bg-muted/10 italic">
                <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">"{snapshot.calcNotes}"</p>
                </CardContent>
            </Card>
        )}
    </div>
  );
}
