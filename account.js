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
    overlay.style.cssText = 'position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(28,36,48,.28)';
    overlay.innerHTML =
      '<div style="width:100%;max-width:320px;margin:auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 8px 32px rgba(28,36,48,.14)">' +
        '<div style="font-size:.92rem;color:#44515C;margin-bottom:14px;white-space:pre-wrap;line-height:1.5">' + accountEscapeHtml_(message) + '</div>' +
        '<input id="account-code-input" class="inp" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Код из мессенджера" autocomplete="one-time-code" style="text-align:center;letter-spacing:.3em;font-size:1.2rem">' +
        '<button type="button" class="btn" id="account-code-ok">Подтвердить</button>' +
        '<button type="button" class="btn ghost" id="account-code-cancel">Отмена</button>' +
      '</div>';
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#account-code-input');
    const finish = function(value) { if(value!==null && !/^\d{6}$/.test(value)){input.setCustomValidity('Введите 6 цифр');input.reportValidity();return;} overlay.remove(); resolve(value); };
    input.addEventListener('input',()=>input.setCustomValidity(''));
    overlay.querySelector('#account-code-ok').onclick = function() { finish((input.value || '').trim()); };
    overlay.querySelector('#account-code-cancel').onclick = function() { finish(null); };
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); finish((input.value || '').trim()); } });
    setTimeout(function() { input.focus(); }, 50);
  });
}
async function ensureAccountAuth_() {
  const phone = gasPhone;
  if (accountToken_()) {
    try { const status = await accountCall_('status'); return phone === gasPhone ? status : false; }
    catch (e) { if (!/Подтвердите вход/.test(e.message)) throw e; sessionStorage.removeItem('wkAccount_' + gasPhone); }
  }
  const sent = await accountCall_('requestCode');
  if (phone !== gasPhone) return false;
  const code = await accountCodeModal_(sent.message + '\nВведите шестизначный код:');
  if (!code || phone !== gasPhone) return false;
  const verified = await accountCall_('verifyCode', { code: code.trim() });
  if (phone !== gasPhone) return false;
  saveAccountToken_(phone, verified.accountToken);
  if (_lsGet(keyRequestStorage_())) scheduleKeyResume_();
  return true;
}
function accountMoney_(value) {
  return Number(value).toLocaleString('ru-RU', {style:'currency', currency:'RUB', minimumFractionDigits:2});
}
function accountQuoteModal_(quote) {
  return new Promise(function(resolve) {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'account-quote';
    dialog.setAttribute('aria-labelledby', 'account-quote-title');
    const esc = accountEscapeHtml_;
    const money = value => esc(accountMoney_(value));
    const paid = Number(quote.total) > 0;
    dialog.innerHTML =
      '<div class="account-quote-content">' +
      '<p class="account-step">ДОБАВЛЕНИЕ В ТАРИФ</p>' +
      '<h2 id="account-quote-title">' + (quote.kind === 'wifi' ? 'Подключить роутер Wi-Fi' : 'Добавить устройство') + '</h2>' +
      '<p>Сейчас мест: <strong>' + esc(quote.oldCount) + '</strong>. После подключения: <strong>' + esc(quote.count) + '</strong>.</p>' +
      '<div class="account-price"><span>' + (paid ? 'Доплатить сейчас' : 'Сейчас платить не нужно') + '</span><strong>' + money(quote.total) + '</strong>' +
      '<p>' + (paid ? 'За дополнительное место до ' + esc(quote.expiry) + '. Все надбавки уже включены.' : 'Место заработает после оплаты подписки.') + '</p></div>' +
      '<p class="account-next">При следующем продлении<br><strong>' + money(quote.nextMonthly) + ' за месяц</strong><br>За все ' + esc(quote.count) + ' мест вместе.</p>' +
      '<p>' + (paid ? 'Подписка останется до <strong>' + esc(quote.expiry) + '</strong>. Доплата не продлевает её.' : 'Сумма продления учитывает дополнительное место.') + '</p>' +
      '<details><summary>Как рассчитана сумма</summary><p>Оставшийся срок: ' + esc(quote.days) + ' дн.<br>Стоимость за этот срок: ' + money(quote.base) + '.<br>Надбавка ' + esc(quote.rate) + '%: ' + money(Number(quote.total) - Number(quote.base)) + '.</p></details>' +
      '<p class="account-help">' + (paid ? 'Далее покажем реквизиты. Деньги автоматически не спишутся. Место появится после подтверждения оплаты.' : 'Далее сохраним новое количество мест в тарифе.') + '</p>' +
      '<button type="button" class="btn" data-quote-accept>' + (paid ? 'Перейти к оплате' : 'Добавить место') + '</button>' +
      '<button type="button" class="btn ghost" data-quote-cancel>Не сейчас</button></div>';
    dialog.addEventListener('close', function() {
      const accepted = dialog.returnValue === 'accept';
      dialog.remove();
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
      resolve(accepted);
    }, {once:true});
    dialog.querySelector('[data-quote-accept]').onclick = () => dialog.close('accept');
    dialog.querySelector('[data-quote-cancel]').onclick = () => dialog.close('cancel');
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}
function accountPaymentCard_(change) {
  const card = document.createElement('div');
  card.className = 'account-payment';
  const esc = accountEscapeHtml_;
  card.innerHTML = '<h3>Оплата дополнительного места</h3>' +
    '<div class="account-price"><span>Сумма перевода</span><strong>' + esc(accountMoney_(change.total)) + '</strong></div>' +
    '<ol><li><strong>Переведите указанную сумму.</strong><p class="account-recipient">Реквизиты: ' + esc(change.paymentMethod) + '<br>Банк: ' + esc(change.bank) + '</p></li>' +
    '<li><strong>Сообщите об оплате в поддержку.</strong><p>Укажите номер аккаунта: ' + esc(gasPhone) + '.</p></li>' +
    '<li><strong>Дождитесь подтверждения.</strong><p>После него можно подключить дополнительное устройство.</p></li></ol>' +
    '<p>Если уже перевели деньги, повторно платить не нужно.</p>' +
    '<p class="account-help">Подписка до ' + esc(change.expiry) + '. Дата не меняется. При следующем продлении: ' + esc(accountMoney_(change.nextMonthly)) + ' за месяц за все ' + esc(change.count) + ' мест.</p>';
  accountButton_(card, 'Написать в поддержку', async function() { chatOpen(); });
  return card;
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
// Отдельный экран для отвязанных устройств вместо растущего списка кнопок в основной панели.
function accountRevokedModal_(devices, onAllow) {
  document.getElementById('account-revoked-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'account-revoked-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:900;display:flex;align-items:flex-end;justify-content:center;background:rgba(28,36,48,.28)';
  const box = document.createElement('div');
  box.style.cssText = 'width:100%;max-width:440px;max-height:80vh;overflow-y:auto;margin:0 auto;background:#fff;border-radius:22px 22px 0 0;padding:20px 20px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 32px rgba(28,36,48,.08)';
  const title = document.createElement('h3'); title.textContent = 'Отвязанные устройства'; box.appendChild(title);
  const hint = document.createElement('p'); hint.className = 'sub';
  hint.textContent = 'Эти устройства были отвязаны. Разрешите повторный вход, чтобы устройство снова могло получить ключ.';
  box.appendChild(hint);
  if (!devices.length) {
    const empty = document.createElement('p'); empty.textContent = 'Отвязанных устройств нет.'; box.appendChild(empty);
  }
  devices.forEach(function(device) {
    const item = document.createElement('div'); item.className = 'card';
    const name = document.createElement('strong'); name.textContent = device.label || device.configName || device.deviceTail; item.appendChild(name);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn sec'; btn.textContent = 'Разрешить повторный вход';
    btn.onclick = async function() {
      btn.disabled = true;
      try { await onAllow(device); overlay.remove(); }
      catch (e) { toast(e.message || 'Ошибка'); btn.disabled = false; }
    };
    item.appendChild(btn);
    box.appendChild(item);
  });
  const close = document.createElement('button'); close.type = 'button'; close.className = 'btn ghost'; close.textContent = 'Закрыть';
  close.onclick = function() { overlay.remove(); };
  box.appendChild(close);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
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
    if(result.quota){const q=result.quota,note=document.createElement('p');note.textContent='Привязано: '+q.bound+'. Создаётся: '+q.pending+'. Свободно: '+q.free+'. Обычных мест: '+q.deviceLimit+', Wi-Fi: '+q.wifiLimit+'.';panel.appendChild(note);}
    (result.reservations || []).forEach(function(r){
      const item=document.createElement('div');item.className='card';const label=document.createElement('p');label.textContent='Создание '+(r.kind==='wifi'?'Wi-Fi':'ключа')+': '+r.label+'. Бронь ещё '+Math.max(1,Math.ceil((r.expiresAt-Date.now())/60000))+' мин.';item.appendChild(label);
      accountButton_(item,'Отменить незавершённый запрос',async function(){await accountCall_('cancelReservation',{deviceId:r.deviceId});await openAccountDevices();},true);panel.appendChild(item);
    });
    (data.devices || []).forEach(function(device) {
      const item = document.createElement('div'); item.className = 'card';
      const name = document.createElement('strong'); name.textContent = (device.kind === 'wifi' ? 'Wi-Fi · ' : '') + (device.label || device.configName || device.deviceTail); item.appendChild(name);
      const location = document.createElement('p'); location.textContent = device.host || 'Конфиг ещё не создан'; item.appendChild(location);
      const pending = resets.some(r => r.deviceId === device.deviceId && !r.detached);
      if (pending) {
        const status = document.createElement('p'); status.style.cssText='font-weight:600;color:var(--accent2)';
        status.textContent = '⏳ Отвязка выполняется — обычно до пары минут. Сейчас обновится само.'; item.appendChild(status);
      } else {
        const change = async function(op) {
          const warning = op === 'remove'
            ? 'Убрать устройство из тарифа? Слот пропадёт совсем, следующий платёж станет меньше. За текущий месяц деньги не вернутся.'
            : 'Отвязать устройство? Место освободится сразу. Старый ключ будет удалён в фоне; недоступный сервер обработает отзыв при восстановлении связи.';
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
    const revokedPending = (result.revokedDevices || []).filter(d => !resets.some(r => r.deviceId === d.deviceId && !r.detached));
    if (revokedPending.length) {
      accountButton_(panel, 'Отвязанные устройства (' + revokedPending.length + ')', async function() {
        accountRevokedModal_(revokedPending, async function(device) {
          if (!confirm('Снова разрешить этому устройству получать ключ? Оно сможет занять свободный слот.')) return;
          const reply = await accountCall_('authorizeDevice', {deviceId:device.deviceId});
          toast(reply.message); await openAccountDevices();
        });
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
    if(resets.length){const note=document.createElement('p');note.textContent='Отвязано. Фоновое удаление старых ключей: '+resets.length+'. Можно пользоваться свободными местами; завершения очистки ждать не нужно.';panel.appendChild(note);}
    if (result.change) {
      panel.appendChild(accountPaymentCard_(result.change));
      accountButton_(panel, 'Отменить заявку на доплату', async () => { if (confirm('Отменить заявку? Если деньги уже переведены, сначала свяжитесь с поддержкой.')) { await accountCall_('cancelChange'); _lsSet(keyRequestStorage_(), ''); clearTimeout(keyFlowTimer_); keyFlowTimer_ = null; await openAccountDevices(); } });
    } else if (data.deviceLimit < 5) {
      for (const kind of ['device', 'wifi']) accountButton_(panel, kind === 'wifi' ? 'Добавить Wi-Fi в тариф' : 'Добавить устройство в тариф', async function() {
        const count = data.deviceLimit + 1;
        const result = await accountCall_('quote', { count, clientType: gasClientType, deviceKind: kind });
        const q = result.quote;
        if (!await accountQuoteModal_(q)) return;
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
  if (slot && slot.confirmed===false) { toast('Сначала завершите подтверждение выдачи ключа'); return; }
  if (!slot || slot.kind !== 'wifi') { toast('Wi-Fi оформляется отдельно по тарифу Wi-Fi'); return; }
  if (!slot || !slot.conf || !/^\s*\[Interface\]/m.test(slot.conf) || !/^\s*\[Peer\]/m.test(slot.conf)) {
    toast('Для старого ключа полный конфиг не сохранён. Пересоздайте этот ключ, затем скачайте Wi-Fi TXT.'); return;
  }
  const url = URL.createObjectURL(new Blob([slot.conf.replace(/\r\n/g, '\n')], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url;
  link.download = 'Weltkind-WiFi-' + String(slot.label || 'device').replace(/[^a-zа-я0-9_-]/gi, '_') + '.txt';
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function keyRequestStorage_() { return 'wk_key_request_' + normalizePhone(gasPhone); }
let keyFlowTimer_ = null, keyResumeAttempt_ = '';
function showKeyFlowMessage_(message) {
  toggleIosKeyPanel(true);
  const box = document.getElementById('home-key-flow');
  if (box) { box.textContent = message; box.classList.remove('gas-hidden'); }
}
function scheduleKeyResume_() {
  clearTimeout(keyFlowTimer_);
  const phone = gasPhone;
  keyFlowTimer_ = setTimeout(async () => {
    keyFlowTimer_ = null;
    if (phone !== gasPhone || !accountToken_() || !_lsGet(keyRequestStorage_())) return;
    if (document.visibilityState === 'visible' && !webKeyActionBusy_) {
      try {
        const request = JSON.parse(_lsGet(keyRequestStorage_()));
        await startKeyFlow_(request.kind, true, true);
      } catch (error) { showKeyFlowMessage_(error.message || 'Не удалось проверить оплату. Нажмите кнопку ключа ещё раз.'); }
    }
    const pending = _lsGet(keyRequestStorage_());
    if (pending && JSON.parse(pending).id !== keyResumeAttempt_) scheduleKeyResume_();
  }, 15000);
}
async function startKeyFlow_(kind, another = false, resume = false) {
  return keyAction_(document.getElementById(kind === 'wifi' ? 'home-wifi-toggle' : 'home-key-toggle'), async () => {
    if (!gasPhone) { toast('Сначала войдите по номеру'); return; }
    if (resume && !accountToken_()) return;
    const authenticated = await ensureAccountAuth_();
    if (!authenticated) return;
    const phone = gasPhone;
    const status = authenticated.data ? authenticated : await accountCall_('status');
    if (phone !== gasPhone) return;
    gasUserData = status.data;
    await restoreWebKeys_(false);
    if (phone !== gasPhone) return;
    let list = loadWebKeys();
    const storedRequest = _lsGet(keyRequestStorage_());
    const request = storedRequest ? JSON.parse(storedRequest) : null;
    const sameKind = slot => (slot.kind || 'device') === kind;
    const saved = list.find(slot => sameKind(slot) && slot.vpn && slot.confirmed !== false);
    if (saved && !another) {
      toggleIosKeyPanel(true);
      document.getElementById('wk-ta-' + saved.id)?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    if (resume && (!request || request.kind !== kind || keyResumeAttempt_ === request.id)) return;
    if (status.change) {
      if (!resume) await openAccountDevices();
      showKeyFlowMessage_('Ожидаем подтверждения доплаты. После него создадим ключ автоматически, пока кабинет открыт. Если закрыли — нажмите кнопку ключа после входа.');
      if (request) scheduleKeyResume_();
      return;
    }
    const draft = list.find(slot => sameKind(slot) && (!slot.vpn || slot.confirmed === false));
    const id = draft?.id || (request?.kind === kind ? request.id : newWebDeviceId());
    const tariffs = gasUserData.deviceTariffs || {deviceCount:gasUserData.deviceLimit,wifiCount:0};
    const occupied = (gasUserData.devices || []).concat((status.reservations || []).filter(reservation => !(gasUserData.devices || []).some(device => device.deviceId === reservation.deviceId)));
    const capacity = Number(kind === 'wifi' ? tariffs.wifiCount : tariffs.deviceCount) || 0;
    const ownPlace = occupied.some(slot => slot.deviceId === id && sameKind(slot));
    const free = ownPlace || (occupied.length < gasUserData.deviceLimit && occupied.filter(sameKind).length < capacity);
    if (!free) {
      if (resume) return;
      if (Number(gasUserData.deviceLimit) === 0) { showKeyFlowMessage_('Выдача ключей отключена. Напишите в поддержку.'); return; }
      if (Number(gasUserData.deviceLimit) >= 5 || (status.reservations || []).some(sameKind)) {
        showKeyFlowMessage_('Все места заняты или уже создаются. В разделе «Устройства» можно освободить ненужное место.');
        await openAccountDevices(); return;
      }
      const result = await accountCall_('quote', {count:Number(gasUserData.deviceLimit)+1,clientType:gasClientType,deviceKind:kind});
      if (!await accountQuoteModal_(result.quote) || phone !== gasPhone) return;
      _lsSet(keyRequestStorage_(), JSON.stringify({kind,id}));
      const added = await accountCall_('add', {quoteId:result.quote.id});
      scheduleKeyResume_();
      if (added.status === 'pending') {
        await openAccountDevices();
        showKeyFlowMessage_('Запрос сохранён. После оплаты и подтверждения создадим ваш ключ.');
      } else {
        await gasLogin(true);
        showKeyFlowMessage_('Место добавлено. Оплатите подписку — затем создадим ваш ключ.');
        showTab('pay');
      }
      return;
    }
    if (!isPaymentUiActive_(gasUserData)) {
      if (!resume) { showKeyFlowMessage_('Сначала продлите подписку. Сохранённые ключи останутся в кабинете.'); showTab('pay'); }
      return;
    }
    if (resume) keyResumeAttempt_ = id;
    if (!draft) { list.push({id,kind,vpn:'',label:kind === 'wifi' ? 'Мой роутер' : 'Мой iPhone / Mac'}); saveWebKeys(list); }
    gasRenderKeyCard(gasUserData, {skipSync:true});
    toggleIosKeyPanel(true);
    await createWebKeyInner_(id, false, true);
    if (phone !== gasPhone) return;
    const ready = loadWebKeys().find(slot => slot.id === id && slot.vpn && slot.confirmed !== false);
    if (ready) {
      if (request?.id === id) { _lsSet(keyRequestStorage_(), ''); clearTimeout(keyFlowTimer_); keyFlowTimer_ = null; document.getElementById('account-panel')?.remove(); }
      showKeyFlowMessage_(kind === 'wifi' ? 'Конфиг готов. Нажмите «Скачать Wi-Fi TXT» и импортируйте файл в роутер.' : 'Ключ готов. Скопируйте его и вставьте в приложение на iPhone / Mac.');
      document.getElementById('wk-ta-' + id)?.scrollIntoView({behavior:'smooth',block:'center'});
    }
  });
}
async function addWifiKeySlot() { return startKeyFlow_('wifi'); }
