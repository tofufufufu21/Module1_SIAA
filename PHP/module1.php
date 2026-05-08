<?php
// module1.php — All Module 1 API endpoints in a single file
// Route via:  module1.php?r=<route>
// All responses are JSON: { success, message, data }

require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Helpers ───────────────────────────────────────────────────
function ok(mixed $data = null, string $msg = 'OK', int $code = 200): never {
    http_response_code($code);
    echo json_encode(['success' => true,  'message' => $msg, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $msg = 'Error', int $code = 400): never {
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $msg, 'data' => null], JSON_UNESCAPED_UNICODE);
    exit;
}
function body(): array {
    $raw = file_get_contents('php://input');
    return $raw ? (json_decode($raw, true) ?? $_POST) : $_POST;
}
function q(string $key, mixed $default = null): mixed {
    return $_GET[$key] ?? $default;
}
function current_user(): int { return 1; } // Replace with session auth

// ── Router ────────────────────────────────────────────────────
$r      = q('r', '');
$method = $_SERVER['REQUEST_METHOD'];

match(true) {
    // ── Dashboard ──────────────────────────────────────────
    $r === 'dashboard'          => dashboard(),

    // ── Assets ─────────────────────────────────────────────
    $r === 'asset_list'         => asset_list(),
    $r === 'asset_view'         => asset_view(),
    $r === 'asset_create'       => asset_create(),
    $r === 'asset_update'       => asset_update(),
    $r === 'asset_transfer'     => asset_transfer(),
    $r === 'asset_status'       => asset_change_status(),
    $r === 'asset_history'      => asset_history(),

    // ── Attachments ─────────────────────────────────────────
    $r === 'attach_list'        => attach_list(),
    $r === 'attach_upload'      => attach_upload(),
    $r === 'attach_delete'      => attach_delete(),
    $r === 'attach_download'    => attach_download(),

    // ── Stock Items ─────────────────────────────────────────
    $r === 'item_list'          => item_list(),
    $r === 'item_create'        => item_create(),
    $r === 'item_update'        => item_update(),

    // ── Stock Transactions ──────────────────────────────────
    $r === 'stock_list'         => stock_list(),
    $r === 'stock_receive'      => stock_receive(),
    $r === 'stock_issue'        => stock_issue(),
    $r === 'stock_transfer'     => stock_transfer(),
    $r === 'stock_adjust'       => stock_adjust(),
    $r === 'stock_low'          => stock_low(),
    $r === 'stock_transactions' => stock_transactions(),

    // ── Lookups ─────────────────────────────────────────────
    $r === 'lookup_list'        => lookup_list(),
    $r === 'lookup_create'      => lookup_create(),
    $r === 'lookup_update'      => lookup_update(),
    $r === 'lookup_delete'      => lookup_delete(),

    default                     => fail("Unknown route: {$r}", 404),
};

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════
function dashboard(): never {
    $db = db();
    $byStatus = [];
    foreach ($db->query("SELECT status, COUNT(*) as n FROM assets WHERE is_active=1 GROUP BY status")->fetchAll() as $row) {
        $byStatus[$row['status']] = (int)$row['n'];
    }
    $totalSkus  = (int)$db->query("SELECT COUNT(*) FROM stock_items WHERE is_active=1")->fetchColumn();
    $totalValue = (float)$db->query("SELECT COALESCE(SUM(si.unit_cost * sl.quantity_on_hand),0) FROM stock_items si JOIN stock_levels sl ON sl.item_id=si.id WHERE si.is_active=1 AND si.unit_cost IS NOT NULL")->fetchColumn();
    $lowStock   = $db->query("SELECT COUNT(*) FROM stock_levels sl JOIN stock_items si ON si.id=sl.item_id WHERE si.is_active=1 AND sl.quantity_on_hand <= COALESCE(sl.reorder_point, sl.min_level)")->fetchColumn();
    ok([
        'total_assets'  => array_sum($byStatus),
        'by_status'     => $byStatus,
        'in_use'        => $byStatus['In-Use']       ?? 0,
        'in_stock'      => $byStatus['In-Stock']     ?? 0,
        'under_repair'  => $byStatus['Under Repair'] ?? 0,
        'retired'       => ($byStatus['Retired'] ?? 0) + ($byStatus['Disposed'] ?? 0),
        'total_skus'    => $totalSkus,
        'total_value'   => $totalValue,
        'low_stock_count'=> (int)$lowStock,
    ]);
}

