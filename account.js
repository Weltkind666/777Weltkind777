/* Self-service account UI. API owns prices, quotas and revoke completion. */
function accountToken_() { return sessionStorage.getItem('wkAccount_' + gasPhone) || ''; }
function saveAccountToken_(phone, token) { sessionStorage.setItem('wkAccount_' + phone, token); }
async function accountCall_(op, extra) {
  const result = await gasApi(Object.assign({ action: 'account', op, phone: gasPhone, accountToken: accountToken_() }, extra || {}), 30000);
  if (!result || result.status === 'error') throw new Error((result && result.message) || 'Нет ответа');
  return result;
}
function accountEscapeHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// Custom in-page modal instead of window.prompt(): many mobile browsers/PWA
// webviews auto-dismiss native prompt()/confirm()/alert() dialogs when the
// tab loses visibility (e.g. user switches to Telegram/MAX to read the code).
// A regular DOM element does not get dismissed and survives backgrounding.
function accountCodeModal_(message) {
  return new Promise(function(resolve) {
    document.getElementById('account-code-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'account-code-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:900;display:flex;align-items:flex-end;justify-content:center;background:rgba(28,36,48,.28)';
    overlay.innerHTML =
      '<div style="width:100%;max-width:440px;margin:0 auto;background:#fff;border-radius:22px 22px 0 0;padding:20px 20px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 32px rgba(28,36,48,.08)">' +
        '<div style="font-size:.92rem;color:#44515C;margin-bottom:14px;white-space:pre-wrap;line-height:1.5">' + accountEscapeHtml_(message) + '</div>' +
        '<input id="account-code-input" class="inp" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Код из мессенджера" autocomplete="one-time-code" style="text-align:center;letter-spacing:.3em;font-size:1.2rem">' +
        '<button type="button" class="btn" id="account-code-ok">Подтвердить</button>' +
        '<button type="button" class="btn ghost" id="account-code-cancel">Отмена</button>' +
      '</div>';
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#account-code-input');
    const finish = function(value) { overlay.remove(); resolve(value); };
    overlay.querySelector('#account-code-ok').onclick = function() { finish((input.value || '').trim()); };
    overlay.querySelector('#account-code-cancel').onclick = function() { finish(null); };
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); finish((input.value || '').trim()); } });
    setTimeout(function() { input.focus(); }, 50);
  });
}
async function ensureAccountAuth_() {
  if (accountToken_()) {
    try { await accountCall_('status'); return true; }
    catch (e) { if (!/Подтвердите вход/.test(e.message)) throw e; sessionStorage.removeItem('wkAccount_' + gasPhone); }
  }
  const sent = await accountCall_('requestCode');
  const code = await accountCodeModal_(sent.message + '\nВведите шестизначный код:');
  if (!code) return false;
  const verified = await accountCall_('verifyCode', { code: code.trim() });
  saveAccountToken_(gasPhone, verified.accountToken);
  return true;
}
function accountPanel_() {
  let panel = document.getElementById('account-panel');
  if (!panel) {
    panel = document.createElement('section'); panel.id = 'account-panel'; panel.className = 'card';
    document.getElementById('gas-home-view').prepend(panel);
  }
  return panel;
}
function accountButton_(parent, text, action, danger) {
  const button = document.createElement('button'); button.type = 'button'; button.className = danger ? 'btn danger' : 'btn sec'; button.textContent = text;
  button.onclick = async function() {
    button.disabled = true;
    try { await action(); } catch (err) { toast(err.message || 'Ошибка'); }
    finally { button.disabled = false; }
  };
  parent.appendChild(button); return button;
}
let accountDevicesPollTimer_ = null;
async function openAccountDevices(opt) {
  opt = opt || {};
  if (accountDevicesPollTimer_) { clearTimeout(accountDevicesPollTimer_); accountDevicesPollTimer_ = null; }
  try {
    if (!gasPhone) { toast('Сначала войдите по номеру'); return; }
    if (!await ensureAccountAuth_()) return;
    const result = await accountCall_('status');
    const data = result.data;
    gasUserData = data;
    const panel = accountPanel_(); panel.replaceChildren();
    const title = document.createElement('h3'); title.textContent = 'Устройства (' + data.deviceUsed + ' из ' + data.deviceLimit + ')'; panel.appendChild(title);
    const text = document.createElement('p'); text.className = 'sub';
    text.innerHTML = '<strong>Отвязать</strong> — освободить слот, тариф не меняется, ключ можно выдать заново.<br><strong>Убрать из тарифа</strong> — слот пропадает совсем, следующий платёж меньше. За текущий месяц деньги не возвращаются.';
    panel.appendChild(text);
    const resets = result.resets || [];
    (data.devices || []).forEach(function(device) {
      const item = document.createElement('div'); item.className = 'card';
      const name = document.createElement('strong'); name.textContent = (device.kind === 'wifi' ? 'Wi-Fi · ' : '') + (device.label || device.configName || device.deviceTail); item.appendChild(name);
      const location = document.createElement('p'); location.textContent = device.host || 'Конфиг ещё не создан'; item.appendChild(location);
      const pending = resets.some(r => r.deviceId === device.deviceId);
      if (pending) {
        const status = document.createElement('p'); status.style.cssText='font-weight:600;color:var(--accent2)';
        status.textContent = '⏳ Отвязка выполняется — обычно до пары минут. Сейчас обновится само.'; item.appendChild(status);
      } else {
        const change = async function(op) {
          const warning = op === 'remove'
            ? 'Убрать устройство из тарифа? Слот пропадёт совсем, следующий платёж станет меньше. За текущий месяц деньги не вернутся.'
            : 'Отвязать устройство? Старый ключ перестанет работать — можно будет сразу создать новый.';
          if (!confirm(warning)) return;
          const reply = await accountCall_(op, { deviceId: device.deviceId });
          toast(reply.message);
          const keys = loadWebKeys().filter(k => k.id !== device.deviceId); saveWebKeys(keys);
          _lsSet('wk_vpn_' + normalizePhone(gasPhone), '');
          await openAccountDevices();
        };
        accountButton_(item, 'Отвязать устройство', () => change('reset'), true);
        if (data.deviceLimit > 1) accountButton_(item, 'Убрать из тарифа', () => change('remove'), true);
      }
      panel.appendChild(item);
    });
    if (!(data.devices || []).length) { const empty = document.createElement('p'); empty.textContent = 'Привязанных устройств пока нет.'; panel.appendChild(empty); }
    for (const device of result.revokedDevices || []) {
      if (resets.some(r => r.deviceId === device.deviceId)) continue;
      accountButton_(panel, 'Разрешить повторный вход · ' + device.label, async function() {
        if (!confirm('Снова разрешить этому устройству получать ключ? Оно сможет занять свободный слот.')) return;
        const reply = await accountCall_('authorizeDevice', {deviceId:device.deviceId});
        toast(reply.message); await openAccountDevices();
      });
    }
    if (data.deviceLimit > 1 && data.deviceLimit > data.deviceUsed && !result.change && !resets.length) {
      const tariffs = data.deviceTariffs || { deviceCount: data.deviceLimit, wifiCount: 0 };
      for (const kind of ['device', 'wifi']) {
        const used = (data.devices || []).filter(d => (d.kind || 'device') === kind).length;
        if (used >= (kind === 'wifi' ? tariffs.wifiCount : tariffs.deviceCount)) continue;
        accountButton_(panel, 'Убрать пустой слот · ' + (kind === 'wifi' ? 'Wi-Fi' : 'устройство'), async function() {
          if (confirm('Убрать незанятый слот из тарифа? Он не занят устройством. Возврата за текущий месяц нет.')) { await accountCall_('removeUnused', {deviceKind:kind}); await openAccountDevices(); }
        }, true);
      }
    }
    if (result.change) {
      const pending = document.createElement('p'); const c = result.change;
      pending.textContent = 'Заявка: ' + c.oldCount + ' → ' + c.count + ' устройств. Доплата ' + c.total.toFixed(2) + ' ₽. Реквизиты: ' + c.paymentMethod + ', ' + c.bank + '. После перевода ожидайте подтверждения администратора.';
      panel.appendChild(pending);
      accountButton_(panel, 'Отменить заявку на доплату', async () => { if (confirm('Отменить заявку? Если деньги уже переведены, сначала свяжитесь с поддержкой.')) { await accountCall_('cancelChange'); await openAccountDevices(); } });
    } else if (data.deviceLimit < 5) {
      for (const kind of ['device', 'wifi']) accountButton_(panel, kind === 'wifi' ? 'Добавить Wi-Fi в тариф' : 'Добавить устройство в тариф', async function() {
        const count = data.deviceLimit + 1;
        const result = await accountCall_('quote', { count, clientType: gasClientType, deviceKind: kind });
        const q = result.quote;
        const details = 'Устройств: ' + q.oldCount + ' → ' + q.count + '\nОсталось дней: ' + q.days + '\nДоплата: ' + q.total.toFixed(2) + ' ₽ (база ' + q.base.toFixed(2) + ' ₽ + надбавка ' + q.rate + '%).\nСледующий месяц: ' + q.nextMonthly.toFixed(2) + ' ₽.\nДата окончания подписки не изменится.\nСоздать заявку?';
        if (!confirm(details)) return;
        await accountCall_('add', { quoteId: q.id }); await openAccountDevices();
      });
    }
    accountButton_(panel, 'Обновить статус', openAccountDevices);
    accountButton_(panel, 'Закрыть', async () => {
      if (accountDevicesPollTimer_) { clearTimeout(accountDevicesPollTimer_); accountDevicesPollTimer_ = null; }
      panel.remove(); gasRefresh();
    });
    if (!opt.silent) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (resets.length) {
      accountDevicesPollTimer_ = setTimeout(() => openAccountDevices({ silent: true }), 5000);
    }
  } catch (err) { toast(err.message || 'Не удалось загрузить устройства'); }
}
function downloadWifiConfig(id) {
  const slot = loadWebKeys().find(s => s.id === id);
  if (!slot || slot.kind !== 'wifi') { toast('Wi-Fi оформляется отдельно по тарифу Wi-Fi'); return; }
  if (!slot || !slot.conf || !/^\s*\[Interface\]/m.test(slot.conf) || !/^\s*\[Peer\]/m.test(slot.conf)) {
    toast('Для старого ключа полный конфиг не сохранён. Пересоздайте этот ключ, затем скачайте Wi-Fi TXT.'); return;
  }
  const url = URL.createObjectURL(new Blob([slot.conf.replace(/\r\n/g, '\n')], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url;
  link.download = 'Weltkind-WiFi-' + String(slot.label || 'device').replace(/[^a-zа-я0-9_-]/gi, '_') + '.txt';
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function addWifiKeySlot() {
  try {
    if (!await ensureAccountAuth_()) return;
    const result = await accountCall_('status');
    gasUserData = result.data;
    const t = result.data.deviceTariffs || {};
    const used = (result.data.devices || []).filter(d => d.kind === 'wifi').length;
    const list = loadWebKeys();
    const existing = list.find(s => s.kind === 'wifi' && !s.vpn);
    if (!existing && used >= (t.wifiCount || 0)) {
      toast('Сначала добавьте Wi-Fi в тариф и дождитесь подтверждения доплаты');
      await openAccountDevices(); return;
    }
    if (!existing) {
      list.push({id:newWebDeviceId(), kind:'wifi', vpn:'', label:'Wi-Fi'});
      saveWebKeys(list);
    }
    toggleIosKeyPanel(true);
    gasRenderKeyCard(gasUserData, {skipSync:true});
    document.getElementById('home-key-body').scrollIntoView({behavior:'smooth', block:'start'});
  } catch (err) { toast(err.message || 'Не удалось открыть Wi-Fi'); }
}
