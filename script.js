/* ════════════════════════════════════════════════════════════
   AgriGuide Pro — script.js
   Powered by Google Gemini (FREE) · 2025
════════════════════════════════════════════════════════════ */

/* ── API Key (Google Gemini - Free!) ────────────────────── */
const GROQ_KEY = "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";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/* ── Call Groq AI (Free!) ───────────────────────────────── */
async function callGemini(prompt, systemPrompt = '') {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || 'No response.';
}

/* ── Call Groq with image (uses text description fallback) ── */
async function callGeminiWithImage(base64, mimeType, prompt) {
  // Groq llama3 vision for image analysis
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: prompt }
        ]
      }],
      max_tokens: 1000
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || 'No response.';
}

/* ── State ─────────────────────────────────────────────── */
let currentUser   = null;
let chatHistory   = [];
let cropRegistry  = JSON.parse(localStorage.getItem('agri_crops')   || '[]');
let scanHistory   = JSON.parse(localStorage.getItem('agri_history') || '[]');
let isDark        = localStorage.getItem('agri_theme') === 'dark';
let currentLang   = localStorage.getItem('agri_lang') || 'en';
let toastTimer    = null;

/* ── All page IDs ───────────────────────────────────────── */
const TOP_PAGES = ['landingPage', 'loginPage', 'appShell'];
const APP_PAGES = ['dashboard', 'scan', 'result', 'crops', 'market', 'weather', 'history'];

/* ════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  if (isDark) {
    document.body.classList.add('dark');
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = '☀️';
  }

  document.getElementById('languageSelect').value = currentLang;
  applyTranslations(currentLang);

  const savedUser = localStorage.getItem('agri_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      enterApp();
    } catch {
      showPage('landingPage');
    }
  } else {
    showPage('landingPage');
  }

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('userMenu');
    const chip = document.getElementById('userChip');
    if (menu && chip && !menu.contains(e.target) && !chip.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  const zone = document.getElementById('uploadZone');
  if (zone) {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--green-700)'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById('scanImage').files = dt.files;
        previewImageFile(file);
      }
    });
  }
});

/* ════════════════════════════════════════════════════════════
   PAGE NAVIGATION
════════════════════════════════════════════════════════════ */
function showPage(id) {
  TOP_PAGES.forEach(p => {
    const el = document.getElementById(p);
    if (el) el.classList.toggle('hidden', p !== id);
  });
}

