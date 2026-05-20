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
    // 提交接口
    if (url.pathname === '/submit' && method === 'POST') {
      return handleSubmit(request, env);
    }
    // 查看数据接口
    if (url.pathname === '/list' && method === 'GET') {
      return handleList(request, env);
    }
    // 默认：返回表单页
    return new Response(renderHtml(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>公司信息提交</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    input { width: 100%; padding: 10px; margin: 5px 0; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
    button { background: #007bff; color: #fff; padding: 10px; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
    p { margin: 5px 0; }
    small { color: #666; }
  </style>
</head>
<body>
  <h2>📊 提交记录（最近20条）</h2>
  <div id="list"></div>
  <h3>📝 提交新信息</h3>
  <form onsubmit="submitForm(event)">
    <input name="company" placeholder="公司名称" required />
    <input name="name" placeholder="姓名" required />
    <input name="phone" placeholder="手机号" required pattern="^1[3-9]\\d{9}$" />
    <input name="email" placeholder="邮箱" required type="email" />
    <button type="submit">提交</button>
  </form>
  <script>
    async function submitForm(e: Event) {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(e.target as HTMLFormElement).entries());
      const res = await fetch('/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
      alert(res.ok ? '提交成功！' : '错误: ' + res.status);
      window.location.reload();
    }
    fetch('/list').then(r => r.json()).then(data => {
      document.getElementById('list')!.innerHTML = data.data.map((r: any) => 
        '<p><small>🤖 ' + r.created_at + '</small><br>' +
        '🏢 ' + r.company + ' | 👤 ' + r.name + ' | 📱 ' + r.phone + ' | ✉️ ' + r.email + '</p>'
      ).join('');
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
    'SELECT COUNT(*) as cnt FROM company_leads WHERE ip = ? AND phone = ? AND created_at > ?'
  ).bind(ip, phone, fiveMinAgo).all();
  if (cnt >= 3) {
    return jsonResp({ ok: false, error: '提交太频繁，请5分钟后再试' }, 429);
  }
  await env.DB.prepare(
    'INSERT INTO company_leads (company, name, phone, email, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(company, name, phone, email, ip, now).run();
  return jsonResp({ ok: true, msg: '提交成功' });
},
async handleList(request: Request, env: Env) {
  const rows = await env.DB.prepare(
    'SELECT * FROM company_leads ORDER BY created_at DESC LIMIT 20'
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
