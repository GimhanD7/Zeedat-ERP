export const roles = {
  owner: 'Owner',
  manager: 'Branch Manager',
  cashier: 'Cashier',
  technician: 'Technician',
  stock: 'Inventory Staff',
};

export const sellers = ['owner', 'manager', 'cashier'];
export const managers = ['owner', 'manager'];
export const stockRoles = ['owner', 'manager', 'stock'];
export const tenders = ['Cash', 'Card', 'Bank Transfer', 'Koko'];
export const categories = ['Phones', 'Accessories', 'Repair Parts', 'Services'];

export const statuses = [
  'Received',
  'Diagnosing',
  'Awaiting Approval',
  'Waiting for Parts',
  'In Progress',
  'Testing',
  'Ready',
  'Delivered',
  'Cancelled',
];

export const transitions = {
  Received: ['Diagnosing', 'Cancelled'],
  Diagnosing: ['Awaiting Approval', 'Waiting for Parts', 'In Progress', 'Cancelled'],
  'Awaiting Approval': ['Waiting for Parts', 'In Progress', 'Cancelled'],
  'Waiting for Parts': ['In Progress', 'Cancelled'],
  'In Progress': ['Waiting for Parts', 'Testing', 'Cancelled'],
  Testing: ['In Progress', 'Ready'],
  Ready: ['Delivered', 'In Progress'],
};

export const firstPage = {
  owner: 'dashboard',
  manager: 'dashboard',
  cashier: 'pos',
  technician: 'repairs',
  stock: 'inventory',
};

export const allBranchPages = [
  'dashboard',
  'repairs',
  'inventory',
  'returns',
  'purchases',
  'transfers',
  'customers',
  'reports',
  'sales',
  'staff',
  'settings',
];

export const permissionDefinitions = [
  {
    id: 'dashboard',
    name: 'Dashboard & Analytics',
    description: 'Real-time sales KPI widgets, branch revenue charts, and system notices',
    category: 'Management & Reports',
  },
  {
    id: 'pos',
    name: 'POS & Billing Terminal',
    description: 'Process customer sales, barcode scanning, discounts, drafts, and print receipts',
    category: 'Operations & Sales',
  },
  {
    id: 'repairs',
    name: 'Repair Desk & Workshop',
    description: 'Device intake, diagnose hardware issues, assign technicians, update job statuses',
    category: 'Operations & Sales',
  },
  {
    id: 'customers',
    name: 'Customer Registry',
    description: 'Customer contact directory, purchase history, and credit balance accounts',
    category: 'Operations & Sales',
  },
  {
    id: 'sales',
    name: 'Sales History',
    description: 'Search completed orders, view invoices, and reprint transaction receipts',
    category: 'Operations & Sales',
  },
  {
    id: 'inventory',
    name: 'Inventory & Products',
    description: 'Manage catalog, multi-branch stock levels, generate barcodes, print labels & IMEI units',
    category: 'Inventory & Stock',
  },
  {
    id: 'purchases',
    name: 'Purchases & Receiving',
    description: 'Record supplier purchase orders and receive inventory shipments',
    category: 'Inventory & Stock',
  },
  {
    id: 'transfers',
    name: 'Stock Transfers',
    description: 'Request, dispatch, receive, and review inter-branch inventory transfers',
    category: 'Inventory & Stock',
  },
  {
    id: 'drawer',
    name: 'Cash Register & Movements',
    description: 'Open & close register, record cash movements, and cash audits',
    category: 'Finance & Cash',
  },
  {
    id: 'returns',
    name: 'Returns & Exchanges',
    description: 'Handle customer return requests, refunds, and replacement sales',
    category: 'Finance & Cash',
  },
  {
    id: 'reports',
    name: 'Reports & Analytics',
    description: 'Export sales reports, inventory turnover, and financial profit summaries',
    category: 'Management & Reports',
  },
  {
    id: 'staff',
    name: 'Staff & Role Permissions',
    description: 'Create staff accounts and configure role-based access permissions',
    category: 'Management & Reports',
  },
  {
    id: 'settings',
    name: 'Shop Settings & Audits',
    description: 'Store preferences, receipt paper width, tax rates, and security audit logs',
    category: 'Management & Reports',
  },
];

