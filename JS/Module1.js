/* ============================================================
   module1.js — All JS for Module 1 (Asset & Inventory)
   Single file: API client, utilities, asset logic, stock logic
   ============================================================ */
'use strict';

// ── CONFIG ────────────────────────────────────────────────────
const API = (() => {
  // Prefer an absolute localhost path so requests still work
  // even when this page is opened from a different dev server.
  if (window.location.protocol.startsWith('http')) {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const appIdx = parts.findIndex(p => p.toLowerCase() === 'siaa_module1');
    if (appIdx >= 0) {
      const root = parts.slice(0, appIdx + 1).join('/');
      return `${window.location.origin}/${root}/PHP/module1.php`;
    }
  }
  return 'http://localhost/SIAA_Module1/PHP/module1.php';
})();

// ── STATE ─────────────────────────────────────────────────────
const S = {
  assetPage:  1,
  stockPage:  1,
  assetId:    null,  // currently selected asset
  stockItems: [],    // cached for issue/grn selects
};

// ════════════════════════════════════════════════════════════
//  CORE API CLIENT
// ════════════════════════════════════════════════════════════
async function api(route, params = {}, body = null) {
  const qs  = new URLSearchParams({ r: route, ...params }).toString();
  const url = `${API}?${qs}`;
  try {
    const opts = body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'GET' };
    const res  = await fetch(url, opts);
    const raw  = await res.text();

    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch (_) {
      // Non-JSON responses are typically wrong host/path or PHP fatal output.
    }

    if (!res.ok) {
      return {
        success: false,
        message: json?.message || `HTTP ${res.status} ${res.statusText}`,
      };
    }

    if (!json || typeof json.success === 'undefined') {
      return {
        success: false,
        message: 'API did not return JSON. Open app via Apache localhost and check PHP errors.',
      };
    }

    return json;
  } catch (e) {
    toast('error', 'Network Error', 'Could not reach server.');
    return { success: false, message: 'Network error' };
  }
}

async function upload(route, formData) {
  try {
    const res = await fetch(`${API}?r=${route}`, { method: 'POST', body: formData });
    return await res.json();
  } catch (e) { return { success: false, message: 'Upload failed.' }; }
}

// ════════════════════════════════════════════════════════════
//  LOOKUP CACHE
// ════════════════════════════════════════════════════════════
const LookupCache = {};
function invalidateLookup(res) {
  Object.keys(LookupCache).forEach(k => {
    if (k.startsWith(res)) delete LookupCache[k];
  });
}

function setDatalist(id, options) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = options.map(v => `<option value="${esc(v)}"></option>`).join('');
}

async function getLookup(res, extra = {}) {
  const key = res + JSON.stringify(extra);
  if (LookupCache[key]) return LookupCache[key];
  const r = await api('lookup_list', { res, ...extra });
  if (r.success) LookupCache[key] = r.data;
  return r.data || [];
}

async function fillSelect(selId, res, { blank = 'Select…', extra = {}, label = null } = {}) {
  const el = document.getElementById(selId);
  if (!el) return;
  const cur   = el.value;
  const items = await getLookup(res, extra);
  el.innerHTML = `<option value="">${blank}</option>`;
  items.forEach(i => {
    const o = document.createElement('option');
    o.value = i.id;
    o.textContent = label ? label(i) : (i.name || i.full_name || '');
    el.appendChild(o);
  });
  if (cur) el.value = cur;
}

// ════════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════════
const PAGE_TITLES = { dashboard: 'Dashboard', assets: 'Asset Master', stock: 'Stock Room' };

function navigate(page) {
  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page-view').forEach(v => v.classList.toggle('active', v.id === 'page-' + page));
  document.getElementById('tb-title').textContent = PAGE_TITLES[page] || page;
  if (page === 'dashboard') loadDashboard();
  if (page === 'assets')    loadAssets(1);
  if (page === 'stock')     loadStock(1);
}

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════
async function loadDashboard() {
  const r = await api('dashboard');
  if (!r.success) return;
  const d = r.data;
  setText('d-total',    d.total_assets);
  setText('d-lowstock', d.low_stock_count ?? '—');
  setText('d-repair',   d.under_repair    ?? '—');
}

