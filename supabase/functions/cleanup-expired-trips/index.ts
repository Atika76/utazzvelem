import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function buildTripTimestamp(datum?: string | null, ido?: string | null) {
  if (!datum) return null
  const safeTime = (ido && /^\d{2}:\d{2}/.test(ido)) ? ido.slice(0, 5) : '00:00'
  const iso = `${datum}T${safeTime}:00`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function normPhone(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D/g, '')
  if (raw.startsWith('00')) return '+' + raw.slice(2).replace(/\D/g, '')
  if (raw.startsWith('06')) return '+36' + raw.slice(2).replace(/\D/g, '')
  return raw.replace(/\D/g, '')
}

function normExternalId(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

async function sendEmail(resendApiKey: string, to: string, subject: string, html: string) {
  if (!resendApiKey || !to) return { ok: false, skipped: true }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'FuvarVelünk <onboarding@resend.dev>', to: [to], subject, html })
  })
  return { ok: resp.ok, skipped: false, data: await resp.text() }
}

async function sendSms(to: string, body: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
  const token = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
  const from = Deno.env.get('TWILIO_FROM_NUMBER') || ''
  const phone = normPhone(to)
  if (!sid || !token || !from || !phone) return { ok: false, skipped: true }
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: phone, Body: body }).toString(),
  })
  return { ok: resp.ok, skipped: false, data: await resp.text() }
}

