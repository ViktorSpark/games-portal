// Галактика Игр — отправка кода входа на почту.
// Деплой: Supabase Dashboard → Edge Functions → New function → send-code,
// вставь этот код, добавь секреты: RESEND_API_KEY (https://resend.com),
// опционально RESEND_FROM (отправитель, по умолчанию onboarding@resend.dev).
// Если секрета RESEND_API_KEY нет — функция вернёт ok:false,
// и клиент покажет код на экране.

const RESEND = Deno.env.get('RESEND_API_KEY');
const FROM = Deno.env.get('RESEND_FROM') || 'onboarding@resend.dev';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '*';
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { email, code, nickname } = await req.json();
    if (!email || !code) {
      return new Response(JSON.stringify({ ok: false, error: 'bad payload' }), { status: 400, headers: cors });
    }
    if (!RESEND) {
      return new Response(JSON.stringify({ ok: false, error: 'no email provider' }), { status: 200, headers: cors });
    }

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: 'Код входа — Галактика Игр',
        html:
          '<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;border:1px solid #334;border-radius:14px;background:#0a0e22;color:#e8ecff">' +
          '<h2 style="color:#ffd500;margin:0 0 12px">Галактика Игр</h2>' +
          '<p style="color:#e8ecff">Привет, <b>' + (nickname || 'игрок') + '</b>! Твой код для входа:</p>' +
          '<div style="font-size:32px;letter-spacing:10px;color:#4de1ff;padding:14px;border:1px dashed #4de1ff;border-radius:10px;text-align:center">' + code + '</div>' +
          '<p style="color:#9aa4d6;font-size:12px;margin-top:14px">Код действителен 10 минут. Если ты не запрашивал его — просто проигнорируй письмо.</p>' +
          '</div>'
      })
    });
    return new Response(JSON.stringify({ ok: r.ok, error: r.ok ? '' : 'send failed' }), { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200, headers: cors });
  }
});
