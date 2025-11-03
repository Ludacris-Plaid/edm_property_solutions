<?php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = $_POST;
    $log = date('Y-m-d H:i:s') . " - " . print_r($data, true) . "\n";
    file_put_contents('leads_log.txt', $log, FILE_APPEND);
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Lead logged! Check leads_log.txt'
    ]);
} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
?>