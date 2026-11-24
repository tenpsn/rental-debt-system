import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  AuditLog, Cheque, ChequeDetail, Contract, ContractDetail, DeliveryCoverageRow,
  GroupRow, Hospital, Invoice, InvoiceDetail, Overview, Region, UninvoicedPeriod,
  UnpaidInvoice, User,
} from './models';

type Params = Record<string, string | number | boolean | null | undefined>;

function toParams(params?: Params): HttpParams {
  let httpParams = new HttpParams();
  if (!params) return httpParams;
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      httpParams = httpParams.set(key, String(value));
    }
  }
  return httpParams;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // ---------- master ----------
  regions() {
    return this.http.get<Region[]>('/api/master/regions');
  }
  hospitals(params?: Params) {
    return this.http.get<Hospital[]>('/api/master/hospitals', { params: toParams(params) });
  }
  users() {
    return this.http.get<User[]>('/api/master/users');
  }
  createHospital(body: unknown) {
    return this.http.post<{ id: string }>('/api/master/hospitals', body);
  }
  updateHospital(id: string, body: unknown) {
    return this.http.patch(`/api/master/hospitals/${id}`, body);
  }
  createUser(body: unknown) {
    return this.http.post<{ id: string }>('/api/master/users', body);
  }
  updateUser(id: string, body: unknown) {
    return this.http.patch(`/api/master/users/${id}`, body);
  }
  changePassword(body: { current_password: string; new_password: string }) {
    return this.http.post('/api/auth/change-password', body);
  }

  // ---------- contracts ----------
  contracts(params?: Params) {
    return this.http.get<Contract[]>('/api/contracts', { params: toParams(params) });
  }
  contract(id: string) {
    return this.http.get<ContractDetail>(`/api/contracts/${id}`);
  }
  createContract(body: unknown) {
    return this.http.post<{ id: string; periodCount: number }>('/api/contracts', body);
  }
  previewPeriods(params: Params) {
    return this.http.get<{ count: number; periods: { period_no: number; period_start: string; period_end: string; due_date: string }[] }>(
      '/api/contracts/preview-periods',
      { params: toParams(params) },
    );
  }
  renewContract(id: string, body: unknown) {
    return this.http.post<{ id: string; periodCount: number }>(`/api/contracts/${id}/renew`, body);
  }

  // ---------- invoices ----------
  invoices(params?: Params) {
    return this.http.get<Invoice[]>('/api/invoices', { params: toParams(params) });
  }
  invoice(id: string) {
    return this.http.get<InvoiceDetail>(`/api/invoices/${id}`);
  }
  createInvoice(body: unknown) {
    return this.http.post<{ id: string; invoiceNo: string; totalAmount: number }>('/api/invoices', body);
  }
  bulkInvoice(body: { periodIds: string[]; issueDate: string }) {
    return this.http.post<{ createdCount: number }>('/api/invoices/bulk', body);
  }
  cancelInvoice(id: string) {
    return this.http.post(`/api/invoices/${id}/cancel`, {});
  }
  addDelivery(invoiceId: string, body: unknown) {
    return this.http.post<{ id: string }>(`/api/invoices/${invoiceId}/deliveries`, body);
  }

  // ---------- cheques ----------
  cheques(params?: Params) {
    return this.http.get<Cheque[]>('/api/cheques', { params: toParams(params) });
  }
  cheque(id: string) {
    return this.http.get<ChequeDetail>(`/api/cheques/${id}`);
  }
  createCheque(body: unknown) {
    return this.http.post<{ id: string }>('/api/cheques', body);
  }
  updateCheque(id: string, body: unknown) {
    return this.http.patch(`/api/cheques/${id}`, body);
  }

  // ---------- attachments ----------
  uploadAttachment(entityType: string, entityId: string, file: File) {
    const form = new FormData();
    form.append('entityType', entityType);
    form.append('entityId', entityId);
    form.append('file', file);
    return this.http.post<{ id: string; fileName: string }>('/api/attachments', form);
  }
  attachmentUrl(id: string, inline = false) {
    return `/api/attachments/${id}/download?inline=${inline}`;
  }

  // ---------- reports ----------
  overview(params?: Params) {
    return this.http.get<Overview>('/api/reports/overview', { params: toParams(params) });
  }
  aging(params?: Params) {
    return this.http.get<Overview['aging']>('/api/reports/aging', { params: toParams(params) });
  }
  byRep(params?: Params) {
    return this.http.get<GroupRow[]>('/api/reports/by-rep', { params: toParams(params) });
  }
  byHospital(params?: Params) {
    return this.http.get<GroupRow[]>('/api/reports/by-hospital', { params: toParams(params) });
  }
  uninvoicedPeriods(params?: Params) {
    return this.http.get<UninvoicedPeriod[]>('/api/reports/uninvoiced-periods', { params: toParams(params) });
  }
  unpaidInvoices(params?: Params) {
    return this.http.get<UnpaidInvoice[]>('/api/reports/unpaid-invoices', { params: toParams(params) });
  }
  deliveryCoverage(params?: Params) {
    return this.http.get<DeliveryCoverageRow[]>('/api/reports/delivery-coverage', { params: toParams(params) });
  }
  auditLogs(params?: Params) {
    return this.http.get<AuditLog[]>('/api/reports/audit-logs', { params: toParams(params) });
  }
}
