// Theme Toggle
const toggle = document.getElementById('theme-toggle');
const body = document.body;
const icon = toggle ? toggle.querySelector('i') : null;

if (toggle && icon) {
  toggle.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    body.classList.toggle('light-mode');
    icon.classList.toggle('fa-moon');
    icon.classList.toggle('fa-sun');
    localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
  });
  if (localStorage.getItem('theme') === 'dark') {
    body.classList.add('dark-mode'); body.classList.remove('light-mode');
    icon.classList.replace('fa-moon', 'fa-sun');
  }
}

// Login (optional on pages that include the modal)
const loginBtn = document.getElementById('admin-login-btn');
const loginModalEl = document.getElementById('loginModal');
const modal = loginModalEl && window.bootstrap ? new bootstrap.Modal(loginModalEl) : null;
if (loginBtn && modal) {
  loginBtn.addEventListener('click', () => modal.show());
}
const loginForm = document.getElementById('login-form');
if (loginForm && modal) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (document.getElementById('username').value === 'admin' && document.getElementById('password').value === 'chaos2025') {
      localStorage.setItem('adminLoggedIn', 'true');
      modal.hide();
      window.location.href = 'admin.html';
    } else {
      alert('Invalid credentials');
    }
  });
}

// Counter animation function (used when stats section reveals)
function startCounters(root = document) {
  root.querySelectorAll('.count').forEach(counter => {
    if (counter.dataset.started === 'true') return;
    counter.dataset.started = 'true';
    const target = +counter.getAttribute('data-target');
    const increment = Math.max(1, Math.floor(target / 200));
    const prefix = counter.getAttribute('data-prefix') || '';
    const suffix = counter.getAttribute('data-suffix') || '';
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) { current = target; clearInterval(timer); }
      counter.textContent = `${prefix}${Math.floor(current).toLocaleString()}${suffix}`;
    }, 10);
  });
}

// Reveal on scroll animations
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && revealEls.length) {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-visible');
        if (entry.target.classList.contains('stats-section')) {
          startCounters(entry.target);
        }
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => obs.observe(el));
} else {
  // Fallback
  revealEls.forEach(el => {
    el.classList.add('reveal-visible');
    if (el.classList.contains('stats-section')) startCounters(el);
  });
}

// Optional: smooth scroll for internal anchor links
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const targetId = a.getAttribute('href').slice(1);
    const target = document.getElementById(targetId);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Navbar solid on scroll (fixed-top)
const navbar = document.querySelector('nav.navbar');
const hero = document.querySelector('.hero-video');
function updateNavbar() {
  if (!navbar) return;
  const threshold = (hero ? hero.offsetHeight : 120) - 40;
  if (window.scrollY > threshold) {
    navbar.classList.add('navbar-scrolled');
    navbar.classList.remove('bg-transparent');
  } else {
    navbar.classList.remove('navbar-scrolled');
    navbar.classList.add('bg-transparent');
  }
}
window.addEventListener('scroll', updateNavbar, { passive: true });
window.addEventListener('load', () => {
  document.body.classList.add('with-fixed-nav');
  updateNavbar();
});

// -----------------------------
// Property Scoring + Carousel
// -----------------------------
function propertyScore({
  price,
  local_avg_price,
  days_listed,
  min_price,
  max_price,
  yield_percent,
  max_yield,
  location_score,
  condition_score,
  growth_score
}) {
  const P = 1 - (price - min_price) / Math.max(1, (max_price - min_price));
  const R = yield_percent / Math.max(1, max_yield);
  const L = clamp01(location_score);
  const C = clamp01(condition_score);
  const G = clamp01(growth_score);

  let score_raw = 0.4*P + 0.3*R + 0.15*L + 0.1*C + 0.05*G;
  if (price <= 0.8 * local_avg_price) score_raw += 0.2;
  if (days_listed > 30) score_raw += 0.1;
  score_raw = Math.min(score_raw, 1.0);
  const score_1_5 = 1 + score_raw * 4;
  return Math.round(score_1_5 * 100) / 100;
}

