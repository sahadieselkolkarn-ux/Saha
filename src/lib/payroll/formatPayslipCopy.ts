

import type { PayslipSnapshot, PayType } from '@/lib/types';

const formatCurrency = (value: number | undefined) => {
    return (value ?? 0).toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
};

interface SlipData {
    userName: string;
    periodLabel: string;
    snapshot: PayslipSnapshot;
    payType?: PayType;
    totals: {
        basePay: number;
        addTotal: number;
        dedTotal: number;
        netPay: number;
    };
}

export function formatPayslipAsText(data: SlipData): string {
    const { userName, periodLabel, snapshot, payType, totals } = data;
    
    let text = `ใบเงินเดือน\n`;
    text += `--------------------------------\n`;
    text += `ชื่อ: ${userName}\n`;
    text += `งวด: ${periodLabel}\n`;
    text += `--------------------------------\n\n`;

    text += `ฐานเงินเดือน: ${formatCurrency(totals.basePay)}\n\n`;

    text += `(+) รายรับเพิ่มเติม\n`;
    if (snapshot.additions && snapshot.additions.length > 0) {
        snapshot.additions.forEach(item => {
            text += `- ${item.name}: ${formatCurrency(item.amount)}\n`;
        });
    } else {
        text += `- ไม่มี -\n`;
    }
    text += `รวมรายรับเพิ่มเติม: ${formatCurrency(totals.addTotal)}\n\n`;

    text += `(-) รายการหัก\n`;
    if (snapshot.deductions && snapshot.deductions.length > 0) {
        snapshot.deductions.forEach(item => {
            text += `- ${item.name}: ${formatCurrency(item.amount)}\n`;
        });
    } else {
        text += `- ไม่มี -\n`;
    }
    text += `รวมรายการหัก: ${formatCurrency(totals.dedTotal)}\n\n`;

    text += `--------------------------------\n`;
    text += `ยอดสุทธิ: ${formatCurrency(totals.netPay)}\n`;
    text += `--------------------------------\n\n`;

    if (snapshot.attendanceSummary && payType !== 'MONTHLY_NOSCAN') {
        text += `สรุปการทำงาน:\n`;
        text += ` - วันทำงาน: ${snapshot.attendanceSummary.presentDays ?? 0}\n`;
        text += ` - มาสาย: ${snapshot.attendanceSummary.lateDays ?? 0} วัน (${snapshot.attendanceSummary.lateMinutes ?? 0} นาที)\n`;
        text += ` - ขาด: ${snapshot.attendanceSummary.absentUnits ?? 0} หน่วย\n`;
        text += ` - ลา: ${snapshot.attendanceSummary.leaveDays ?? 0} วัน\n\n`;
    }

    if (snapshot.leaveSummary) {
        text += `สรุปการลา:\n`;
        text += ` - ลาป่วย: ${snapshot.leaveSummary.sickDays ?? 0} วัน\n`;
        text += ` - ลากิจ: ${snapshot.leaveSummary.businessDays ?? 0} วัน\n`;
        text += ` - ลาพักร้อน: ${snapshot.leaveSummary.vacationDays ?? 0} วัน\n`;
        if (snapshot.leaveSummary.overLimitDays && snapshot.leaveSummary.overLimitDays > 0) {
            text += ` - ลาเกินสิทธิ์: ${snapshot.leaveSummary.overLimitDays} วัน\n`;
        }
    }

    if (snapshot.calcNotes) {
        text += `\nหมายเหตุ HR:\n${snapshot.calcNotes}\n`;
    }
     if (snapshot.attendanceSummary?.warnings && snapshot.attendanceSummary.warnings.length > 0) {
        text += `\n**คำเตือน**:\n${snapshot.attendanceSummary.warnings.join('\n')}\n`;
    }

    return text;
}

export function formatPayslipAsJson(snapshot: PayslipSnapshot): string {
    return JSON.stringify(snapshot, null, 2);
}
