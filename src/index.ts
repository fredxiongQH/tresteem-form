import { renderHtml } from "./renderHtml";
interface FormData {
  company: string;
  name: string;
  phone: string;
  email: string;
}
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const method = request.method;
    if (url.pathname === '/submit' && method === 'POST') {
      return handleSubmit(request, env);
    }
    if (url.pathname === '/list' && method === 'GET') {
      return handleList(request, env);
    }
    return new Response(renderHtml(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>公司信息提交</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      background: #f8f9fa; color: #333; line-height: 1.6;
      padding: 20px 16px;
    }
    .container { max-width: 480px; margin: 0 auto; }
    h2 { color: #1a73e8; font-size: 18px; margin-bottom: 16px; }
    h3 { color: #333; font-size: 16px; margin: 24px 0 12px; }
    .card {
      background: #fff; border-radius: 8px; padding: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 16px;
    }
    .form-group { margin-bottom: 14px; }
    label { display: block; margin-bottom: 6px; font-size: 14px; color: #666; }
    input {
      width: 100%; padding: 10px 12px; font-size: 15px;
      border: 1px solid #ddd; border-radius: 6px; transition: border 0.2s;
    }
    input:focus { border-color: #1a73e8; outline: none; box-shadow: 0 0 0 2px rgba(26,115,232,0.1); }
    button {
      width: 100%; padding: 12px; background: #1a73e8; color: #fff;
      border: none; border-radius: 6px; font-size: 16px; font-weight: 600;
      cursor: pointer; transition: background 0.2s; margin-top: 8px;
    }
    button:hover { background: #1557b0; }
    .item { background: #f1f3f4; padding: 12px; border-radius: 6px; margin-bottom: 8px; }
    .item small { color: #777; font-size: 12px; display: block; margin-bottom: 6px; }
    .item p { font-size: 14px; color: #333; margin: 4px 0; }
    .empty { text-align: center; color: #999; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>📊 提交记录（最近20条）</h2>
    <div id="list"></div>
    <h3>📝 提交新信息</h3>
    <div class="card">
      <form onsubmit="submitForm(event)">
        <div class="form-group">
          <label>公司名称</label>
          <input name="company" placeholder="请输入公司全称" required />
        </div>
        <div class="form-group">
          <label>姓名</label>
          <input name="name" placeholder="请输入姓名" required />
        </div>
        <div class="form-group">
          <label>手机号</label>
          <input name="phone" placeholder="请输入11位手机号" type="tel" inputmode="numeric" pattern="^1[3-9]\d{9}$" required />
        </div>
        <div class="form-group">
          <label>邮箱</label>
          <input name="email" placeholder="请输入邮箱地址" type="email" required />
        </div>
        <button type="submit">提交</button>
      </form>
    </div>
  </div>
  <script>
    async function submitForm(e: Event) {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const btn = form.querySelector('button') as HTMLButtonElement;
      const formData = Object.fromEntries(new FormData(form).entries());
      
      btn.textContent = '提交中...';
      btn.disabled = true;
      
      try {
        const res = await fetch('/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        alert(data.ok ? '✅ 提交成功！' : '❌ ' + (data.error || '提交失败'));
        if (data.ok) window.location.reload();
      } finally {
        btn.textContent = '提交';
        btn.disabled = false;
      }
    }
    fetch('/list').then(r => r.json()).then(data => {
      const el = document.getElementById('list')!;
      if (!data.data.length) {
        el.innerHTML = '<div class="empty">暂无数据</div>';
        return;
      }
      el.innerHTML = data.data.map((r: any) => `
        <div class="item">
          <small>🕒 ${r.created_at}</small>
          <p><strong>🏢 ${r.company}</strong></p>
          <p>👤 ${r.name} | 📱 ${r.phone} | ✉️ ${r.email}</p>
        </div>
      `).join('');
    });
  </script>
</body>
</html>
`), {
    headers: { 'content-type': 'text/html;charset=utf-8' }
  });
},
async handleSubmit(request: Request, env: Env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const formData: FormData = await request.json();
  const { company, name, phone, email } = formData;
  if (!company || !name || !phone || !email) {
    return jsonResp({ ok: false, error: '所有字段必填' }, 400);
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return jsonResp({ ok: false, error: '手机号格式错误' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResp({ ok: false, error: '邮箱格式错误' }, 400);
  }
  const now = new Date().toISOString();
  const fiveMinAgo = new Date(Date.now() - 5*60*1000).toISOString();
  const [{ cnt }] = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM comments WHERE ip = ? AND phone = ? AND created_at > ?'
  ).bind(ip, phone, fiveMinAgo).all();
  if (cnt >= 3) {
    return jsonResp({ ok: false, error: '提交太频繁，请5分钟后再试' }, 429);
  }
  await env.DB.prepare(
    'INSERT INTO comments (company, name, phone, email, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(company, name, phone, email, ip, now).run();
  return jsonResp({ ok: true, msg: '提交成功' });
},
async handleList(request: Request, env: Env) {
  const rows = await env.DB.prepare(
    'SELECT * FROM comments ORDER BY created_at DESC LIMIT 20'
  ).all();
  return jsonResp({ ok: true, data: rows.results });
}
} satisfies ExportedHandler<Env>;
function jsonResp(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