function navigateTo(page) {
  APP_PAGES.forEach(p => {
    const el = document.getElementById(`pg-${p}`);
    if (el) el.classList.toggle('hidden', p !== page);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (page === 'market')  loadMarketData();
  if (page === 'history') renderHistory();
  if (page === 'crops')   renderCrops();
}

function closeUserMenu() {
  document.getElementById('userMenu')?.classList.add('hidden');
}

function toggleUserMenu() {
  document.getElementById('userMenu')?.classList.toggle('hidden');
}

/* ════════════════════════════════════════════════════════════
   AUTHENTICATION
════════════════════════════════════════════════════════════ */
function switchAuthTab(tab) {
  document.getElementById('tabLogin').classList.toggle('active',  tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
  document.getElementById('formLogin').classList.toggle('hidden', tab !== 'login');
  document.getElementById('formSignup').classList.toggle('hidden', tab !== 'signup');
}

function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value.trim();
  if (!email || !pass)      { showToast('⚠️ Please fill in all fields.'); return; }
  if (!isValidEmail(email)) { showToast('⚠️ Please enter a valid email.'); return; }
  if (pass.length < 6)      { showToast('⚠️ Password must be at least 6 characters.'); return; }
  currentUser = { name: nameFromEmail(email), email, photo: null };
  saveSession();
  enterApp();
  showToast('👋 Welcome back!');
}

function signup() {
  const name  = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const pass  = document.getElementById('signupPassword').value.trim();
  if (!name || !email || !pass) { showToast('⚠️ Please fill in all fields.'); return; }
  if (!isValidEmail(email))     { showToast('⚠️ Please enter a valid email.'); return; }
  if (pass.length < 6)          { showToast('⚠️ Password must be at least 6 characters.'); return; }
  currentUser = { name, email, photo: null };
  saveSession();
  chatHistory  = [];
  cropRegistry = [];
  scanHistory  = [];
  saveCrops();
  saveHistory();
  enterApp();
  showToast(`🌾 Welcome, ${name}!`);
}

function googleLogin() {
  currentUser = { name: 'Demo Farmer', email: 'demo@agriguide.pro', photo: null };
  saveSession();
  enterApp();
  showToast('✅ Signed in!');
}

function logoutUser() {
  currentUser = null;
  chatHistory = [];
  localStorage.removeItem('agri_user');
  resetChatUI();
  document.getElementById('imagePreviewContainer').innerHTML = '';
  showPage('landingPage');
  showToast('👋 Signed out.');
}

function saveSession() {
  localStorage.setItem('agri_user', JSON.stringify(currentUser));
}

function enterApp() {
  showPage('appShell');
  navigateTo('dashboard');
  updateUserUI();
}

function updateUserUI() {
  if (!currentUser) return;
  const firstName = currentUser.name.split(' ')[0];
  const avatarUrl = currentUser.photo ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.name)}&backgroundColor=1A3325&textColor=ffffff`;
  setText('welcomeText',     `Welcome back, ${firstName} 👋`);
  setText('userEmailDisplay', currentUser.email);
  setAttr('userPhoto',    'src', avatarUrl);
  setText('navUserName',  firstName);
  setAttr('navUserPhoto', 'src', avatarUrl);
  setText('menuUserName',  currentUser.name);
  setText('menuUserEmail', currentUser.email);
}

/* ════════════════════════════════════════════════════════════
   THEME
════════════════════════════════════════════════════════════ */
function toggleTheme() {
  isDark = !isDark;
  document.body.classList.toggle('dark', isDark);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('agri_theme', isDark ? 'dark' : 'light');
}

/* ════════════════════════════════════════════════════════════
   LANGUAGE
════════════════════════════════════════════════════════════ */
const TRANSLATIONS = {
  en: { menuLabel:'Quick Actions', scan:'Scan Crop', crops:'My Crops', history:'Scan History', market:'Market Mandi', weather:'AI Weather', botTitle:'AgriGuide AI Assistant', botSubtitle:'Ask about pests, soil, crop rotation & more' },
  hi: { menuLabel:'त्वरित क्रियाएं', scan:'फसल स्कैन', crops:'मेरी फसलें', history:'इतिहास', market:'बाज़ार मंडी', weather:'AI मौसम', botTitle:'AgriGuide AI सहायक', botSubtitle:'कीट, मिट्टी या फसल के बारे में पूछें' },
  mr: { menuLabel:'द्रुत क्रिया', scan:'पीक स्कॅन', crops:'माझी पिके', history:'स्कॅन इतिहास', market:'बाजार मंडी', weather:'AI हवामान', botTitle:'AgriGuide AI सहाय्यक', botSubtitle:'कीड, माती किंवा पीक चक्राबद्दल विचारा' },
  gu: { menuLabel:'ઝડપી ક્રિયાઓ', scan:'પાક સ્કૅન', crops:'મારા પાક', history:'ઇતિહાસ', market:'બજાર મંડી', weather:'AI હવામાન', botTitle:'AgriGuide AI સહાયક', botSubtitle:'જંતુ, જમીન અથવા પાક વિશે પૂછો' },
  pa: { menuLabel:'ਤੇਜ਼ ਕਿਰਿਆਵਾਂ', scan:'ਫਸਲ ਸਕੈਨ', crops:'ਮੇਰੀਆਂ ਫਸਲਾਂ', history:'ਇਤਿਹਾਸ', market:'ਬਾਜ਼ਾਰ ਮੰਡੀ', weather:'AI ਮੌਸਮ', botTitle:'AgriGuide AI ਸਹਾਇਕ', botSubtitle:'ਕੀੜੇ, ਮਿੱਟੀ ਜਾਂ ਫਸਲ ਬਾਰੇ ਪੁੱਛੋ' },
};

function changeLanguage() {
  currentLang = document.getElementById('languageSelect').value;
  localStorage.setItem('agri_lang', currentLang);
  applyTranslations(currentLang);
}

function applyTranslations(lang) {
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  setText('menuLabel',       t.menuLabel);
  setText('menuScanText',    t.scan);
  setText('menuCropsText',   t.crops);
  setText('menuHistoryText', t.history);
  setText('menuMarketText',  t.market);
  setText('menuWeatherText', t.weather);
  setText('botTitle',        t.botTitle);
  setText('botSubtitle',     t.botSubtitle);
}

/* ════════════════════════════════════════════════════════════
   IMAGE SCAN
════════════════════════════════════════════════════════════ */
function previewImage(event) {
  const file = event.target.files[0];
  if (file) previewImageFile(file);
}

function previewImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('imagePreviewContainer').innerHTML =
      `<img src="${e.target.result}" alt="Crop preview" style="max-width:100%;border-radius:10px;margin-top:16px;border:1.5px solid var(--border);" />`;
  };
  reader.readAsDataURL(file);
}

async function scanCrop() {
  const file = document.getElementById('scanImage').files[0];
  if (!file) { showToast('📷 Please upload a crop image first.'); return; }

  navigateTo('result');
  const loading = document.getElementById('loadingScreen');
  const result  = document.getElementById('scanResult');
  loading.classList.remove('hidden');
  result.classList.add('hidden');
  result.innerHTML = '';

  try {
    const base64 = await fileToBase64(file);
    const prompt = `You are an expert agronomist. Analyze this crop image and provide:

**🌿 Crop Identified:** [name]
**🔬 Diagnosis:** [disease/deficiency or Healthy]
**⚠️ Severity:** [Mild/Moderate/Severe/Healthy]
**📋 Symptoms Observed:**
- [symptom 1]
- [symptom 2]
**💊 Treatment Recommendations:**
- [treatment 1]
- [treatment 2]
- [treatment 3]
**🛡️ Prevention Tips:**
- [tip 1]
- [tip 2]
**⏰ Urgency:** [action needed]

Be practical and farmer-friendly.`;

    const text = await callGeminiWithImage(base64, file.type, prompt);

    loading.classList.add('hidden');
    result.classList.remove('hidden');
    result.innerHTML = formatMarkdown(text);

    const entry = {
      id:      Date.now(),
      date:    new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }),
      summary: text.replace(/\*\*/g,'').slice(0, 120) + '…',
      full:    text
    };
    scanHistory.unshift(entry);
    if (scanHistory.length > 50) scanHistory.pop();
    saveHistory();
    showToast('✅ Scan complete!');

  } catch (err) {
    loading.classList.add('hidden');
    result.classList.remove('hidden');
    result.innerHTML = `<div style="color:var(--danger);">⚠️ <strong>Error:</strong> ${err.message}</div>`;
  }
}

/* ════════════════════════════════════════════════════════════
   AI CHATBOT
════════════════════════════════════════════════════════════ */
async function sendMessage() {
  const input = document.getElementById('userInput');
  const msg   = input.value.trim();
  if (!msg) return;

  input.value = '';
  appendChatMsg(msg, 'user');
  chatHistory.push({ role: 'user', content: msg });

  const typingId = showTyping();

  try {
    const systemPrompt = `You are AgriGuide AI, India's most trusted agricultural advisor.
You help farmers with crop diseases, soil health, pest management, irrigation, fertilizers, mandi prices, government schemes (PM-KISAN, PMFBY), and organic farming.
Be warm, practical and encouraging. Respond in the same language the user writes in.
Use bullet points for clarity. Keep answers concise and actionable.

Previous conversation:
${chatHistory.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n')}`;

    const reply = await callGemini(msg, systemPrompt);

    removeTyping(typingId);
    chatHistory.push({ role: 'assistant', content: reply });
    appendChatMsg(reply, 'bot');

  } catch (err) {
    removeTyping(typingId);
    appendChatMsg(`⚠️ Error: ${err.message}`, 'bot');
  }
}

