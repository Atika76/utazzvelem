// Supabase Edge Function példa Resend-del.
// 1) állítsd be a SUPABASE Functions alatt a RESEND_API_KEY secretet
// 2) deploy: supabase functions deploy notify-admin
// 3) js/config.js => notificationFunctionUrl: 'https://<project-ref>.functions.supabase.co/notify-admin'

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' } })
  }

  try {
    const { kind, payload, adminEmail } = await req.json()
    if (!RESEND_API_KEY || !adminEmail) {
      return new Response(JSON.stringify({ ok: false, message: 'Missing config' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const subject = kind === 'uj_fuvar'
      ? `Új fuvar vár jóváhagyásra: ${payload.indulas} → ${payload.erkezes}`
      : `Új foglalás érkezett: ${payload.utas_nev || payload.nev || ''}`

    const html = kind === 'uj_fuvar'
      ? `<h2>Új fuvar vár jóváhagyásra</h2><p><strong>${payload.indulas}</strong> → <strong>${payload.erkezes}</strong></p><p>Dátum: ${payload.datum} ${payload.ido}</p><p>Sofőr: ${payload.nev} (${payload.email})</p>`
      : `<h2>Új foglalás érkezett</h2><p>Foglaló: <strong>${payload.utas_nev || payload.nev || ''}</strong></p><p>Utas e-mail: ${payload.utas_email || payload.email || ''}</p><p>Foglalt helyek: ${payload.foglalt_helyek || 1}</p><p>Sofőr: ${payload.sofor_nev || ''} (${payload.sofor_email || ''})</p>`

    const resend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'FuvarVelünk <onboarding@resend.dev>',
        to: [adminEmail],
        subject,
        html,
      })
    })

    const data = await resend.text()
    return new Response(JSON.stringify({ ok: resend.ok, data }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }
})
