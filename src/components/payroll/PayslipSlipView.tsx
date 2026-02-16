"use client";

import { useMemo } from "react";
import type { PayslipSnapshot, PayType } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { PlusCircle, Trash2, AlertCircle, Clock, CalendarX, FileText, Edit, BadgeCheck } from "lucide-react";
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
  mode: "read" | "edit";
  payType?: PayType;
  onChange?: (nextSnapshot: PayslipSnapshot) => void;
  onAdjustAttendance?: () => void;
  className?: string;
}

// --- Main Component ---
export function PayslipSlipView({ userName, periodLabel, snapshot, mode, payType, onChange, onAdjustAttendance, className }: PayslipSlipViewProps) {
  const isEdit = mode === 'edit';
  const totals = useMemo(() => calcTotals(snapshot), [snapshot]);

  const handleFieldChange = (field: keyof PayslipSnapshot | `additions.${number}.${string}` | `deductions.${number}.${string}`, value: any) => {
    if (!onChange) return;

    const newSnapshot: PayslipSnapshot = JSON.parse(JSON.stringify(snapshot));
    const parts = field.split('.');

    if (parts.length === 3) {
        const [arrayName, indexStr, propName] = parts as ['additions' | 'deductions', string, 'name' | 'amount' | 'notes'];
        const index = parseInt(indexStr, 10);
        if (!newSnapshot[arrayName]) newSnapshot[arrayName] = [];
        if (!newSnapshot[arrayName][index]) newSnapshot[arrayName][index] = {name:'',amount:0, notes:''};
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
    <div className={cn("space-y-4", className)}>
        <div className="text-center">
            <h2 className="text-xl font-bold">{userName}</h2>
            <p className="text-muted-foreground">{periodLabel}</p>
        </div>

        {snapshot.attendanceSummary?.warnings && snapshot.attendanceSummary.warnings.length > 0 && (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>คำเตือน</AlertTitle>
                <AlertDescription>
                    <ul className="list-disc pl-4">
                       {snapshot.attendanceSummary.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                    </ul>
                </AlertDescription>
            </Alert>
        )}

        <Card>
            <CardHeader>
                <CardTitle className="text-lg">สรุปการจ่ายเงิน</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                <div className="flex justify-between items-center">
                    <Label htmlFor="basePay" className={cn(isEdit && "text-base")}>ฐานเงินเดือน (ในงวดนี้)</Label>
                    {isEdit ? (
                        <Input id="basePay" type="number" className="w-40 text-right font-semibold" value={snapshot?.basePay || ''} onChange={(e) => handleFieldChange('basePay', safeParseFloat(e.target.value))}/>
                    ) : (
                         <span className="font-semibold">{formatCurrency(totals.basePay)}</span>
                    )}
                </div>
                 <div className="flex justify-between">
                    <span className="text-muted-foreground">รายรับเพิ่มเติม</span>
                    <span className="text-green-600">{formatCurrency(totals.addTotal)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">รายการหัก</span>
                    <span className="text-destructive">{`-${formatCurrency(totals.dedTotal)}`}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-xl font-bold">
                    <span>ยอดสุทธิที่ได้รับ</span>
                    <span className="text-primary">{formatCurrency(totals.netPay)}</span>
                </div>
            </CardContent>
        </Card>

        {/* Attendance Day Log Section */}
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4"/> รายละเอียดการ สาย ขาด ลา</CardTitle>
            </CardHeader>
            <CardContent>
                {snapshot.attendanceSummary?.dayLogs && snapshot.attendanceSummary.dayLogs.length > 0 ? (
                    <div className="space-y-2">
                        {snapshot.attendanceSummary.dayLogs.map((log, i) => (
                            <div key={i} className="flex justify-between items-center text-xs border-b border-dashed pb-1 last:border-0">
                                <div className="flex items-center gap-2">
                                    <Badge variant={log.type === 'ABSENT' ? 'destructive' : log.type === 'LATE' ? 'secondary' : 'outline'} className="text-[9px] px-1 h-4">
                                        {log.type === 'ABSENT' ? 'ขาด' : log.type === 'LATE' ? 'สาย' : 'ลา'}
                                    </Badge>
                                    <span className="font-medium">{log.date}</span>
                                </div>
                                <span className="text-muted-foreground">{log.detail}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-center py-4 text-xs text-muted-foreground italic">ไม่มีรายการ สาย ขาด หรือ ลา ในงวดนี้ค่ะ</p>
                )}
            </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {payType !== 'MONTHLY_NOSCAN' && snapshot.attendanceSummary && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base">สรุปการลงเวลา</CardTitle>
                        {isEdit && onAdjustAttendance && (
                            <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="h-7 text-[10px] px-2 gap-1 border-primary/30 text-primary hover:bg-primary/5"
                                onClick={onAdjustAttendance}
                            >
                                <Edit className="h-3 w-3" />
                                ปรับปรุงเวลา
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead className="text-[10px]">รายการ</TableHead><TableHead className="text-right text-[10px]">งวดนี้</TableHead></TableRow></TableHeader>
                            <TableBody className="text-xs">
                                <TableRow><TableCell>วันทำงานตามตาราง</TableCell><TableCell className="text-right font-medium">{snapshot.attendanceSummary?.scheduledWorkDays ?? '-'}</TableCell></TableRow>
                                <TableRow><TableCell>วันทำงานจริง</TableCell><TableCell className="text-right font-medium">{snapshot.attendanceSummary?.presentDays ?? '-'}</TableCell></TableRow>
                                <TableRow><TableCell>วันมาสาย</TableCell><TableCell className="text-right font-medium text-destructive">{snapshot.attendanceSummary?.lateDays ?? '-'}</TableCell></TableRow>
                                <TableRow><TableCell>หน่วยที่ขาด</TableCell><TableCell className="text-right font-medium text-destructive">{snapshot.attendanceSummary?.absentUnits ?? '-'}</TableCell></TableRow>
                                <TableRow><TableCell>วันลาที่อนุมัติ</TableCell><TableCell className="text-right font-medium">{snapshot.attendanceSummary?.leaveDays ?? '-'}</TableCell></TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
             <Card>
                <CardHeader><CardTitle className="text-base">สรุปการลา</CardTitle></CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader><TableRow><TableHead className="text-[10px]">รายการ</TableHead><TableHead className="text-right text-[10px]">งวดนี้</TableHead></TableRow></TableHeader>
                        <TableBody className="text-xs">
                            <TableRow><TableCell>ลาป่วย</TableCell><TableCell className="text-right">{snapshot.leaveSummary?.sickDays ?? 0}</TableCell></TableRow>
                            <TableRow><TableCell>ลากิจ</TableCell><TableCell className="text-right">{snapshot.leaveSummary?.businessDays ?? 0}</TableCell></TableRow>
                            <TableRow><TableCell>ลาพักร้อน</TableCell><TableCell className="text-right">{snapshot.leaveSummary?.vacationDays ?? 0}</TableCell></TableRow>
                            <TableRow><TableCell>ลาเกินสิทธิ์</TableCell><TableCell className="text-right text-destructive">{snapshot.leaveSummary?.overLimitDays ?? 0}</TableCell></TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>


        {isEdit ? (
            <>
                <Card>
                    <CardHeader><CardTitle className="text-lg">รายรับเพิ่มเติม</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        {(snapshot.additions || []).map((item, index) => renderEditableRow('additions', item, index))}
                        <Button type="button" variant="outline" size="sm" onClick={() => handleAddRow('additions')}><PlusCircle /> เพิ่มรายการ</Button>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="text-lg">รายการหัก</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        {(snapshot.deductions || []).map((item, index) => renderEditableRow('deductions', item, index))}
                        <Button type="button" variant="outline" size="sm" onClick={() => handleAddRow('deductions')}><PlusCircle /> เพิ่มรายการ</Button>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader><CardTitle className="text-lg">หมายเหตุ (HR)</CardTitle></CardHeader>
                    <CardContent>
                        <Textarea placeholder="ระบุสูตรการคำนวณ หรือบันทึกเพื่อคุยกับพนักงาน..." value={snapshot.calcNotes || ''} onChange={(e) => handleFieldChange('calcNotes', e.target.value)} />
                    </CardContent>
                </Card>
            </>
        ) : (
            <>
                <Card>
                    <CardHeader><CardTitle className="text-lg">รายละเอียดรายรับ/หัก</CardTitle></CardHeader>
                    <CardContent>
                        <h4 className="font-semibold text-sm mb-2 text-green-600">รายรับเพิ่มเติม</h4>
                        {(snapshot.additions && snapshot.additions.length > 0) ? snapshot.additions.map((item, i)=><div key={i} className="flex justify-between text-sm py-1 border-b last:border-0 border-dashed"><p>{item.name}</p><p className="font-medium">{formatCurrency(item.amount)}</p></div>) : <p className="text-sm text-muted-foreground">- ไม่มี -</p>}
                        <Separator className="my-4"/>
                        <h4 className="font-semibold text-sm mb-2 text-destructive">รายการหัก</h4>
                         {(snapshot.deductions && snapshot.deductions.length > 0) ? snapshot.deductions.map((item, i)=><div key={i} className="flex justify-between text-sm py-1 border-b last:border-0 border-dashed"><p>{item.name}</p><p className="font-medium text-destructive">{`-${formatCurrency(item.amount)}`}</p></div>) : <p className="text-sm text-muted-foreground">- ไม่มี -</p>}
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader><CardTitle className="text-lg">หมายเหตุจาก HR</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap italic">{snapshot.calcNotes || '- ไม่มีหมายเหตุ -'}</p>
                    </CardContent>
                </Card>
            </>
        )}
    </div>
  );
}