function appendChatMsg(text, who) {
  const box = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = `chat-msg ${who === 'user' ? 'user-msg' : 'bot-msg'}`;
  div.innerHTML = `
    <div class="chat-avatar">${who === 'user' ? '👤' : '🤖'}</div>
    <div class="chat-bubble">${formatMarkdown(text)}</div>
  `;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function showTyping() {
  const box = document.getElementById('chatBox');
  const id  = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.className = 'chat-msg bot-msg';
  div.id = id;
  div.innerHTML = `
    <div class="chat-avatar">🤖</div>
    <div class="chat-bubble">
      <div class="chat-typing">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

function clearChat() {
  chatHistory = [];
  resetChatUI();
  showToast('💬 Chat cleared.');
}

function resetChatUI() {
  const box = document.getElementById('chatBox');
  if (!box) return;
  box.innerHTML = `
    <div class="chat-msg bot-msg">
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble">
        Namaste! 🌾 I'm your AgriGuide AI assistant. I can help you with:
        <ul style="margin-top:8px;padding-left:18px;font-size:0.85rem;">
          <li>Crop disease diagnosis &amp; treatment</li>
          <li>Soil health &amp; fertilizer advice</li>
          <li>Irrigation &amp; weather guidance</li>
          <li>Market prices &amp; when to sell</li>
        </ul>
        Ask me anything!
      </div>
    </div>
  `;
}

function startVoiceInput() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('🎤 Voice input not supported.'); return; }
  const rec = new SR();
  const langMap = { hi:'hi-IN', mr:'mr-IN', gu:'gu-IN', pa:'pa-IN', en:'en-IN' };
  rec.lang = langMap[currentLang] || 'en-IN';
  rec.onresult = (e) => {
    document.getElementById('userInput').value = e.results[0][0].transcript;
    showToast('✅ Voice captured!');
  };
  rec.onerror = () => showToast('⚠️ Could not capture voice.');
  rec.start();
  showToast('🎤 Listening…');
}

/* ════════════════════════════════════════════════════════════
   MY CROPS
════════════════════════════════════════════════════════════ */
function addCrop() {
  const name  = document.getElementById('cropName').value.trim();
  const price = document.getElementById('cropPrice').value.trim();
  if (!name)                          { showToast('⚠️ Please enter a crop name.'); return; }
  if (!price || isNaN(Number(price))) { showToast('⚠️ Please enter a valid price.'); return; }
  if (Number(price) <= 0)             { showToast('⚠️ Price must be greater than 0.'); return; }
  const crop = { id: Date.now(), name, price: Number(price), addedOn: new Date().toLocaleDateString('en-IN') };
  cropRegistry.unshift(crop);
  saveCrops();
  document.getElementById('cropName').value  = '';
  document.getElementById('cropPrice').value = '';
  renderCrops();
  showToast(`✅ ${name} added!`);
}

function deleteCrop(id) {
  const crop = cropRegistry.find(c => c.id === id);
  cropRegistry = cropRegistry.filter(c => c.id !== id);
  saveCrops();
  renderCrops();
  if (crop) showToast(`🗑 ${crop.name} removed.`);
}

function renderCrops() {
  const list = document.getElementById('cropList');
  if (!list) return;
  if (!cropRegistry.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🌱</div><p>No crops added yet.</p></div>`;
    return;
  }
  const icons = { rice:'🌾',wheat:'🌾',maize:'🌽',corn:'🌽',onion:'🧅',tomato:'🍅',potato:'🥔',cotton:'🌿',soybean:'🫘',sugarcane:'🎋',groundnut:'🥜',turmeric:'🟡' };
  list.innerHTML = cropRegistry.map(c => {
    const icon = icons[c.name.toLowerCase().split(' ')[0]] || '🌿';
    return `
      <div class="crop-row">
        <div class="crop-icon-sm">${icon}</div>
        <div class="crop-info">
          <strong>${escapeHtml(c.name)}</strong>
          <span>Added ${c.addedOn}</span>
        </div>
        <div class="crop-price">₹${Number(c.price).toLocaleString('en-IN')}<small style="font-size:0.65rem;color:var(--muted);margin-left:2px;">/qtl</small></div>
        <button class="btn btn-outline btn-sm" onclick="deleteCrop(${c.id})">✕</button>
      </div>`;
  }).join('');
}