// ════════════════════════════════════════════════════════════
//  ASSET MASTER
// ════════════════════════════════════════════════════════════
async function loadAssets(page = 1) {
  S.assetPage = page;
  const r = await api('asset_list', {
    page, per_page: 15,
    search:        val('a-search'),
    status:        val('a-filter-status'),
    category_id:   val('a-filter-cat'),
    department_id: val('a-filter-dept'),
    location_id:   val('a-filter-loc'),
  });
  if (!r.success) { toast('error', 'Error', r.message); return; }
  const { items, total, total_pages } = r.data;
  setText('a-count', `Showing ${items.length} of ${total} assets`);
  renderTable('a-tbody', items, assetRow, 10);
  renderPagination('a-pagination', r.data, loadAssets);
}

function assetRow(a) {
  const warnCls = (a.warranty_end && new Date(a.warranty_end) < new Date(Date.now() + 30*86400000)) ? 'text-red' : 'td-muted';
  return `<tr>
    <td><input type="checkbox" class="row-cb" value="${a.id}"></td>
    <td class="fw-600">${esc(a.asset_tag)}</td>
    <td class="td-muted">${esc(a.serial_number || '—')}</td>
    <td>${esc(a.category_name || '—')}</td>
    <td>${esc(a.model || '—')}</td>
    <td>${statusBadge(a.status)}</td>
    <td>${esc(a.assigned_user_name || '—')}</td>
    <td>${esc(a.department_name || '—')}</td>
    <td class="${warnCls}">${a.warranty_end || '—'}</td>
    <td>
      <div style="display:flex;gap:5px">
        <button class="btn btn-secondary btn-xs" onclick="viewAsset(${a.id})">View</button>
        <button class="btn btn-dark btn-xs"      onclick="editAsset(${a.id})">Edit</button>
        <button class="btn btn-danger btn-xs"    onclick="openTransfer(${a.id})">Transfer</button>
      </div>
    </td>
  </tr>`;
}

// ── ADD / EDIT ASSET ──
async function openAddAsset() {
  S.assetId = null;
  document.getElementById('modal-asset-title').textContent = 'ADD NEW ASSET';
  document.getElementById('form-asset').reset();
  set('a-id', '');
  resetTabs('modal-asset');
  await loadAssetSelects();
  document.getElementById('attach-list').innerHTML = '<p style="color:var(--text-3);font-size:13px">Save asset first to upload documents.</p>';
  openModal('modal-asset');
}

async function editAsset(id) {
  const r = await api('asset_view', { id });
  if (!r.success) { toast('error', 'Error', r.message); return; }
  const a = r.data;
  S.assetId = id;
  document.getElementById('modal-asset-title').textContent = `EDIT ASSET | ${a.asset_tag}`;
  resetTabs('modal-asset');
  await loadAssetSelects();
  const fields = ['asset_tag','serial_number','category_id','make','model','os','firmware_version','status','notes','po_number','invoice_number','purchase_cost','date_acquired','warranty_start','warranty_end','sla_tier','support_contract_ref','department_id','location_id','cost_center'];
  fields.forEach(f => set('a-' + f, a[f]));
  set('a-vendor_name', a.vendor_name || '');
  set('a-assigned_user_text', a.assigned_user_name || '');
  set('a-id', a.id);
  loadAttachments(id);
  openModal('modal-asset');
}

async function loadAssetSelects() {
  await Promise.all([
    fillSelect('a-category_id',     'categories'),
    fillSelect('a-department_id',   'departments',  { blank: 'Unassigned' }),
    fillSelect('a-location_id',     'locations',    { blank: 'Select', label: i => (i.site_name ? i.site_name+' › ':'')+i.name }),
  ]);
}

async function saveAsset() {
  const id = val('a-id');
  const body = {};
  ['asset_tag','serial_number','category_id','make','model','os','firmware_version','status','notes','po_number','invoice_number','purchase_cost','date_acquired','warranty_start','warranty_end','sla_tier','support_contract_ref','department_id','location_id','cost_center'].forEach(f => { body[f] = val('a-'+f) || null; });
  body.vendor_id = null;
  body.assigned_user_id = null;
  if (!body.asset_tag)   { toast('warning', 'Required', 'Asset Tag is required.'); return; }
  if (!body.category_id) { toast('warning', 'Required', 'Category is required.'); return; }
  body.status = body.status || 'In-Stock';
  if (id) body.id = id;
  const r = await api(id ? 'asset_update' : 'asset_create', {}, body);
  if (r.success) {
    toast('success', id ? 'Asset Updated' : 'Asset Created');
    closeModal('modal-asset');
    Object.keys(LookupCache).forEach(k => delete LookupCache[k]);
    loadAssets(S.assetPage);
  } else toast('error', 'Save Failed', r.message);
}

