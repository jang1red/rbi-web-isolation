/* ===== RBCloud Browser 자동 로그인 + 브랜딩 초기화 ===== */
(function () {
  document.title = 'RBCloud Browser';

  var params = new URLSearchParams(window.location.search);
  /* noauth 모드라 실제 비번 검증은 안 하지만, 폼이 빈 비번을 막으므로 더미값을 채워 버튼을 활성화 */
  var pwd = params.get('pwd') || 'rbcloud';
  var usr = params.get('usr') || 'RBCloud';

  /* Vue3 / React 의 v-model 이 무시하지 않도록 native setter + 다중 이벤트 */
  function setVal(el, val) {
    var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
                                          : window.HTMLInputElement.prototype;
    try {
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
    } catch (e) { el.value = val; }
    ['input', 'change', 'blur', 'keydown', 'keyup'].forEach(function (ev) {
      el.dispatchEvent(new Event(ev, { bubbles: true }));
    });
  }

  function pressEnter(el) {
    ['keydown', 'keypress', 'keyup'].forEach(function (t) {
      el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    });
  }

  var tries = 0, MAX = 120; /* 최대 ~30초 */
  var timer = setInterval(function () {
    tries++;
    if (tries > MAX) { clearInterval(timer); return; }

    var inputs = Array.from(document.querySelectorAll('input'));
    if (!inputs.length) return; /* 폼 아직 미로딩 */

    var passInput = inputs.find(function (el) {
      return el.type === 'password' || /pass|비밀번호/i.test(el.placeholder || '');
    });
    var userInput = inputs.find(function (el) {
      return el !== passInput &&
        (el.type === 'text' || el.type === '' || /이름|name|user|표시/i.test(el.placeholder || ''));
    });

    /* 표시이름 + 비번(더미) 모두 채워서 버튼 활성화 보장 */
    if (userInput) setVal(userInput, usr);
    if (passInput) setVal(passInput, pwd);

    /* 잠깐 기다렸다가 연결 시도 (Vue reactivity 반영 시간) */
    setTimeout(function () {
      var btns = Array.from(document.querySelectorAll('button, input[type=submit]'));
      var btn = btns.find(function (b) {
        return /연결|connect|join|enter|login|로그인/i.test((b.textContent || '') + (b.value || ''));
      });

      if (btn && !btn.disabled) {
        btn.click();
        clearInterval(timer);
      } else {
        /* 버튼이 여전히 막혀있으면: form submit + Enter 키로 재시도 */
        var form = (passInput || userInput || {}).form;
        if (form) { try { form.requestSubmit ? form.requestSubmit() : form.submit(); } catch (e) {} }
        if (passInput) pressEnter(passInput);
        else if (userInput) pressEnter(userInput);
      }
    }, 150);
  }, 250);
})();