// ════════════════════════════════════════════════════════════
//  ASSETS
// ════════════════════════════════════════════════════════════
function asset_select_sql(): string {
    return "SELECT a.*,
        c.name AS category_name, v.name AS vendor_name,
        u.full_name AS assigned_user_name, d.name AS department_name,
        l.name AS location_name,
        CONCAT(COALESCE(s.name,''), ' › ', l.name) AS location_full,
        pa.asset_tag AS parent_asset_tag
    FROM assets a
    LEFT JOIN categories  c  ON c.id = a.category_id
    LEFT JOIN vendors     v  ON v.id = a.vendor_id
    LEFT JOIN users       u  ON u.id = a.assigned_user_id
    LEFT JOIN departments d  ON d.id = a.department_id
    LEFT JOIN locations   l  ON l.id = a.location_id
    LEFT JOIN sites       s  ON s.id = l.site_id
    LEFT JOIN assets      pa ON pa.id = a.parent_asset_id";
}

function asset_list(): never {
    $db     = db();
    $page   = max(1, (int)q('page', 1));
    $limit  = max(1, min(100, (int)q('per_page', 15)));
    $offset = ($page - 1) * $limit;

    $where  = ['a.is_active = 1'];
    $params = [];

    if ($s = q('search'))      { $where[] = '(a.asset_tag LIKE ? OR a.serial_number LIKE ? OR a.make LIKE ? OR a.model LIKE ?)'; array_push($params, "%$s%", "%$s%", "%$s%", "%$s%"); }
    if ($v = q('status'))      { $where[] = 'a.status = ?';      $params[] = $v; }
    if ($v = q('category_id')) { $where[] = 'a.category_id = ?'; $params[] = (int)$v; }
    if ($v = q('department_id')){ $where[] = 'a.department_id = ?'; $params[] = (int)$v; }
    if ($v = q('location_id')) { $where[] = 'a.location_id = ?'; $params[] = (int)$v; }

    $wc     = 'WHERE ' . implode(' AND ', $where);
    $total  = (int)$db->prepare("SELECT COUNT(*) FROM assets a $wc")->execute($params) ? $db->prepare("SELECT COUNT(*) FROM assets a $wc")->execute($params) : 0;

    $cnt    = $db->prepare("SELECT COUNT(*) FROM assets a $wc");
    $cnt->execute($params);
    $total  = (int)$cnt->fetchColumn();

    $sql    = asset_select_sql() . " $wc ORDER BY a.created_at DESC LIMIT $limit OFFSET $offset";
    $stmt   = $db->prepare($sql);
    $stmt->execute($params);
    $items  = $stmt->fetchAll();

    ok(['items' => $items, 'total' => $total, 'page' => $page, 'per_page' => $limit, 'total_pages' => (int)ceil($total / $limit)]);
}

function asset_view(): never {
    $id  = (int)q('id');
    if (!$id) fail('Asset ID required.');
    $db  = db();
    $stmt = $db->prepare(asset_select_sql() . ' WHERE a.id = ? AND a.is_active = 1');
    $stmt->execute([$id]);
    $asset = $stmt->fetch();
    if (!$asset) fail('Asset not found.', 404);

    $log = $db->prepare("SELECT ll.*, pb.full_name AS performed_by_name FROM asset_lifecycle_log ll LEFT JOIN users pb ON pb.id=ll.performed_by WHERE ll.asset_id=? ORDER BY ll.performed_at DESC LIMIT 15");
    $log->execute([$id]);
    $asset['lifecycle_log'] = $log->fetchAll();

    $att = $db->prepare("SELECT a.*, u.full_name AS uploaded_by_name FROM asset_attachments a LEFT JOIN users u ON u.id=a.uploaded_by WHERE a.asset_id=? ORDER BY a.uploaded_at DESC");
    $att->execute([$id]);
    $rows = $att->fetchAll();
    foreach ($rows as &$r) { $r['file_size_kb'] = $r['file_size'] ? round($r['file_size']/1024, 1).' KB' : null; }
    $asset['attachments'] = $rows;

    $ch = $db->prepare(asset_select_sql() . ' WHERE a.parent_asset_id=? AND a.is_active=1');
    $ch->execute([$id]);
    $asset['children'] = $ch->fetchAll();

    ok($asset);
}

