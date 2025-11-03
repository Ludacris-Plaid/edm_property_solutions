<?php
// Gateway to Node Playwright scraper. Reads POST params and passes JSON to node script.
// Requires: node + npm install (playwright) in scraper/ directory.
// Security: Do not log or echo proxy credentials.

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error'=>'Method Not Allowed']); exit; }

$payload = [
  'mode' => 'headless',
  'location' => $_POST['location'] ?? '',
  'min_price' => $_POST['min_price'] ?? '',
  'max_price' => $_POST['max_price'] ?? '',
  'beds' => $_POST['beds'] ?? '',
  'baths' => $_POST['baths'] ?? '',
  'max_days' => $_POST['max_days'] ?? '',
  'max_pages' => $_POST['max_pages'] ?? '10',
  'type' => $_POST['type'] ?? '',
  'min_yield' => $_POST['min_yield'] ?? '',
  'max_yield' => $_POST['max_yield'] ?? '',
  'min_l' => $_POST['min_l'] ?? '',
  'min_c' => $_POST['min_c'] ?? '',
  'min_g' => $_POST['min_g'] ?? '',
  'proxy_endpoint' => $_POST['proxy_endpoint'] ?? '',
  'proxy_user' => $_POST['proxy_user'] ?? '',
  'proxy_pass' => $_POST['proxy_pass'] ?? '',
  'proxy_rotate' => $_POST['proxy_rotate'] ?? '0',
];

$cmd = 'node scraper/scrape.mjs';
$descriptorspec = [
  0 => ['pipe', 'r'], // stdin
  1 => ['pipe', 'w'], // stdout
  2 => ['pipe', 'w'], // stderr
];

$process = proc_open($cmd, $descriptorspec, $pipes, __DIR__);
if (!is_resource($process)) { http_response_code(500); echo json_encode(['error'=>'Failed to start scraper']); exit; }

fwrite($pipes[0], json_encode($payload));
fclose($pipes[0]);

$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);
foreach ($pipes as $p) { if (is_resource($p)) fclose($p); }
$exit = proc_close($process);

if ($exit !== 0) {
  http_response_code(500);
  echo json_encode(['error'=>'Scraper failed', 'details'=> substr($stderr,0,4000)]);
  exit;
}

// Validate JSON output
$data = json_decode($stdout, true);
if (!is_array($data)) { http_response_code(500); echo json_encode(['error'=>'Invalid scraper response']); exit; }

echo json_encode($data);