function saveCrops() { localStorage.setItem('agri_crops', JSON.stringify(cropRegistry)); }

/* ════════════════════════════════════════════════════════════
   MARKET
════════════════════════════════════════════════════════════ */
function loadMarketData() {
  const prices = [
    { name:'Rice (Basmati)',  icon:'🌾', msp:2183, market:2340, change:'+7.2%',  up:true  },
    { name:'Wheat',           icon:'🌾', msp:2275, market:2190, change:'-3.7%',  up:false },
    { name:'Soybean',         icon:'🫘', msp:4600, market:4850, change:'+5.4%',  up:true  },
    { name:'Maize',           icon:'🌽', msp:2090, market:2105, change:'+0.7%',  up:true  },
    { name:'Cotton',          icon:'🌿', msp:6620, market:6480, change:'-2.1%',  up:false },
    { name:'Groundnut',       icon:'🥜', msp:6377, market:6700, change:'+5.1%',  up:true  },
    { name:'Turmeric',        icon:'🟡', msp:7000, market:8200, change:'+17.1%', up:true  },
    { name:'Onion',           icon:'🧅', msp:800,  market:1450, change:'+81.3%', up:true  },
    { name:'Potato',          icon:'🥔', msp:600,  market:890,  change:'+48.3%', up:true  },
    { name:'Sugarcane',       icon:'🎋', msp:315,  market:340,  change:'+7.9%',  up:true  },
    { name:'Chana (Gram)',    icon:'🫘', msp:5440, market:5200, change:'-4.4%',  up:false },
    { name:'Mustard',         icon:'🌿', msp:5650, market:5900, change:'+4.4%',  up:true  },
  ];
  document.getElementById('marketList').innerHTML = `
    <div style="overflow-x:auto;">
      <table class="market-table">
        <thead><tr><th>Commodity</th><th>MSP ₹/qtl</th><th>Mandi Rate</th><th>Change</th></tr></thead>
        <tbody>
          ${prices.map(p => `
            <tr>
              <td><span style="margin-right:8px;">${p.icon}</span><strong>${p.name}</strong></td>
              <td>₹${p.msp.toLocaleString('en-IN')}</td>
              <td><strong>₹${p.market.toLocaleString('en-IN')}</strong></td>
              <td class="${p.up ? 'market-up' : 'market-down'}">${p.up?'↑':'↓'} ${p.change}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="market-note">ℹ️ Indicative APMC rates. Verify with your local mandi.</div>
  `;
}

/* ════════════════════════════════════════════════════════════
   WEATHER
════════════════════════════════════════════════════════════ */
async function showWeather() {
  const city = document.getElementById('cityInput').value.trim();
  if (!city) { showToast('🌍 Please enter a city name.'); return; }

  const container = document.getElementById('weatherResult');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Fetching weather for ${escapeHtml(city)}…</span></div>`;

  try {
    // City-specific weather knowledge
    const cityClimate = {
      mumbai: {t:"31°C", f:"38°C", c:"Heavy Monsoon Rain", h:"92%", w:"28 km/h SW", r:"Heavy rain 80mm", uv:"Low (2)"},
      delhi: {t:"42°C", f:"47°C", c:"Hot & Hazy", h:"35%", w:"15 km/h NW", r:"No rain expected", uv:"Extreme (11)"},
      pune: {t:"28°C", f:"30°C", c:"Partly Cloudy", h:"68%", w:"12 km/h NE", r:"Light rain 10mm", uv:"High (8)"},
      nashik: {t:"27°C", f:"29°C", c:"Cloudy", h:"72%", w:"10 km/h W", r:"18mm expected", uv:"Moderate (6)"},
      bengaluru: {t:"24°C", f:"25°C", c:"Pleasant & Mild", h:"65%", w:"8 km/h SE", r:"5mm light showers", uv:"Moderate (7)"},
      bangalore: {t:"24°C", f:"25°C", c:"Pleasant & Mild", h:"65%", w:"8 km/h SE", r:"5mm light showers", uv:"Moderate (7)"},
      chennai: {t:"38°C", f:"44°C", c:"Hot & Humid", h:"78%", w:"18 km/h SE", r:"Possible 12mm", uv:"Very High (9)"},
      kolkata: {t:"35°C", f:"41°C", c:"Humid & Cloudy", h:"85%", w:"20 km/h S", r:"Monsoon 45mm", uv:"High (8)"},
      jaipur: {t:"44°C", f:"48°C", c:"Very Hot & Dry", h:"22%", w:"25 km/h W", r:"No rain", uv:"Extreme (11)"},
      shimla: {t:"18°C", f:"16°C", c:"Cool & Pleasant", h:"55%", w:"6 km/h N", r:"Light 5mm", uv:"Moderate (5)"},
      nagpur: {t:"43°C", f:"47°C", c:"Extremely Hot", h:"28%", w:"14 km/h SW", r:"No rain", uv:"Extreme (11)"},
      hyderabad: {t:"35°C", f:"39°C", c:"Hot & Partly Cloudy", h:"52%", w:"16 km/h S", r:"8mm possible", uv:"Very High (9)"},
      ahmedabad: {t:"40°C", f:"45°C", c:"Hot & Dry", h:"30%", w:"20 km/h W", r:"No rain", uv:"Extreme (10)"},
      lucknow: {t:"41°C", f:"46°C", c:"Very Hot", h:"38%", w:"12 km/h NW", r:"No rain", uv:"Extreme (10)"},
    };
    const cityKey = city.toLowerCase().trim();
    const climate = cityClimate[cityKey] || {t:"32°C", f:"36°C", c:"Partly Cloudy", h:"60%", w:"14 km/h NE", r:"10mm possible", uv:"High (8)"};

    const prompt = `You are a weather expert. Give farming weather advice for ${city}, India in June 2025.
The weather data for ${city} today: Temperature ${climate.t}, Feels like ${climate.f}, ${climate.c}, Humidity ${climate.h}, Wind ${climate.w}, Rainfall ${climate.r}, UV ${climate.uv}.
Return ONLY this JSON (fill in the farmingAdvisories with 4 specific tips for farmers in ${city} region, mention local crops like sugarcane/onion for Nashik, cotton/soybean for Vidarbha, rice for coastal areas, wheat for north India etc):
{"city":"${city}","temperature":"${climate.t}","feelsLike":"${climate.f}","condition":"${climate.c}","humidity":"${climate.h}","wind":"${climate.w}","rainfall":"${climate.r}","uvIndex":"${climate.uv}","farmingAdvisories":[{"icon":"✅","text":"tip1"},{"icon":"⚠️","text":"tip2"},{"icon":"💧","text":"tip3"},{"icon":"🌱","text":"tip4"}]}`;

    const text   = await callGemini(prompt);
    const clean  = text.replace(/```json|```/g,'').trim();
    const w      = JSON.parse(clean);

    container.innerHTML = `
      <div class="weather-card">
        <div class="weather-city">🌍 ${escapeHtml(w.city)}</div>
        <div class="weather-temp">${w.temperature}</div>
        <div class="weather-condition">${w.condition} · Feels like ${w.feelsLike}</div>
        <div class="weather-tags">
          <span class="weather-tag">💧 ${w.humidity}</span>
          <span class="weather-tag">🌬 ${w.wind}</span>
          <span class="weather-tag">☀️ UV ${w.uvIndex}</span>
          <span class="weather-tag">🌧 ${w.rainfall}</span>
        </div>
      </div>
      <p class="section-label" style="margin-top:20px;margin-bottom:12px;">Farming Advisories</p>
      <div class="advisory-list">
        ${w.farmingAdvisories.map(a => `
          <div class="advisory-item">
            <span class="advisory-icon">${a.icon}</span>
            <span>${escapeHtml(a.text)}</span>
          </div>`).join('')}
      </div>`;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger);padding:16px 0;">⚠️ Could not load weather. Error: ${err.message}</p>`;
  }
}

