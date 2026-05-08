<?php
// db.php — Single database connector (shared by all modules)
// Change only DB_NAME / DB_USER / DB_PASS as needed.

define('DB_HOST',    'localhost');
define('DB_NAME',    'SIAA');
define('DB_USER',    'root');
define('DB_PASS',    '');
define('DB_CHARSET', 'utf8mb4');

/**
 * Returns a shared PDO instance.
 * Usage anywhere: $pdo = db();
 */
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, DB_CHARSET);
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            header('Content-Type: application/json');
            die(json_encode(['success' => false, 'message' => 'Database connection failed. Check db.php credentials.']));
        }
    }
    return $pdo;
}