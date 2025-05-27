/**
 * pipepal.js
 * Full PipePal widget implementation for Arizona Plumbing Pros
 * Updated: honor voice toggle & strip leading emojis/icons from replies
 */
(function() {
  // ── ENTRYPOINT ────────────────────────────────────────────────────────────────
  function initPipepal() {
    console.log("✅ PipePal JS Loaded");

    // ── CONFIG ───────────────────────────────────────────────────────────────────
    const WEBHOOK_URL  = 'https://haneshbb.app.n8n.cloud/webhook/pipepal-sosy';
    const TECH_WEBHOOK = 'https://haneshbb.app.n8n.cloud/webhook/receive-ticket';
    const APPT_WEBHOOK = 'https://haneshbb.app.n8n.cloud/webhook/log-lead';
    const STORAGE_KEY  = 'pipepal_chat_history';
    const USER_KEY     = 'pipepal_user_data';

    // ── STATE & CONTEXT ──────────────────────────────────────────────────────────
    const context = { State: 'COLLECT_ISSUE', Issue: null, CustomerID: null, Phone: null, Email: null, Name: null, IntentName: null };

    // ── VOICE FLAG ────────────────────────────────────────────────────────────────
    let voiceEnabled = true;

    // ── UTILS ────────────────────────────────────────────────────────────────────
    function saveHistory(entries) { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
    function loadHistory()   { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
    function saveUserData()  { localStorage.setItem(USER_KEY, JSON.stringify({ Issue: context.Issue, CustomerID: context.CustomerID, Phone: context.Phone, Email: context.Email, Name: context.Name })); }
    function loadUserData()  { try { return JSON.parse(localStorage.getItem(USER_KEY)) || {}; } catch { return {}; } }

    function speakText(text) {
  // if voice is muted, bail out
  if (voiceToggle.textContent === '🔇') return;

  if (!('speechSynthesis' in window)) return;

  // remove HTML tags, then strip most emoji codepoints
  let clean = text
    .replace(/<[^>]+>/g, '')
    // remove emojis in the U+1F300–1F6FF, U+1F900–1F9FF, U+2600–U+26FF ranges:
    .replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}]/gu, '');

  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = 'en-US';
  speechSynthesis.speak(utter);
    }

    // strip all emojis & icons at start of each line
    function stripEmojis(str) {
      return str
        .split('\n')
        .map(line => line.replace(/^[\p{Emoji_Presentation}\p{Emoji}\uFE0F\s–—:]+/u, ''))
        .join('\n');
    }

    // ── DOM ELEMENTS ─────────────────────────────────────────────────────────────
    const toggleBtn   = document.getElementById('pipepal-toggle');
    const chatWindow  = document.getElementById('pipepal-chat');
    const closeBtn    = document.getElementById('pipepal-close');
    const sendBtn     = document.getElementById('pipepal-send');
    const inputField  = document.getElementById('pipepal-user-input');
    const bodyEl      = document.getElementById('pipepal-body');
    const typingEl    = document.getElementById('pipepal-typing');
    const headerEl    = document.getElementById('pipepal-header');
    let voiceToggle   = document.getElementById('pipepal-voice-toggle');

    // add voice toggle if missing
    if (headerEl && !voiceToggle) {
      voiceToggle = document.createElement('button');
      voiceToggle.id = 'pipepal-voice-toggle';
      voiceToggle.title = 'Toggle Voice';
      voiceToggle.textContent = '🔊';
      headerEl.appendChild(voiceToggle);
    }

    if (![toggleBtn, chatWindow, closeBtn, sendBtn, inputField, bodyEl, typingEl, voiceToggle].every(el => el)) {
      console.warn('❌ Missing elements for PipePal widget');
      return;
    }

    // ── SHOW/HIDE ────────────────────────────────────────────────────────────────
    toggleBtn.addEventListener('click', () => chatWindow.classList.toggle('pipepal-hidden'));
    closeBtn.addEventListener('click',  () => chatWindow.classList.add('pipepal-hidden'));

    // ── VOICE TOGGLE ─────────────────────────────────────────────────────────────
    voiceToggle.addEventListener('click', () => {
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      voiceEnabled = !voiceEnabled;
      voiceToggle.textContent = voiceEnabled ? '🔊' : '🔇';
    });

    // ── MESSAGE PERSISTENCE ───────────────────────────────────────────────────────
    function persistMessage(role, data) {
      const hist = loadHistory();
      hist.push({ role, data });
      saveHistory(hist);
    }

    // ── RENDER & SHOW MESSAGES ────────────────────────────────────────────────────
    function showUserMessageText(text) {
      const msg = document.createElement('div');
      msg.className = 'pipepal-msg pipepal-user';
      msg.textContent = text;
      bodyEl.appendChild(msg);
      persistMessage('user', { type: 'text', content: text });
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    function showUserMessageImage(file) {
      const blobUrl = URL.createObjectURL(file);
      const wrapper = document.createElement('div');
      wrapper.className = 'pipepal-msg pipepal-user';
      const img = document.createElement('img');
      img.src = blobUrl;
      img.onload = () => URL.revokeObjectURL(blobUrl);
      wrapper.appendChild(img);
      bodyEl.appendChild(wrapper);
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    function showBotMessage(html, isHTML=false) {
      // strip leading emojis/icons
      const content = stripEmojis(html);
      const msg = document.createElement('div');
      msg.className = 'pipepal-msg pipepal-bot';
      if (isHTML) msg.innerHTML = content;
      else        msg.textContent = content;
      bodyEl.appendChild(msg);
      persistMessage('bot', { type: 'bot', content, isHTML });
      speakText(content);
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    function renderHistory() {
      loadHistory().forEach(({ role, data }) => {
        if (role === 'user' && data.type === 'text') {
          const m = document.createElement('div');
          m.className = 'pipepal-msg pipepal-user';
          m.textContent = data.content;
          bodyEl.appendChild(m);
        }
        if (role === 'bot') {
          const m = document.createElement('div');
          m.className = 'pipepal-msg pipepal-bot';
          if (data.isHTML) m.innerHTML = data.content;
          else             m.textContent = data.content;
          bodyEl.appendChild(m);
        }
      });
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    // ── GREETING ────────────────────────────────────────────────────────────────
    function greetUser() {
      const udata = loadUserData();
      if (udata.Name) showBotMessage(`Welcome back, ${udata.Name}! How can I help today?`);
      else            showBotMessage("Hi there! I'm PipePal. What issue can I help you with today?");
    }

    // ── QUICK BUTTONS ────────────────────────────────────────────────────────────
    document.querySelectorAll('.pipepal-quick-buttons button').forEach(btn => {
      btn.addEventListener('click', () => {
        const txt = btn.textContent.trim();
        const quickMap = {
          'Book Appointment': 'appointment',
          'Get Quote':        'price',
          'Live Agent':       'connect_human',
          'Plumbing Emergency':'emergency',
          'Electrical Emergency':'emergency',
          'Heating Emergency':'emergency'
        };
        const intent = quickMap[txt];
        if (intent === 'appointment') {
          context.IntentName = 'appointment';
          context.State      = 'APPT_NAME';
          showBotMessage("Sure—what's your full name?");
        }
        else if (intent === 'connect_human') {
          showBotMessage('One moment—connecting you to a live agent…');
          forwardToTech('Live Agent');
        }
        else if (intent === 'emergency') {
          showBotMessage('Redirecting you to our 24/7 emergency line…');
          forwardToTech('Emergency');
          window.location.href = 'tel:5203332121';
        }
        else {
          inputField.value = txt;
          sendBtn.click();
        }
      });
    });

    // ── PHOTO DIAGNOSIS ──────────────────────────────────────────────────────────
    const fileInput = document.createElement('input');
    fileInput.type    = 'file';
    fileInput.accept  = 'image/*,.pdf';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    window.openPhotoDiagnosis = () => {
      chatWindow.classList.remove('pipepal-hidden');
      fileInput.click();
    };
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) processUserInput();
    });

    // ── INPUT HANDLERS ─────────────────────────────────────────────────────────
    inputField.addEventListener('keypress', e => e.key === 'Enter' && sendBtn.click());
    sendBtn.addEventListener('click', processUserInput);

    // ── LIFECYCLE ───────────────────────────────────────────────────────────────
    renderHistory();
    greetUser();

    // ── TECH FORWARD ────────────────────────────────────────────────────────────
    function forwardToTech(notes) {
      const fd = new FormData();
      ['Issue','CustomerID','Phone','Email','Name'].forEach(k => fd.append(k, context[k] || ''));
      fd.append('notes', notes || '');
      if (fileInput.files[0]) fd.append('imageFile', fileInput.files[0]);
      fetch(TECH_WEBHOOK, { method: 'POST', body: fd })
        .then(() => console.log('📩 Ticket sent'))
        .catch(console.warn);
    }
// ── APPT FLOW ───────────────────────────────────────────────────────────────
async function handleAppointmentFlow(answer) {
  if (context.State === 'APPT_NAME') {
    context.Name  = answer;
    context.State = 'APPT_PHONE';
    showBotMessage('Thanks! Can I get your phone number?');

  } else if (context.State === 'APPT_PHONE') {
    context.Phone = answer;
    context.State = 'APPT_EMAIL';
    showBotMessage("Great—what's your email?");

  } else if (context.State === 'APPT_EMAIL') {
    context.Email = answer;

    // 🚀 Send the collected lead to your appointment endpoint
    try {
      await fetch(APPT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:  context.Name,
          phone: context.Phone,
          email: context.Email,
          issue: context.Issue
        })
      });
      console.log('📩 Appointment lead logged');
    } catch (err) {
      console.warn('❌ Failed to log appointment lead:', err);
    }

    // then show the booking link
    showBotMessage('All set! Here’s your booking link:');
    showBotMessage(
      '<a href="https://yourbooking.link" target="_blank">📅 Book an Appointment</a>',
      true
    );
    context.State = 'DONE';
  }
}

    // ── MAIN PROCESS ────────────────────────────────────────────────────────────
    async function processUserInput() {
      const text = inputField.value.trim();
      inputField.value = '';

      if (fileInput.files[0]) showUserMessageImage(fileInput.files[0]);
      if (text) showUserMessageText(text);

      if (context.State.startsWith('APPT_')) {
        return handleAppointmentFlow(text);
      }

      const fd = new FormData();
      if (text)               fd.append('message', text);
      if (fileInput.files[0]) fd.append('imageFile', fileInput.files[0]);
      fd.append('context', JSON.stringify(context));

      try {
        const res = await fetch(WEBHOOK_URL, { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        let data = {};
        try { data = JSON.parse(txt); } catch { console.warn('Malformed JSON:', txt); }
        if (Array.isArray(data)) data = data[0] || {};

        if (data.emergencyType) {
          showBotMessage(`🚨 ${data.emergencyType} Emergency!`);
          showBotMessage('<a href="tel:5203332121" class="pipepal-emergency-btn">📞 Call Now</a>', true);
          forwardToTech(text);
          return;
        }

        // normal AI reply
        const reply = data.reply || data.customerMessage;
        if (reply) {
        showBotMessage(reply, /<[^>]+>/.test(reply));
        } else {
  // **FALLBACK** when no reply was provided
  showBotMessage("Thanks, our emergency team has been notified and will reach out shortly.");
}
      }
      catch (err) {
        console.error('❌ Error in processUserInput:', err);
        showBotMessage(`⚠️ Error: ${err.message}`);
      }
    }
  }

  // ── EXPORT & GLOBAL ──────────────────────────────────────────────────────────
  const PipePal = { init: initPipepal };
  window.PipePal = PipePal;
  // document.addEventListener('DOMContentLoaded', initPipepal);
})();