async function sendPush(externalIds: string[], heading: string, message: string, url?: string) {
  const appId = Deno.env.get('ONESIGNAL_APP_ID') || ''
  const apiKey = Deno.env.get('ONESIGNAL_API_KEY') || ''
  const ids = [...new Set((externalIds || []).map(normExternalId).filter(Boolean))]
  if (!appId || !apiKey || !ids.length) return { ok: false, skipped: true }

  const resp = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: appId,
      target_channel: 'push',
      include_aliases: { external_id: ids },
      headings: { hu: heading, en: heading },
      contents: { hu: message, en: message },
      url,
      web_url: url,
    }),
  })

  return { ok: resp.ok, skipped: false, data: await resp.text() }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405)

  try {
    const cronSecret = Deno.env.get('CRON_SECRET') || ''
    const sentSecret = req.headers.get('x-cron-secret') || ''

    if (cronSecret && sentSecret !== cronSecret) {
      return json({ ok: false, message: 'Unauthorized cron request' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const resendApiKey = Deno.env.get('RESEND_API_KEY') || ''
    const siteUrl = Deno.env.get('SITE_URL') || 'https://fuvarvelunk.hu'
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500)
    }

    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch (_) {
      body = {}
    }

    const graceDays = Number(body.graceDays ?? 3)
    const dryRun = Boolean(body.dryRun ?? false)
    const reminderWindowMinutes = Number(body.reminderWindowMinutes ?? 120)
    const now = new Date()
    const threshold = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000)
    const reminderLimit = new Date(now.getTime() + reminderWindowMinutes * 60 * 1000)

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: trips, error: tripsError } = await admin
      .from('fuvarok')
      .select('id, datum, ido, indulas, erkezes, statusz, email, nev, telefon')

    if (tripsError) throw tripsError

    const expiredTrips = (trips || []).filter((trip: any) => {
      const when = buildTripTimestamp(trip?.datum, trip?.ido)
      return when && when < threshold
    })

    const upcomingTrips = (trips || []).filter((trip: any) => {
      const when = buildTripTimestamp(trip?.datum, trip?.ido)
      if (!when) return false
      const status = String(trip?.statusz || '').toLowerCase()
      return when >= now && when <= reminderLimit && !['függőben', 'elutasítva', 'torolve', 'törölve'].includes(status)
    })

    const expiredIds = expiredTrips.map((trip: any) => trip.id).filter(Boolean)

    const result: Record<string, unknown> = {
      ok: true,
      now: now.toISOString(),
      graceDays,
      threshold: threshold.toISOString(),
      expired_trip_count: expiredIds.length,
      expired_trip_ids: expiredIds,
      upcoming_trip_count: upcomingTrips.length,
      reminder_window_minutes: reminderWindowMinutes,
      dryRun,
    }

    const reminderLogs: any[] = []
    if (!dryRun && upcomingTrips.length) {
      for (const trip of upcomingTrips) {
        const { data: existingLog } = await admin
          .from('email_naplo')
          .select('id')
          .eq('tipus', 'sofor_indulas_emlekezteto')
          .contains('payload', { trip_id: trip.id })
          .limit(1)

        if (existingLog && existingLog.length) {
          reminderLogs.push({ trip_id: trip.id, skipped: true, reason: 'already_sent' })
          continue
        }

        const { count: bookingCount } = await admin
          .from('foglalasok')
          .select('id', { count: 'exact', head: true })
          .eq('fuvar_id', trip.id)

        const subject = `Fuvar indul 2 órán belül: ${trip.indulas || ''} → ${trip.erkezes || ''}`
        const html = `<h2>Indulási emlékeztető</h2><p>Kedves ${trip.nev || 'Sofőr'}!</p><p>A fuvarod ${reminderWindowMinutes} percen belül indul.</p><p><strong>${trip.indulas || ''} → ${trip.erkezes || ''}</strong></p><p>Dátum: ${trip.datum || ''} ${trip.ido || ''}</p><p>Foglalások száma: ${bookingCount || 0}</p>`
        const emailRes = await sendEmail(resendApiKey, trip.email || '', subject, html)
        const smsRes = await sendSms(trip.telefon || '', `FuvarVelünk: a ${trip.indulas || ''} → ${trip.erkezes || ''} fuvarod ${Math.round(reminderWindowMinutes / 60)} órán belül indul. Foglalások: ${bookingCount || 0}.`)
        const pushRes = await sendPush([trip.email || ''], 'Fuvar indul 2 órán belül', `${trip.indulas || ''} → ${trip.erkezes || ''} · foglalások: ${bookingCount || 0}`, `${siteUrl}/trip.html?id=${encodeURIComponent(String(trip.id || ''))}`)

        await admin.from('email_naplo').insert([{
          tipus: 'sofor_indulas_emlekezteto',
          cel_email: trip.email || '',
          statusz: emailRes.ok ? 'elkuldve' : (emailRes.skipped ? 'kihagyva' : 'sikertelen'),
          sikeres: !!emailRes.ok,
          targy: subject,
          payload: {
            trip_id: trip.id,
            sms_ok: !!smsRes.ok,
            sms_skipped: !!smsRes.skipped,
            push_ok: !!pushRes.ok,
            push_skipped: !!pushRes.skipped,
            foglalas_db: bookingCount || 0,
          },
        }])

        reminderLogs.push({
          trip_id: trip.id,
          email_ok: !!emailRes.ok,
          sms_ok: !!smsRes.ok,
          sms_skipped: !!smsRes.skipped,
          push_ok: !!pushRes.ok,
          push_skipped: !!pushRes.skipped,
        })
      }
    }

    result.reminders = reminderLogs

    if (!expiredIds.length || dryRun) {
      return json(result)
    }

    const { error: ratingsError, count: ratingsDeleted } = await admin
      .from('ertekelesek')
      .delete({ count: 'exact' })
      .in('fuvar_id', expiredIds)
    if (ratingsError) throw ratingsError

    const { error: bookingsError, count: bookingsDeleted } = await admin
      .from('foglalasok')
      .delete({ count: 'exact' })
      .in('fuvar_id', expiredIds)
    if (bookingsError) throw bookingsError

    const { error: tripsDeleteError, count: tripsDeleted } = await admin
      .from('fuvarok')
      .delete({ count: 'exact' })
      .in('id', expiredIds)
    if (tripsDeleteError) throw tripsDeleteError

    result.deleted = {
      ertekelesek: ratingsDeleted || 0,
      foglalasok: bookingsDeleted || 0,
      fuvarok: tripsDeleted || 0,
    }

    return json(result)
  } catch (error) {
    return json({ ok: false, error: String(error) }, 500)
  }
})