function asset_create(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $b = body();
    if (empty($b['asset_tag']))   fail("'Asset Tag' is required.");
    if (empty($b['category_id'])) fail("'Category' is required.");

    $db = db();
    $exists = $db->prepare("SELECT id FROM assets WHERE asset_tag=? AND is_active=1");
    $exists->execute([$b['asset_tag']]);
    if ($exists->fetch()) fail("Asset tag '{$b['asset_tag']}' already exists.");

    $statuses = ['In-Use','In-Stock','Under Repair','Retired','Disposed','Lost'];
    $status   = in_array($b['status'] ?? '', $statuses) ? $b['status'] : 'In-Stock';

    $cols = ['asset_tag','serial_number','barcode','category_id','make','model','cpu','ram','storage','os','firmware_version','vendor_id','po_number','invoice_number','purchase_cost','date_acquired','warranty_start','warranty_end','sla_tier','support_contract_ref','status','assigned_user_id','department_id','location_id','cost_center','parent_asset_id','installed_at','connected_to','notes','created_by'];
    $data = [];
    foreach ($cols as $col) { $data[$col] = isset($b[$col]) && $b[$col] !== '' ? $b[$col] : null; }
    $data['status']      = $status;
    $data['created_by']  = current_user();
    $data['category_id'] = (int)$b['category_id'];

    $id = db_insert('assets', $data);
    db_insert('asset_lifecycle_log', ['asset_id'=>$id,'action_type'=>'StatusChange','to_status'=>$status,'reason'=>'Asset created','performed_by'=>current_user()]);
    ok(['id' => $id], 'Asset created.', 201);
}

function asset_update(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $b  = body();
    $id = (int)($b['id'] ?? 0);
    if (!$id) fail('Asset ID required.');
    $db = db();

    $old = $db->prepare("SELECT * FROM assets WHERE id=? AND is_active=1");
    $old->execute([$id]);
    $existing = $old->fetch();
    if (!$existing) fail('Asset not found.', 404);

    if (!empty($b['asset_tag']) && $b['asset_tag'] !== $existing['asset_tag']) {
        $chk = $db->prepare("SELECT id FROM assets WHERE asset_tag=? AND is_active=1 AND id!=?");
        $chk->execute([$b['asset_tag'], $id]);
        if ($chk->fetch()) fail("Asset tag '{$b['asset_tag']}' already exists.");
    }

    $allowed = ['asset_tag','serial_number','barcode','category_id','make','model','cpu','ram','storage','os','firmware_version','vendor_id','po_number','invoice_number','purchase_cost','date_acquired','warranty_start','warranty_end','sla_tier','support_contract_ref','status','assigned_user_id','department_id','location_id','cost_center','parent_asset_id','installed_at','connected_to','notes'];
    $data = [];
    foreach ($allowed as $col) { if (array_key_exists($col, $b)) $data[$col] = $b[$col] === '' ? null : $b[$col]; }
    db_update('assets', $id, $data);

    if (isset($data['status']) && $data['status'] !== $existing['status']) {
        db_insert('asset_lifecycle_log', ['asset_id'=>$id,'action_type'=>'StatusChange','from_status'=>$existing['status'],'to_status'=>$data['status'],'reason'=>$b['reason'] ?? 'Manual update','performed_by'=>current_user()]);
    }
    ok(['id' => $id], 'Asset updated.');
}

