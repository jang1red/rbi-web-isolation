/* ===== RBCloud Browser 자동 로그인 + 브랜딩 초기화 ===== */
(function () {
  /* 1) 페이지 타이틀 강제 변경 */
  document.title = 'RBCloud Browser';

  /* 2) URL ?pwd= 파라미터로 자동 로그인 */
  var params = new URLSearchParams(window.location.search);
  var pwd = params.get('pwd');
  if (!pwd) return;

  var tries = 0;
  var MAX = 60; /* 최대 18초 대기 */

  var timer = setInterval(function () {
    tries++;
    if (tries > MAX) { clearInterval(timer); return; }

    /* 비밀번호 input 찾기 (n.eko v2 기준) */
    var inputs = Array.from(document.querySelectorAll('input')).filter(function (el) {
      return el.type === 'password' ||
        (el.placeholder && /pass|비밀번호|password/i.test(el.placeholder));
    });
    if (!inputs.length) return;

    var inp = inputs[0];

    /* React / Vue native value setter (단순 .value= 는 무시됨) */
    try {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, pwd);
      inp.dispatchEvent(new Event('input',  { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      inp.value = pwd;
    }

    /* 연결 버튼 찾아서 클릭 */
    var btns = Array.from(document.querySelectorAll('button, input[type=submit]'));
    var btn = btns.find(function (b) {
      return /연결|connect|join|enter|login/i.test(b.textContent + (b.value || ''));
    });

    if (btn) {
      setTimeout(function () { btn.click(); }, 150);
      clearInterval(timer);
    }
  }, 300);
})();
