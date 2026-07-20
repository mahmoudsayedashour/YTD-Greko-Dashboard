import sys

# 1. Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

old_login_html = """  <div id="login-page" class="login-page" style="display:none">
    <div class="login-card">
      <div class="login-logo">
        <img src="greko_logo.png" alt="Greko Egypt"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="brand-text-fallback" style="display:none;flex-direction:column;align-items:center;gap:2px">
          <span class="brand-greko">greko</span><span class="brand-egypt">EGYPT</span>
        </div>
      </div>
      <h1 class="login-title">Sales Dashboard</h1>
      <p class="login-sub">Sign in to access the dashboard</p>
      <div class="login-form">
        <div class="login-field">
          <label for="login-user">Username</label>
          <input id="login-user" type="text" placeholder="Enter username" autocomplete="username">
        </div>
        <div class="login-field">
          <label for="login-pass">Password</label>
          <input id="login-pass" type="password" placeholder="Enter password" autocomplete="current-password">
        </div>
        <div id="login-error" class="login-error" style="display:none">Invalid username or password</div>
        <button id="login-btn" class="login-btn">Sign In</button>
      </div>
      <p class="login-footer">Greko Egypt © 2026 – Confidential</p>
    </div>
  </div>"""

new_login_html = """  <div id="login-page" class="login-page" style="display:none">
    <div class="login-split">
      <div class="login-left">
        <div class="login-card-inner">
          <div class="login-logo">
            <div style="font-size:32px; font-weight:900; letter-spacing:-1px; color:#fff; display:flex; align-items:center; justify-content:center; margin-bottom: 24px;">
              <span style="color:#00e676;">greko</span>
              <span style="font-weight:300; margin-left:6px; opacity:0.8; font-size:20px; align-self:flex-end; padding-bottom:4px">EGYPT</span>
            </div>
          </div>
          <h1 class="login-title">Sales Analytics Platform</h1>
          <p class="login-sub">Sign in to access the dashboard</p>
          <div class="login-form">
            <div class="login-field">
              <label for="login-user">Username</label>
              <input id="login-user" type="text" autocomplete="off" value="">
            </div>
            <div class="login-field">
              <label for="login-pass">Password</label>
              <input id="login-pass" type="password" autocomplete="new-password" value="">
            </div>
            <div id="login-error" class="login-error" style="display:none">Invalid username or password</div>
            <button id="login-btn" class="login-btn">Sign In</button>
          </div>
          <p class="login-footer">Greko Egypt © 2026 – Confidential</p>
        </div>
      </div>
      <div class="login-right"></div>
    </div>
  </div>"""

if old_login_html in html:
    html = html.replace(old_login_html, new_login_html)
else:
    print('Could not find old login HTML')
    sys.exit(1)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update style.css
with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()

old_login_css = """/* ═══════════════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════════════ */
.login-page {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: url('login_bg.jpg') center/cover no-repeat;
  z-index: 1000;
}
.login-page::before {
  content: ''; position: absolute; inset: 0;
  background: rgba(14, 17, 23, 0.85);
  backdrop-filter: blur(12px);
}
.login-card {
  position: relative; z-index: 10;
  background: rgba(22, 27, 34, 0.85);
  backdrop-filter: blur(20px);
  padding: 48px;
  border-radius: 16px;
  width: 100%; max-width: 440px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1);
  text-align: center;
}"""

new_login_css = """/* ═══════════════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════════════ */
.login-page {
  position: fixed; inset: 0;
  display: flex;
  background: var(--bg-main);
  z-index: 1000;
}
.login-split {
  display: flex;
  width: 100%;
  height: 100%;
}
.login-left {
  flex: 0 0 480px;
  background: var(--bg-card);
  display: flex; align-items: center; justify-content: center;
  padding: 40px;
  box-shadow: 10px 0 30px rgba(0,0,0,0.3);
  position: relative;
  z-index: 10;
  border-right: 1px solid var(--border);
}
.login-right {
  flex: 1;
  background: url('login_artwork.jpg') center/cover no-repeat;
  position: relative;
}
.login-right::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, var(--bg-card) 0%, transparent 15%);
}
.login-card-inner {
  width: 100%;
  max-width: 340px;
  text-align: center;
}"""

if old_login_css in css:
    css = css.replace(old_login_css, new_login_css)
else:
    print('Could not find old login CSS')
    sys.exit(1)

with open('style.css', 'w', encoding='utf-8') as f:
    f.write(css)
