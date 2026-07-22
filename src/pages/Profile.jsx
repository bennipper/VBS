import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useRoom } from '../context/RoomContext.jsx'
import { money, signedMoney, priceLabel, relTime } from '../lib/format.js'
import { BAILOUT_THRESHOLD, BAILOUT_AMOUNT, AVATAR_BUCKET, AVATAR_MAX_BYTES } from '../config.js'
import Avatar from '../components/Avatar.jsx'
import RoomsSection from '../components/RoomsSection.jsx'
import { computeAchievements } from '../lib/achievements.js'

// Net P/L from the ledger — includes payouts, refunds, cash-outs and rake, minus
// stakes. Excludes bailouts and the signup bonus (those aren't winnings).
const PL_TYPES = new Set(['bet', 'payout', 'refund', 'cashout', 'rake', 'daily_stake', 'daily_win'])
function plFromTransactions(txns) {
  return txns.reduce((acc, t) => (PL_TYPES.has(t.type) ? acc + Number(t.amount) : acc), 0)
}

function computeStats(bets) {
  let staked = 0
  let returned = 0
  let settled = 0
  let wins = 0
  let recordWin = 0
  for (const b of bets) {
    staked += Number(b.amount)
    const payout = b.payout == null ? 0 : Number(b.payout)
    returned += payout
    const outcome = b.market?.resolved_outcome
    if (b.market?.resolved_at) {
      if (outcome !== 'VOID') {
        settled += 1
        if (b.side === outcome) {
          wins += 1
          recordWin = Math.max(recordWin, payout - Number(b.amount))
        }
      }
    }
  }
  return {
    pl: returned - staked,
    winRate: settled > 0 ? wins / settled : null,
    settled,
    wins,
    recordWin,
    staked,
    count: bets.length,
  }
}

