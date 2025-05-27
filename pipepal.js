/**
 * pipepal.js
 * Full PipePal widget implementation for Arizona Plumbing Pros
 * Updated to support image thumbnails, appointment flow, emergencies, etc.
 */
(function() {
  // ── ENTRYPOINT ────────────────────────────────────────────────────────────────
  function initPipepal() {
    console.log("✅ PipePal JS Loaded");

    // ── CONFIG ───────────────────────────────────────────────────────────────────
    const WEBHOOK_URL  = 'https://haneshbb.app.n8n.cloud/webhook-test/pipepal-sosy';
    const TECH_WEBHOOK = 'https://haneshbb.app.n8n.cloud/webhook/receive-ticket';
    const APPT_WEBHOOK = 'https://haneshbb.app.n8n.cloud/webhook/log-lead';
    const STORAGE_KEY  = 'pipepal_chat_history';
    const USER_KEY     = 'pipepal_user_data';

    // ── STATE & CONTEXT ──────────────────────────────────────────────────────────
    const context = {
      State:           'COLLECT_ISSUE', // or APPT_NAME, APPT_PHONE, APPT_EMAIL, DONE
      Issue:           null,
      CustomerID:      null,
      Phone:           null,
      Email:           null,
      AppointmentDate: null,
      Name:            null,
      IntentName:      null
    };

    // ── UTILS ────────────────────────────────────────────────────────────────────
    function saveHistory(entries) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
    function loadHistory() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
      catch { return []; }
    }
    function saveUserData() {
      localStorage.setItem(USER_KEY, JSON.stringify({
        Issue:      context.Issue,
        CustomerID: context.CustomerID,
        Phone:      context.Phone,
        Email:      context.Email,
        Name:       context.Name
      }));
    }
    function loadUserData() {
      try { return JSON.parse(localStorage.getItem(USER_KEY)) || {}; }
      catch { return {}; }
    }
    function speakText(text) {
      if (!('speechSynthesis' in window)) return;
      const clean = text.replace(/<[^>]+>/g, '');
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = 'en-US';
      speechSynthesis.speak(utter);
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

    // Add voice toggle button
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
    closeBtn.addEventListener('click', () => chatWindow.classList.add('pipepal-hidden'));

    // ── VOICE TOGGLE ─────────────────────────────────────────────────────────────
    voiceToggle.addEventListener('click', () => {
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      voiceToggle.textContent = voiceToggle.textContent === '🔊' ? '🔇' : '🔊';
    });

    // ── MESSAGE RENDERING ─────────────────────────────────────────────────────────
    function persistMessage(role, html) {
      const hist = loadHistory();
      hist.push({ role, html });
      saveHistory(hist);
    }
    function showUserMessageText(text) {
      const msg = document.createElement('div');
      msg.className = 'pipepal-msg pipepal-user';
      msg.textContent = text;
      bodyEl.appendChild(msg);
      persistMessage('user', text);
    }
    function showUserMessageImage(src) {
      const wrapper = document.createElement('div');
      wrapper.className = 'pipepal-msg pipepal-user';
      const img = document.createElement('img');
      img.src = src;
      img.onload = () => URL.revokeObjectURL(src);
      img.style.maxWidth = '200px';
      img.style.borderRadius = '4px';
      img.style.margin = '8px 0';
      wrapper.appendChild(img);
      bodyEl.appendChild(wrapper);
      persistMessage('user', wrapper.innerHTML);
    }
    function showBotMessage(html, isHTML=false, shouldSpeak=true) {
      const msg = document.createElement('div');
      msg.className = 'pipepal-msg pipepal-bot';
      if (isHTML) msg.innerHTML = html;
      else        msg.textContent = html;
      bodyEl.appendChild(msg);
      persistMessage('bot', isHTML ? html : msg.textContent);
      if (shouldSpeak) speakText(isHTML ? msg.textContent : html);
    }
    function renderHistory() {
      loadHistory().forEach(({ role, html }) => {
        const el = document.createElement('div');
        el.className = `pipepal-msg pipepal-${role}`;
        el.innerHTML = html;
        bodyEl.appendChild(el);
      });
    }

    // ── GREETING ────────────────────────────────────────────────────────────────
    function greetUser() {
      const udata = loadUserData();
      if (udata.Name) showBotMessage(`Welcome back, ${udata.Name}! How can I help today?`);
      else            showBotMessage("Hi there! I'm PipePal. What issue can I help you with today?");
    }

    // ── QUICK BUTTONS ────────────────────────────────────────────────────────────
    const quickMap = {
      'Book Appointment':     'appointment',
      'Get Quote':            'price',
      'Live Agent':           'connect_human',
      'Plumbing Emergency':   'emergency',
      'Electrical Emergency': 'emergency',
      'Heating Emergency':    'emergency'
    };
    document.querySelectorAll('.pipepal-quick-buttons button').forEach(btn => {
      btn.addEventListener('click', () => {
        const txt = btn.textContent.trim();
        const intent = quickMap[txt];
        // appointment flow
        if (intent === 'appointment') {
          context.IntentName = 'appointment';
          context.State      = 'APPT_NAME';
          showBotMessage("Sure—what's your full name?");
          return;
        }
        // connect human
        if (intent === 'connect_human') {
          showBotMessage('One moment—connecting you to a live agent…');
          forwardToTech('Live Agent');
          return;
        }
        // emergency
        if (intent === 'emergency') {
          showBotMessage('Connecting you directly to our 24/7 emergency line…', false);
          forwardToTech('Emergency');
          window.location.href = 'tel:5203332121';
          return;
        }
        // fallback: treat as text
        inputField.value = txt;
        sendBtn.click();
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

    // ── FORWARD TO TECH ─────────────────────────────────────────────────────────
    function forwardToTech(notes) {
      const fd = new FormData();
      ['Issue','CustomerID','Phone','Email','Name']
        .forEach(k => fd.append(k, context[k]||''));  
      fd.append('notes', notes || '');
      if (fileInput.files[0]) fd.append('imageFile', fileInput.files[0]);
      fetch(TECH_WEBHOOK, { method: 'POST', body: fd })
        .then(() => console.log('📩 Ticket sent to tech'))
        .catch(console.warn);
    }

    // ── APPOINTMENT FLOW ────────────────────────────────────────────────────────
    async function handleAppointmentFlow(answer) {
      if (context.State === 'APPT_NAME') {
        context.Name  = answer;
        context.State = 'APPT_PHONE';
        showBotMessage('Thanks! Can I get your phone number?');
      }
      else if (context.State === 'APPT_PHONE') {
        context.Phone = answer;
        context.State = 'APPT_EMAIL';
        showBotMessage("Great—what's your email?");
      }
      else if (context.State === 'APPT_EMAIL') {
        context.Email = answer;
        showBotMessage('All set! Here’s your booking link:');
        showBotMessage('<a href="https://yourbooking.link" target="_blank">📅 Book an Appointment</a>', true);
        context.State = 'DONE';
      }
    }

    // ── MAIN PROCESS ────────────────────────────────────────────────────────────
    async function processUserInput() {
      const text = inputField.value.trim();
      inputField.value = '';

      // 1) echo user content
      if (fileInput.files[0]) {
        const blobUrl = URL.createObjectURL(fileInput.files[0]);
        showUserMessageImage(blobUrl);
      }
      if (text) {
        showUserMessageText(text);
      }

      // 2) appointment sub-flow
      if (context.State.startsWith('APPT_')) {
        return handleAppointmentFlow(text);
      }

      // 3) build payload
      const fd = new FormData();
      if (text)                   fd.append('message', text);
      if (fileInput.files[0])     fd.append('imageFile', fileInput.files[0]);
      fd.append('context', JSON.stringify(context));

      // 4) call your AI webhook
      try {
        const res = await fetch(WEBHOOK_URL, { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        let data = {};
        try { data = JSON.parse(txt); } catch { console.warn('Malformed JSON:', txt); }
        if (Array.isArray(data)) data = data[0] || {};

        // emergency response
        if (data.emergencyType) {
          showBotMessage(`🚨 ${data.emergencyType} Emergency!`);
          showBotMessage('<a href="tel:5203332121" class="pipepal-emergency-btn">📞 Call Now</a>', true);
          forwardToTech(text);
          return;
        }

        // normal reply
        const reply = data.reply || data.customerMessage || '';
        if (reply) showBotMessage(reply, /<[^>]+>/.test(reply));
      }
      catch (err) {
        console.error('❌ Error in processUserInput:', err);
        showBotMessage(`⚠️ Error: ${err.message}`, false);
      }

      // clear file from next round
      fileInput.value = '';
    }
  }

  // ── EXPORT & GLOBAL ──────────────────────────────────────────────────────────
  const PipePal = { init: initPipepal };
  window.PipePal = PipePal;
  // document.addEventListener('DOMContentLoaded', initPipepal);
})();