// ── VIEW ASSET ──
async function viewAsset(id) {
  const r = await api('asset_view', { id });
  if (!r.success) { toast('error', 'Error', r.message); return; }
  const a = r.data;
  S.assetId = id;

  setText('vw-tag', a.asset_tag);
  const sb = document.getElementById('vw-status');
  sb.className = 'badge ' + statusClass(a.status);
  sb.textContent = a.status;
  setText('vw-cat', a.category_name || '—');
  setText('vw-serial',   a.serial_number);
  setText('vw-brand',    (a.make||'—')+' / '+(a.model||'—'));
  setText('vw-category', a.category_name);
  setText('vw-os',       a.os);
  setText('vw-firmware', a.firmware_version);
  setText('vw-status-row', a.status);
  setText('vw-spec',     a.notes);
  setText('vw-vendor',   a.vendor_name);
  setText('vw-po',       (a.po_number||'—')+' / '+(a.invoice_number||'—'));
  setText('vw-cost',     a.purchase_cost ? peso(a.purchase_cost) : '—');
  setText('vw-acquired', a.date_acquired || '—');
  setText('vw-warranty', a.warranty_start && a.warranty_end ? `${a.warranty_start} → ${a.warranty_end}` : '—');
  setText('vw-sla',      a.sla_tier || '—');
  setText('vw-assigned', a.assigned_user_name || 'Unassigned');
  setText('vw-dept',     a.department_name || '—');
  setText('vw-location', a.location_full || a.location_name || '—');
  setText('vw-cc',       a.cost_center || '—');

  const log = a.lifecycle_log || [];
  const closedTypes = new Set(['CheckedIn', 'Retired', 'Disposed', 'Found']);
  const totalTickets = log.length;
  const closedTickets = log.filter(l => closedTypes.has(l.action_type)).length;
  const openTickets = Math.max(totalTickets - closedTickets, 0);
  setText('vw-ticket-total', totalTickets);
  setText('vw-ticket-open', openTickets);
  setText('vw-ticket-closed', closedTickets);

  document.getElementById('vw-timeline').innerHTML = log.length
    ? log.map(l => `<div class="timeline-item"><div class="tl-dot"></div><div><div class="tl-label">${esc(l.action_type)}${l.to_status?' → '+l.to_status:''}${l.reason?' — '+l.reason:''}</div><div class="tl-date">${l.performed_at} · ${esc(l.performed_by_name||'—')}</div></div></div>`).join('')
    : '<p class="text-muted" style="font-size:13px">No history yet.</p>';

  openModal('modal-view');
}

function openEditFromView()     { closeModal('modal-view'); editAsset(S.assetId); }
function openTransferFromView() { closeModal('modal-view'); openTransfer(S.assetId); }

// ── TRANSFER ──
async function openTransfer(id) {
  S.assetId = id;
  const r = await api('asset_view', { id });
  if (!r.success) return;
  const a = r.data;
  document.getElementById('tf-tag').textContent = a.asset_tag;
  set('tf-current', a.assigned_user_name || 'Unassigned');
  set('tf-reason', '');
  set('tf-user_text', '');
  set('tf-location_text', '');
  document.getElementById('tf-signoff').checked = false;
  // Ensure latest master data appears even if rows were added outside this UI.
  invalidateLookup('departments');
  invalidateLookup('locations');
  invalidateLookup('users');
  const [depts, users, locs] = await Promise.all([
    getLookup('departments'),
    getLookup('users'),
    getLookup('locations'),
  ]);
  await fillSelect('tf-department', 'departments', { blank: 'Select' });

  // Build suggestion maps for confirmTransfer.
  S.tfUserMap = {};
  const userOpts = (users || []).map(u => {
    const v = `${u.full_name}${u.employee_id ? ` (${u.employee_id})` : ''}`;
    S.tfUserMap[v.toLowerCase()] = u.id;
    return v;
  });
  setDatalist('dl-users', userOpts);

  S.tfLocMap = {};
  const locOpts = (locs || []).map(l => {
    const v = `${(l.site_name ? `${l.site_name} - ` : '')}${l.name}`;
    S.tfLocMap[v.toLowerCase()] = l.id;
    return v;
  });
  setDatalist('dl-locations', locOpts);
  openModal('modal-transfer');
}

