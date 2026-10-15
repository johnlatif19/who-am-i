(function () {
  "use strict";

  const API_BASE = "/api";

  const els = {
    form: document.getElementById("login-form"),
    username: document.getElementById("username"),
    password: document.getElementById("password"),
    toggle: document.getElementById("toggle-password"),
    alert: document.getElementById("login-alert"),
    submit: document.getElementById("login-submit"),
    submitLabel: document.querySelector("#login-submit .btn-label"),
    submitSpinner: document.querySelector("#login-submit .btn-spinner"),
    lockNote: document.getElementById("lockout-note"),
    connection: document.getElementById("connection-indicator"),
    connectionLabel: document.querySelector("#connection-indicator .label"),
    footerYear: document.getElementById("footer-year"),
  };

  let submitting = false;
  let lockTimer = null;
  let lockUntil = 0;

  function setYear() {
    if (els.footerYear) {
      els.footerYear.textContent = String(new Date().getFullYear());
    }
  }

  function setConnectionState(state) {
    if (!els.connection) return;
    els.connection.dataset.state = state;
    if (els.connectionLabel) {
      els.connectionLabel.textContent = state === "online" ? "متصل" : "غير متصل";
    }
  }

  function initConnectionWatcher() {
    function update() {
      setConnectionState(navigator.onLine ? "online" : "offline");
    }
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
  }

  function clearFieldErrors() {
    document.querySelectorAll(".field-error").forEach(function (el) {
      el.hidden = true;
      el.textContent = "";
    });
    document.querySelectorAll(".input-wrap").forEach(function (el) {
      el.classList.remove("invalid");
    });
  }

  function setFieldError(name, message) {
    const errorEl = document.querySelector('.field-error[data-error-for="' + name + '"]');
    const inputEl = document.getElementById(name);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
    if (inputEl && inputEl.parentElement) {
      inputEl.parentElement.classList.add("invalid");
    }
  }

  function showAlert(type, message) {
    if (!els.alert) return;
    els.alert.dataset.type = type;
    els.alert.textContent = message;
    els.alert.hidden = false;
  }

  function hideAlert() {
    if (!els.alert) return;
    els.alert.hidden = true;
    els.alert.textContent = "";
    els.alert.removeAttribute("data-type");
  }

  function setSubmitting(state) {
    submitting = state;
    if (els.submit) els.submit.disabled = state;
    if (els.submitLabel) {
      els.submitLabel.textContent = state ? "جارٍ التحقق..." : "تسجيل الدخول";
    }
    if (els.submitSpinner) {
      els.submitSpinner.hidden = !state;
    }
  }

  function validateInputs() {
    clearFieldErrors();
    let ok = true;
    const username = els.username.value.trim();
    const password = els.password.value;

    if (!username) {
      setFieldError("username", "يرجى إدخال اسم المستخدم");
      ok = false;
    } else if (username.length < 3) {
      setFieldError("username", "اسم المستخدم قصير جدًا");
      ok = false;
    }

    if (!password) {
      setFieldError("password", "يرجى إدخال كلمة المرور");
      ok = false;
    } else if (password.length < 5) {
      setFieldError("password", "كلمة المرور قصيرة جدًا");
      ok = false;
    }

    return ok;
  }

  function togglePasswordVisibility() {
    if (!els.password || !els.toggle) return;
    const isHidden = els.password.type === "password";
    els.password.type = isHidden ? "text" : "password";
    els.toggle.setAttribute("aria-pressed", String(isHidden));
    els.toggle.setAttribute("aria-label", isHidden ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
  }

  function startLockCountdown(seconds) {
    lockUntil = Date.now() + seconds * 1000;
    if (lockTimer) clearInterval(lockTimer);

    function tick() {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      if (remaining <= 0) {
        clearInterval(lockTimer);
        lockTimer = null;
        if (els.lockNote) {
          els.lockNote.hidden = true;
          els.lockNote.textContent = "";
        }
        if (els.submit) els.submit.disabled = false;
        return;
      }
      if (els.lockNote) {
        els.lockNote.hidden = false;
        els.lockNote.textContent = "محاولات كثيرة. يرجى الانتظار " + remaining + " ثانية قبل المحاولة مجددًا.";
      }
      if (els.submit) els.submit.disabled = true;
    }

    tick();
    lockTimer = setInterval(tick, 1000);
  }

  async function redirectIfAlreadyLoggedIn() {
    try {
      const res = await fetch(API_BASE + "/auth/session", {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) return false;
      const data = await res.json().catch(function () { return null; });
      if (data && data.success && data.role === "admin") {
        window.location.replace("/admin-dashboard");
        return true;
      }
    } catch (e) {
    }
    return false;
  }

  async function submitLogin(event) {
    event.preventDefault();
    if (submitting) return;
    if (lockTimer) return;
    hideAlert();

    if (!validateInputs()) return;

    const payload = {
      username: els.username.value.trim(),
      password: els.password.value,
    };

    setSubmitting(true);

    try {
      const res = await fetch(API_BASE + "/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }

      if (res.ok && data && data.success) {
        showAlert("success", "تم تسجيل الدخول بنجاح. جارٍ التحويل...");
        setTimeout(function () {
          window.location.replace("/admin-dashboard");
        }, 500);
        return;
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After")) || 60;
        showAlert("error", "تم تجاوز عدد المحاولات المسموح. يرجى المحاولة لاحقًا.");
        startLockCountdown(retryAfter);
        return;
      }

      if (res.status === 401) {
        showAlert("error", "اسم المستخدم أو كلمة المرور غير صحيحة.");
        return;
      }

      if (res.status === 400) {
        showAlert("error", (data && data.message) || "بيانات الدخول غير صحيحة.");
        return;
      }

      showAlert("error", (data && data.message) || "تعذر تسجيل الدخول. حاول مرة أخرى.");
    } catch (e) {
      showAlert("error", "تعذر الاتصال بالسيرفر. تحقق من اتصالك بالإنترنت وحاول مجددًا.");
    } finally {
      setSubmitting(false);
    }
  }

  async function init() {
    const redirected = await redirectIfAlreadyLoggedIn();
    if (redirected) return;

    setYear();
    initConnectionWatcher();

    if (els.toggle) {
      els.toggle.addEventListener("click", togglePasswordVisibility);
    }

    if (els.form) {
      els.form.addEventListener("submit", submitLogin);
    }

    [els.username, els.password].forEach(function (input) {
      if (!input) return;
      input.addEventListener("input", function () {
        const wrap = input.parentElement;
        if (wrap) wrap.classList.remove("invalid");
        const err = document.querySelector('.field-error[data-error-for="' + input.id + '"]');
        if (err) {
          err.hidden = true;
          err.textContent = "";
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();