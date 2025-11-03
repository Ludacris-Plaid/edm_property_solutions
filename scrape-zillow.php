<?php
// Lightweight placeholder endpoint for Zillow-like scraping.
// IMPORTANT: Direct scraping of Zillow may violate their Terms of Service.
// This endpoint returns demo data filtered by given parameters and shaped
// to match the site's expected leads format.

header('Content-Type: application/json');

// Allow only POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode([ 'error' => 'Method Not Allowed' ]);
  exit;
}

// Read params
$location = trim($_POST['location'] ?? '');
$min_price = isset($_POST['min_price']) && $_POST['min_price'] !== '' ? (float)$_POST['min_price'] : 0;
$max_price = isset($_POST['max_price']) && $_POST['max_price'] !== '' ? (float)$_POST['max_price'] : 99999999;
$beds = isset($_POST['beds']) && $_POST['beds'] !== '' ? (int)$_POST['beds'] : 0;
$baths = isset($_POST['baths']) && $_POST['baths'] !== '' ? (float)$_POST['baths'] : 0;
$max_days = isset($_POST['max_days']) && $_POST['max_days'] !== '' ? (int)$_POST['max_days'] : 365;
$type = trim($_POST['type'] ?? '');
$min_yield = isset($_POST['min_yield']) && $_POST['min_yield'] !== '' ? (float)$_POST['min_yield'] : 0;
$max_yield = isset($_POST['max_yield']) && $_POST['max_yield'] !== '' ? (float)$_POST['max_yield'] : 1000;
$min_l = isset($_POST['min_l']) && $_POST['min_l'] !== '' ? (float)$_POST['min_l'] : 0;
$min_c = isset($_POST['min_c']) && $_POST['min_c'] !== '' ? (float)$_POST['min_c'] : 0;
$min_g = isset($_POST['min_g']) && $_POST['min_g'] !== '' ? (float)$_POST['min_g'] : 0;

// Demo inventory generator
function random_street() {
  $streets = ['Oak','Pine','Cedar','Maple','Elm','Birch','Willow','Aspen','Hillcrest','Sunset','Ridge','Valley','River','Lake','Forest'];
  $suffix = ['St','Ave','Rd','Blvd','Ln','Dr','Ct'];
  return rand(100,9999) . ' ' . $streets[array_rand($streets)] . ' ' . $suffix[array_rand($suffix)];
}

function random_type() {
  $types = ['Single Family','Condo','Townhouse','Multi-Family','Land'];
  return $types[array_rand($types)];
}

function random_phone() {
  return '(' . rand(200,989) . ') ' . rand(200,989) . '-' . str_pad((string)rand(0,9999), 4, '0', STR_PAD_LEFT);
}

$city = $location !== '' ? $location : 'Sample City, ST';

$items = [];
$count = 25; // demo size
for ($i=0; $i<$count; $i++) {
  $price = rand(180000, 950000);
  $avg = (int)round($price * (0.95 + (mt_rand(-5,5)/100)));
  $days = rand(1, 120);
  $yld = round(mt_rand(40, 120) / 10, 1); // 4% - 12%
  $loc = round(mt_rand(60, 95) / 100, 2);
  $cond = round(mt_rand(55, 90) / 100, 2);
  $growth = round(mt_rand(50, 85) / 100, 2);
  $bd = rand(1, 6);
  $ba = rand(1, 5);

  $items[] = [
    'address' => random_street() . ', ' . $city,
    'type' => random_type(),
    'price' => $price,
    'local_avg_price' => $avg,
    'days_listed' => $days,
    'yield_percent' => $yld,
    'location_score' => $loc,
    'condition_score' => $cond,
    'growth_score' => $growth,
    'beds' => $bd,
    'baths' => $ba,
    'contact' => random_phone(),
    'link' => 'https://www.zillow.com/homedetails/demo-' . ($i+1),
  ];
}

// Filter
$filtered = array_values(array_filter($items, function($x) use ($min_price, $max_price, $beds, $baths, $max_days, $type, $min_yield, $max_yield, $min_l, $min_c, $min_g) {
  $okPrice = ($x['price'] >= $min_price) && ($x['price'] <= $max_price);
  $okBeds = ($beds <= 0) ? true : ($x['beds'] >= $beds);
  $okBaths = ($baths <= 0) ? true : ($x['baths'] >= $baths);
  $okDays = ($x['days_listed'] <= $max_days);
  $okType = ($type === '') ? true : (strcasecmp($x['type'], $type) === 0);
  $okYield = ($x['yield_percent'] >= $min_yield) && ($x['yield_percent'] <= $max_yield);
  $okL = ($x['location_score'] >= $min_l);
  $okC = ($x['condition_score'] >= $min_c);
  $okG = ($x['growth_score'] >= $min_g);
  return $okPrice && $okBeds && $okBaths && $okDays && $okType && $okYield && $okL && $okC && $okG;
}));

// Output
http_response_code(200);
// For consistency with leads.json shape, just return the array of objects
// Admin page will compute scores and merge.
echo json_encode($filtered);
