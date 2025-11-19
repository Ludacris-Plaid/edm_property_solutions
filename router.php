<?php
// router.php

// Load .env file (if present) to populate environment variables for built-in PHP server
(function() {
    $envPath = __DIR__ . '/.env';
    if (!is_file($envPath)) return;
    $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$lines) return;
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
        [$k, $v] = array_map('trim', explode('=', $line, 2));
        // remove optional wrapping quotes
        if (strlen($v) >= 2 && (($v[0] === '"' && substr($v, -1) === '"') || ($v[0] === "'" && substr($v, -1) === "'"))) {
            $v = substr($v, 1, -1);
        }
        // final trim
        $v = trim($v);
        if ($k !== '') {
            putenv($k . '=' . $v);
            $_ENV[$k] = $v;
        }
    }
})();

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = rtrim($path, '/');
if ($path === '') { $path = '/'; }
$ext = pathinfo($path, PATHINFO_EXTENSION);

// ============== API: Zillow Search Proxy (RapidAPI) ==============
if (strpos($path, '/api/zillow-search') === 0) {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');

    $payload = json_decode(file_get_contents('php://input'), true) ?: [];

    $location = trim($payload['location'] ?? '');
    $homeStatus = trim($payload['home_status'] ?? 'FOR_SALE');
    $sort = trim($payload['sort'] ?? 'DEFAULT');
    $listingType = trim($payload['listing_type'] ?? 'BY_AGENT');
    $page = (int)($payload['page'] ?? 1);

    $rapidKey = trim(getenv('RAPIDAPI_ZILLOW_KEY') ?: (getenv('RAPIDAPI_KEY') ?: ''));
    $rapidHost = trim(getenv('RAPIDAPI_ZILLOW_HOST') ?: 'real-time-zillow-data.p.rapidapi.com');
    $rapidEndpoint = trim(getenv('RAPIDAPI_ZILLOW_ENDPOINT') ?: '/search');

    if ($rapidKey === '') {
        echo json_encode(['error' => 'Missing RapidAPI Zillow key']);
        exit;
    }

    $query = array_filter([
        'location' => $location,
        'home_status' => $homeStatus,
        'sort' => $sort,
        'listing_type' => $listingType,
        'page' => max(1, $page),
    ], fn($v) => $v !== '' && $v !== null);

    $url = 'https://' . $rapidHost . $rapidEndpoint . '?' . http_build_query($query);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'x-rapidapi-key: ' . $rapidKey,
            'x-rapidapi-host: ' . $rapidHost,
            'accept: application/json'
        ],
    ]);

    $resp = curl_exec($ch);
    $err = curl_error($ch);
    $httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err) {
        http_response_code(502);
        echo json_encode(['error' => 'RapidAPI request failed', 'detail' => $err]);
        exit;
    }

    $json = json_decode($resp, true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($json)) {
        $list = [];
        foreach (['data','results','props','properties','list'] as $k) {
            if (isset($json[$k]) && is_array($json[$k])) { $list = $json[$k]; break; }
        }
        if (empty($list) && isset($json[0])) $list = $json;

        if (!empty($list)) {
            $out = [];
            foreach ($list as $idx => $it) {
                $id = $it['zpid'] ?? $it['id'] ?? ('z_' . $idx . '_' . time());
                $addr = $it['address'] ?? '';
                if (is_array($addr)) {
                    $addr = trim(($addr['streetAddress'] ?? '') . ' ' . ($addr['city'] ?? '') . ', ' . ($addr['state'] ?? ''));
                }
                $city = $it['city'] ?? ($it['address']['city'] ?? '');
                $type = $it['homeType'] ?? '';
                $status = $it['homeStatus'] ?? '';
                $price = $it['price'] ?? 0;
                $beds = $it['bedrooms'] ?? null;
                $baths = $it['bathrooms'] ?? null;
                $livingArea = $it['livingArea'] ?? null;
                $yearBuilt = $it['yearBuilt'] ?? null;
                $zipcode = $it['zipcode'] ?? null;
                $dom = $it['daysOnZillow'] ?? 0;
                if ($dom < 0) { $dom = 0; }
                $currency = $it['currency'] ?? null;
                $detailUrl = $it['detailUrl'] ?? null;
                $img = $it['imgSrc'] ?? null;

                // Alberta-only filter heuristics
                $abCities = ['Calgary','Edmonton','Red Deer','Lethbridge','Medicine Hat','Grande Prairie','Airdrie','St. Albert','Sherwood Park','Fort McMurray','Spruce Grove','Leduc','Okotoks','Cochrane','Camrose','Brooks','Lloydminster','Chestermere','Canmore','Banff','Strathcona County','Stony Plain','Fort Saskatchewan','Sylvan Lake','Wetaskiwin','Parkland County','Beaumont','Strathmore','High River','Hinton','Jasper','Rocky Mountain House'];
                $isAB = in_array($city, $abCities, true) || stripos($addr, 'Alberta') !== false || stripos($addr, ', AB') !== false;
                if (!$isAB) { continue; }

                $priceDisplay = null;
                if ($currency && is_numeric($price)) {
                    $priceDisplay = $currency . ' $' . number_format((float)$price, 0, '.', ',');
                } elseif (!is_numeric($price)) {
                    $priceDisplay = (string)($it['price'] ?? '');
                }

                $out[] = [
                    'id' => $id,
                    'mlsNumber' => $it['zpid'] ?? null,
                    'address' => $addr,
                    'city' => $city,
                    'type' => $type,
                    'price' => (int)$price,
                    'priceDisplay' => $priceDisplay,
                    'beds' => $beds,
                    'baths' => $baths,
                    'status' => $status,
                    'daysOnMarket' => (int)$dom,
                    'remarks' => $it['description'] ?? '',
                    'detailUrl' => $detailUrl,
                    'imageUrl' => $img,
                    'currency' => $currency,
                    'livingArea' => $livingArea,
                    'yearBuilt' => $yearBuilt,
                    'zipcode' => $zipcode
                ];
            }
            http_response_code($httpStatus ?: 200);
            echo json_encode(['meta' => ['total' => count($out)], 'data' => $out]);
            exit;
        }
    }

    http_response_code($httpStatus ?: 200);
    echo json_encode(['error' => 'Unexpected Zillow response', 'snippet' => substr($resp ?? '', 0, 500)]);
    exit;
}