function asset_transfer(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $b  = body();
    $id = (int)($b['asset_id'] ?? 0);
    if (!$id) fail('asset_id required.');
    $db = db();
    $old = $db->prepare("SELECT * FROM assets WHERE id=? AND is_active=1"); $old->execute([$id]);
    $existing = $old->fetch();
    if (!$existing) fail('Asset not found.', 404);

    $updates = ['status' => 'In-Use'];
    if (!empty($b['to_user_id']))       $updates['assigned_user_id'] = (int)$b['to_user_id'];
    if (!empty($b['to_department_id'])) $updates['department_id']    = (int)$b['to_department_id'];
    if (!empty($b['to_location_id']))   $updates['location_id']      = (int)$b['to_location_id'];
    db_update('assets', $id, $updates);

    db_insert('asset_lifecycle_log', [
        'asset_id'         => $id,
        'action_type'      => $existing['assigned_user_id'] ? 'Transferred' : 'Assigned',
        'from_user_id'     => $existing['assigned_user_id'],
        'to_user_id'       => $b['to_user_id'] ?? null,
        'from_location_id' => $existing['location_id'],
        'to_location_id'   => $b['to_location_id'] ?? null,
        'from_status'      => $existing['status'],
        'to_status'        => 'In-Use',
        'reason'           => $b['reason'] ?? '',
        'performed_by'     => current_user(),
    ]);
    ok(null, 'Asset transferred.');
}

function asset_change_status(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $b      = body();
    $id     = (int)($b['asset_id'] ?? 0);
    $status = $b['status'] ?? '';
    if (!$id || !$status) fail('asset_id and status required.');
    $statuses = ['In-Use','In-Stock','Under Repair','Retired','Disposed','Lost'];
    if (!in_array($status, $statuses)) fail("Invalid status.");
    $db = db();
    $old = $db->prepare("SELECT status FROM assets WHERE id=? AND is_active=1"); $old->execute([$id]);
    $existing = $old->fetch();
    if (!$existing) fail('Asset not found.', 404);
    db_update('assets', $id, ['status' => $status]);
    db_insert('asset_lifecycle_log', ['asset_id'=>$id,'action_type'=>'StatusChange','from_status'=>$existing['status'],'to_status'=>$status,'reason'=>$b['reason'] ?? '','performed_by'=>current_user()]);
    ok(null, 'Status updated.');
}

function asset_history(): never {
    $id = (int)q('id');
    if (!$id) fail('Asset ID required.');
    $stmt = db()->prepare("SELECT ll.*, pb.full_name AS performed_by_name FROM asset_lifecycle_log ll LEFT JOIN users pb ON pb.id=ll.performed_by WHERE ll.asset_id=? ORDER BY ll.performed_at DESC");
    $stmt->execute([$id]);
    ok($stmt->fetchAll());
}

// ════════════════════════════════════════════════════════════
//  ATTACHMENTS
// ════════════════════════════════════════════════════════════
function attach_list(): never {
    $id = (int)q('asset_id');
    if (!$id) fail('asset_id required.');
    $stmt = db()->prepare("SELECT a.*, u.full_name AS uploaded_by_name FROM asset_attachments a LEFT JOIN users u ON u.id=a.uploaded_by WHERE a.asset_id=? ORDER BY a.uploaded_at DESC");
    $stmt->execute([$id]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) { $r['file_size_kb'] = $r['file_size'] ? round($r['file_size']/1024,1).' KB' : null; }
    ok($rows);
}

function attach_upload(): never {
    $assetId = (int)($_POST['asset_id'] ?? 0);
    $label   = $_POST['label'] ?? 'Other';
    if (!$assetId)        fail('asset_id required.');
    if (empty($_FILES['file'])) fail('No file uploaded.');
    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) fail('Upload error.');
    if ($file['size'] > 10 * 1024 * 1024) fail('File too large (max 10 MB).');

    $allowed = ['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/csv',
        'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime  = $finfo->file($file['tmp_name']);
    if (!in_array($mime, $allowed)) fail("File type '$mime' not allowed.");

    $dir  = __DIR__ . '/uploads/' . $assetId;
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $name = time() . '_' . preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', basename($file['name']));
    $dest = $dir . '/' . $name;
    if (!move_uploaded_file($file['tmp_name'], $dest)) fail('Failed to save file.');

    $path = 'uploads/' . $assetId . '/' . $name;
    $newId = db_insert('asset_attachments', ['asset_id'=>$assetId,'file_name'=>basename($file['name']),'file_path'=>$path,'file_type'=>$mime,'file_size'=>$file['size'],'label'=>$label,'uploaded_by'=>current_user()]);
    ok(['id'=>$newId,'file_name'=>basename($file['name']),'file_path'=>$path], 'File uploaded.', 201);
}

