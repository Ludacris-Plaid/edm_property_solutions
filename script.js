// ============================================================
// THEME TOGGLE
// ============================================================
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
    body.classList.add('dark-mode');
    body.classList.remove('light-mode');
    icon.classList.replace('fa-moon', 'fa-sun');
  }
}

// ============================================================
// LOGIN MODAL (Optional on pages that include it)
// ============================================================
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
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (user === 'admin' && pass === 'chaos2025') {
      localStorage.setItem('adminLoggedIn', 'true');
      modal.hide();
      window.location.href = 'admin.html';
    } else {
      alert('Invalid credentials');
    }
  });
}

// ============================================================
// COUNTERS (used in stats section)
// ============================================================
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

// ============================================================
// REVEAL ON SCROLL
// ============================================================
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
  revealEls.forEach(el => {
    el.classList.add('reveal-visible');
    if (el.classList.contains('stats-section')) startCounters(el);
  });
}

// ============================================================
// SMOOTH SCROLL
// ============================================================
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

// ============================================================
// NAVBAR SCROLL BEHAVIOR
// ============================================================
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

// ============================================================
// PROPERTY SCORING + CAROUSEL BUILDER
// ============================================================
function clamp01(x) { return Math.max(0, Math.min(1, Number(x) || 0)); }

function propertyScore({ price, local_avg_price, days_listed, min_price, max_price, yield_percent, max_yield, location_score, condition_score, growth_score }) {
  const P = 1 - (price - min_price) / Math.max(1, (max_price - min_price));
  const R = yield_percent / Math.max(1, max_yield);
  const L = clamp01(location_score);
  const C = clamp01(condition_score);
  const G = clamp01(growth_score);
  let score_raw = 0.4 * P + 0.3 * R + 0.15 * L + 0.1 * C + 0.05 * G;
  if (price <= 0.8 * local_avg_price) score_raw += 0.2;
  if (days_listed > 30) score_raw += 0.1;
  score_raw = Math.min(score_raw, 1.0);
  const score_1_5 = 1 + score_raw * 4;
  return Math.round(score_1_5 * 100) / 100;
}

function starsHTML(score) {
  const full = Math.floor(score);
  const half = score - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '<span class="score-stars">' +
    '★'.repeat(full) + (half ? '☆' : '') + '·'.repeat(Math.max(0, empty - (half ? 0 : 0))) +
    '</span>';
}

function safeUrl(u) {
  if (!u || typeof u !== 'string') return '';
  const m = u.match(/https?:[^\s\)]+/);
  return m ? m[0] : u;
}

function clearCarousel() {
  const indicators = document.getElementById('propertyCarouselIndicators');
  const inner = document.getElementById('propertyCarouselInner');
  if (!indicators || !inner) return { indicators: null, inner: null };
  indicators.innerHTML = '';
  inner.innerHTML = '';
  return { indicators, inner };
}