// ============== API: Distressed Search Proxy (RapidAPI) ==============
if (strpos($path, '/api/distressed-search') === 0) {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');

    $payload = json_decode(file_get_contents('php://input'), true) ?: [];

    $city = isset($payload['city']) ? trim($payload['city']) : '';
    $propertyType = isset($payload['propertyType']) ? trim($payload['propertyType']) : '';
    $priceRange = isset($payload['priceRange']) ? trim($payload['priceRange']) : '';
    $filters = isset($payload['filters']) && is_array($payload['filters']) ? $payload['filters'] : [];
    $page = isset($payload['page']) ? (int)$payload['page'] : 1;
    $perPage = isset($payload['perPage']) ? (int)$payload['perPage'] : 25;

    // Build keyword string based on distress toggles
    $kw = [];
    if (!empty($filters['probate'])) $kw[] = 'probate|estate sale|executor';
    if (!empty($filters['foreclosure'])) $kw[] = 'foreclosure|judicial sale|court ordered|bank owned';
    if (!empty($filters['asIs'])) $kw[] = 'as is|as-is where-is|handyman special|needs tlc|fixer';
    if (!empty($filters['distressed'])) $kw[] = 'distressed|motivated seller|must sell';
    $keywords = trim(implode(' ', $kw));

    // Parse price range
    $priceMin = '';
    $priceMax = '';
    if ($priceRange !== '') {
        if (strpos($priceRange, '-') !== false) {
            list($priceMin, $priceMax) = array_map('intval', explode('-', $priceRange, 2));
        } else {
            $priceMin = (int)$priceRange; // 1000000+
        }
    }

    // RapidAPI configuration (user must set these)
    $rapidKey = getenv('RAPIDAPI_KEY') ?: '';
    $rapidHost = getenv('RAPIDAPI_HOST') ?: '';
    $rapidEndpoint = getenv('RAPIDAPI_ENDPOINT') ?: '';
    // Example values you can set in your env (do not hardcode here):
    // RAPIDAPI_HOST=realty-in-ca.p.rapidapi.com
    // RAPIDAPI_ENDPOINT=/listings

    // If not configured, return sample data so frontend still works
    if ($rapidKey === '' || $rapidHost === '' || $rapidEndpoint === '') {
        $sample = [
            'meta' => ['source' => 'sample', 'page' => $page, 'perPage' => $perPage, 'total' => 1],
            'data' => [[
                'id' => 'sample-' . time(),
                'address' => '1234 Distressed St',
                'city' => $city ?: 'Edmonton',
                'type' => $propertyType ?: 'House',
                'price' => 299000,
                'status' => !empty($filters['foreclosure']) ? 'Foreclosure' : (!empty($filters['probate']) ? 'Probate' : (!empty($filters['asIs']) ? 'As-Is' : 'Distressed')),
                'daysOnMarket' => 45,
                'remarks' => 'Bank-owned property in need of repairs.'
            ]]
        ];
        echo json_encode($sample);
        exit;
    }

    // Provider-specific mapping for realty-in-ca list-residential
    // Alberta bounding box (approx): lat 49.0 to 60.0, lon -120.0 to -110.0
    $alberta = [
        'LatitudeMax' => 60.0,
        'LatitudeMin' => 49.0,
        'LongitudeMax' => -110.0,
        'LongitudeMin' => -120.0,
    ];

    // Base query for this endpoint
    $query = array_merge($alberta, [
        'CurrentPage' => max(1, $page),
        'RecordsPerPage' => max(1, $perPage),
        'SortOrder' => 'A', // ascending
        'SortBy' => 1,      // provider-defined; 1 commonly means by date/price
        'CultureId' => 1,
        'NumberOfDays' => 0,
        'BedRange' => '0-0',
        'BathRange' => '0-0',
        'RentMin' => 0,
    ]);

    // If price range provided, attempt to include provider params if supported
    if ($priceMin !== '' || $priceMax !== '') {
        // Some variants use PriceMin/PriceMax or MinPrice/MaxPrice
        if ($priceMin !== '') $query['PriceMin'] = (int)$priceMin;
        if ($priceMax !== '') $query['PriceMax'] = (int)$priceMax;
    }

    // Property type hint (provider may or may not support it here)
    if ($propertyType !== '') {
        $query['PropertyType'] = $propertyType;
    }

    $url = 'https://' . $rapidHost . $rapidEndpoint . '?' . http_build_query(array_filter($query, fn($v) => $v !== '' && $v !== null));

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'x-rapidapi-key: ' . $rapidKey,
            'x-rapidapi-host: ' . $rapidHost,
            'accept: application/json'
        ],
    ]);

    $resp = curl_exec($ch);
    $err = curl_error($ch);
    $httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err) {
        http_response_code(502);
        echo json_encode(['error' => 'RapidAPI request failed', 'detail' => $err]);
        exit;
    }

    // Try to normalize to { meta, data } => each item with id,address,city,type,price,status,daysOnMarket
    $json = json_decode($resp, true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($json)) {
        // Find list array in common fields
        $list = [];
        foreach (['data','Results','Data','Properties','Listings','results'] as $k) {
            if (isset($json[$k]) && is_array($json[$k])) { $list = $json[$k]; break; }
        }
        if (empty($list) && isset($json[0])) {
            $list = $json; // root array
        }

        if (!empty($list) && is_array($list)) {
            $out = [];
            foreach ($list as $idx => $it) {
                // Restrict to Alberta only
                $province = $it['ProvinceName'] ?? ($it['Property']['Address']['Province'] ?? null);
                if ($province && strcasecmp($province, 'Alberta') !== 0) {
                    continue;
                }

                // Realtor API specific fields
                $prop = $it['Property'] ?? [];
                $addrObj = $prop['Address'] ?? ($it['Address'] ?? []);
                $addrText = '';
                if (is_string($addrObj)) {
                    $addrText = $addrObj;
                } elseif (is_array($addrObj)) {
                    $addrText = $addrObj['AddressText'] ?? '';
                    if (!$addrText) {
                        $addrText = trim(($addrObj['StreetAddress'] ?? '') . ' ' . ($addrObj['City'] ?? '') . ' ' . ($addrObj['Province'] ?? ''));
                    }
                }

                // Derive city: after the last '|' take the part before the first ','
                $city = '';
                if ($addrText) {
                    $afterPipe = str_contains($addrText, '|') ? substr($addrText, strrpos($addrText, '|') + 1) : $addrText;
                    $city = trim(strtok($afterPipe, ','));
                }

                // Price: prefer numeric unformatted value; also capture display string
                $priceRaw = $prop['PriceUnformattedValue'] ?? $it['PriceUnformattedValue'] ?? $it['price'] ?? $it['Price'] ?? 0;
                $priceNum = (int)round((float)$priceRaw);
                $priceDisplay = $prop['Price'] ?? ($prop['ShortValue'] ?? null);

                // Beds/Baths if present
                $building = $it['Building'] ?? [];
                $beds = $building['BedroomsTotal'] ?? $building['Bedrooms'] ?? null;
                $baths = $building['BathroomsTotal'] ?? $building['BathroomTotal'] ?? $building['Bathrooms'] ?? null;

                $type = $prop['Type'] ?? ($it['PropertyType'] ?? '');
                $status = $it['Status'] ?? ($it['StatusId'] ?? '');
                if (is_numeric($status)) {
                    $status = ((int)$status === 1) ? 'Active' : (string)$status;
                }
                $dom = $it['DaysOnMarket'] ?? $it['Dom'] ?? 0;
                $id = $it['Id'] ?? $it['ListingID'] ?? ('prov-' . $idx . '-' . time());

                $remarks = $it['PublicRemarks'] ?? ($it['Remarks'] ?? '');

                $out[] = [
                    'id' => $id,
                    'address' => $addrText ?: '',
                    'city' => $city,
                    'type' => (string)$type,
                    'price' => $priceNum,
                    'priceDisplay' => $priceDisplay,
                    'beds' => $beds !== null ? (int)$beds : null,
                    'baths' => $baths !== null ? (float)$baths : null,
                    'status' => (string)$status,
                    'daysOnMarket' => (int)$dom,
                    'remarks' => $remarks
                ];
            }

            $total = $json['total'] ?? $json['Total'] ?? ($json['Paging']['TotalRecords'] ?? null) ?? count($out);
            http_response_code($httpStatus ?: 200);
            echo json_encode(['meta' => ['total' => $total], 'data' => $out]);
            exit;
        }
    }

    // Fallback: ensure valid JSON
    http_response_code($status ?: 200);
    $snippet = substr($resp ?? '', 0, 500);
    echo json_encode([
        'error' => 'Upstream returned non-JSON or unexpected schema',
        'status' => $status,
        'snippet' => $snippet
    ]);
    exit;
}