function attach_delete(): never {
    $b  = body();
    $id = (int)($b['id'] ?? 0);
    if (!$id) fail('id required.');
    $stmt = db()->prepare("SELECT * FROM asset_attachments WHERE id=?"); $stmt->execute([$id]);
    $att  = $stmt->fetch();
    if (!$att) fail('Attachment not found.', 404);
    $full = __DIR__ . '/' . $att['file_path'];
    if (file_exists($full)) unlink($full);
    db()->prepare("DELETE FROM asset_attachments WHERE id=?")->execute([$id]);
    ok(null, 'Deleted.');
}

function attach_download(): never {
    $id   = (int)q('id');
    if (!$id) { http_response_code(400); echo 'Missing id.'; exit; }
    $stmt = db()->prepare("SELECT * FROM asset_attachments WHERE id=?"); $stmt->execute([$id]);
    $att  = $stmt->fetch();
    if (!$att) { http_response_code(404); echo 'Not found.'; exit; }
    $path = __DIR__ . '/' . $att['file_path'];
    if (!file_exists($path)) { http_response_code(404); echo 'File missing.'; exit; }
    $inline = in_array($att['file_type'], ['image/jpeg','image/png','image/gif','image/webp','application/pdf']);
    header('Content-Type: ' . $att['file_type']);
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . addslashes($att['file_name']) . '"');
    readfile($path); exit;
}

// ════════════════════════════════════════════════════════════
//  STOCK ITEMS
// ════════════════════════════════════════════════════════════
function item_list(): never {
    $page   = max(1, (int)q('page', 1));
    $limit  = max(1, min(100, (int)q('per_page', 15)));
    $offset = ($page - 1) * $limit;
    $where  = ['si.is_active = 1']; $params = [];
    if ($s = q('search'))      { $where[] = '(si.item_code LIKE ? OR si.name LIKE ?)'; $params[] = "%$s%"; $params[] = "%$s%"; }
    if ($v = q('category_id')) { $where[] = 'si.category_id = ?'; $params[] = (int)$v; }
    $wc    = 'WHERE ' . implode(' AND ', $where);
    $cnt   = db()->prepare("SELECT COUNT(*) FROM stock_items si $wc"); $cnt->execute($params);
    $total = (int)$cnt->fetchColumn();
    $stmt  = db()->prepare("SELECT si.*, c.name AS category_name, COALESCE(SUM(sl.quantity_on_hand),0) AS total_qty_on_hand FROM stock_items si LEFT JOIN categories c ON c.id=si.category_id LEFT JOIN stock_levels sl ON sl.item_id=si.id $wc GROUP BY si.id ORDER BY si.name ASC LIMIT $limit OFFSET $offset");
    $stmt->execute($params);
    ok(['items'=>$stmt->fetchAll(),'total'=>$total,'page'=>$page,'per_page'=>$limit,'total_pages'=>(int)ceil($total/$limit)]);
}

function item_create(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $b = body();
    if (empty($b['item_code'])) fail("'Item Code' is required.");
    if (empty($b['name']))      fail("'Name' is required.");
    $chk = db()->prepare("SELECT id FROM stock_items WHERE item_code=? AND is_active=1"); $chk->execute([$b['item_code']]);
    if ($chk->fetch()) fail("Item code '{$b['item_code']}' already exists.");
    $id = db_insert('stock_items', [
        'item_code'       => $b['item_code'],
        'name'            => $b['name'],
        'description'     => $b['description'] ?? null,
        'category_id'     => !empty($b['category_id']) ? (int)$b['category_id'] : null,
        'unit_of_measure' => $b['unit_of_measure'] ?? 'pcs',
        'has_expiry'      => (int)($b['has_expiry'] ?? 0),
        'unit_cost'       => !empty($b['unit_cost']) ? (float)$b['unit_cost'] : null,
    ]);
    ok(['id' => $id], 'Item created.', 201);
}

