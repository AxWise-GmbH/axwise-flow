/**
 * Partners ready-business — default entity-type configs.
 *
 * Shared source of truth used by BOTH the API seeder
 * (lib/api-handlers/partner-entities.js) and the frontend first render
 * (src/pages/PartnersHub/*), so a freshly-activated user sees identical
 * defaults whether or not the network round-trip has completed.
 *
 * A record is polymorphic: entity_type_key = partner | supplier | warehouse |
 * crm (or a user-defined key). Each type owns its own fields / filters /
 * metrics, so the list table, add/edit form, filter bar and metric strip are
 * all rendered from config — adding a field (or a whole type) is a data change,
 * never new components.
 *
 * Field def shape:
 *   { key, label, type, options?, required?, showInTable?, filterable?, agg?, group? }
 * Supported field `type`:
 *   text | number | currency | percent | select | multiselect | country |
 *   date | boolean | email | phone | url | tags
 * Metric def shape:
 *   { key, label, helper?, agg: 'count'|'sum'|'avg', field?, format?: 'currency'|'percent'|'number' }
 * Filter def shape:
 *   { key, label, field, kind: 'select'|'multiselect'|'country' }
 */
import {
  TRAFFIC_SOURCES,
  GROUP_TYPES,
  AGREEMENT_TYPES,
  FUNNEL_STATUSES,
} from '../utils/constants.js';

const PAYMENT_TERMS = ['Prepaid', 'Net 15', 'Net 30', 'Net 60'];
const SUPPLIER_STATUS = ['Active', 'On hold', 'Blacklisted'];
const WAREHOUSE_STATUS = ['Operational', 'Maintenance', 'Closed'];
const CRM_SEGMENTS = ['Whale', 'Active Player', 'New User', 'Churn Risk'];
const RISK_LEVELS = ['Low', 'Medium', 'High'];
const FTD_STATUS = ['None', 'Deposited'];