function clamp01(x){ return Math.max(0, Math.min(1, Number(x) || 0)); }

function starsHTML(score){
  const full = Math.floor(score);
  const half = score - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '<span class="score-stars">' +
    '★'.repeat(full) + (half? '☆' : '') + '·'.repeat(Math.max(0, empty-(half?0:0))) +
    '</span>';
}

async function buildCarouselFromLeads() {
  const indicators = document.getElementById('propertyCarouselIndicators');
  const inner = document.getElementById('propertyCarouselInner');
  if (!indicators || !inner) return;
  try {
    const res = await fetch('./leads.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('leads.json not ok: '+res.status);
    const leads = await res.json();
    if (!Array.isArray(leads) || !leads.length) return;

    // Compute min/max price from dataset
    const prices = leads.map(l => Number(l.price) || 0).filter(x => x > 0);
    const min_price = Math.max(50000, Math.min(...prices));
    const max_price = Math.max(...prices) || (min_price + 1);

    leads.forEach((lead, idx) => {
      const price = Number(lead.price) || Math.round((Number(lead.local_avg_price)||350000)*0.7);
      const local_avg_price = Number(lead.local_avg_price) || Math.round(price/0.7);
      const days_listed = Number(lead.days_listed) || (15 + (idx*7)%60);
      const yield_percent = (lead.yield_percent != null ? Number(lead.yield_percent) : 6);
      const max_yield = 12;
      const location_score = lead.location_score != null ? Number(lead.location_score) : 0.65;
      const condition_score = lead.condition_score != null ? Number(lead.condition_score) : 0.6;
      const growth_score = lead.growth_score != null ? Number(lead.growth_score) : 0.6;

      const score = propertyScore({ price, local_avg_price, days_listed, min_price, max_price, yield_percent, max_yield, location_score, condition_score, growth_score });

      // Choose image: prefer lead.image, else first image_urls element, parse out url if markdown-like
      let img = lead.image || '';
      if ((!img || img.length < 5) && Array.isArray(lead.image_urls) && lead.image_urls.length) {
        const raw = String(lead.image_urls[0]);
        const match = raw.match(/https?:[^\s\)]+/);
        img = match ? match[0] : raw;
      }
      if (!img) {
        img = 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?q=80&w=1600&auto=format&fit=crop';
      }

      const slide = document.createElement('div');
      slide.className = 'carousel-item' + (idx===0? ' active':'');
      slide.innerHTML = `
        <div class="row justify-content-center">
          <div class="col-md-10 col-lg-8">
            <div class="property-card border-0 hover-lift">
              <div class="property-image" style="background-image:url('${img}');"></div>
              <div class="p-3 d-flex flex-column gap-1">
                <div class="d-flex justify-content-between align-items-center">
                  <h6 class="fw-bold mb-0">${lead.address || 'Property'}</h6>
                  <span class="score-badge" title="Opportunity Score">
                    <i class="fas fa-ranking-star"></i>
                    ${score} ${starsHTML(score)}
                  </span>
                </div>
                <p class="text-success small mb-1">List $${price.toLocaleString()} (Local Avg $${local_avg_price.toLocaleString()})</p>
                <div>
                  <span class="badge bg-primary me-2">${lead.type || 'Lead'}</span>
                  <span class="badge bg-info text-dark me-2">${days_listed} days</span>
                  <span class="badge bg-secondary">Yield ~${Number(yield_percent).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      inner.appendChild(slide);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-bs-target', '#propertyCarousel');
      btn.setAttribute('data-bs-slide-to', String(idx));
      if (idx===0) { btn.classList.add('active'); btn.setAttribute('aria-current','true'); }
      btn.setAttribute('aria-label', `Slide ${idx+1}`);
      indicators.appendChild(btn);
    });
  } catch (e) {
    console.warn('Failed to load leads.json, using fallback data (serve over http to enable fetch).', e);
    const leads = [
      { address: '7421 Grief Rd, Edmonton, AB', type: 'Probate', arv: 389, distress: 'Widow, 82yo, Heirs Desperate' },
      { address: '108 Bankruptcy Ln, Edmonton', type: 'Foreclosure', arv: 212, distress: 'Bank Auction in 14 Days' },
      { address: '666 Estate Way, Sherwood Park', type: 'Estate Sale', arv: 450, distress: 'Siblings Fighting Over Inheritance' },
      { address: '911 Despair Cres, St. Albert', type: 'Divorce', arv: 520, distress: 'Ex-Wife Wants Out Fast' }
    ];

    const indicators = document.getElementById('propertyCarouselIndicators');
    const inner = document.getElementById('propertyCarouselInner');
    if (!indicators || !inner) return;

    const arvs = leads.map(l => (Number(l.arv)||0) * 1000);
    const min_price = Math.max(50000, Math.min(...arvs) * 0.6);
    const max_price = Math.max(...arvs) * 1.1;

    leads.forEach((lead, idx) => {
      const arv = (Number(lead.arv)||0) * 1000;
      const price = Math.round(arv * 0.7);
      const local_avg_price = Math.round(arv * 1.0);
      const days_listed = 15 + (idx*12) % 50;
      const yield_percent = 5 + (idx*1.2)%6;
      const max_yield = 12;
      const location_score = 0.6 + (idx*0.1)%0.4;
      const condition_score = 0.5 + (idx*0.2)%0.5;
      const growth_score = 0.4 + (idx*0.15)%0.6;

      const score = propertyScore({ price, local_avg_price, days_listed, min_price, max_price, yield_percent, max_yield, location_score, condition_score, growth_score });

      const slide = document.createElement('div');
      slide.className = 'carousel-item' + (idx===0? ' active':'');
      slide.innerHTML = `
        <div class="row justify-content-center">
          <div class="col-md-10 col-lg-8">
            <div class="property-card border-0 hover-lift">
              <div class="property-image" style="background-image:url('${img}');"></div>
              <div class="p-3 d-flex flex-column gap-1">
                <div class="d-flex justify-content-between align-items-center">
                  <h6 class="fw-bold mb-0">${lead.address || 'Property'}</h6>
                  <span class="score-badge" title="Opportunity Score">
                    <i class="fas fa-ranking-star"></i>
                    ${score} ${starsHTML(score)}
                  </span>
                </div>
                <p class="text-success small mb-1">Est. Target $${price.toLocaleString()} (ARV $${arv.toLocaleString()})</p>
                <div>
                  <span class="badge bg-primary me-2">${lead.type || 'Lead'}</span>
                  <span class="badge bg-info text-dark me-2">${days_listed} days</span>
                  <span class="badge bg-secondary">Yield ~${yield_percent.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      inner.appendChild(slide);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-bs-target', '#propertyCarousel');
      btn.setAttribute('data-bs-slide-to', String(idx));
      if (idx===0) { btn.classList.add('active'); btn.setAttribute('aria-current','true'); }
      btn.setAttribute('aria-label', `Slide ${idx+1}`);
      indicators.appendChild(btn);
    });
  }
}

buildCarouselFromLeads();

// -----------------------------
// Hero Typewriter (looping phrases)
// -----------------------------
(function(){
  const el = document.getElementById('typewriter');
  if (!el) return;
  const phrases = [
    'Built to Move Markets',
    'AI-Powered Intelligence for Global Real Estate',
    'Smarter Real Estate, Smarter Decisions',
    'Turning Data Into Deals',
    'Advanced Intelligence. Real Results.'
  ];
  let i = 0, idx = 0, typing = true;
  const speed = 60, hold = 2250, erase = 37;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.textContent = phrases[0]; return; }

  function tick(){
    const text = phrases[i];
    if (typing){
      el.textContent = text.slice(0, idx+1);
      idx++;
      if (idx === text.length){ typing = false; setTimeout(tick, hold); return; }
      setTimeout(tick, speed);
    } else {
      el.textContent = text.slice(0, idx-1);
      idx--;
      if (idx === 0){ typing = true; i = (i+1) % phrases.length; setTimeout(tick, 350); return; }
      setTimeout(tick, erase);
    }
  }
  tick();
})();