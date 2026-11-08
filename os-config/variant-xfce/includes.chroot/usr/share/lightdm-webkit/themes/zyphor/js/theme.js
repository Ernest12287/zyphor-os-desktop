/* ============================================================
   Zyphor OS login screen — LightDM WebKit greeter theme logic

   Works with lightdm-webkit2-greeter and with web-greeter, both of
   which expose the same `lightdm` object plus the show_prompt /
   show_message / authentication_complete callbacks.

   Opened in a plain browser (no `lightdm` object) it falls back to a
   clearly badged preview mode so the design can be reviewed without
   booting the ISO.
   ============================================================ */

(function () {
  'use strict';

  var FALLBACK_AVATAR = 'assets/zyphor-avatar.png';
  var os = (typeof window.lightdm !== 'undefined') ? window.lightdm : null;
  var demo = os === null;

  var users = [];
  var selected = 0;
  var pendingPassword = null;
  var promptReady = false;
  var shakeTimer = null;
  var authTimer = null;

  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /* ---------- clock ---------- */

  function tickClock() {
    var now = new Date();
    els.clockTime.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
    els.clockDate.textContent =
      now.getFullYear() + '/' + pad(now.getMonth() + 1) + '/' + pad(now.getDate()) +
      '  ' + WEEKDAYS[now.getDay()];
  }

  /* ---------- user model ---------- */

  function userLabel(user) {
    if (!user) {
      return 'Zyphor OS';
    }
    return user.display_name || user.real_name || user.name || 'Zyphor OS';
  }

  function userImage(user) {
    var image = user && user.image ? String(user.image) : '';
    return image || FALLBACK_AVATAR;
  }

  function currentUser() {
    return users[selected] || null;
  }

  function setImage(img, src) {
    img.onerror = function () {
      img.onerror = null;
      img.src = FALLBACK_AVATAR;
    };
    img.src = src || FALLBACK_AVATAR;
  }

  function render() {
    var user = currentUser();
    els.name.textContent = userLabel(user);
    els.name.title = userLabel(user);
    setImage(els.avatar, userImage(user));
    renderStrip();
  }

  function renderStrip() {
    var strip = els.strip;
    strip.innerHTML = '';

    if (users.length < 2) {
      strip.hidden = true;
      return;
    }

    strip.hidden = false;
    users.forEach(function (user, index) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'user-chip' + (index === selected ? ' active' : '');
      chip.title = userLabel(user);
      chip.setAttribute('aria-label', userLabel(user));

      var img = document.createElement('img');
      img.alt = '';
      setImage(img, userImage(user));

      chip.appendChild(img);
      chip.addEventListener('click', function () {
        selectUser(index);
      });
      strip.appendChild(chip);
    });
  }

  /* ---------- messages ---------- */

  function notice(text, isError) {
    if (!text) {
      clearNotice();
      return;
    }
    els.notice.textContent = String(text);
    els.notice.classList.toggle('error', !!isError);
    els.notice.hidden = false;
  }

  function clearNotice() {
    els.notice.hidden = true;
    els.notice.textContent = '';
  }

  function shake() {
    els.card.classList.remove('shake');
    void els.card.offsetWidth; /* restart the animation */
    els.card.classList.add('shake');
    window.clearTimeout(shakeTimer);
    shakeTimer = window.setTimeout(function () {
      els.card.classList.remove('shake');
    }, 500);
  }

  /* ---------- authentication ---------- */

  function cancelAuth() {
    promptReady = false;
    pendingPassword = null;
    if (!demo && os.in_authentication) {
      try {
        os.cancel_authentication();
      } catch (e) {
        /* the greeter has already dropped the conversation */
      }
    }
  }

  function beginAuth() {
    if (demo) {
      return;
    }
    var user = currentUser();
    if (user && os.in_authentication && os.authentication_user === user.name) {
      return;
    }
    if (os.in_authentication) {
      try {
        os.cancel_authentication();
      } catch (e) {
        /* nothing to cancel */
      }
    }
    promptReady = false;
    try {
      /* A null user name makes the greeter ask for one, which is what is
         wanted when the user list is hidden or empty. */
      os.authenticate(user ? user.name : null);
    } catch (e) {
      notice('Could not start authentication', true);
    }
  }

  /* Send the queued password as soon as the greeter asks for it. */
  function flushPassword() {
    if (pendingPassword === null) {
      return;
    }
    var password = pendingPassword;
    pendingPassword = null;
    promptReady = false;
    try {
      os.respond(password);
    } catch (e) {
      notice('Login failed', true);
    }
  }

  function submit() {
    var password = els.password.value;

    if (!password) {
      notice('Enter your password', true);
      shake();
      els.password.focus();
      return;
    }

    clearNotice();

    if (demo) {
      els.password.value = '';
      notice('Preview mode — LightDM is not connected');
      return;
    }

    pendingPassword = password;
    els.password.value = '';

    if (!os.in_authentication) {
      beginAuth();
    }
    flushPassword();
  }

  function failed(message) {
    pendingPassword = null;
    promptReady = false;
    els.password.value = '';
    notice(message || 'Incorrect password, try again', true);
    shake();
    els.password.focus();
    window.clearTimeout(authTimer);
    /* Re-arm the conversation once the greeter has finished the last one. */
    authTimer = window.setTimeout(beginAuth, 60);
  }

  function selectUser(index) {
    if (index === selected) {
      els.password.focus();
      return;
    }
    selected = index;
    cancelAuth();
    clearNotice();
    els.password.value = '';
    render();
    els.password.focus();
    beginAuth();
  }

  /* ---------- LightDM callbacks ---------- */

  window.show_prompt = function (text, type) {
    promptReady = true;
    var secret = (type === 'password' || type === 'secret');
    var label = text ? String(text).replace(/[:\s]+$/, '') : '';

    els.password.type = secret ? 'password' : 'text';
    els.password.placeholder = label || (secret ? 'Password' : 'Username');
    els.password.setAttribute('aria-label', els.password.placeholder);
    els.password.focus();

    flushPassword();
  };

  window.show_message = function (text, type) {
    notice(text, type === 'error');
    if (type === 'error') {
      shake();
    }
  };

  window.authentication_complete = function () {
    if (demo) {
      return;
    }
    promptReady = false;

    if (!os.is_authenticated) {
      failed();
      return;
    }

    notice('Logging in…');
    var user = currentUser();
    var session = (user && user.session) || os.default_session;

    try {
      os.start_session_sync(session);
    } catch (e) {
      notice('Could not start session', true);
      window.clearTimeout(authTimer);
      authTimer = window.setTimeout(beginAuth, 60);
    }
  };

  window.autologin_timer_expired = function () {
    cancelAuth();
  };

  /* ---------- power menu ---------- */

  function openPowerMenu() {
    els.powerMenu.hidden = false;
    els.power.setAttribute('aria-expanded', 'true');
    var first = els.powerMenu.querySelector('.power-item:not([hidden])');
    if (first) {
      first.focus();
    }
  }

  function closePowerMenu() {
    if (els.powerMenu.hidden) {
      return;
    }
    els.powerMenu.hidden = true;
    els.power.setAttribute('aria-expanded', 'false');
  }

  function powerAllowed(action) {
    if (demo) {
      return true;
    }
    if (action === 'shutdown') {
      return !!os.can_shutdown;
    }
    if (action === 'restart') {
      return !!os.can_restart;
    }
    if (action === 'suspend') {
      return !!os.can_suspend;
    }
    return false;
  }

  function runPowerAction(action) {
    closePowerMenu();

    if (demo) {
      notice('Preview mode — power actions are disabled');
      return;
    }

    try {
      if (action === 'shutdown') {
        os.shutdown();
      } else if (action === 'restart') {
        os.restart();
      } else if (action === 'suspend') {
        os.suspend();
      }
    } catch (e) {
      notice('Power action failed', true);
    }
  }

  function hideUnavailablePowerActions() {
    var items = els.powerMenu.querySelectorAll('.power-item');
    Array.prototype.forEach.call(items, function (item) {
      item.hidden = !powerAllowed(item.getAttribute('data-action'));
    });
  }

  /* ---------- caps lock ---------- */

  function updateCaps(event) {
    if (typeof event.getModifierState !== 'function') {
      return;
    }
    els.caps.hidden = !event.getModifierState('CapsLock');
  }

  /* ---------- wiring ---------- */

  function bind() {
    els.form.addEventListener('submit', function (event) {
      event.preventDefault();
      submit();
    });

    els.submit.addEventListener('click', submit);
    els.card.addEventListener('click', function (event) {
      if (event.target === els.card) {
        els.password.focus();
      }
    });

    els.password.addEventListener('keydown', updateCaps);
    els.password.addEventListener('keyup', updateCaps);
    els.password.addEventListener('blur', function () {
      els.caps.hidden = true;
    });

    els.power.addEventListener('click', function () {
      if (els.powerMenu.hidden) {
        openPowerMenu();
      } else {
        closePowerMenu();
      }
    });

    els.powerMenu.addEventListener('click', function (event) {
      var item = event.target.closest ? event.target.closest('.power-item') : null;
      if (item) {
        runPowerAction(item.getAttribute('data-action'));
      }
    });

    document.addEventListener('mousedown', function (event) {
      if (els.powerMenu.hidden) {
        return;
      }
      if (els.powerMenu.contains(event.target) || els.power.contains(event.target)) {
        return;
      }
      closePowerMenu();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closePowerMenu();
      }
    });
  }

  /* ---------- boot ---------- */

  function demoUsers() {
    return [
      { name: 'zyphor', display_name: 'Zyphor Live user', image: '' },
      { name: 'markjason', display_name: 'Mark Jason', image: '' }
    ];
  }

  function boot() {
    els = {
      clockTime: $('clock-time'),
      clockDate: $('clock-date'),
      strip: $('user-strip'),
      card: $('card'),
      avatar: $('avatar'),
      name: $('user-name'),
      notice: $('notice'),
      form: $('credentials'),
      password: $('password'),
      caps: $('caps'),
      submit: $('submit'),
      power: $('power'),
      powerMenu: $('power-menu'),
      brandSub: $('brand-sub'),
      badge: $('demo-badge')
    };

    bind();
    tickClock();
    window.setInterval(tickClock, 1000);

    if (demo) {
      users = demoUsers();
      els.badge.hidden = false;
      els.brandSub.textContent = 'live session';
      render();
      els.password.focus();
      return;
    }

    var list = os.users || [];
    users = [];
    for (var i = 0; i < list.length; i++) {
      users.push(list[i]);
    }

    if (os.select_user) {
      for (var j = 0; j < users.length; j++) {
        if (users[j].name === os.select_user) {
          selected = j;
          break;
        }
      }
    }

    els.brandSub.textContent = os.hostname || '';
    render();
    hideUnavailablePowerActions();
    els.password.focus();
    beginAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