async function confirmTransfer() {
  if (!document.getElementById('tf-signoff').checked) { toast('warning', 'Sign-off Required', 'Please confirm the new custodian has acknowledged.'); return; }
  const cust = val('tf-user_text');
  const loc  = val('tf-location_text');
  if (!cust) { toast('warning', 'Required', 'New custodian is required.'); return; }
  if (!val('tf-department')) { toast('warning', 'Required', 'New department is required.'); return; }
  const toUserId = (S.tfUserMap?.[cust.toLowerCase()] ?? null);
  const toLocId  = loc ? (S.tfLocMap?.[loc.toLowerCase()] ?? null) : null;
  const r = await api('asset_transfer', {}, {
    asset_id: S.assetId,
    to_department_id: val('tf-department') || null,
    to_location_id: toLocId,
    to_user_id: toUserId,
    reason: val('tf-reason')
  });
  if (r.success) { toast('success', 'Transfer Complete'); closeModal('modal-transfer'); loadAssets(S.assetPage); }
  else toast('error', 'Transfer Failed', r.message);
}

// ── EXPORT ──
async function exportAssets() {
  const r = await api('asset_list', { per_page: 9999 });
  if (!r.success) return;
  const rows = [['Asset Tag','Serial No.','Category','Make','Model','Status','Assigned To','Dept','Location','Warranty End'], ...r.data.items.map(a => [a.asset_tag,a.serial_number,a.category_name,a.make,a.model,a.status,a.assigned_user_name,a.department_name,a.location_full,a.warranty_end])];
  const csv  = rows.map(r => r.map(c => `"${(c||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const a    = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
  a.download = 'assets_export.csv'; a.click();
  toast('success', 'Exported', 'assets_export.csv downloaded.');
}

function clearFilters() {
  ['a-search','a-filter-status','a-filter-cat','a-filter-dept','a-filter-loc'].forEach(id => set(id,''));
  syncStatusPills('');
  loadAssets(1);
}

function syncStatusPills(value) {
  document.querySelectorAll('.status-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === value);
  });
}

// ── ATTACHMENTS ──
async function loadAttachments(assetId) {
  const r  = await api('attach_list', { asset_id: assetId });
  const el = document.getElementById('attach-list');
  if (!r.success || !r.data?.length) { el.innerHTML = '<p style="color:var(--text-3);font-size:13px">No attachments yet.</p>'; return; }
  el.innerHTML = r.data.map(a => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
    <span style="font-size:18px">${fileIcon(a.file_type)}</span>
    <div style="flex:1;min-width:0">
      <a href="${API}?r=attach_download&id=${a.id}" target="_blank" style="font-size:13px;color:var(--teal);text-decoration:none;font-weight:600">${esc(a.file_name)}</a>
      <div style="font-size:11px;color:var(--text-3)">${esc(a.label)} · ${esc(a.file_size_kb||'')}</div>
    </div>
    <button class="icon-btn" onclick="deleteAttach(${a.id})">✕</button>
  </div>`).join('');
}

async function uploadAttachment() {
  const id = val('a-id') || S.assetId;
  if (!id) { toast('warning', 'Save First', 'Save the asset before uploading files.'); return; }
  const fi = document.getElementById('attach-file');
  if (!fi?.files?.length) return;
  const fd = new FormData();
  fd.append('file', fi.files[0]); fd.append('asset_id', id); fd.append('label', val('attach-label')); fd.append('uploaded_by', 1);
  const r = await upload('attach_upload', fd);
  if (r.success) { toast('success', 'Uploaded', fi.files[0].name); fi.value=''; loadAttachments(id); }
  else toast('error', 'Upload Failed', r.message);
}

async function deleteAttach(attachId) {
  confirm_dialog('Delete Attachment', 'This cannot be undone.', async () => {
    const r = await api('attach_delete', {}, { id: attachId });
    if (r.success) { toast('success', 'Deleted'); loadAttachments(S.assetId); }
    else toast('error', 'Error', r.message);
  });
}

// ════════════════════════════════════════════════════════════
//  STOCK ROOM
// ════════════════════════════════════════════════════════════
async function loadStock(page = 1) {
  S.stockPage = page;
  const [rItems, rLow] = await Promise.all([
    api('item_list', { page, per_page:15, search: val('s-search'), category_id: val('s-filter-cat') }),
    api('stock_low'),
  ]);
  if (!rItems.success) return;

  const lowIds    = new Set((rLow.data||[]).map(i => i.id));
  const stockouts = (rLow.data||[]).filter(i => parseFloat(i.quantity_on_hand) <= 0);

  const allR = await api('item_list', { per_page:9999 });
  let totalVal = 0;
  (allR.data?.items||[]).forEach(i => { totalVal += parseFloat(i.unit_cost||0) * parseFloat(i.total_qty_on_hand||0); });

  setText('s-value',     peso(totalVal));
  setText('s-skus',      allR.data?.total ?? '—');
  setText('s-below-rop', rLow.data?.length ?? 0);
  setText('s-stockout',  stockouts.length);

  S.stockItems = allR.data?.items || [];
  renderTable('s-tbody', rItems.data.items, i => stockRow(i, lowIds), 8);
  renderPagination('s-pagination', rItems.data, loadStock);
}

function stockRow(i, lowIds) {
  const qty   = parseFloat(i.total_qty_on_hand || 0);
  const min   = parseFloat(i.min_level || 0);
  const max   = parseFloat(i.max_level || 0);
  const rop   = parseFloat(i.reorder_point || 0);
  const isOut = qty <= 0;
  const isLow = lowIds.has(i.id);
  let badge = `<span class="badge b-in-stock">In stock</span>`;
  if (isOut)      badge = `<span class="badge b-stockout">Stockout</span>`;
  else if (isLow) badge = `<span class="badge b-below-rop">Below ROP</span>`;
  return `<tr>
    <td class="fw-600">${esc(i.item_code)}</td>
    <td>${esc(i.name)}</td>
    <td class="fw-600">${qty.toFixed(0)}</td>
    <td class="td-muted">${min > 0 ? min.toFixed(0) : '—'}</td>
    <td class="td-muted">${max > 0 ? max.toFixed(0) : '—'}</td>
    <td class="td-muted">${rop > 0 ? rop.toFixed(0) : '—'}</td>
    <td>${badge}</td>
    <td>
      <div style="display:flex;gap:5px">
        <button class="btn btn-dark btn-xs" onclick="editStockItem(${i.id})">Edit</button>
      </div>
    </td>
  </tr>`;
}

async function openAddStockItem() {
  S.currentStockId = null;
  document.getElementById('modal-stock-title').textContent = 'Add Item';
  document.getElementById('form-stock').reset();
  set('si-id','');
  await fillSelect('si-category_id', 'categories');
  openModal('modal-stock-item');
}

async function editStockItem(id) {
  const item = S.stockItems.find(i => i.id === id);
  if (!item) return;
  document.getElementById('modal-stock-title').textContent = 'Edit Item';
  await fillSelect('si-category_id', 'categories');
  ['id','item_code','name','unit_of_measure','description'].forEach(f => set('si-'+f, item[f]));
  set('si-brand', '');
  set('si-min_level', item.min_level || '');
  set('si-max_level', item.max_level || '');
  set('si-reorder_point', item.reorder_point || '');
  set('si-category_id', item.category_id);
  openModal('modal-stock-item');
}

async function saveStockItem() {
  const id   = val('si-id');
  const brand = val('si-brand');
  const desc = val('si-description');
  const finalDesc = brand ? (`Brand: ${brand}${desc ? ` | ${desc}` : ''}`) : (desc || null);
  const body = {
    item_code: val('si-item_code'),
    name: val('si-name'),
    category_id: val('si-category_id')||null,
    unit_of_measure: val('si-unit_of_measure')||'pcs',
    description: finalDesc,
    min_level: val('si-min_level') || null,
    max_level: val('si-max_level') || null,
    reorder_point: val('si-reorder_point') || null
  };
  if (!body.item_code) { toast('warning','Required','Item Code is required.'); return; }
  if (!body.name)      { toast('warning','Required','Name is required.'); return; }
  if (!body.category_id) { toast('warning','Required','Category is required.'); return; }
  if (body.min_level === null || body.max_level === null || body.reorder_point === null) {
    toast('warning','Required','Min Level, Max Level, and Reorder Point are required.');
    return;
  }
  if (id) body.id = id;
  const r = await api(id ? 'item_update' : 'item_create', {}, body);
  if (r.success) {
    toast('success', id ? 'Item Updated' : 'Item Added');
    closeModal('modal-stock-item');
    loadStock(S.stockPage);
  }
  else toast('error', 'Failed', r.message);
}

// ── MASTER DATA (Departments / Sites / Locations) ──
async function openMasterData() {
  await loadMasterDataLists();
  openModal('modal-masterdata');
}

async function loadMasterDataLists() {
  const [depts, sites, locs, vendors] = await Promise.all([
    getLookup('departments'),
    getLookup('sites'),
    getLookup('locations'),
    getLookup('vendors')
  ]);

  document.getElementById('md-dept-list').innerHTML = (depts?.length
    ? depts.map(d => `<div class="mini-item"><span>${esc(d.name)}</span></div>`).join('')
    : '<div class="mini-item"><span>No departments yet.</span></div>');

  document.getElementById('md-site-list').innerHTML = (sites?.length
    ? sites.map(s => `<div class="mini-item"><span>${esc(s.name)}</span></div>`).join('')
    : '<div class="mini-item"><span>No sites yet.</span></div>');

  document.getElementById('md-vendor-list').innerHTML = (vendors?.length
    ? vendors.map(v => `<div class="mini-item"><span>${esc(v.name)}</span></div>`).join('')
    : '<div class="mini-item"><span>No vendors yet.</span></div>');

  document.getElementById('md-loc-list').innerHTML = (locs?.length
    ? locs.map(l => `<div class="mini-item"><span>${esc((l.site_name ? `${l.site_name} › ` : '') + l.name)}</span></div>`).join('')
    : '<div class="mini-item"><span>No locations yet.</span></div>');

  const siteSel = document.getElementById('md-loc-site');
  siteSel.innerHTML = '<option value="">Select site</option>';
  (sites || []).forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name;
    siteSel.appendChild(o);
  });
}

