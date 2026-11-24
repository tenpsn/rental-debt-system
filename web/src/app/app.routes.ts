import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent),
    title: 'เข้าสู่ระบบ',
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        data: { title: 'ภาพรวมการติดตามหนี้' },
        loadComponent: () => import('./pages/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'contracts',
        data: { title: 'สัญญาเช่า / ใบสั่งจ้าง' },
        loadComponent: () => import('./pages/contracts.component').then((m) => m.ContractsComponent),
      },
      {
        path: 'contracts/new',
        data: { title: 'สร้างสัญญาใหม่' },
        loadComponent: () => import('./pages/contract-form.component').then((m) => m.ContractFormComponent),
      },
      {
        path: 'contracts/:id',
        data: { title: 'รายละเอียดสัญญา' },
        loadComponent: () => import('./pages/contract-detail.component').then((m) => m.ContractDetailComponent),
      },
      {
        path: 'invoices',
        data: { title: 'ใบแจ้งหนี้' },
        loadComponent: () => import('./pages/invoices.component').then((m) => m.InvoicesComponent),
      },
      {
        path: 'invoices/:id',
        data: { title: 'รายละเอียดใบแจ้งหนี้' },
        loadComponent: () => import('./pages/invoice-detail.component').then((m) => m.InvoiceDetailComponent),
      },
      {
        path: 'cheques',
        data: { title: 'เช็ค / การรับชำระ' },
        loadComponent: () => import('./pages/cheques.component').then((m) => m.ChequesComponent),
      },
      {
        path: 'cheques/:id',
        data: { title: 'รายละเอียดเช็ค' },
        loadComponent: () => import('./pages/cheque-detail.component').then((m) => m.ChequeDetailComponent),
      },
      {
        path: 'hospitals',
        data: { title: 'โรงพยาบาล' },
        loadComponent: () => import('./pages/hospitals.component').then((m) => m.HospitalsComponent),
      },
      {
        path: 'reports',
        data: { title: 'รายงาน' },
        loadComponent: () => import('./pages/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'users',
        data: { title: 'ผู้ใช้งาน' },
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'audit',
        data: { title: 'บันทึกการใช้งาน' },
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/audit.component').then((m) => m.AuditComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