export const DEFAULT_ENTITY_TYPES = [
  {
    type_key: 'partner',
    label: 'Partners',
    icon: 'HandshakeOutlined',
    color: '#0EA5E9',
    description: 'Traffic and revenue partners - webmasters, affiliates and direct relationships.',
    sort_order: 0,
    is_system: true,
    fields: [
      { key: 'category', label: 'Category', type: 'select', options: GROUP_TYPES, showInTable: true, filterable: true },
      { key: 'agreement', label: 'Agreement', type: 'select', options: AGREEMENT_TYPES, showInTable: true, filterable: true },
      { key: 'trafficSource', label: 'Traffic Source', type: 'multiselect', options: TRAFFIC_SOURCES, filterable: true },
      { key: 'geo', label: 'GEO', type: 'country', showInTable: true, filterable: true },
      { key: 'funnelStatus', label: 'Funnel Status', type: 'select', options: FUNNEL_STATUSES, showInTable: true, filterable: true },
      { key: 'revshare', label: 'RevShare %', type: 'percent', showInTable: true, agg: 'avg', group: 'Finance' },
      { key: 'cpa', label: 'CPA', type: 'currency', agg: 'avg', group: 'Finance' },
      { key: 'ftd', label: 'FTD', type: 'number', showInTable: true, agg: 'sum', group: 'Performance' },
      { key: 'revenue', label: 'Revenue', type: 'currency', showInTable: true, agg: 'sum', group: 'Finance' },
      { key: 'email', label: 'Email', type: 'email' },
    ],
    filters: [
      { key: 'category', label: 'Category', field: 'category', kind: 'select' },
      { key: 'agreement', label: 'Agreement', field: 'agreement', kind: 'select' },
      { key: 'trafficSource', label: 'Traffic Source', field: 'trafficSource', kind: 'multiselect' },
      { key: 'funnelStatus', label: 'Funnel Status', field: 'funnelStatus', kind: 'select' },
      { key: 'geo', label: 'GEO', field: 'geo', kind: 'country' },
    ],
    metrics: [
      { key: 'count', label: 'Total Partners', helper: 'All relationships', agg: 'count' },
      { key: 'revenue', label: 'Revenue', helper: 'Total generated', agg: 'sum', field: 'revenue', format: 'currency' },
      { key: 'ftd', label: 'Total FTD', helper: 'First-time deposits', agg: 'sum', field: 'ftd', format: 'number' },
      { key: 'revshare', label: 'Avg RevShare', helper: 'Average share', agg: 'avg', field: 'revshare', format: 'percent' },
    ],
  },
  {
    type_key: 'supplier',
    label: 'Suppliers',
    icon: 'LocalShippingOutlined',
    color: '#F59E0B',
    description: 'Goods and service suppliers with lead times, terms and reliability ratings.',
    sort_order: 1,
    is_system: true,
    fields: [
      { key: 'category', label: 'Category', type: 'text', showInTable: true, filterable: true },
      { key: 'country', label: 'Country', type: 'country', showInTable: true, filterable: true },
      { key: 'leadTimeDays', label: 'Lead Time (days)', type: 'number', showInTable: true, agg: 'avg', group: 'Logistics' },
      { key: 'minOrderQty', label: 'Min Order Qty', type: 'number', group: 'Logistics' },
      { key: 'paymentTerms', label: 'Payment Terms', type: 'select', options: PAYMENT_TERMS, showInTable: true, filterable: true, group: 'Finance' },
      { key: 'rating', label: 'Rating', type: 'number', showInTable: true, agg: 'avg', group: 'Quality' },
      { key: 'status', label: 'Status', type: 'select', options: SUPPLIER_STATUS, showInTable: true, filterable: true },
      { key: 'contactEmail', label: 'Contact Email', type: 'email' },
    ],
    filters: [
      { key: 'paymentTerms', label: 'Payment Terms', field: 'paymentTerms', kind: 'select' },
      { key: 'status', label: 'Status', field: 'status', kind: 'select' },
      { key: 'country', label: 'Country', field: 'country', kind: 'country' },
    ],
    metrics: [
      { key: 'count', label: 'Total Suppliers', helper: 'All suppliers', agg: 'count' },
      { key: 'leadTime', label: 'Avg Lead Time', helper: 'Days to deliver', agg: 'avg', field: 'leadTimeDays', format: 'number' },
      { key: 'rating', label: 'Avg Rating', helper: 'Reliability score', agg: 'avg', field: 'rating', format: 'number' },
    ],
  },
  {
    type_key: 'warehouse',
    label: 'Warehouses',
    icon: 'WarehouseOutlined',
    color: '#22C55E',
    description: 'Storage and fulfilment locations with capacity, occupancy and SKU coverage.',
    sort_order: 2,
    is_system: true,
    fields: [
      { key: 'location', label: 'Location', type: 'text', showInTable: true },
      { key: 'country', label: 'Country', type: 'country', showInTable: true, filterable: true },
      { key: 'capacityUnits', label: 'Capacity (units)', type: 'number', showInTable: true, agg: 'sum', group: 'Capacity' },
      { key: 'occupiedUnits', label: 'Occupied (units)', type: 'number', agg: 'sum', group: 'Capacity' },
      { key: 'occupancyPct', label: 'Occupancy %', type: 'percent', showInTable: true, agg: 'avg', group: 'Capacity' },
      { key: 'skuCount', label: 'SKUs', type: 'number', showInTable: true, agg: 'sum', group: 'Inventory' },
      { key: 'manager', label: 'Manager', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: WAREHOUSE_STATUS, showInTable: true, filterable: true },
    ],
    filters: [
      { key: 'status', label: 'Status', field: 'status', kind: 'select' },
      { key: 'country', label: 'Country', field: 'country', kind: 'country' },
    ],
    metrics: [
      { key: 'count', label: 'Total Warehouses', helper: 'All locations', agg: 'count' },
      { key: 'capacity', label: 'Total Capacity', helper: 'Units available', agg: 'sum', field: 'capacityUnits', format: 'number' },
      { key: 'occupancy', label: 'Avg Occupancy', helper: 'Space used', agg: 'avg', field: 'occupancyPct', format: 'percent' },
      { key: 'skus', label: 'Total SKUs', helper: 'Distinct products', agg: 'sum', field: 'skuCount', format: 'number' },
    ],
  },
  {
    type_key: 'crm',
    label: 'CRM',
    icon: 'ContactsOutlined',
    color: '#7C3AED',
    description: 'Customer relationships - leads and players with LTV, segment and risk scoring.',
    sort_order: 3,
    is_system: true,
    fields: [
      { key: 'segment', label: 'Segment', type: 'select', options: CRM_SEGMENTS, showInTable: true, filterable: true },
      { key: 'value', label: 'LTV', type: 'currency', showInTable: true, agg: 'sum', group: 'Value' },
      { key: 'score', label: 'Score', type: 'number', showInTable: true, agg: 'avg', group: 'Engagement' },
      { key: 'country', label: 'Country', type: 'country', showInTable: true, filterable: true },
      { key: 'risk', label: 'Risk', type: 'select', options: RISK_LEVELS, showInTable: true, filterable: true },
      { key: 'source', label: 'Source', type: 'text', filterable: false },
      { key: 'ftdStatus', label: 'FTD Status', type: 'select', options: FTD_STATUS, showInTable: true, filterable: true },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'phone' },
    ],
    filters: [
      { key: 'segment', label: 'Segment', field: 'segment', kind: 'select' },
      { key: 'risk', label: 'Risk', field: 'risk', kind: 'select' },
      { key: 'ftdStatus', label: 'FTD Status', field: 'ftdStatus', kind: 'select' },
      { key: 'country', label: 'Country', field: 'country', kind: 'country' },
    ],
    metrics: [
      { key: 'count', label: 'Total Contacts', helper: 'All contacts', agg: 'count' },
      { key: 'ltv', label: 'Total LTV', helper: 'Lifetime value', agg: 'sum', field: 'value', format: 'currency' },
      { key: 'score', label: 'Avg Score', helper: 'Engagement level', agg: 'avg', field: 'score', format: 'number' },
    ],
  },
];

export const DEFAULT_ENTITY_TYPE_KEYS = DEFAULT_ENTITY_TYPES.map((t) => t.type_key);