async function addDepartment() {
  const name = val('md-dept-name');
  if (!name) { toast('warning', 'Required', 'Department name is required.'); return; }
  const r = await api('lookup_create', { res: 'departments' }, { name });
  if (!r.success) { toast('error', 'Failed', r.message); return; }
  set('md-dept-name', '');
  await refreshMasterLookups();
  toast('success', 'Department Added');
}

async function addSite() {
  const name = val('md-site-name');
  if (!name) { toast('warning', 'Required', 'Site name is required.'); return; }
  const r = await api('lookup_create', { res: 'sites' }, { name });
  if (!r.success) { toast('error', 'Failed', r.message); return; }
  set('md-site-name', '');
  await refreshMasterLookups();
  toast('success', 'Site Added');
}

async function addLocation() {
  const siteId = val('md-loc-site');
  const name = val('md-loc-name');
  if (!siteId || !name) { toast('warning', 'Required', 'Site and location are required.'); return; }
  const r = await api('lookup_create', { res: 'locations' }, { name, site_id: siteId });
  if (!r.success) { toast('error', 'Failed', r.message); return; }
  set('md-loc-name', '');
  await refreshMasterLookups();
  toast('success', 'Location Added');
}

async function addVendor() {
  const name = val('md-vendor-name');
  const email = val('md-vendor-email');
  if (!name) { toast('warning', 'Required', 'Vendor name is required.'); return; }
  const payload = { name };
  if (email) payload.email = email;
  const r = await api('lookup_create', { res: 'vendors' }, payload);
  if (!r.success) { toast('error', 'Failed', r.message); return; }
  set('md-vendor-name', '');
  set('md-vendor-email', '');
  await refreshMasterLookups();
  toast('success', 'Vendor Added');
}

