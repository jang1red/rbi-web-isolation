/* ===== RBCloud Browser 자동 로그인 + 브랜딩 초기화 ===== */
(function () {
  document.title = 'RBCloud Browser';

  var params = new URLSearchParams(window.location.search);
  var pwd = params.get('pwd');
  var usr = params.get('usr') || 'RBCloud';
  if (!pwd) return;

  /* React/Vue 가 무시하지 않도록 native value setter 로 입력 */
  function setVal(el, val) {
    try {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, val);
    } catch (e) { el.value = val; }
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('keyup',  { bubbles: true }));
  }

  var tries = 0, MAX = 80; /* 최대 ~24초 */
  var timer = setInterval(function () {
    tries++;
    if (tries > MAX) { clearInterval(timer); return; }

    var inputs = Array.from(document.querySelectorAll('input'));
    if (!inputs.length) return;

    /* 비밀번호 input */
    var passInput = inputs.find(function (el) {
      return el.type === 'password' || /pass|비밀번호/i.test(el.placeholder || '');
    });
    /* 표시 이름(username) input — 비밀번호가 아닌 첫 text input */
    var userInput = inputs.find(function (el) {
      return el !== passInput &&
        (el.type === 'text' || el.type === '' || /이름|name|user|표시/i.test(el.placeholder || ''));
    });

    if (!passInput) return; /* 폼 아직 미로딩 */

    /* 표시 이름 + 비밀번호 입력 (neko v3 는 둘 다 필요) */
    if (userInput) setVal(userInput, usr);
    setVal(passInput, pwd);

    /* '연결' 버튼 — disabled 풀릴 때까지 대기 */
    var btns = Array.from(document.querySelectorAll('button, input[type=submit]'));
    var btn = btns.find(function (b) {
      return /연결|connect|join|enter|login|로그인/i.test((b.textContent || '') + (b.value || ''));
    });

    if (btn && !btn.disabled) {
      setTimeout(function () { btn.click(); }, 250);
      clearInterval(timer);
    }
  }, 250);
})();
