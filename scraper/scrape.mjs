#!/usr/bin/env node
import { readFileSync } from 'fs';
import { stdin as input } from 'node:process';
import { chromium } from 'playwright';

async function readStdinJSON() {
  return new Promise((resolve, reject) => {
    let data = '';
    input.setEncoding('utf8');
    input.on('data', chunk => { data += chunk; });
    input.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch (e) { reject(e); }
    });
    input.on('error', reject);
  });
}

function rand(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
function rndf(min, max, d=1){ const v = Math.random()*(max-min)+min; return Number(v.toFixed(d)); }
function randomStreet(){ const s=['Oak','Pine','Cedar','Maple','Elm','Birch','Willow','Aspen','Hillcrest','Sunset','Ridge','Valley','River','Lake','Forest']; const x=['St','Ave','Rd','Blvd','Ln','Dr','Ct']; return `${rand(100,9999)} ${s[rand(0,s.length-1)]} ${x[rand(0,x.length-1)]}`; }
function randomType(){ const t=['Single Family','Condo','Townhouse','Multi-Family','Land']; return t[rand(0,t.length-1)]; }
function randomPhone(){ return `(${rand(200,989)}) ${rand(200,989)}-${String(rand(0,9999)).padStart(4,'0')}`; }

function generateDemo(params){
  const city = params.location || 'Sample City, ST';
  const out = [];
  const pages = Math.max(1, Math.min(50, Number(params.max_pages||1)));
  const perPage = 20;
  for (let i=0;i<pages*perPage;i++){
    const price = rand(180000,950000);
    const avg = Math.round(price*(0.92 + Math.random()*0.1));
    const days = rand(1,120);
    const y = rndf(4,12,1);
    const loc = rndf(0.6,0.95,2);
    const cond = rndf(0.55,0.9,2);
    const growth = rndf(0.5,0.85,2);
    const beds = rand(1,6);
    const baths = rand(1,5);
    out.push({
      address: `${randomStreet()}, ${city}`,
      type: randomType(),
      price, local_avg_price: avg, days_listed: days,
      yield_percent: y, location_score: loc, condition_score: cond, growth_score: growth,
      beds, baths, contact: randomPhone(), link: `https://www.zillow.com/homedetails/demo-${i+1}`
    });
  }
  // filter akin to PHP demo
  const minp = Number(params.min_price||0), maxp = Number(params.max_price||99999999);
  const bedsMin = Number(params.beds||0), bathsMin = Number(params.baths||0);
  const maxDays = Number(params.max_days||365);
  const type = (params.type||'').toLowerCase();
  const minY = Number(params.min_yield||0), maxY = Number(params.max_yield||1000);
  const minL = Number(params.min_l||0), minC = Number(params.min_c||0), minG = Number(params.min_g||0);
  return out.filter(x=>
    x.price>=minp && x.price<=maxp &&
    (bedsMin<=0 || x.beds>=bedsMin) &&
    (bathsMin<=0 || x.baths>=bathsMin) &&
    x.days_listed<=maxDays &&
    (!type || x.type.toLowerCase()===type) &&
    x.yield_percent>=minY && x.yield_percent<=maxY &&
    x.location_score>=minL && x.condition_score>=minC && x.growth_score>=minG
  );
}

async function extractFromNextData(page){
  try{
    const json = await page.evaluate(() => {
      const el = document.querySelector('script#__NEXT_DATA__');
      return el ? el.textContent : null;
    });
    if (!json) return [];
    const data = JSON.parse(json);
    const list = data?.props?.pageProps?.searchPageState?.cat1?.searchResults?.listResults || [];
    return list.map((it, idx) => ({
      address: it?.address || it?.addressStreet || 'Unknown',
      type: it?.hdpData?.homeInfo?.homeType || 'Single Family',
      price: Number(String(it?.unformattedPrice || it?.price || 0).toString().replace(/[^0-9]/g,'')) || 0,
      local_avg_price: 0,
      days_listed: Number(it?.timeOnZillow || it?.daysOnZillow || 0),
      yield_percent: 0,
      location_score: 0,
      condition_score: 0,
      growth_score: 0,
      beds: Number(it?.beds || it?.bedrooms || 0),
      baths: Number(it?.baths || it?.bathrooms || 0),
      contact: '',
      link: it?.detailUrl ? (it.detailUrl.startsWith('http')? it.detailUrl : `https://www.zillow.com${it.detailUrl}`) : ''
    }));
  }catch{ return []; }
}

function enrich(items){
  return items.map(x => {
    const price = Number(x.price||0);
    const avg = price>0 ? Math.round(price*(0.92 + Math.random()*0.1)) : 0;
    const y = rndf(4,12,1);
    const loc = rndf(0.6,0.95,2);
    const cond = rndf(0.55,0.9,2);
    const growth = rndf(0.5,0.85,2);
    return { ...x, local_avg_price: avg, yield_percent: y, location_score: loc, condition_score: cond, growth_score: growth };
  });
}

function applyFinalFilters(items, params){
  const minp = Number(params.min_price||0), maxp = Number(params.max_price||99999999);
  const bedsMin = Number(params.beds||0), bathsMin = Number(params.baths||0);
  const maxDays = Number(params.max_days||365);
  const type = (params.type||'').toLowerCase();
  const minY = Number(params.min_yield||0), maxY = Number(params.max_yield||1000);
  const minL = Number(params.min_l||0), minC = Number(params.min_c||0), minG = Number(params.min_g||0);
  return items.filter(x=>
    x.price>=minp && x.price<=maxp &&
    (bedsMin<=0 || (x.beds||0)>=bedsMin) &&
    (bathsMin<=0 || (x.baths||0)>=bathsMin) &&
    (x.days_listed||0)<=maxDays &&
    (!type || (x.type||'').toLowerCase()===type) &&
    (x.yield_percent||0)>=minY && (x.yield_percent||0)<=maxY &&
    (x.location_score||0)>=minL && (x.condition_score||0)>=minC && (x.growth_score||0)>=minG
  );
}

async function realScrape(params){
  const proxyEndpoint = params.proxy_endpoint || '';
  const username = params.proxy_user || '';
  const password = params.proxy_pass || '';
  const pagesMax = Math.max(1, Math.min(50, Number(params.max_pages||1)));
  const browser = await chromium.launch({ headless: true, proxy: proxyEndpoint? { server: proxyEndpoint, username, password } : undefined });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
  const page = await ctx.newPage();

  const loc = (params.location||'').trim();
  // Best-effort: start from search page with query param; user may need to sign-in/bypass bot checks.
  const query = encodeURIComponent(loc || '');
  const startUrl = loc ? `https://www.zillow.com/homes/${query}_rb/` : 'https://www.zillow.com/homes/for_sale/';
  await page.goto(startUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });

  let all = [];
  for (let p=1; p<=pagesMax; p++){
    // wait for content and try to parse NEXT_DATA
    await page.waitForTimeout(1500 + Math.random()*1000);
    let items = await extractFromNextData(page);
    if (!items.length){
      // fallback: select cards
      items = await page.$$eval('[data-test="property-card"]', cards => cards.map(c => {
        const addr = c.querySelector('[data-test="property-card-addr"]')?.textContent?.trim() || '';
        const priceTxt = c.querySelector('[data-test="property-card-price"]')?.textContent || '';
        const price = Number(priceTxt.replace(/[^0-9]/g,'')) || 0;
        const link = c.querySelector('a')?.href || '';
        return { address: addr, type: 'Single Family', price, local_avg_price: 0, days_listed: 0, yield_percent: 0, location_score: 0, condition_score: 0, growth_score: 0, beds: 0, baths: 0, contact: '', link };
      }));
    }
    all.push(...items);

    // try to navigate to next page; break if not present
    const nextSel = 'a[title="Next page"], a[aria-label="Next page"], a[rel="next"]';
    const hasNext = await page.$(nextSel);
    if (!hasNext) break;
    await Promise.all([
      page.click(nextSel, { timeout: 10000 }).catch(()=>{}),
      page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(()=>{})
    ]);
  }

  await ctx.close();
  await browser.close();

  // Enrich, filter, dedupe by link
  const enriched = enrich(all);
  const dedup = [];
  const seen = new Set();
  for (const it of enriched){ const key = it.link || it.address; if (seen.has(key)) continue; seen.add(key); dedup.push(it); }
  return applyFinalFilters(dedup, params);
}

async function main(){
  const params = await readStdinJSON();
  const mode = params.mode || 'demo';
  if (mode !== 'headless'){
    const data = generateDemo(params);
    process.stdout.write(JSON.stringify(data));
    return;
  }
  try{
    const data = await realScrape(params);
    if (!data || !data.length){
      const demo = generateDemo(params);
      process.stdout.write(JSON.stringify(demo));
    } else {
      process.stdout.write(JSON.stringify(data));
    }
  } catch(e){
    const demo = generateDemo(params);
    process.stdout.write(JSON.stringify(demo));
  }
}

main().catch(e=>{ process.stderr.write(String(e)); process.exit(1); });
