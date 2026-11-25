export type Role = 'ADMIN' | 'MANAGER' | 'ACCOUNTING' | 'REP';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  regionId: number | null;
  regionName: string | null;
  phone?: string | null;
  isActive?: boolean;
  lastLoginAt?: string | null;
  hospitalCount?: number;
}

export interface Region {
  id: number;
  code: string;
  name: string;
  hospitalCount: number;
}

export interface Hospital {
  id: string;
  code: string;
  name: string;
  hospitalType: string | null;
  province: string | null;
  regionId: number | null;
  regionName: string | null;
  repId: string | null;
  repName: string | null;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  isActive: boolean;
  activeContracts: number;
}

export interface Contract {
  id: string;
  contractNo: string;
  hospitalId: string;
  hospitalName: string;
  hospitalCode: string;
  repId: string | null;
  repName: string | null;
  regionName: string | null;
  contractType: 'LEASE' | 'PURCHASE_ORDER' | 'SHORT_TERM';
  title: string | null;
  startDate: string;
  endDate: string;
  billingCycle: 'MONTHLY' | 'EVERY_10_DAYS' | 'EVERY_15_DAYS';
  pricingMode: 'FIXED' | 'PAY_PER_USE';
  periodAmount: number | null;
  unitPrice: number | null;
  unitName: string | null;
  paymentTermDays: number;
  vatRate: number;
  status: string;
  note: string | null;
  totalPeriods: number;
  invoicedPeriods: number;
  invoicedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  remainingValue: number;
  nextDueDate: string | null;
}

export interface Period {
  id: string;
  periodNo: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  expectedAmount: number | null;
  invoiceId: string | null;
  invoiceNo: string | null;
  totalAmount: number | null;
  outstandingAmount: number | null;
  paymentState: string | null;
  lastDeliveredOn: string | null;
  daysOverdue: number;
  isOverdueUninvoiced: boolean;
}

export interface ContractDetail extends Contract {
  periods: Period[];
  equipment: { id: string; name: string; model: string | null; serialNo: string | null; qty: number; note: string | null }[];
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  hospitalId: string;
  hospitalName: string;
  hospitalCode: string;
  contractId: string;
  contractNo: string;
  periodId: string | null;
  periodNo: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  issueDate: string;
  dueDate: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  usageQty: number | null;
  pricingMode: string;
  status: string;
  paymentState: 'NOT_SENT' | 'SENT' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  outstandingAmount: number;
  chequeReceivedAmount: number;
  daysOverdue: number;
  lastDeliveredOn: string | null;
  deliveryCount: number;
  attachmentCount: number;
  repId: string | null;
  repName: string | null;
  note: string | null;
}

export interface Delivery {
  id: string;
  deliveredOn: string;
  method: string;
  status: string;
  recipientType: string;
  recipientName: string | null;
  courierName: string | null;
  trackingNo: string | null;
  note: string | null;
  recordedByName: string | null;
  createdAt: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName?: string | null;
  createdAt: string;
}

export interface InvoiceDetail extends Invoice {
  deliveries: Delivery[];
  cheques: { id: string; chequeNo: string; bankName: string; amount: number; allocatedAmount: number; receivedDate: string; status: string; receivedByName: string | null }[];
  attachments: Attachment[];
}

export interface Cheque {
  id: string;
  chequeNo: string;
  bankName: string;
  bankBranch: string | null;
  amount: number;
  chequeDate: string;
  receivedDate: string;
  receivedById: string | null;
  receivedByName: string | null;
  hospitalId: string;
  hospitalName: string;
  repName: string | null;
  deliveryMethod: string;
  companyReceivedDate: string | null;
  status: string;
  note: string | null;
  allocatedAmount: number;
  invoiceCount: number;
  attachmentCount: number;
  atCompany: boolean;
}

export interface ChequeDetail extends Cheque {
  allocations: { id: string; invoiceId: string; invoiceNo: string; invoiceTotal: number; issueDate: string; dueDate: string; paymentState: string; amount: number }[];
  attachments: Attachment[];
}

export interface AgingRow {
  bucket: string;
  label: string;
  count: number;
  amount: number;
}

export interface GroupRow {
  id: string;
  name: string;
  subLabel: string;
  hospitalCount: number;
  invoiceCount: number;
  invoiceAmount: number;
  chequeAmount: number;
  awaitingAmount: number;
  invoiceOverdueCount: number;
  invoiceOverdueAmount: number;
  totalPeriods: number;
  invoicedPeriods: number;
  dueNotInvoicedPeriods: number;
  dueNotInvoicedAmount: number;
  remainingValue: number;
  collectionRate: number;
}

export interface Overview {
  asOf: string;
  kpi: {
    totalPeriods: number;
    invoicedPeriods: number;
    notInvoicedPeriods: number;
    dueNotInvoicedPeriods: number;
    dueNotInvoicedAmount: number;
    remainingValue: number;
    invoiceCount: number;
    invoiceAmount: number;
    deliveredCount: number;
    deliveredAmount: number;
    undeliveredCount: number;
    undeliveredAmount: number;
    chequeCount: number;
    chequeAmount: number;
    clearedAmount: number;
    awaitingCount: number;
    awaitingAmount: number;
    overdueCount: number;
    overdueAmount: number;
    invoicesWithoutFile: number;
    collectionRate: number;
    deliveryRate: number;
    activeCount: number;
    expiredCount: number;
    expiringSoonCount: number;
  };
  aging: AgingRow[];
  byRep: GroupRow[];
  byHospital: GroupRow[];
}

export interface UninvoicedPeriod {
  id: string;
  contractId: string;
  contractNo: string;
  contractType: string;
  periodNo: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  estimatedAmount: number;
  pricingMode: string;
  daysOverdue: number;
  hospitalId: string;
  hospitalName: string;
  hospitalCode: string;
  repId: string | null;
  repName: string;
  regionName: string | null;
}

export interface UnpaidInvoice {
  id: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  outstandingAmount: number;
  daysOverdue: number;
  paymentState: string;
  lastDeliveredOn: string | null;
  hospitalId: string;
  hospitalName: string;
  repName: string;
  contractNo: string;
}

export interface AuditLog {
  id: number;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface DeliveryCoverageRow {
  contractId: string;
  contractNo: string;
  hospitalName: string;
  repName: string;
  invoiceCount: number;
  deliveredCount: number;
  undeliveredCount: number;
}