function item_update(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $b  = body();
    $id = (int)($b['id'] ?? 0);
    if (!$id) fail('id required.');
    $allowed = ['name','description','category_id','unit_of_measure','has_expiry','unit_cost'];
    $data = [];
    foreach ($allowed as $col) { if (array_key_exists($col, $b)) $data[$col] = $b[$col] === '' ? null : $b[$col]; }
    db_update('stock_items', $id, $data);
    ok(['id' => $id], 'Item updated.');
}

// ════════════════════════════════════════════════════════════
//  STOCK TRANSACTIONS
// ════════════════════════════════════════════════════════════
function stock_list(): never { item_list(); } // same query

function stock_receive(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $b = body();
    if (empty($b['item_id']) || empty($b['location_id']) || empty($b['quantity'])) fail('item_id, location_id, quantity required.');
    if ((float)$b['quantity'] <= 0) fail('Quantity must be positive.');
    $db = db(); $db->beginTransaction();
    try {
        db_insert('stock_transactions', ['item_id'=>(int)$b['item_id'],'transaction_type'=>'GRN','quantity'=>(float)$b['quantity'],'to_location_id'=>(int)$b['location_id'],'reference_type'=>$b['reference_type'] ?? 'Manual','reason_code'=>'Normal','notes'=>$b['notes'] ?? null,'performed_by'=>current_user()]);
        stock_adjust_level((int)$b['item_id'], (int)$b['location_id'], (float)$b['quantity']);
        $db->commit(); ok(null, 'Stock received.');
    } catch (Throwable $e) { $db->rollBack(); fail($e->getMessage(), 500); }
}

function stock_issue(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $b = body();
    if (empty($b['item_id']) || empty($b['location_id']) || empty($b['quantity'])) fail('item_id, location_id, quantity required.');
    $qty = (float)$b['quantity'];
    if ($qty <= 0) fail('Quantity must be positive.');
    $avail = get_stock_qty((int)$b['item_id'], (int)$b['location_id']);
    if ($avail < $qty) fail("Insufficient stock. Available: {$avail}, Requested: {$qty}.", 422);
    $db = db(); $db->beginTransaction();
    try {
        db_insert('stock_transactions', ['item_id'=>(int)$b['item_id'],'transaction_type'=>'Issue','quantity'=>-$qty,'from_location_id'=>(int)$b['location_id'],'reason_code'=>$b['reason_code'] ?? 'Normal','notes'=>$b['notes'] ?? null,'performed_by'=>current_user()]);
        stock_adjust_level((int)$b['item_id'], (int)$b['location_id'], -$qty);
        $db->commit(); ok(null, 'Stock issued.');
    } catch (Throwable $e) { $db->rollBack(); fail($e->getMessage(), 500); }
}

function stock_transfer(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $b = body();
    if (empty($b['item_id']) || empty($b['from_location_id']) || empty($b['to_location_id']) || empty($b['quantity'])) fail('item_id, from_location_id, to_location_id, quantity required.');
    if ((int)$b['from_location_id'] === (int)$b['to_location_id']) fail('Source and destination must differ.');
    $qty   = (float)$b['quantity'];
    $avail = get_stock_qty((int)$b['item_id'], (int)$b['from_location_id']);
    if ($avail < $qty) fail("Insufficient stock. Available: {$avail}.", 422);
    $db = db(); $db->beginTransaction();
    try {
        db_insert('stock_transactions', ['item_id'=>(int)$b['item_id'],'transaction_type'=>'Transfer','quantity'=>$qty,'from_location_id'=>(int)$b['from_location_id'],'to_location_id'=>(int)$b['to_location_id'],'reason_code'=>$b['reason_code'] ?? 'Normal','notes'=>$b['notes'] ?? null,'performed_by'=>current_user()]);
        stock_adjust_level((int)$b['item_id'], (int)$b['from_location_id'], -$qty);
        stock_adjust_level((int)$b['item_id'], (int)$b['to_location_id'],   $qty);
        $db->commit(); ok(null, 'Stock transferred.');
    } catch (Throwable $e) { $db->rollBack(); fail($e->getMessage(), 500); }
}

