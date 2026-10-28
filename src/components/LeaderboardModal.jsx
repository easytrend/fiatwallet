import { useState, useEffect, useCallback } from 'react';
import { fetchLeaderboard } from '../services/leaderboardService';
import { fetchReferralStats, getReferralLink } from '../services/referralService';

export default function LeaderboardModal({ isOpen, onClose, walletAddress }) {
  const [activeTab, setActiveTab] = useState('leaderboard'); // 'leaderboard' | 'referrals'
  const [timeframe, setTimeframe] = useState('all');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState({
    user: null,
    leaderboard: [],
    total_participants: 0,
    total_points_distributed: 0,
  });
  const [referralData, setReferralData] = useState({
    referral_link: '',
    total_referred_users: 0,
    referral_points: 0,
    referred_friends: [],
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [lbRes, refRes] = await Promise.all([
        fetchLeaderboard({
          address: walletAddress || null,
          timeframe,
          limit: 50,
        }),
        walletAddress ? fetchReferralStats(walletAddress) : Promise.resolve(null),
      ]);

      if (lbRes && lbRes.success) {
        setData(lbRes);
      }
      if (refRes && refRes.success) {
        setReferralData(refRes);
      } else if (walletAddress) {
        setReferralData(prev => ({
          ...prev,
          referral_link: getReferralLink(walletAddress),
        }));
      }
    } catch (err) {
      console.warn('[LeaderboardModal] loadData error:', err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, timeframe]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const handleCopyLink = () => {
    const link = referralData.referral_link || getReferralLink(walletAddress);
    if (!link) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link);
      } else {
        const input = document.createElement('input');
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  const handleShareLink = () => {
    const link = referralData.referral_link || getReferralLink(walletAddress);
    if (!link) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: 'FiatWallet',
        text: 'Join me on FiatWallet and trade crypto with instant local bank transfers! Earn points on every transaction.',
        url: link,
      }).catch(() => {});
    } else {
      handleCopyLink();
    }
  };

  if (!isOpen) return null;

  const userCard = data.user;
  const list = data.leaderboard || [];
  const topThree = list.slice(0, 3);
  const restList = list.slice(3);

  // Reorder top 3 for classic podium layout: [2nd (left), 1st (center), 3rd (right)]
  const podiumItems = [];
  if (topThree.length >= 2) {
    podiumItems.push({
      item: topThree[1],
      rankLabel: '2nd',
      color: '#94a3b8',
      borderColor: 'rgba(148, 163, 184, 0.45)',
      isCenter: false,
    });
  }
  if (topThree.length >= 1) {
    podiumItems.push({
      item: topThree[0],
      rankLabel: '1st',
      color: '#eab308',
      borderColor: 'rgba(234, 179, 8, 0.65)',
      isCenter: true,
    });
  }
  if (topThree.length >= 3) {
    podiumItems.push({
      item: topThree[2],
      rankLabel: '3rd',
      color: '#d97706',
      borderColor: 'rgba(217, 119, 6, 0.45)',
      isCenter: false,
    });
  }

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
          padding: '20px 24px 14px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px', fontWeight: '800', color: 'white', letterSpacing: '-0.02em' }}>
                Points & Rewards
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
                1 Pt / USD
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3, #94a3b8)', marginTop: '2px' }}>
              Earn points from ramp volume and friend referrals
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

        {/* Modal Navigation Tabs: Leaderboard vs Referral Program */}
        <div style={{
          display: 'flex',
          padding: '12px 24px 0',
          gap: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(255, 255, 255, 0.02)',
        }}>
          <button
            onClick={() => setActiveTab('leaderboard')}
            style={{
              flex: 1,
              padding: '10px 0',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'leaderboard' ? '2px solid var(--lime, #a3e635)' : '2px solid transparent',
              color: activeTab === 'leaderboard' ? 'white' : 'var(--text3, #94a3b8)',
              fontWeight: activeTab === 'leaderboard' ? '700' : '500',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Leaderboard Rankings
          </button>
          <button
            onClick={() => setActiveTab('referrals')}
            style={{
              flex: 1,
              padding: '10px 0',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'referrals' ? '2px solid var(--lime, #a3e635)' : '2px solid transparent',
              color: activeTab === 'referrals' ? 'white' : 'var(--text3, #94a3b8)',
              fontWeight: activeTab === 'referrals' ? '700' : '500',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Referral Program
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'leaderboard' ? (
            <>
              {/* User Personal Card */}
              {userCard && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.08) 0%, rgba(34, 211, 238, 0.04) 100%)',
                  border: '1px solid rgba(163, 230, 53, 0.3)',
                  borderRadius: '18px',
                  padding: '16px',
                  marginBottom: '16px',
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
                      <div style={{ fontSize: '22px', fontWeight: '800', color: 'white', marginTop: '2px' }}>
                        {Math.floor(Number(userCard.total_points) || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Points Breakdown */}
                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    marginTop: '10px',
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    borderRadius: '10px',
                    fontSize: '11px',
                  }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ color: 'var(--text3, #94a3b8)' }}>Trading: </span>
                      <span style={{ fontWeight: '700', color: 'white' }}>
                        {Math.floor(Number(userCard.personal_points) || 0).toLocaleString()} pts
                      </span>
                    </div>
                    <div style={{ width: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ color: 'var(--text3, #94a3b8)' }}>Referrals: </span>
                      <span style={{ fontWeight: '700', color: 'var(--lime, #a3e635)' }}>
                        {Math.floor(Number(userCard.referral_points) || 0).toLocaleString()} pts
                      </span>
                    </div>
                  </div>

                  {/* Progress to Next Tier */}
                  {userCard.next_tier_target && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text3, #94a3b8)', marginBottom: '5px' }}>
                        <span>Next Tier Progress</span>
                        <span>{userCard.tier_progress || 0}% ({Math.floor(Number(userCard.total_points) || 0).toLocaleString()} / {Math.floor(Number(userCard.next_tier_target)).toLocaleString()} pts)</span>
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

                  {/* Completed Orders Count */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    fontSize: '11px',
                    color: 'var(--text2, #cbd5e1)',
                  }}>
                    <span style={{ color: 'var(--text3, #94a3b8)' }}>Completed Transactions:</span>
                    <span style={{ fontWeight: '700', color: 'white' }}>{userCard.total_transactions || 0}</span>
                  </div>
                </div>
              )}

              {/* Referral Shortcut Promo */}
              <div
                onClick={() => setActiveTab('referrals')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'rgba(163, 230, 53, 0.06)',
                  border: '1px solid rgba(163, 230, 53, 0.2)',
                  borderRadius: '12px',
                  marginBottom: '16px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                <div>
                  <span style={{ fontWeight: '700', color: 'white' }}>Invite Friends & Earn Points: </span>
                  <span style={{ color: 'var(--text3, #94a3b8)' }}>Get 1 Point for every 10 USD completed by friends</span>
                </div>
                <span style={{ color: 'var(--lime, #a3e635)', fontWeight: '700', fontSize: '12px' }}>→</span>
              </div>

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

              {/* Top 3 Podium (2nd on Left, 1st in Center, 3rd on Right) */}
              {podiumItems.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${podiumItems.length}, 1fr)`,
                  gap: '8px',
                  alignItems: 'end',
                  marginBottom: '18px',
                  paddingTop: '6px',
                }}>
                  {podiumItems.map(({ item, rankLabel, color, borderColor, isCenter }) => (
                    <div
                      key={item.address}
                      style={{
                        background: isCenter
                          ? 'linear-gradient(180deg, rgba(234, 179, 8, 0.14) 0%, rgba(255, 255, 255, 0.04) 100%)'
                          : 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${borderColor}`,
                        borderRadius: '16px',
                        padding: isCenter ? '18px 8px 14px' : '12px 8px',
                        textAlign: 'center',
                        transform: isCenter ? 'translateY(-6px)' : 'none',
                        boxShadow: isCenter ? '0 8px 24px rgba(234, 179, 8, 0.18)' : 'none',
                      }}
                    >
                      <div style={{
                        display: 'inline-block',
                        fontSize: isCenter ? '12px' : '11px',
                        fontWeight: '800',
                        color: color,
                        background: 'rgba(255, 255, 255, 0.06)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        marginBottom: '6px',
                      }}>
                        {rankLabel}
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: 'white', marginBottom: '4px' }}>
                        {item.short_address}
                      </div>
                      <div style={{
                        fontSize: isCenter ? '15px' : '13px',
                        fontWeight: '800',
                        color: 'var(--lime, #a3e635)',
                      }}>
                        {Math.floor(Number(item.total_points) || 0).toLocaleString()} pts
                      </div>
                    </div>
                  ))}
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
                  <span style={{ width: '50px' }}>Rank</span>
                  <span style={{ flex: 1 }}>Wallet</span>
                  <span style={{ width: '80px', textAlign: 'center' }}>Tier</span>
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
                        <span style={{ width: '50px', fontWeight: '700', color: isMe ? 'var(--lime, #a3e635)' : 'var(--text3, #94a3b8)' }}>
                          #{item.rank}
                        </span>
                        <span style={{ flex: 1, fontWeight: '600', color: isMe ? 'var(--lime, #a3e635)' : 'white' }}>
                          {item.short_address} {isMe && '(You)'}
                        </span>
                        <span style={{
                          width: '80px',
                          textAlign: 'center',
                          fontSize: '10px',
                          fontWeight: '700',
                          color: getTierColor(item.tier),
                        }}>
                          {item.tier}
                        </span>
                        <span style={{ width: '90px', textAlign: 'right', fontWeight: '700', color: 'white' }}>
                          {Math.floor(Number(item.total_points) || 0).toLocaleString()}
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
                          <span style={{ width: '50px', fontWeight: '700', color: 'var(--lime, #a3e635)' }}>
                            #{item.rank}
                          </span>
                          <span style={{ flex: 1, fontWeight: '600', color: isMe ? 'var(--lime, #a3e635)' : 'white' }}>
                            {item.short_address} {isMe && '(You)'}
                          </span>
                          <span style={{
                            width: '80px',
                            textAlign: 'center',
                            fontSize: '10px',
                            fontWeight: '700',
                            color: getTierColor(item.tier),
                          }}>
                            {item.tier}
                          </span>
                          <span style={{ width: '90px', textAlign: 'right', fontWeight: '700', color: 'white' }}>
                            {Math.floor(Number(item.total_points) || 0).toLocaleString()}
                          </span>
                        </div>
                      );
                    })
                  )
                )}
              </div>
            </>
          ) : (
            /* Referral Program Tab */
            <div>
              {/* Program Explainer Hero */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(163, 230, 53, 0.12) 0%, rgba(34, 211, 238, 0.06) 100%)',
                border: '1px solid rgba(163, 230, 53, 0.3)',
                borderRadius: '18px',
                padding: '18px',
                marginBottom: '16px',
              }}>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'white', marginBottom: '6px' }}>
                  FiatWallet Referral Program
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2, #cbd5e1)', lineHeight: '1.5', marginBottom: '14px' }}>
                  Share your link with friends. When they trade crypto through FiatWallet on-ramp or off-ramp, you earn 1 Point for every 10 USD of volume they complete.
                </div>

                {/* Referral Link Box */}
                <div style={{
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <div style={{
                    flex: 1,
                    fontSize: '11px',
                    color: 'var(--lime, #a3e635)',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {referralData.referral_link || getReferralLink(walletAddress)}
                  </div>
                  <button
                    onClick={handleCopyLink}
                    style={{
                      background: copied ? 'var(--lime, #a3e635)' : 'rgba(255, 255, 255, 0.1)',
                      color: copied ? '#0a1628' : 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {copied ? 'Copied ✓' : 'Copy Link'}
                  </button>
                  <button
                    onClick={handleShareLink}
                    style={{
                      background: 'rgba(34, 211, 238, 0.18)',
                      color: 'var(--cyan, #22d3ee)',
                      border: '1px solid rgba(34, 211, 238, 0.3)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Share
                  </button>
                </div>
              </div>

              {/* Referral Stats Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
                marginBottom: '16px',
              }}>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '14px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', fontWeight: '600' }}>
                    Friends Referred
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'white', marginTop: '4px' }}>
                    {referralData.total_referred_users || 0}
                  </div>
                </div>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(163, 230, 53, 0.2)',
                  borderRadius: '14px',
                  padding: '14px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', fontWeight: '600' }}>
                    Referral Points
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--lime, #a3e635)', marginTop: '4px' }}>
                    {Math.floor(Number(referralData.referral_points) || 0).toLocaleString()} pts
                  </div>
                </div>
              </div>

              {/* Referred Friends Activity List */}
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
                  <span style={{ flex: 1 }}>Friend Wallet</span>
                  <span style={{ width: '80px', textAlign: 'center' }}>Orders</span>
                  <span style={{ width: '90px', textAlign: 'right' }}>Points Earned</span>
                </div>

                {loading ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text3, #94a3b8)', fontSize: '12px' }}>
                    Loading referral data...
                  </div>
                ) : !referralData.referred_friends || referralData.referred_friends.length === 0 ? (
                  <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text3, #94a3b8)', fontSize: '12px' }}>
                    No friends have connected via your referral link yet. Share your link above to start earning points.
                  </div>
                ) : (
                  referralData.referred_friends.map(friend => (
                    <div
                      key={friend.address}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '10px 14px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ flex: 1, fontWeight: '600', color: 'white' }}>
                        {friend.short_address || friend.address}
                      </span>
                      <span style={{ width: '80px', textAlign: 'center', color: 'var(--text2, #cbd5e1)' }}>
                        {friend.completed_orders || 0}
                      </span>
                      <span style={{ width: '90px', textAlign: 'right', fontWeight: '700', color: 'var(--lime, #a3e635)' }}>
                        {Math.floor(Number(friend.points_earned) || 0).toLocaleString()} pts
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
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
          <span>Total Points: {Math.floor(Number(data.total_points_distributed) || 0).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
