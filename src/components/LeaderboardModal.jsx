import { useState, useEffect, useCallback } from 'react';
import { fetchLeaderboard } from '../services/leaderboardService';

export default function LeaderboardModal({ isOpen, onClose, walletAddress }) {
  const [timeframe, setTimeframe] = useState('all');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    user: null,
    leaderboard: [],
    total_participants: 0,
    total_points_distributed: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const res = await fetchLeaderboard({
      address: walletAddress || null,
      timeframe,
      limit: 50,
    });
    if (res && res.success) {
      setData(res);
    }
    setLoading(false);
  }, [walletAddress, timeframe]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const userCard = data.user;
  const list = data.leaderboard || [];
  const topThree = list.slice(0, 3);
  const restList = list.slice(3);

  const getTierColor = (tier) => {
    switch ((tier || '').toLowerCase()) {
      case 'legend': return '#f59e0b';
      case 'diamond': return '#38bdf8';
      case 'gold': return '#eab308';
      case 'silver': return '#94a3b8';
      case 'bronze': return '#d97706';
      default: return '#64748b';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(5, 11, 20, 0.85)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          background: 'linear-gradient(180deg, #111e38 0%, #0a1628 100%)',
          border: '1px solid rgba(163, 230, 53, 0.25)',
          borderRadius: '24px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
          fontFamily: 'var(--ff, sans-serif)',
          color: 'var(--text, #f0f6ff)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px', fontWeight: '800', color: 'white', letterSpacing: '-0.02em' }}>
                Volume Leaderboard
              </span>
              <span style={{
                background: 'rgba(163, 230, 53, 0.15)',
                color: 'var(--lime, #a3e635)',
                fontSize: '10px',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                1 USD = 1 Pt
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3, #94a3b8)', marginTop: '2px' }}>
              Earn 1 Point per $1.00 USD on-ramped or off-ramped
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={loadData}
              title="Refresh Leaderboard"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                color: 'var(--cyan, #22d3ee)',
                padding: '6px 10px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              ↻
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                color: 'white',
                padding: '6px 10px',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: '700',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          {/* User Personal Card */}
          {userCard && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.08) 0%, rgba(34, 211, 238, 0.04) 100%)',
              border: '1px solid rgba(163, 230, 53, 0.3)',
              borderRadius: '18px',
              padding: '16px',
              marginBottom: '18px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700' }}>
                    Your Ranking
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '24px', fontWeight: '800', color: userCard.rank ? 'var(--lime, #a3e635)' : '#94a3b8' }}>
                      {userCard.rank ? `#${userCard.rank}` : 'Unranked'}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      color: getTierColor(userCard.tier),
                      background: 'rgba(255, 255, 255, 0.05)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                    }}>
                      {userCard.tier} Tier
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', fontWeight: '600' }}>
                    Total Points
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: 'white', marginTop: '2px' }}>
                    {Number(userCard.total_points || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text3, #94a3b8)' }}>
                    ${Number(userCard.total_volume_usd || 0).toLocaleString()} Volume
                  </div>
                </div>
              </div>

              {/* Progress to Next Tier */}
              {userCard.next_tier_target && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text3, #94a3b8)', marginBottom: '5px' }}>
                    <span>Next Tier Progress</span>
                    <span>{userCard.tier_progress || 0}% ({userCard.total_points} / {userCard.next_tier_target} pts)</span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '6px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${userCard.tier_progress || 0}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--lime, #a3e635), var(--cyan, #22d3ee))',
                      borderRadius: '4px',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}

              {/* Breakdown */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                fontSize: '11px',
                color: 'var(--text2, #cbd5e1)',
              }}>
                <div>
                  <span style={{ color: 'var(--text3, #94a3b8)' }}>On-Ramp: </span>
                  <span style={{ fontWeight: '700' }}>${Number(userCard.onramp_usd || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text3, #94a3b8)' }}>Off-Ramp: </span>
                  <span style={{ fontWeight: '700' }}>${Number(userCard.offramp_usd || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text3, #94a3b8)' }}>Orders: </span>
                  <span style={{ fontWeight: '700' }}>{userCard.total_transactions || 0}</span>
                </div>
              </div>
            </div>
          )}

          {/* Timeframe Filter Tabs */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            background: 'rgba(255, 255, 255, 0.04)',
            padding: '4px',
            borderRadius: '12px',
          }}>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'month', label: 'This Month' },
              { id: 'week', label: 'This Week' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setTimeframe(tab.id)}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  background: timeframe === tab.id ? 'rgba(163, 230, 53, 0.18)' : 'none',
                  border: timeframe === tab.id ? '1px solid rgba(163, 230, 53, 0.3)' : '1px solid transparent',
                  borderRadius: '9px',
                  color: timeframe === tab.id ? 'var(--lime, #a3e635)' : 'var(--text3, #94a3b8)',
                  fontSize: '12px',
                  fontWeight: timeframe === tab.id ? '700' : '500',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Top 3 Podium */}
          {topThree.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              marginBottom: '18px',
            }}>
              {topThree.map((item, idx) => {
                const borderColors = ['#eab308', '#94a3b8', '#d97706'];
                const rankLabels = ['1st', '2nd', '3rd'];
                return (
                  <div
                    key={item.address}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${borderColors[idx] || 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: '14px',
                      padding: '12px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{
                      display: 'inline-block',
                      fontSize: '11px',
                      fontWeight: '800',
                      color: borderColors[idx],
                      background: 'rgba(255, 255, 255, 0.05)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      marginBottom: '6px',
                    }}>
                      {rankLabels[idx]}
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'white', marginBottom: '2px' }}>
                      {item.short_address}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--lime, #a3e635)' }}>
                      {Number(item.total_points || 0).toLocaleString()} pts
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text3, #94a3b8)' }}>
                      ${Number(item.total_volume_usd || 0).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ranks Table */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              padding: '10px 14px',
              background: 'rgba(255, 255, 255, 0.04)',
              fontSize: '10px',
              fontWeight: '700',
              color: 'var(--text3, #94a3b8)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              <span style={{ width: '45px' }}>Rank</span>
              <span style={{ flex: 1 }}>Wallet</span>
              <span style={{ width: '70px', textAlign: 'center' }}>Tier</span>
              <span style={{ width: '90px', textAlign: 'right' }}>Points</span>
            </div>

            {loading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text3, #94a3b8)', fontSize: '12px' }}>
                Loading leaderboard rankings...
              </div>
            ) : list.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text3, #94a3b8)', fontSize: '12px' }}>
                No completed on-ramp or off-ramp transactions recorded yet.
              </div>
            ) : (
              restList.length > 0 ? restList.map(item => {
                const isMe = userCard && item.address.toLowerCase() === (walletAddress || '').toLowerCase();
                return (
                  <div
                    key={item.address}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                      background: isMe ? 'rgba(163, 230, 53, 0.08)' : 'none',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ width: '45px', fontWeight: '700', color: isMe ? 'var(--lime, #a3e635)' : 'var(--text3, #94a3b8)' }}>
                      #{item.rank}
                    </span>
                    <span style={{ flex: 1, fontWeight: '600', color: isMe ? 'var(--lime, #a3e635)' : 'white' }}>
                      {item.short_address} {isMe && '(You)'}
                    </span>
                    <span style={{
                      width: '70px',
                      textAlign: 'center',
                      fontSize: '10px',
                      fontWeight: '700',
                      color: getTierColor(item.tier),
                    }}>
                      {item.tier}
                    </span>
                    <span style={{ width: '90px', textAlign: 'right', fontWeight: '700', color: 'white' }}>
                      {Number(item.total_points || 0).toLocaleString()}
                    </span>
                  </div>
                );
              }) : (
                topThree.map(item => {
                  const isMe = userCard && item.address.toLowerCase() === (walletAddress || '').toLowerCase();
                  return (
                    <div
                      key={item.address}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '10px 14px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                        background: isMe ? 'rgba(163, 230, 53, 0.08)' : 'none',
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ width: '45px', fontWeight: '700', color: 'var(--lime, #a3e635)' }}>
                        #{item.rank}
                      </span>
                      <span style={{ flex: 1, fontWeight: '600', color: isMe ? 'var(--lime, #a3e635)' : 'white' }}>
                        {item.short_address} {isMe && '(You)'}
                      </span>
                      <span style={{
                        width: '70px',
                        textAlign: 'center',
                        fontSize: '10px',
                        fontWeight: '700',
                        color: getTierColor(item.tier),
                      }}>
                        {item.tier}
                      </span>
                      <span style={{ width: '90px', textAlign: 'right', fontWeight: '700', color: 'white' }}>
                        {Number(item.total_points || 0).toLocaleString()}
                      </span>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>

        {/* Footer info */}
        <div style={{
          padding: '12px 24px',
          background: 'rgba(0, 0, 0, 0.2)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: 'var(--text3, #94a3b8)',
        }}>
          <span>{data.total_participants || 0} Traders Ranked</span>
          <span>Total Points: {Number(data.total_points_distributed || 0).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