function stock_adjust(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $b = body();
    if (empty($b['item_id']) || empty($b['location_id']) || !isset($b['new_quantity'])) fail('item_id, location_id, new_quantity required.');
    $newQty  = (float)$b['new_quantity'];
    $current = get_stock_qty((int)$b['item_id'], (int)$b['location_id']);
    $delta   = $newQty - $current;
    $db = db(); $db->beginTransaction();
    try {
        db_insert('stock_transactions', ['item_id'=>(int)$b['item_id'],'transaction_type'=>'Adjustment','quantity'=>$delta,'to_location_id'=>(int)$b['location_id'],'reason_code'=>$b['reason_code'] ?? 'AuditCorrection','notes'=>$b['notes'] ?? null,'performed_by'=>current_user()]);
        $db->prepare("INSERT INTO stock_levels (item_id,location_id,quantity_on_hand) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity_on_hand=?")->execute([(int)$b['item_id'],(int)$b['location_id'],$newQty,$newQty]);
        $db->commit(); ok(null, 'Stock adjusted.');
    } catch (Throwable $e) { $db->rollBack(); fail($e->getMessage(), 500); }
}

function stock_low(): never {
    $rows = db()->query("SELECT si.id, si.item_code, si.name, si.unit_of_measure, sl.location_id, l.name AS location_name, sl.quantity_on_hand, sl.reorder_point, sl.min_level FROM stock_levels sl JOIN stock_items si ON si.id=sl.item_id JOIN locations l ON l.id=sl.location_id WHERE si.is_active=1 AND sl.quantity_on_hand <= COALESCE(sl.reorder_point, sl.min_level) ORDER BY sl.quantity_on_hand ASC")->fetchAll();
    ok($rows);
}

function stock_transactions(): never {
    $page   = max(1, (int)q('page', 1));
    $limit  = 20;
    $offset = ($page - 1) * $limit;
    $where  = ['1=1']; $params = [];
    if ($v = q('item_id')) { $where[] = 'st.item_id=?'; $params[] = (int)$v; }
    if ($v = q('type'))    { $where[] = 'st.transaction_type=?'; $params[] = $v; }
    $wc    = 'WHERE ' . implode(' AND ', $where);
    $cnt   = db()->prepare("SELECT COUNT(*) FROM stock_transactions st $wc"); $cnt->execute($params);
    $total = (int)$cnt->fetchColumn();
    $stmt  = db()->prepare("SELECT st.*, si.item_code, si.name AS item_name, si.unit_of_measure, fl.name AS from_location_name, tl.name AS to_location_name, u.full_name AS performed_by_name FROM stock_transactions st JOIN stock_items si ON si.id=st.item_id LEFT JOIN locations fl ON fl.id=st.from_location_id LEFT JOIN locations tl ON tl.id=st.to_location_id LEFT JOIN users u ON u.id=st.performed_by $wc ORDER BY st.performed_at DESC LIMIT $limit OFFSET $offset");
    $stmt->execute($params);
    ok(['items'=>$stmt->fetchAll(),'total'=>$total,'page'=>$page,'per_page'=>$limit,'total_pages'=>(int)ceil($total/$limit)]);
}

// ════════════════════════════════════════════════════════════
//  LOOKUPS (shared reference data for all modules)
// ════════════════════════════════════════════════════════════
function lookup_list(): never {
    $res     = q('res', '');
    $allowed = ['categories','departments','sites','locations','vendors','users'];
    if (!in_array($res, $allowed)) fail("Unknown resource '$res'.");
    $db = db();
    if ($res === 'users') {
        $s   = q('search', '');
        $sql = "SELECT u.*, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id=u.department_id WHERE u.is_active=1";
        if ($s) { $stmt = $db->prepare($sql." AND (u.full_name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ?) ORDER BY u.full_name LIMIT 200"); $stmt->execute(["%$s%","%$s%","%$s%"]); }
        else    { $stmt = $db->query($sql." ORDER BY full_name LIMIT 200"); }
        ok($stmt->fetchAll());
    }
    if ($res === 'locations') {
        $siteId = q('site_id');
        if ($siteId) { $stmt = $db->prepare("SELECT l.*, s.name AS site_name FROM locations l JOIN sites s ON s.id=l.site_id WHERE l.site_id=? AND l.is_active=1 ORDER BY l.name"); $stmt->execute([(int)$siteId]); }
        else         { $stmt = $db->query("SELECT l.*, s.name AS site_name FROM locations l LEFT JOIN sites s ON s.id=l.site_id WHERE l.is_active=1 ORDER BY l.name"); }
        ok($stmt->fetchAll());
    }
    ok($db->query("SELECT * FROM `$res` WHERE is_active=1 ORDER BY name")->fetchAll());
}