async function refreshMasterLookups() {
  Object.keys(LookupCache).forEach(k => delete LookupCache[k]);
  await Promise.all([
    fillSelect('a-filter-cat', 'categories', { blank: 'All' }),
    fillSelect('a-filter-dept', 'departments', { blank: 'All' }),
    fillSelect('a-filter-loc', 'locations', { blank: 'All', label:i=>(i.site_name?i.site_name+' › ':'')+i.name }),
    fillSelect('s-filter-cat', 'categories', { blank: 'All Categories' })
  ]);
  await loadMasterDataLists();
}

// ── ISSUE STOCK ──
async function openIssueStock() {
  document.getElementById('form-issue').reset();
  set('issue-avail','—');
  document.getElementById('issue-oos').classList.add('hidden');
  const sel = document.getElementById('issue-item');
  sel.innerHTML = '<option value="">Select Item</option>';
  S.stockItems.forEach(i => {
    const o = document.createElement('option');
    o.value = i.id;
    o.dataset.qty = i.total_qty_on_hand || 0;
    o.dataset.uom = i.unit_of_measure || 'pcs';
    o.textContent = `${i.name} (${i.item_code})`;
    sel.appendChild(o);
  });
  const uomSel = document.getElementById('issue-uom');
  if (uomSel) uomSel.innerHTML = '<option value="">—</option>';
  await fillSelect('issue-location','locations',{blank:'Select location…',label:i=>(i.site_name?i.site_name+' › ':'')+i.name});
  openModal('modal-issue');
}

