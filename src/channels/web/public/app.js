/**
 * app.js — Vanilla-JS client for the BIAgent Web Chat demo.
 *
 * Talks to the same engine as the Microsoft Teams bot via a plain JSON API
 * (POST /api/chat, GET /api/welcome, GET /api/alerts/preview) and renders the
 * Adaptive Card JSON responses with a small custom renderer covering the
 * specific card elements this app emits (Container, TextBlock, FactSet,
 * ColumnSet/Column, Action.Submit). No frameworks, no build step.
 */

(function () {
  'use strict';

  const SESSION_KEY = 'biagent_session_id';
  const messagesEl = document.getElementById('messages');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const langButtons = document.querySelectorAll('.lang-btn');
  const previewAlertsBtn = document.getElementById('preview-alerts-btn');
  const quickActions = document.getElementById('quick-actions');

  let currentLang = 'en';

  function getSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  /** Convert Adaptive Cards' limited markdown (only **bold** is used here) to HTML. */
  function renderInlineMarkdown(text) {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  // ── Adaptive Card renderer ────────────────────────────────────────────

  function sizeClass(size) {
    return 'ac-size-' + (size ? String(size).toLowerCase() : 'default');
  }

  function colorClass(color) {
    return 'ac-color-' + (color ? String(color).toLowerCase() : 'default');
  }

  function renderTextBlock(node) {
    const el = document.createElement('div');
    el.className = [
      'ac-textblock',
      sizeClass(node.size),
      colorClass(node.color),
      node.weight === 'Bolder' ? 'ac-weight-bolder' : '',
      node.weight === 'Lighter' ? 'ac-weight-lighter' : '',
      node.isSubtle ? 'ac-subtle' : '',
      node.rtl ? 'rtl' : '',
    ]
      .filter(Boolean)
      .join(' ');
    el.innerHTML = renderInlineMarkdown(node.text);
    return el;
  }

  function renderFactSet(node) {
    const table = document.createElement('table');
    table.className = 'ac-factset' + (node.rtl ? ' rtl' : '');
    (node.facts || []).forEach(function (fact) {
      const row = document.createElement('tr');
      const titleCell = document.createElement('td');
      titleCell.className = 'fact-title';
      titleCell.innerHTML = renderInlineMarkdown(fact.title);
      const valueCell = document.createElement('td');
      valueCell.className = 'fact-value';
      valueCell.innerHTML = renderInlineMarkdown(fact.value);
      row.appendChild(titleCell);
      row.appendChild(valueCell);
      table.appendChild(row);
    });
    return table;
  }

  function renderColumn(col) {
    const el = document.createElement('div');
    el.className = 'ac-column ' + (col.width === 'auto' ? 'ac-column-auto' : 'ac-column-stretch');
    (col.items || []).forEach(function (child) {
      const rendered = renderNode(child);
      if (rendered) el.appendChild(rendered);
    });
    return el;
  }

  function renderColumnSet(node) {
    const el = document.createElement('div');
    el.className = 'ac-columnset' + (node.rtl ? ' rtl' : '');
    (node.columns || []).forEach(function (col) {
      el.appendChild(renderColumn(col));
    });
    return el;
  }

  function renderContainer(node) {
    const el = document.createElement('div');
    el.className = [
      'ac-container',
      node.style === 'emphasis' ? 'ac-container-emphasis' : '',
      node.style === 'attention' ? 'ac-container-attention' : '',
    ]
      .filter(Boolean)
      .join(' ');
    (node.items || []).forEach(function (child) {
      const rendered = renderNode(child);
      if (rendered) el.appendChild(rendered);
    });
    return el;
  }

  function renderNode(node) {
    if (!node || !node.type) return null;
    switch (node.type) {
      case 'Container':
        return renderContainer(node);
      case 'TextBlock':
        return renderTextBlock(node);
      case 'FactSet':
        return renderFactSet(node);
      case 'ColumnSet':
        return renderColumnSet(node);
      case 'Column':
        return renderColumn(node);
      default:
        return null;
    }
  }

  /**
   * Render a full Adaptive Card JSON object into a DOM element.
   * @param {object} card - Adaptive Card JSON (as produced by core/cards/adaptiveCards.ts)
   * @param {(query: string) => void} onAction - callback invoked when an Action.Submit button is clicked
   */
  function renderCard(card, onAction) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ac-card';

    (card.body || []).forEach(function (node) {
      const rendered = renderNode(node);
      if (rendered) wrapper.appendChild(rendered);
    });

    if (Array.isArray(card.actions) && card.actions.length > 0) {
      const actionsRow = document.createElement('div');
      actionsRow.className = 'ac-actions';
      card.actions.forEach(function (action) {
        if (action.type !== 'Action.Submit') return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ac-action-btn';
        btn.textContent = action.title;
        btn.addEventListener('click', function () {
          if (action.data && action.data.query) onAction(action.data.query);
        });
        actionsRow.appendChild(btn);
      });
      wrapper.appendChild(actionsRow);
    }

    return wrapper;
  }

  // ── Chat UI ────────────────────────────────────────────────────────────

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addUserMessage(text) {
    const row = document.createElement('div');
    row.className = 'msg-row from-user';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function addBotCard(card) {
    const row = document.createElement('div');
    row.className = 'msg-row from-bot';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.appendChild(renderCard(card, sendMessage));
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function addBotText(text) {
    const row = document.createElement('div');
    row.className = 'msg-row from-bot';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble plain-text';
    bubble.textContent = text;
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function showTyping() {
    const row = document.createElement('div');
    row.className = 'msg-row from-bot';
    row.id = 'typing-row';
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.textContent = currentLang === 'he' ? 'ה-BIAgent מקליד…' : 'BIAgent is typing…';
    row.appendChild(indicator);
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function hideTyping() {
    const row = document.getElementById('typing-row');
    if (row) row.remove();
  }

  function setLanguage(lang) {
    currentLang = lang;
    langButtons.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    document.body.classList.toggle('rtl-mode', lang === 'he');
    input.placeholder =
      lang === 'he'
        ? 'שאל על מכירות, מלאי או הזמנות רכש… (עברית או אנגלית)'
        : 'Ask about sales, inventory, or purchase orders… (English or Hebrew)';
  }

  async function sendMessage(text) {
    if (!text || !text.trim()) return;
    addUserMessage(text);
    input.value = '';
    showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), text: text }),
      });
      const data = await res.json();
      hideTyping();

      if (data.language) setLanguage(data.language);

      if (data.adaptiveCard) {
        addBotCard(data.adaptiveCard);
      } else if (data.text) {
        addBotText(data.text);
      }
    } catch (err) {
      hideTyping();
      addBotText(
        currentLang === 'he'
          ? 'לא ניתן להתחבר לשרת. ודא שהשרת פועל ונסה שוב.'
          : 'Could not reach the server. Please make sure it is running and try again.',
      );
      // eslint-disable-next-line no-console
      console.error('BIAgent chat request failed:', err);
    }
  }

  async function previewAlerts() {
    showTyping();
    try {
      const res = await fetch('/api/alerts/preview?lang=' + currentLang);
      const data = await res.json();
      hideTyping();

      if (!data.alerts || data.alerts.length === 0) {
        addBotText(
          currentLang === 'he'
            ? '✅ הכל תקין — לא נמצאו התראות פעילות בנתוני הדמו כרגע.'
            : '✅ All clear — no alerts are currently triggered in the demo data.',
        );
        return;
      }

      addBotText(
        currentLang === 'he'
          ? 'כך תיראה התראה יזומה בערוץ Teams:'
          : "Here's what a proactive Teams channel alert would look like:",
      );
      data.alerts.forEach(function (alert) {
        addBotCard(alert.adaptiveCard);
      });
    } catch (err) {
      hideTyping();
      addBotText(
        currentLang === 'he' ? 'לא ניתן לטעון את תצוגת ההתראות.' : 'Could not load the alerts preview.',
      );
      // eslint-disable-next-line no-console
      console.error('BIAgent alerts preview failed:', err);
    }
  }

  async function loadWelcomeCard() {
    try {
      const res = await fetch('/api/welcome?lang=' + currentLang);
      const data = await res.json();
      addBotCard(data.adaptiveCard);
    } catch (err) {
      addBotText(
        '👋 Welcome to BIAgent. Ask about sales, inventory, or purchase orders — in English or Hebrew.',
      );
      // eslint-disable-next-line no-console
      console.error('BIAgent welcome card failed to load:', err);
    }
  }

  // ── Event wiring ───────────────────────────────────────────────────────

  form.addEventListener('submit', function (evt) {
    evt.preventDefault();
    sendMessage(input.value);
  });

  langButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      sendMessage(btn.dataset.lang === 'he' ? '/lang he' : '/lang en');
    });
  });

  quickActions.addEventListener('click', function (evt) {
    const btn = evt.target.closest('.quick-btn');
    if (!btn || btn === previewAlertsBtn) return;
    sendMessage(btn.dataset.query);
  });

  previewAlertsBtn.addEventListener('click', previewAlerts);

  setLanguage('en');
  loadWelcomeCard();
  input.focus();
})();