// =================== Contact submit endpoint ===================
if ($path === '/contact-submit' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    // Accept form-encoded or JSON
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    $payload = [];
    if (stripos($contentType, 'application/json') !== false) {
        $payload = json_decode(file_get_contents('php://input'), true) ?: [];
    } else {
        $payload = $_POST ?: [];
    }
    $entry = [
        'name' => trim($payload['name'] ?? ''),
        'email' => trim($payload['email'] ?? ''),
        'phone' => trim($payload['phone'] ?? ''),
        'message' => trim($payload['message'] ?? ''),
        'ts' => date('c'),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
        'ua' => $_SERVER['HTTP_USER_AGENT'] ?? null
    ];
    // Basic validation
    if ($entry['name'] === '' || $entry['email'] === '' || $entry['message'] === '') {
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'Missing required fields']);
        exit;
    }
    // Ensure data dir
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
    $file = $dir . '/contact_messages.json';
    $arr = [];
    if (is_file($file)) {
        $raw = file_get_contents($file);
        $arr = json_decode($raw, true);
        if (!is_array($arr)) $arr = [];
    }
    $arr[] = $entry;
    file_put_contents($file, json_encode($arr, JSON_PRETTY_PRINT));
    echo json_encode(['ok'=>true]);
    exit;
}

// =================== Static file server below ===================
// Set proper MIME types
$mime_types = [
    'css' => 'text/css',
    'js' => 'application/javascript',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'svg' => 'image/svg+xml',
    'mp4' => 'video/mp4',
    'woff' => 'font/woff',
    'woff2' => 'font/woff2',
    'ttf' => 'font/ttf',
    'eot' => 'application/vnd.ms-fontobject',
    'otf' => 'font/otf',
    'json' => 'application/json',
    'csv' => 'text/csv'
];

if (array_key_exists($ext, $mime_types)) {
    $mime = $mime_types[$ext];
    header("Content-Type: $mime");
}

// Serve the requested resource if it exists
if ($path !== '/' && file_exists(__DIR__ . $path) && is_file(__DIR__ . $path)) {
    return false; // Serve the file as-is
}

// Default document: index.html (homepage)
$default = '/index.html';
include __DIR__ . $default;