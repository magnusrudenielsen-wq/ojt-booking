const { test } = require('node:test')
const assert = require('node:assert')
const { freeSlotsFor } = require('../srv/lib/slots')
const { localToUtc } = require('../srv/lib/time')

const tz = 'Europe/Copenhagen'
const rules = [{ weekday: 2, startTime: '08:00:00', endTime: '12:00:00' }] // Tuesdays 08-12

test('generates hourly slots from a weekly rule, in local time', () => {
  const s = freeSlotsFor({ rules, fromDay: '2026-10-13', toDay: '2026-10-13', durationMinutes: 60, tz })
  assert.deepStrictEqual(s.map(x => x.startAt), [
    '2026-10-13T06:00:00.000Z', '2026-10-13T07:00:00.000Z', '2026-10-13T08:00:00.000Z', '2026-10-13T09:00:00.000Z'
  ])
})

test('handles winter time (UTC+1) after the DST change', () => {
  const s = freeSlotsFor({ rules, fromDay: '2026-11-03', toDay: '2026-11-03', durationMinutes: 60, tz })
  assert.strictEqual(s[0].startAt, '2026-11-03T07:00:00.000Z')
})

test('a 90-minute item only fits twice in a 4-hour window', () => {
  const s = freeSlotsFor({ rules, fromDay: '2026-10-13', toDay: '2026-10-13', durationMinutes: 90, tz })
  assert.strictEqual(s.length, 2)
})

test('removes blocked time and existing bookings', () => {
  const s = freeSlotsFor({
    rules, fromDay: '2026-10-13', toDay: '2026-10-13', durationMinutes: 60, tz,
    blocked: [{ day: '2026-10-13', startTime: '10:00:00', endTime: '12:00:00' }],
    busy: [{ startAt: localToUtc('2026-10-13', '08:30', tz), endAt: localToUtc('2026-10-13', '09:00', tz) }]
  })
  assert.deepStrictEqual(s.map(x => x.startAt), ['2026-10-13T07:00:00.000Z'])
})

test('nothing before notBefore, nothing on days without rules', () => {
  const s = freeSlotsFor({
    rules, fromDay: '2026-10-12', toDay: '2026-10-14', durationMinutes: 60, tz,
    notBefore: localToUtc('2026-10-13', '10:30', tz)
  })
  assert.deepStrictEqual(s.map(x => x.startAt), ['2026-10-13T09:00:00.000Z'])
})

test('one-off available dates add slots on that date only', () => {
  const dates = [{ day: '2026-10-14', startTime: '13:00:00', endTime: '15:00:00' }] // a Wednesday
  const s = freeSlotsFor({ rules, dates, fromDay: '2026-10-13', toDay: '2026-10-21', durationMinutes: 60, tz })
  const wednesdays = s.filter(x => x.startAt.startsWith('2026-10-14') || x.startAt.startsWith('2026-10-21'))
  assert.deepStrictEqual(wednesdays.map(x => x.startAt), ['2026-10-14T11:00:00.000Z', '2026-10-14T12:00:00.000Z'])
})
