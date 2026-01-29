import type { PayslipSnapshot } from '@/lib/types';

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
    totals: {
        basePay: number;
        addTotal: number;
        dedTotal: number;
        netPay: number;
    };
}

export function formatPayslipAsText(data: SlipData): string {
    const { userName, periodLabel, snapshot, totals } = data;
    
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

    if (snapshot.calcNotes) {
        text += `หมายเหตุ HR:\n${snapshot.calcNotes}\n`;
    }

    return text;
}

export function formatPayslipAsJson(snapshot: PayslipSnapshot): string {
    return JSON.stringify(snapshot, null, 2);
}
