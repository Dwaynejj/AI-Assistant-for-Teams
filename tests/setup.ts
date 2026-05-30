/**
 * @file tests/setup.ts
 * @description Global Jest test setup — configures environment variables and mocks.
 */

// Load test environment variables
process.env['NODE_ENV'] = 'test';
process.env['MICROSOFT_APP_ID'] = 'test-app-id';
process.env['MICROSOFT_APP_PASSWORD'] = 'test-app-password';
process.env['CRM_API_URL'] = 'https://mock-crm.example.com/api';
process.env['CRM_API_KEY'] = 'test-crm-key';
process.env['ERP_API_URL'] = 'https://mock-erp.example.com/api';
process.env['ERP_API_KEY'] = 'test-erp-key';
process.env['INVENTORY_DB_CONNECTION_STRING'] = 'mock://inventory.example.com';
process.env['LOW_STOCK_THRESHOLD'] = '50';
process.env['CRITICAL_STOCK_THRESHOLD'] = '10';
process.env['PO_OVERDUE_DAYS'] = '3';
process.env['ALERT_TEAMS_CHANNEL_ID'] = 'test-channel-id';
process.env['ALERT_TEAMS_TEAM_ID'] = 'test-team-id';
process.env['APPLICATIONINSIGHTS_CONNECTION_STRING'] = 'InstrumentationKey=test-insights-key';
process.env['AAD_TENANT_ID'] = 'test-tenant-id';
process.env['AAD_ROLE_GROUP_SALES'] = 'test-sales-group';
process.env['AAD_ROLE_GROUP_INVENTORY'] = 'test-inventory-group';
process.env['AAD_ROLE_GROUP_PROCUREMENT'] = 'test-procurement-group';
process.env['AAD_ROLE_GROUP_MANAGER'] = 'test-manager-group';
process.env['AAD_ROLE_GROUP_ADMIN'] = 'test-admin-group';
process.env['APP_VERSION'] = '1.0.0-test';
process.env['PORT'] = '3979';