/* ════════════════════════════════════════════════════════════
   HISTORY
════════════════════════════════════════════════════════════ */
function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  if (!scanHistory.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><p>No scans yet.</p></div>`;
    return;
  }
  list.innerHTML = scanHistory.map(h => `
    <div class="history-item">
      <div class="history-icon-badge">🔬</div>
      <div class="history-meta">
        <h4>Crop Scan #${String(h.id).slice(-5)}</h4>
        <p>${escapeHtml(h.summary)}</p>
      </div>
      <div class="history-date">${h.date}</div>
    </div>`).join('');
}

function clearAllScanHistory() {
  if (!confirm('Clear all scan history?')) return;
  scanHistory = [];
  saveHistory();
  renderHistory();
  showToast('🗑 History cleared.');
}

function saveHistory() { localStorage.setItem('agri_history', JSON.stringify(scanHistory)); }

/* ════════════════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════════════════ */
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setAttr(id, attr, val) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, val);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function nameFromEmail(email) {
  return email.split('@')[0].replace(/[._-]/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatMarkdown(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^#{1,3}\s+(.+)$/gm,'<strong style="display:block;margin-top:10px;">$1</strong>')
    .replace(/^[-•]\s+(.+)$/gm,'<li style="margin-left:18px;margin-bottom:3px;">$1</li>')
    .replace(/(<li.*<\/li>(\n|$))+/g, m => `<ul style="margin:6px 0;">${m}</ul>`)
    .replace(/\n\n+/g,'<br><br>')
    .replace(/\n/g,'<br>');
}
