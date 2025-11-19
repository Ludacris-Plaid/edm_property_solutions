import sys
import json
import asyncio
import random
import re
import httpx
from parsel import Selector

UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]

BASE_HEADERS = {
    "accept-language": "en-US,en;q=0.9",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "referer": "https://www.zillow.com/",
    "origin": "https://www.zillow.com",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
}


def build_address(p: dict) -> str:
    parts = [
        p.get("streetAddress") or p.get("address") or "",
        ", ".join(x for x in [p.get("city"), p.get("state"), p.get("zipcode")] if x),
    ]
    return ", ".join(s for s in parts if s).strip(", ")


async def fetch_page(url: str, cookies: dict, proxies: dict | None, user_agent: str) -> str:
    headers = {**BASE_HEADERS, "user-agent": user_agent}
    # First attempt with HTTP/2
    async with httpx.AsyncClient(http2=True, headers=headers, cookies=cookies, timeout=20, proxies=proxies) as client:
        resp = await client.get(url)
        if resp.status_code == 200:
            return resp.text
        # Retry once on 403 with HTTP/1.1 and tweaked headers / UA
    alt_headers = {**headers, "accept": "*/*"}
    alt_ua = random.choice([ua for ua in UA_POOL if ua != user_agent] or UA_POOL)
    alt_headers["user-agent"] = alt_ua
    async with httpx.AsyncClient(http2=False, headers=alt_headers, cookies=cookies, timeout=25, proxies=proxies) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise RuntimeError(f"Failed to fetch {url}: HTTP {resp.status_code}")
        return resp.text


def parse_property_data(page_content: str) -> dict:
    sel = Selector(page_content)
    raw = sel.css("script#__NEXT_DATA__::text").get()
    if not raw:
        raise RuntimeError("Couldn't find __NEXT_DATA__ block")
    parsed = json.loads(raw)
    gdp_client_cache_str = parsed["props"]["pageProps"]["componentProps"]["gdpClientCache"]
    gdp_client_cache = json.loads(gdp_client_cache_str)
    # Take first key
    key = next(iter(gdp_client_cache))
    return gdp_client_cache[key]["property"]


def parse_search_results(page_content: str) -> list[dict]:
    sel = Selector(page_content)
    raw = sel.css("script#__NEXT_DATA__::text").get()
    if not raw:
        raise RuntimeError("Couldn't find __NEXT_DATA__ block")
    data = json.loads(raw)
    try:
        cat1 = data["props"]["pageProps"]["searchPageState"]["cat1"]["searchResults"]
    except Exception as e:
        raise RuntimeError("Couldn't locate search results in __NEXT_DATA__") from e
    results = cat1.get("listResults") or []
    rows: list[dict] = []
    for it in results:
        addr = it.get("address") or it.get("addressStreet") or ""
        price = it.get("unformattedPrice")
        if price is None:
            # try to parse from formatted string
            ptxt = it.get("price") or ""
            m = re.search(r"[0-9][0-9,\.]+", ptxt)
            price = int(m.group(0).replace(",", "")) if m else 0
        days = it.get("daysOnZillow") or it.get("timeOnZillow")
        link = it.get("detailUrl") or ""
        if link.startswith("/"):
            link = "https://www.zillow.com" + link
        rows.append({
            "address": addr,
            "type": it.get("hdpData", {}).get("homeInfo", {}).get("homeType") or it.get("homeType") or "",
            "price": price or 0,
            "local_avg_price": None,
            "days_listed": days or None,
            "yield_percent": None,
            "location_score": None,
            "condition_score": None,
            "growth_score": None,
            "contact": "",
            "link": link,
        })
    return rows


def map_to_rows(prop: dict, url: str) -> list[dict]:
    addr = build_address(prop)
    price = prop.get("price")
    home_type = prop.get("homeType") or prop.get("resoFacts", {}).get("homeType")
    days = prop.get("daysOnZillow") or prop.get("timeOnZillow")
    return [{
        "address": addr or "",
        "type": home_type or "",
        "price": price or 0,
        "local_avg_price": None,
        "days_listed": days or None,
        "yield_percent": None,
        "location_score": None,
        "condition_score": None,
        "growth_score": None,
        "contact": "",
        "link": url,
    }]


async def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        url = payload.get("zillow_url")
        urls_raw = payload.get("zillow_urls") or ""
        zguid = payload.get("zguid")
        jsessionid = payload.get("jsessionid")
        proxy_endpoint = payload.get("proxy_endpoint") or ""
        proxy_user = payload.get("proxy_user") or ""
        proxy_pass = payload.get("proxy_pass") or ""
        delay_ms = payload.get("delay_ms")
        if (not url and not urls_raw) or not zguid or not jsessionid:
            raise RuntimeError("Missing zillow_url(s), zguid, or jsessionid")

        cookies = {
            # Some setups name it zguid; set both for safety
            "zguid": zguid,
            "zuid": zguid,
            "JSESSIONID": jsessionid,
        }

        proxies = None
        if proxy_endpoint:
            # Build proxy URL with optional auth; support http(s) and socks5 schemes
            endpoint = proxy_endpoint.strip()
            has_scheme = re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", endpoint) is not None
            if not has_scheme:
                endpoint = "http://" + endpoint
            if proxy_user or proxy_pass:
                endpoint = endpoint.replace("://", f"://{proxy_user}:{proxy_pass}@", 1)
            proxy_url = endpoint
            # httpx accepts a single string for all protocols
            proxies = proxy_url

        # Build list of URLs
        urls: list[str] = []
        if url:
            urls = [url]
        if urls_raw:
            more = [u.strip() for u in urls_raw.split(",") if u.strip()]
            urls.extend(more)

        # Deduplicate while preserving order
        seen = set()
        ordered_urls = []
        for u in urls:
            if u not in seen:
                seen.add(u)
                ordered_urls.append(u)

        results: list[dict] = []
        for i, u in enumerate(ordered_urls):
            ua = random.choice(UA_POOL)
            html = await fetch_page(u, cookies, proxies, ua)
            page_rows: list[dict] = []
            try:
                # Try property details first
                prop = parse_property_data(html)
                page_rows = map_to_rows(prop, u)
            except Exception:
                # Fallback to search results parsing
                try:
                    page_rows = parse_search_results(html)
                except Exception as e:
                    raise
            results.extend(page_rows)
            # Delay if requested and more to go
            if delay_ms and i < len(ordered_urls) - 1:
                try:
                    d = max(0, int(delay_ms)) / 1000.0
                    await asyncio.sleep(d)
                except Exception:
                    pass

        sys.stdout.write(json.dumps(results))
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