export default function Profile() {
  const { id: routeId } = useParams()
  const { user, profile: myProfile, refreshProfile } = useAuth()
  const { activeRoomId, activeRoom, refreshRooms } = useRoom()
  const targetId = routeId ?? user?.id
  const isMe = targetId === user?.id

  const [profile, setProfile] = useState(null)
  const [membership, setMembership] = useState(null) // target's row in the active room
  const [bets, setBets] = useState([])
  const [txns, setTxns] = useState([])
  const [marketsCreated, setMarketsCreated] = useState(0)
  const [loading, setLoading] = useState(true)
  const [bailoutBusy, setBailoutBusy] = useState(false)
  const [bailoutError, setBailoutError] = useState('')
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')

  const load = useCallback(async () => {
    // Everything money-ish is scoped to the active room; identity is global.
    const [{ data: p }, { data: mem }, { data: b }, { data: tx }, { count }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', targetId).maybeSingle(),
      activeRoomId
        ? supabase.from('room_members').select('balance, bailout_count').eq('room_id', activeRoomId).eq('user_id', targetId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('bets')
        .select('*, market:markets!market_id(question, resolved_outcome, resolved_at, room_id)')
        .eq('user_id', targetId)
        .order('created_at', { ascending: false }),
      activeRoomId
        ? supabase.from('transactions').select('type, amount, created_at').eq('user_id', targetId).eq('room_id', activeRoomId)
        : Promise.resolve({ data: [] }),
      activeRoomId
        ? supabase.from('markets').select('id', { count: 'exact', head: true }).eq('creator_id', targetId).eq('room_id', activeRoomId)
        : Promise.resolve({ count: 0 }),
    ])
    setProfile(p ?? null)
    setMembership(mem ?? null)
    setBets((b ?? []).filter((bet) => bet.market?.room_id === activeRoomId))
    setTxns(tx ?? [])
    setMarketsCreated(count ?? 0)
    setLoading(false)
  }, [targetId, activeRoomId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Keep own header balance fresh via context.
  const shownProfile = isMe && myProfile ? myProfile : profile

  async function onPickAvatar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadErr('')
    if (!file.type.startsWith('image/')) {
      setUploadErr('Pick an image file.')
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setUploadErr('Image too big — 5 MB max.')
      return
    }
    setUploading(true)
    // Path must start with the user's id to satisfy the storage RLS policy.
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${user.id}/avatar-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: true })
    if (upErr) {
      setUploadErr(upErr.message)
      setUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url: pub.publicUrl })
      .eq('id', user.id)
    setUploading(false)
    if (e.target) e.target.value = ''
    if (updErr) {
      setUploadErr(updErr.message)
      return
    }
    refreshProfile()
    load()
  }

  async function claimBailout() {
    setBailoutError('')
    setBailoutBusy(true)
    const { error } = await supabase.rpc('claim_bailout', { p_room_id: activeRoomId })
    setBailoutBusy(false)
    if (error) {
      setBailoutError(error.message)
      return
    }
    refreshRooms()
    load()
  }

  if (loading) return <div className="loading-full"><div className="spin" /></div>
  if (!shownProfile) {
    return (
      <div className="empty">
        <div className="big">🤷</div>
        <p>No such punter.</p>
        <Link to="/" className="link-red">Back to the book</Link>
      </div>
    )
  }

  const stats = computeStats(bets)
  const pl = plFromTransactions(txns)
  const rakeEarned = txns.reduce((a, t) => (t.type === 'rake' ? a + Number(t.amount) : a), 0)
  const bailoutCount = membership?.bailout_count ?? 0
  const achievements = computeAchievements({
    bets,
    profile: { ...shownProfile, bailout_count: bailoutCount },
    marketsCreated,
    rakeEarned,
  })
  const inRoom = membership != null
  const balance = Number(membership?.balance ?? 0)
  const canBailout = isMe && inRoom && balance < BAILOUT_THRESHOLD

  return (
    <>
      <div className="section-head">
        <h2>{isMe ? 'Your book' : 'Punter'}</h2>
        {activeRoom && <span className="faint" style={{ fontSize: 12 }}>in {activeRoom.name}</span>}
      </div>

      {/* Identity + balance */}
      <div className="card">
        <div className="avatar-upload">
          {isMe ? (
            <button
              className="current"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Change photo"
            >
              <Avatar url={shownProfile.avatar_url} emoji={shownProfile.avatar_emoji} size={56} />
              <span className="avatar-edit-badge">{uploading ? '…' : '✎'}</span>
            </button>
          ) : (
            <Avatar url={shownProfile.avatar_url} emoji={shownProfile.avatar_emoji} size={56} />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden-file"
            onChange={onPickAvatar}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{shownProfile.username}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>
              joined {relTime(shownProfile.created_at)}
              {bailoutCount > 0 && ` · bailed out ${bailoutCount}×`}
            </div>
          </div>
        </div>

        {isMe && uploadErr && <div className="error-box" style={{ marginTop: 12 }}>{uploadErr}</div>}

        <hr className="divider" />
        {inRoom ? (
          <div className="row-between">
            <span className="prob-label">Balance{activeRoom ? ` · ${activeRoom.name}` : ''}</span>
            <span className="tnum" style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-num)' }}>
              {money(balance)}
            </span>
          </div>
        ) : (
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>
            Not a member of {activeRoom?.name ?? 'this room'}.
          </p>
        )}

        {canBailout && (
          <>
            <hr className="divider" />
            {bailoutError && <div className="error-box">{bailoutError}</div>}
            <button className="btn btn-primary" disabled={bailoutBusy} onClick={claimBailout}>
              {bailoutBusy ? <span className="spin" /> : `Skint? Claim ${money(BAILOUT_AMOUNT, { compact: true })}`}
            </button>
            <p className="faint center" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              Only below {money(BAILOUT_THRESHOLD, { compact: true })}. It goes on your permanent record.
            </p>
          </>
        )}
        {isMe && !canBailout && balance < BAILOUT_THRESHOLD * 4 && (
          <p className="faint" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            Bailout unlocks below {money(BAILOUT_THRESHOLD, { compact: true })}.
          </p>
        )}
      </div>

      {/* Rooms live in the account now */}
      {isMe && <RoomsSection />}

      {/* Stats */}
      <div className="section-head"><h2>Stats</h2></div>
      <div className="statgrid">
        <div className="stat">
          <div className="k">Net P/L</div>
          <div className={`v tnum ${pl > 0 ? 'green' : pl < 0 ? 'red' : ''}`}>
            {signedMoney(pl)}
          </div>
        </div>
        <div className="stat">
          <div className="k">Win rate</div>
          <div className="v tnum">
            {stats.winRate == null ? '—' : `${Math.round(stats.winRate * 100)}%`}
          </div>
        </div>
        <div className="stat">
          <div className="k">Record win</div>
          <div className="v tnum green">{stats.recordWin > 0 ? signedMoney(stats.recordWin) : '—'}</div>
        </div>
        <div className="stat">
          <div className="k">Bailouts</div>
          <div className="v tnum">{shownProfile.bailout_count}</div>
        </div>
      </div>

      {/* Achievements */}
      <div className="section-head">
        <h2>Badges</h2>
        <span className="faint" style={{ fontSize: 12 }}>
          {achievements.filter((a) => a.earned).length}/{achievements.length}
        </span>
      </div>
      <div className="badge-grid">
        {achievements.map((a) => (
          <div key={a.name} className={`ach${a.earned ? ' earned' : ''}`} title={a.desc}>
            <span className="ach-emoji">{a.emoji}</span>
            <div className="ach-txt">
              <div className="ach-name">{a.name}</div>
              <div className="ach-desc">{a.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Bet history */}
      <div className="section-head"><h2>Bet history · {stats.count}</h2></div>
      <div className="card">
        {bets.length === 0 ? (
          <div className="faint center" style={{ padding: '12px 0', fontSize: 13 }}>
            No punts yet.
          </div>
        ) : (
          bets.map((b) => {
            const resolved = b.market?.resolved_at
            const outcome = b.market?.resolved_outcome
            const payout = b.payout == null ? null : Number(b.payout)
            let result = null
            if (resolved) {
              if (outcome === 'VOID') result = <span className="badge badge-void">void · refunded</span>
              else if (b.side === outcome) result = <span className="badge badge-yes">won {money(payout, { compact: true })}</span>
              else result = <span className="badge badge-no">lost</span>
            } else {
              result = <span className="badge">open</span>
            }
            return (
              <div className="feed-row" key={b.id}>
                <span className="txt">
                  <Link to={`/market/${b.market_id}`}>
                    <b>{b.market?.question ?? 'market'}</b>
                  </Link>
                  <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {money(b.amount, { compact: true })} on{' '}
                    <span className={b.side === 'YES' ? 'link-red' : 'link-red'} style={{ color: b.side === 'YES' ? 'var(--green)' : 'var(--red)' }}>
                      {b.side}
                    </span>{' '}
                    @ <span className="tnum">{priceLabel(b.price_avg)}</span> · {relTime(b.created_at)}
                  </div>
                </span>
                <span>{result}</span>
              </div>
            )
          })
        )}
      </div>

      {isMe && (
        <>
          <div className="spacer-lg" />
          <SignOutButton />
        </>
      )}
    </>
  )
}

function SignOutButton() {
  const { signOut } = useAuth()
  return (
    <button className="btn btn-ghost" onClick={signOut}>
      Log out
    </button>
  )
}
