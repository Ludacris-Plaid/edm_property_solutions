<?php
// PHP gateway to invoke Python httpx+parsel Zillow scraper.
// POST fields: zillow_url, zguid, jsessionid, (optional) proxy_endpoint, proxy_user, proxy_pass
header('Content-Type: application/json');
// CORS for development; tighten for production
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error'=>'Method Not Allowed']); exit; }

$zurl = $_POST['zillow_url'] ?? '';
$zurls = $_POST['zillow_urls'] ?? '';
$zguid = $_POST['zguid'] ?? '';
$jsess = $_POST['jsessionid'] ?? '';
$proxy_endpoint = $_POST['proxy_endpoint'] ?? '';
$proxy_user = $_POST['proxy_user'] ?? '';
$proxy_pass = $_POST['proxy_pass'] ?? '';
$delay_ms = $_POST['delay_ms'] ?? '';

if ((!$zurl && !$zurls) || !$zguid || !$jsess){ http_response_code(400); echo json_encode(['error'=>'Missing required inputs']); exit; }

$payload = [
  'zillow_url' => $zurl,
  'zillow_urls' => $zurls,
  'zguid' => $zguid,
  'jsessionid' => $jsess,
  'proxy_endpoint' => $proxy_endpoint,
  'proxy_user' => $proxy_user,
  'proxy_pass' => $proxy_pass,
  'delay_ms' => $delay_ms,
];

$candidates = [
  __DIR__ . '/.venv_py/bin/python',
  __DIR__ . '/.venv_py/bin/python3',
  __DIR__ . '/.venv/bin/python',
  __DIR__ . '/.venv/bin/python3',
  __DIR__ . '/venv/bin/python',
  __DIR__ . '/venv/bin/python3',
];
$py = 'python3';
foreach ($candidates as $cand) { if (file_exists($cand)) { $py = $cand; break; } }
$cmd = $py . ' python_scraper/scrape_zillow.py';
$descriptorspec = [
  0 => ['pipe', 'r'],
  1 => ['pipe', 'w'],
  2 => ['pipe', 'w'],
];

$env = $_ENV;
// Prepend venv bin to PATH and expose VIRTUAL_ENV (best-effort)
$venv_dir = null;
foreach ([__DIR__.'/.venv_py', __DIR__.'/.venv', __DIR__.'/venv'] as $vd) { if (is_dir($vd)) { $venv_dir = $vd; break; } }
if ($venv_dir) {
  $venv_bin = $venv_dir . '/bin';
  $env['VIRTUAL_ENV'] = $venv_dir;
  $env['PATH'] = $venv_bin . PATH_SEPARATOR . (getenv('PATH') ?: '');
}

$process = proc_open($cmd, $descriptorspec, $pipes, __DIR__, $env);
if (!is_resource($process)) { http_response_code(500); echo json_encode(['error'=>'Failed to start python scraper']); exit; }

fwrite($pipes[0], json_encode($payload));
fflush($pipes[0]);
fclose($pipes[0]);

$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);
foreach ($pipes as $p) { if (is_resource($p)) fclose($p); }
$exit = proc_close($process);

if ($exit !== 0) {
  http_response_code(500);
  echo json_encode(['error'=>'Python scraper error','py'=>$py,'details'=> substr($stderr,0,4000)]);
  exit;
}

$data = json_decode($stdout, true);
if (!is_array($data)) { http_response_code(500); echo json_encode(['error'=>'Invalid python response']); exit; }

echo json_encode($data);