function updateIssueQty() {
  const opt = document.getElementById('issue-item').selectedOptions[0];
  setText('issue-avail', opt?.dataset?.qty ?? '—');
  document.getElementById('issue-oos').classList.add('hidden');
  const uom = opt?.dataset?.uom || 'pcs';
  const uomSel = document.getElementById('issue-uom');
  if (uomSel) uomSel.innerHTML = `<option value="${esc(uom)}">${esc(uom)}(s)</option>`;
}

function checkOos() {
  const opt   = document.getElementById('issue-item').selectedOptions[0];
  const avail = parseFloat(opt?.dataset?.qty || 0);
  const req   = parseFloat(val('issue-qty') || 0);
  document.getElementById('issue-oos').classList.toggle('hidden', req <= avail || !req);
}

async function confirmIssue() {
  const body = { item_id: val('issue-item'), location_id: val('issue-location'), quantity: val('issue-qty'), reason_code: val('issue-reason'), notes: val('issue-notes')||null };
  if (!body.item_id || !body.location_id || !body.quantity) { toast('warning','Missing Fields','Fill in all required fields.'); return; }
  const r = await api('stock_issue', {}, body);
  if (r.success) { toast('success','Stock Issued'); closeModal('modal-issue'); loadStock(S.stockPage); }
  else toast('error','Issue Failed',r.message);
}

// ── RECEIVE STOCK (GRN) ──
async function openReceivedStock() {
  document.getElementById('form-grn').reset();
  const sel = document.getElementById('grn-item');
  sel.innerHTML = '<option value="">Select Item</option>';
  S.stockItems.forEach(i => { const o = document.createElement('option'); o.value=i.id; o.textContent=`${i.name} (${i.item_code})`; sel.appendChild(o); });
  await fillSelect('grn-location','locations',{blank:'Select location…',label:i=>(i.site_name?i.site_name+' › ':'')+i.name});
  openModal('modal-grn');
}

async function confirmGRN() {
  const body = { item_id: val('grn-item'), location_id: val('grn-location'), quantity: val('grn-qty'), notes: val('grn-notes')||null };
  if (!body.item_id || !body.location_id || !body.quantity) { toast('warning','Missing Fields','Fill in all required fields.'); return; }
  const r = await api('stock_receive', {}, body);
  if (r.success) { toast('success','Stock Received'); closeModal('modal-grn'); loadStock(S.stockPage); }
  else toast('error','GRN Failed',r.message);
}

// ════════════════════════════════════════════════════════════
//  UI HELPERS
// ════════════════════════════════════════════════════════════
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function val(id)      { return document.getElementById(id)?.value?.trim() ?? ''; }
function set(id, v)   { const e = document.getElementById(id); if (e) e.value = v ?? ''; }
function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = (v != null && v !== '') ? v : '—'; }