function buildSlides(items) {
  const { indicators, inner } = clearCarousel();
  if (!indicators || !inner) return 0;
  items.forEach((p, idx) => {
    const priceNum = Number(p.priceNum) || 0;
    const priceText = p.price || (priceNum ? `$${priceNum.toLocaleString()}` : 'N/A');
    const days = Number(p.daysOnMarket || 0);
    const img = p.photos && p.photos.length ? safeUrl(p.photos[0].url) : (p.imageUrl ? safeUrl(p.imageUrl) : 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?q=80&w=1600&auto=format&fit=crop');
    const score = Number(p.distressScore || p.distressAuto || 3);
    const type = p.propertyType || p.type || 'Property';

    const slide = document.createElement('div');
    slide.className = 'carousel-item' + (idx === 0 ? ' active' : '');
    slide.innerHTML = `
      <div class="row justify-content-center">
        <div class="col-md-10 col-lg-8">
          <div class="property-card border-0 hover-lift">
            <div class="property-image" style="background-image:url('${img}');"></div>
            <div class="p-3 d-flex flex-column gap-1">
              <div class="d-flex justify-content-between align-items-center">
                <h6 class="fw-bold mb-0">${p.address || 'Property'}</h6>
                <span class="score-badge" title="Distress Score">
                  <i class="fas fa-heart-crack"></i>
                  ${score} ${starsHTML(score)}
                </span>
              </div>
              <p class="text-success small mb-1">List ${priceText}</p>
              <div>
                <span class="badge bg-primary me-2">${type}</span>
                <span class="badge bg-info text-dark me-2">${days} days</span>
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
    if (idx === 0) { btn.classList.add('active'); btn.setAttribute('aria-current', 'true'); }
    btn.setAttribute('aria-label', `Slide ${idx + 1}`);
    indicators.appendChild(btn);
  });
  return items.length;
}

function buildCarouselFromAdmin() {
  try {
    const json = localStorage.getItem('eps_admin_properties');
    if (!json) return 0;
    const props = JSON.parse(json);
    if (!Array.isArray(props) || !props.length) return 0;
    const withPhoto = props.filter(p => (p.photos && p.photos.length && p.photos[0]?.url));
    if (!withPhoto.length) return 0;
    withPhoto.sort((a,b) => {
      const dsA = Number(a.distressScore || -1);
      const dsB = Number(b.distressScore || -1);
      if (dsB !== dsA) return dsB - dsA;
      const dom = (Number(b.daysOnMarket||0) - Number(a.daysOnMarket||0));
      if (dom) return dom;
      return new Date(b.lastUpdated||0) - new Date(a.lastUpdated||0);
    });
    const top = withPhoto.slice(0, 8);
    return buildSlides(top);
  } catch(e) {
    console.warn('Failed to build from admin properties', e);
    return 0;
  }
}

async function buildCarouselFromLeads() {
  const { indicators, inner } = clearCarousel();
  if (!indicators || !inner) return;

  // First try localStorage properties
  const count = buildCarouselFromAdmin();
  if (count > 0) return;

  // Fallback to leads.json
  try {
    const res = await fetch('./leads.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('leads.json not ok: ' + res.status);
    const leads = await res.json();
    if (!Array.isArray(leads) || !leads.length) return;
    const prices = leads.map(l => Number(l.price) || 0).filter(x => x > 0);
    const min_price = Math.max(50000, Math.min(...prices));
    const max_price = Math.max(...prices) || (min_price + 1);
    leads.forEach((lead, idx) => {
      const price = Number(lead.price) || Math.round((Number(lead.local_avg_price) || 350000) * 0.7);
      const local_avg_price = Number(lead.local_avg_price) || Math.round(price / 0.7);
      const days_listed = Number(lead.days_listed) || (15 + (idx * 7) % 60);
      const yield_percent = (lead.yield_percent != null ? Number(lead.yield_percent) : 6);
      const max_yield = 12;
      const location_score = lead.location_score != null ? Number(lead.location_score) : 0.65;
      const condition_score = lead.condition_score != null ? Number(lead.condition_score) : 0.6;
      const growth_score = lead.growth_score != null ? Number(lead.growth_score) : 0.6;
      const score = propertyScore({ price, local_avg_price, days_listed, min_price, max_price, yield_percent, max_yield, location_score, condition_score, growth_score });
      let img = lead.image || '';
      if ((!img || img.length < 5) && Array.isArray(lead.image_urls) && lead.image_urls.length) {
        const raw = String(lead.image_urls[0]);
        img = safeUrl(raw);
      }
      if (!img) {
        img = 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?q=80&w=1600&auto=format&fit=crop';
      }
      const slide = document.createElement('div');
      slide.className = 'carousel-item' + (idx === 0 ? ' active' : '');
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
      if (idx === 0) { btn.classList.add('active'); btn.setAttribute('aria-current', 'true'); }
      btn.setAttribute('aria-label', `Slide ${idx + 1}`);
      indicators.appendChild(btn);
    });
  } catch (e) {
    console.warn('Failed to load leads.json', e);
  }
}

buildCarouselFromLeads();

// ============================================================
// HERO TYPEWRITER
// ============================================================
(function () {
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
  const speed = 80, hold = 2450, erase = 45;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.textContent = phrases[0]; return; }

  function tick() {
    const text = phrases[i];
    if (typing) {
      el.textContent = text.slice(0, idx + 1);
      idx++;
      if (idx === text.length) { typing = false; setTimeout(tick, hold); return; }
      setTimeout(tick, speed);
    } else {
      el.textContent = text.slice(0, idx - 1);
      idx--;
      if (idx === 0) { typing = true; i = (i + 1) % phrases.length; setTimeout(tick, 350); return; }
      setTimeout(tick, erase);
    }
  }
  tick();
})();

// ============================================================
// ADMIN BUTTONS (Unlock / Import / Export / Delete)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const unlockBtn = document.getElementById('unlockBtn');
  const importBtn = document.getElementById('importBtn');
  const exportBtn = document.getElementById('exportBtn');
  const deleteBtn = document.getElementById('deleteBtn');

  if (unlockBtn) unlockBtn.addEventListener('click', handleUnlock);
  if (importBtn) importBtn.addEventListener('click', handleImport);
  if (exportBtn) exportBtn.addEventListener('click', handleExport);
  if (deleteBtn) deleteBtn.addEventListener('click', handleDelete);
});

function handleUnlock() {
  const code = prompt('Enter unlock code:');
  if (code === 'chaos2025') {
    localStorage.setItem('adminUnlocked', 'true');
    alert('Unlocked!');
  } else {
    alert('Invalid code.');
  }
}

function handleImport() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';
  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    localStorage.setItem('eps_admin_properties', JSON.stringify(data));
    alert('Data imported successfully.');
  };
  fileInput.click();
}

function handleExport() {
  const data = localStorage.getItem('eps_admin_properties') || '[]';
  const blob = new Blob([data], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'exported_properties.json';
  link.click();
}

function handleDelete() {
  if (confirm('Delete all stored property data?')) {
    localStorage.removeItem('eps_admin_properties');
    alert('Data deleted.');
  }
}

// Add this near the top of your script section
const GROK_API_KEY = 'xai-Fnb6pWyXWYSLMQPjDga7qWaqFMRiVjyMBLKTF3UsgERXqtEWSvdX2CEWWnSTsb7kSZEXwLeUg17YXUZg';

// Replace the existing botReply function with this enhanced version
async function botReply(input) {
    input = input.toLowerCase();
    
    // First try to handle with Grok API for more intelligent responses
    try {
        const response = await fetch('https://api.grok.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'grok-1',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful AI assistant for a property management system. Keep responses concise and focused on property management, real estate, and related topics. If asked about the system, you can mention it uses the Synapse Realty platform.'
                    },
                    {
                        role: 'user',
                        content: input
                    }
                ],
                temperature: 0.7,
                max_tokens: 300
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content;
            }
        }
    } catch (error) {
        console.error('Error calling Grok API:', error);
        // Fall through to default responses
    }

    // Fallback responses if Grok API fails or for specific commands
    const responses = {
        greeting: ["Hey there, admin. How can I help you today?", "Hello! What can I assist you with?"],
        import: "To import properties, click the 'Import' button and select a JSON file with property data. Make sure it matches the required format.",
        export: "The 'Export' button will download a JSON file containing all your current property data.",
        delete: "⚠️ Warning: Deleting data is permanent and cannot be undone. Make sure to export any important data first.",
        help: [
            "Here's what I can help with:",
            "• 'Import properties' - Import property data from a JSON file",
            "• 'Export data' - Download your current data",
            "• 'Clear chat' - Reset the chat history",
            "• 'How many properties?' - Show property count",
            "• Or ask me anything about real estate, property management, or market trends"
        ].join('<br>'),
        default: [
            "I'm not sure I understand. Try asking for 'help' to see what I can do.",
            "I'm here to help with property management. Ask me about importing, exporting, or managing your properties.",
            "Could you rephrase that? I'm here to help with property management tasks."
        ]
    };

    if (input.includes('hello') || input.includes('hi') || input.includes('hey')) {
        return responses.greeting[Math.floor(Math.random() * responses.greeting.length)];
    }
    if (input.includes('import')) return responses.import;
    if (input.includes('export')) return responses.export;
    if (input.includes('delete')) return responses.delete;
    if (input.includes('help')) return responses.help;
    if (input.includes('how many') && (input.includes('property') || input.includes('properties'))) {
        return `You currently have ${data.length} propert${data.length === 1 ? 'y' : 'ies'} in the system.`;
    }
    if (input.includes('clear chat')) {
        chatLog = [];
        localStorage.setItem('synapse_chat', JSON.stringify(chatLog));
        return "Chat history cleared.";
    }
    
    return responses.default[Math.floor(Math.random() * responses.default.length)];
}

// Update the sendMessage function to be async
async function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    
    // Add user message
    const userMsg = { 
        sender: 'user', 
        text: msg,
        time: getCurrentTime() 
    };
    chatLog.push(userMsg);
    chatInput.value = '';
    renderChat();
    
    // Show typing indicator
    const typing = showTypingIndicator();
    
    try {
        // Get bot response (will use Grok API)
        const reply = await botReply(msg);
        removeTypingIndicator();
        
        const botMsg = { 
            sender: 'bot', 
            text: reply,
            time: getCurrentTime() 
        };
        chatLog.push(botMsg);
    } catch (error) {
        console.error('Error in chat:', error);
        removeTypingIndicator();
        const errorMsg = { 
            sender: 'bot', 
            text: "I'm having trouble connecting to the AI service. Please try again later.",
            time: getCurrentTime() 
        };
        chatLog.push(errorMsg);
    }
    
    localStorage.setItem('synapse_chat', JSON.stringify(chatLog));
    renderChat();
}