function lookup_create(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $res = q('res', '');
    $allowed = ['categories','departments','sites','locations','vendors','users'];
    if (!in_array($res, $allowed)) fail("Unknown resource.");
    $b = body();
    if (empty($b['name'])) fail('Name is required.');
    $fields = ['categories'=>['name','description'],'departments'=>['name','cost_center'],'sites'=>['name','address'],'locations'=>['name','description','site_id'],'vendors'=>['name','contact_name','email','phone','address','sla_notes'],'users'=>['employee_id','full_name','email','phone','department_id','role']];
    $data = [];
    foreach ($fields[$res] ?? ['name'] as $col) { if (isset($b[$col])) $data[$col] = $b[$col]; }
    $id = db_insert($res, $data);
    ok(['id' => $id], ucfirst($res).' created.', 201);
}

function lookup_update(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $res = q('res', ''); $id = (int)q('id');
    $allowed = ['categories','departments','sites','locations','vendors','users'];
    if (!in_array($res, $allowed)) fail("Unknown resource.");
    if (!$id) fail('ID required.');
    $b = body();
    $fields = ['categories'=>['name','description'],'departments'=>['name','cost_center'],'sites'=>['name','address'],'locations'=>['name','description','site_id'],'vendors'=>['name','contact_name','email','phone','address','sla_notes'],'users'=>['employee_id','full_name','email','phone','department_id','role']];
    $data = [];
    foreach ($fields[$res] ?? ['name'] as $col) { if (array_key_exists($col, $b)) $data[$col] = $b[$col]; }
    db_update($res, $id, $data);
    ok(['id' => $id], ucfirst($res).' updated.');
}

function lookup_delete(): never {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST required.', 405);
    $res = q('res', ''); $id = (int)q('id');
    $allowed = ['categories','departments','sites','locations','vendors','users'];
    if (!in_array($res, $allowed)) fail("Unknown resource.");
    if (!$id) fail('ID required.');
    db()->prepare("UPDATE `$res` SET is_active=0 WHERE id=?")->execute([$id]);
    ok(null, ucfirst($res).' deactivated.');
}

// ════════════════════════════════════════════════════════════
//  DB HELPERS
// ════════════════════════════════════════════════════════════
function db_insert(string $table, array $data): int {
    $cols  = array_keys($data);
    $ph    = implode(',', array_fill(0, count($cols), '?'));
    $sql   = "INSERT INTO `$table` (`" . implode('`,`', $cols) . "`) VALUES ($ph)";
    $stmt  = db()->prepare($sql);
    $stmt->execute(array_values($data));
    return (int)db()->lastInsertId();
}

function db_update(string $table, int $id, array $data): void {
    if (empty($data)) return;
    $sets = implode(', ', array_map(fn($c) => "`$c`=?", array_keys($data)));
    $stmt = db()->prepare("UPDATE `$table` SET $sets WHERE id=?");
    $stmt->execute([...array_values($data), $id]);
}

function stock_adjust_level(int $itemId, int $locId, float $delta): void {
    db()->prepare("INSERT INTO stock_levels (item_id,location_id,quantity_on_hand) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity_on_hand=quantity_on_hand+?")->execute([$itemId,$locId,$delta,$delta]);
}

function get_stock_qty(int $itemId, int $locId): float {
    $stmt = db()->prepare("SELECT quantity_on_hand FROM stock_levels WHERE item_id=? AND location_id=?");
    $stmt->execute([$itemId, $locId]);
    return (float)($stmt->fetchColumn() ?: 0);
}