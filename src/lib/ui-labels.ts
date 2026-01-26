
const DEPARTMENT_LABELS: Record<string, string> = {
    MANAGEMENT: "ผู้บริหาร",
    OFFICE: "ออฟฟิศ",
    CAR_SERVICE: "รถหน้าร้าน",
    COMMONRAIL: "คอมมอนเรล",
    MECHANIC: "ปั๊มหัวฉีดแมคคานิค",
    OUTSOURCE: "งานนอก",
};

const JOB_STATUS_LABELS: Record<string, string> = {
    RECEIVED: "รับงาน",
    IN_PROGRESS: "กำลังทำ",
    WAITING_QUOTATION: "รอเสนอราคา",
    WAITING_APPROVE: "รอลูกค้าอนุมัติ",
    PENDING_PARTS: "รออะไหล่",
    IN_REPAIR_PROCESS: "กำลังดำเนินการซ่อม",
    DONE: "ทำเสร็จ",
    WAITING_CUSTOMER_PICKUP: "รอลูกค้ารับสินค้า",
    CLOSED: "ปิดงาน",
};

const DOC_TYPE_LABELS: Record<string, string> = {
    QUOTATION: "ใบเสนอราคา",
    DELIVERY_NOTE: "ใบส่งของชั่วคราว",
    TAX_INVOICE: "ใบกำกับภาษี",
    RECEIPT: "ใบเสร็จรับเงิน",
    BILLING_NOTE: "ใบวางบิล",
    CREDIT_NOTE: "ใบลดหนี้",
    WITHHOLDING_TAX: "หนังสือหัก ณ ที่จ่าย",
};

const DOC_STATUS_LABELS: Record<string, string> = {
    DRAFT: 'ฉบับร่าง',
    PAID: 'จ่ายแล้ว',
    CANCELLED: 'ยกเลิก',
    WAITING_CUSTOMER_PICKUP: 'รอลูกค้ารับ',
    SUBMITTED: 'ส่งแล้ว',
    APPROVED: 'อนุมัติแล้ว',
    UNPAID: 'ยังไม่จ่าย',
    PENDING_REVIEW: "รอตรวจสอบรายรับ",
    REJECTED: "ตีกลับ",
};

export function deptLabel(dept: string | undefined): string {
    if (!dept) return '';
    return DEPARTMENT_LABELS[dept] || dept;
}

export function jobStatusLabel(status: string | undefined): string {
    if (!status) return '';
    return JOB_STATUS_LABELS[status] || status;
}

export function docTypeLabel(docType: string | undefined): string {
    if (!docType) return '';
    return DOC_TYPE_LABELS[docType] || docType;
}

export function docStatusLabel(status: string | undefined): string {
    if (!status) return '';
    return DOC_STATUS_LABELS[status] || status;
}