function esc(s) {
  return s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function peso(n) {
  return '₱' + parseFloat(n||0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

function statusClass(s) {
  return { 'In-Use':'b-in-use','In-Stock':'b-in-stock','Under Repair':'b-under-repair','Retired':'b-retired','Disposed':'b-disposed','Lost':'b-lost' }[s] || 'b-disposed';
}

function statusBadge(s) {
  return `<span class="badge ${statusClass(s)}">${esc(s)}</span>`;
}

function fileIcon(mime) {
  if (mime?.includes('pdf'))   return '📄';
  if (mime?.includes('image')) return '🖼️';
  if (mime?.includes('word'))  return '📝';
  if (mime?.includes('sheet') || mime?.includes('excel')) return '📊';
  return '📎';
}

// ── TABLE RENDERER ──
function renderTable(tbodyId, items, rowFn, colCount = 8) {
  const el = document.getElementById(tbodyId);
  if (!el) return;
  if (!items?.length) {
    el.innerHTML = `<tr><td colspan="${colCount}"><div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><p>No records found</p><span>Try adjusting your filters.</span></div></td></tr>`;
    return;
  }
  el.innerHTML = items.map(rowFn).join('');
}

function renderPagination(containerId, meta, goFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const { page, total, total_pages } = meta;
  if (total_pages <= 1) { el.innerHTML = `<span class="pg-info">${total} record${total!==1?'s':''}</span>`; return; }
  let html = `<span class="pg-info">${total} records</span>`;
  html += `<button class="pg-btn" onclick="${goFn.name}(${page-1})" ${page<=1?'disabled':''}>‹</button>`;
  const start = Math.max(1,page-2), end = Math.min(total_pages,start+4);
  for (let i=start;i<=end;i++) html += `<button class="pg-btn ${i===page?'active':''}" onclick="${goFn.name}(${i})">${i}</button>`;
  if (end<total_pages) html += `<span style="color:var(--text-3);padding:0 4px">…</span><button class="pg-btn" onclick="${goFn.name}(${total_pages})">${total_pages}</button>`;
  html += `<button class="pg-btn" onclick="${goFn.name}(${page+1})" ${page>=total_pages?'disabled':''}>›</button>`;
  el.innerHTML = html;
}

// ── MODAL TABS ──
function resetTabs(modalId) {
  const m = document.getElementById(modalId);
  m?.querySelectorAll('.modal-tab').forEach((t,i)  => t.classList.toggle('active', i===0));
  m?.querySelectorAll('.tab-panel').forEach((p,i)  => p.classList.toggle('hidden', i!==0));
}

function initTabs(modalId) {
  document.querySelectorAll(`#${modalId} .modal-tab`).forEach(tab => {
    tab.addEventListener('click', () => {
      const modal = document.getElementById(modalId);
      modal.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t===tab));
      modal.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== tab.dataset.tab));
    });
  });
}

// ── TOAST ──
const TOAST_ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>`,
  info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>`,
};
function toast(type, title, msg = '', ms = 3500) {
  const el = document.createElement('div');
  el.className = `toast t-${type}`;
  el.innerHTML = `${TOAST_ICONS[type]}<div class="toast-body"><div class="toast-title">${esc(title)}</div>${msg?`<div class="toast-msg">${esc(msg)}</div>`:''}</div><button class="toast-x" onclick="this.closest('.toast').remove()">✕</button>`;
  document.getElementById('toast-wrap').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ── CONFIRM DIALOG ──
function confirm_dialog(title, msg, onYes) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = msg;
  document.getElementById('confirm-ok').onclick = () => { closeModal('modal-confirm'); onYes(); };
  openModal('modal-confirm');
}

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Set today's date
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

  // Close modals on overlay click or ESC
  document.addEventListener('click', e => { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); });

  // Init modal tabs
  initTabs('modal-asset');

  // Populate filter dropdowns
  await Promise.all([
    fillSelect('a-filter-cat',  'categories',  { blank:'All' }),
    fillSelect('a-filter-dept', 'departments', { blank:'All' }),
    fillSelect('a-filter-loc',  'locations',   { blank:'All', label:i=>(i.site_name?i.site_name+' › ':'')+i.name }),
    fillSelect('s-filter-cat',  'categories',  { blank:'All Categories' }),
  ]);

  document.querySelectorAll('.status-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const status = btn.dataset.status || '';
      set('a-filter-status', status);
      syncStatusPills(status);
      loadAssets(1);
    });
  });

  document.getElementById('a-filter-status')?.addEventListener('change', e => {
    syncStatusPills(e.target.value || '');
  });

  // Load dashboard on start
  navigate('dashboard');
});