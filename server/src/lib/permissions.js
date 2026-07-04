export const ROLE_PERMISSIONS = {
  OWNER: ['*'],
  ADMIN: [
    'dashboard:read', 'customer:*', 'supplier:*', 'product:*', 'purchase:*', 'invoice:*',
    'payment:*', 'return:*', 'ledger:read', 'statement:*', 'cheque:*', 'warranty:*', 'manufacturing:*', 'batch:*', 'service:*', 'crm:*', 'quotation:*', 'hr:*', 'project:*', 'installment:*', 'bankrecon:*', 'asset:*', 'currency:*', 'loyalty:*', 'delivery:*', 'budget:*', 'campaign:*', 'dashboardbuilder:*', 'cashbank:*', 'accounting:*', 'approval:*', 'notification:*', 'audit:*', 'settings:*', 'document:*', 'branch:*', 'report:read', 'user:read', 'subscription:read'
  ],
  ACCOUNTANT: [
    'dashboard:read', 'customer:read', 'supplier:read', 'product:read',
    'invoice:*', 'purchase:*', 'payment:*', 'return:*', 'ledger:read', 'statement:*', 'cheque:*', 'warranty:*', 'manufacturing:*', 'batch:*', 'service:*', 'crm:*', 'quotation:*', 'hr:*', 'project:*', 'installment:*', 'bankrecon:*', 'asset:*', 'currency:*', 'loyalty:*', 'delivery:*', 'budget:*', 'campaign:*', 'dashboardbuilder:*', 'cashbank:*', 'accounting:*', 'approval:*', 'notification:*', 'audit:read', 'settings:read', 'document:*', 'branch:read', 'report:read'
  ],
  CASHIER: [
    'dashboard:read', 'customer:read', 'customer:create', 'product:read',
    'invoice:create', 'invoice:read', 'return:create', 'return:read',
    'payment:create', 'payment:read', 'ledger:read', 'statement:read', 'statement:export', 'cheque:read', 'cheque:create', 'warranty:read', 'warranty:create', 'manufacturing:read', 'batch:read', 'service:read', 'service:create', 'crm:read', 'crm:create', 'crm:update', 'crm:convert', 'quotation:read', 'quotation:create', 'quotation:update', 'quotation:convert', 'project:read', 'project:create', 'project:update', 'project:comment', 'installment:read', 'installment:create', 'installment:pay', 'bankrecon:read', 'asset:read', 'currency:read', 'loyalty:read', 'loyalty:create', 'loyalty:earn', 'loyalty:redeem', 'delivery:read', 'delivery:create', 'delivery:update', 'budget:read', 'campaign:read', 'campaign:create', 'campaign:update', 'campaign:send', 'dashboardbuilder:read', 'cashbank:read', 'approval:create', 'approval:read', 'notification:read', 'document:create', 'document:read', 'branch:read', 'pos:use'
  ],
  INVENTORY_MANAGER: ['dashboard:read', 'product:*', 'supplier:read', 'purchase:*', 'return:*', 'payment:read', 'ledger:read', 'statement:read', 'statement:export', 'cheque:read', 'cheque:create', 'warranty:*', 'cashbank:read', 'accounting:read', 'document:create', 'document:read', 'branch:*', 'approval:create', 'approval:read', 'approval:decide', 'notification:read', 'notification:create', 'audit:read', 'report:stock', 'manufacturing:*', 'batch:*', 'service:*', 'crm:*', 'quotation:*', 'hr:*', 'project:*', 'installment:*', 'bankrecon:*', 'asset:*', 'currency:*', 'loyalty:*', 'delivery:*', 'budget:*', 'campaign:*', 'dashboardbuilder:*'],
  SALES_STAFF: ['dashboard:read', 'customer:*', 'product:read', 'invoice:create', 'invoice:read', 'return:create', 'return:read', 'payment:create', 'ledger:read', 'statement:read', 'statement:export', 'cheque:read', 'cheque:create', 'warranty:read', 'warranty:create', 'manufacturing:read', 'batch:read', 'service:read', 'service:create', 'crm:read', 'crm:create', 'crm:update', 'crm:convert', 'quotation:read', 'quotation:create', 'quotation:update', 'quotation:convert', 'project:read', 'project:create', 'project:update', 'project:comment', 'installment:read', 'installment:create', 'installment:pay', 'bankrecon:read', 'asset:read', 'currency:read', 'loyalty:read', 'loyalty:create', 'loyalty:earn', 'loyalty:redeem', 'delivery:read', 'delivery:create', 'delivery:update', 'budget:read', 'campaign:read', 'campaign:create', 'campaign:update', 'campaign:send', 'dashboardbuilder:read', 'cashbank:read', 'approval:create', 'approval:read', 'notification:read', 'document:create', 'document:read'],
  VIEWER: ['dashboard:read', 'branch:read', 'ledger:read', 'statement:read', 'statement:export', 'cheque:read', 'warranty:read', 'manufacturing:read', 'batch:read', 'service:read', 'crm:read', 'quotation:read', 'hr:read', 'project:read', 'installment:read', 'bankrecon:read', 'asset:read', 'currency:read', 'loyalty:read', 'delivery:read', 'budget:read', 'campaign:read', 'dashboardbuilder:read', 'cashbank:read', 'accounting:read', 'settings:read', 'approval:read', 'document:read', 'notification:read', 'audit:read', 'report:read'],
  AUDITOR: ['dashboard:read', 'branch:read', 'ledger:read', 'statement:read', 'statement:export', 'cheque:read', 'warranty:read', 'manufacturing:read', 'batch:read', 'service:read', 'crm:read', 'quotation:read', 'hr:read', 'project:read', 'installment:read', 'bankrecon:read', 'asset:read', 'currency:read', 'loyalty:read', 'delivery:read', 'budget:read', 'campaign:read', 'dashboardbuilder:read', 'cashbank:read', 'accounting:read', 'settings:read', 'approval:read', 'document:read', 'notification:read', 'report:read', 'audit:read']
};

export function can(role, permission) {
  const allowed = ROLE_PERMISSIONS[role] || [];
  if (allowed.includes('*')) return true;
  if (allowed.includes(permission)) return true;
  const [module] = permission.split(':');
  return allowed.includes(`${module}:*`);
}
