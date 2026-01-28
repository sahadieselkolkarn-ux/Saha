# Canonical Routing Policy (SahaDiesel Service)

## Objective
Stop route duplication and “fixing the wrong page” by enforcing **one canonical App Router root**.

## Canonical Rule
✅ Canonical routes must live under `app/` only.

❌ Do not create or keep routes under:
- `src/app/**`
- `app/app/**`

## Allowed URL Prefix
All in-app pages must use the `/app/...` URL prefix.

## Canonical Menu URLs (must exist and be unique)

### HR (แผนกบุคคล)
- `/app/management/hr/payroll` — การจ่ายเงินเดือน (HR สร้าง/ส่งสลิปต่อคน)
- `/app/management/hr/leaves` — จัดการวันลาพนักงาน
- `/app/management/hr/attendance-summary` — จัดการการลงเวลา
- `/app/management/hr/employees` — จัดการพนักงาน

### Employee (พนักงาน)
- `/app/settings/my-payslips` — เงินเดือนของฉัน
- `/app/settings/my-leaves` — วันลาของฉัน

### Accounting (บัญชี)
- `/app/management/accounting/payroll-payouts` — จ่ายเงินเดือน (จ่ายเฉพาะ READY_TO_PAY)
- `/app/management/accounting/accounts` — บัญชีเงินสด/ธนาคาร

## Redirect Policy
- Redirect is allowed only from legacy paths -> canonical paths.
- ❌ Never redirect a page to itself (redirect loop).

## Definition of “Duplicate”
A route is duplicated if the same URL can be served by more than one `page.tsx` located under different roots.

## Enforcements (to be added)
- Prebuild/CI must fail if it detects:
  - any `src/app/**` directory
  - any `app/app/**` directory

---
Last updated: 2026-01-28
