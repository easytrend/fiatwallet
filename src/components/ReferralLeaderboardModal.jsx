import { useState, useEffect, useCallback } from 'react';
import { fetchLeaderboard } from '../services/leaderboardService';
import { fetchReferralStats, getReferralLink } from '../services/referralService';
import { getFiatTagByWallet } from '../services/supabase';

export default function ReferralLeaderboardModal({ isOpen, onClose, walletAddress }) {
  const [timeframe, setTimeframe] = useState('all');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [fiatTag, setFiatTag] = useState(null);
  const [data, setData] = useState({
    user: null,
    referral_leaderboard: [],
    total_referrers: 0,
    total_referral_points_distributed: 0,
  });
  const [referralData, setReferralData] = useState({
    referral_link: '',
    fiat_tag: null,
    total_referred_users: 0,
    referral_points: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [lbRes, refRes, tagRes] = await Promise.all([
        fetchLeaderboard({
          address: walletAddress || null,
          timeframe,
          limit: 50,
        }),
        walletAddress ? fetchReferralStats(walletAddress) : Promise.resolve(null),
        walletAddress ? getFiatTagByWallet(walletAddress) : Promise.resolve(null),
      ]);

      if (lbRes && lbRes.success) {
        setData(lbRes);
      }

      const resolvedTag = refRes?.fiat_tag || tagRes?.tag_name || (typeof localStorage !== 'undefined' ? localStorage.getItem('fw_fiat_tag') : null);
      if (resolvedTag) {
        setFiatTag(resolvedTag);
      }

      const activeLink = refRes?.referral_link || getReferralLink(walletAddress, resolvedTag);

      if (refRes && refRes.success) {
        setReferralData({
          ...refRes,
          fiat_tag: resolvedTag,
          referral_link: activeLink,
        });
      } else if (walletAddress) {
        setReferralData(prev => ({
          ...prev,
          fiat_tag: resolvedTag,
          referral_link: activeLink,
        }));
      }
    } catch (err) {
      console.warn('[ReferralLeaderboardModal] loadData error:', err);
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
    const link = referralData.referral_link || getReferralLink(walletAddress, fiatTag);
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
    const link = referralData.referral_link || getReferralLink(walletAddress, fiatTag);
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
  const list = data.referral_leaderboard || [];
  const topThree = list.slice(0, 3);
  const restList = list.slice(3);

  // Reorder top 3 for podium layout: [2nd (left), 1st (center), 3rd (right)]
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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          backgroundColor: '#0a1628',
          border: '1px solid rgba(34, 211, 238, 0.3)',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(34, 211, 238, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
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
                Referral Leaderboard
              </span>
              <span style={{
                background: 'rgba(34, 211, 238, 0.15)',
                color: 'var(--cyan, #22d3ee)',
                fontSize: '10px',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                Top Referrers
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3, #94a3b8)', marginTop: '2px' }}>
              Rankings of community ambassadors and friends referred
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
          {/* User Personal Referral Card */}
          {userCard && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.08) 0%, rgba(163, 230, 53, 0.05) 100%)',
              border: '1px solid rgba(34, 211, 238, 0.3)',
              borderRadius: '18px',
              padding: '16px',
              marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700' }}>
                    Your Referral Ranking
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '24px', fontWeight: '800', color: userCard.referral_rank ? 'var(--cyan, #22d3ee)' : '#94a3b8' }}>
                      {userCard.referral_rank ? `#${userCard.referral_rank}` : 'Unranked'}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      color: 'var(--lime, #a3e635)',
                      background: 'rgba(163, 230, 53, 0.15)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                    }}>
                      {userCard.total_referred_users || referralData.total_referred_users || 0} Friends Referred
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3, #94a3b8)', fontWeight: '600' }}>
                    Referral Points
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--lime, #a3e635)', marginTop: '2px' }}>
                    {Math.floor(Number(userCard.referral_points || referralData.referral_points) || 0).toLocaleString()} pts
                  </div>
                </div>
              </div>

              {/* Share link quick row */}
              <div style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <div style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  color: 'var(--lime, #a3e635)',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {referralData.referral_link || getReferralLink(walletAddress, fiatTag)}
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
                    whiteSpace: 'nowrap',
                  }}
                >
                  {copied ? 'Copied ✓' : 'Copy'}
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
                    whiteSpace: 'nowrap',
                  }}
                >
                  Share
                </button>
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
                  padding: '6px 0',
                  background: timeframe === tab.id ? 'rgba(34, 211, 238, 0.18)' : 'none',
                  border: timeframe === tab.id ? '1px solid rgba(34, 211, 238, 0.35)' : '1px solid transparent',
                  borderRadius: '9px',
                  color: timeframe === tab.id ? 'var(--cyan, #22d3ee)' : 'var(--text3, #94a3b8)',
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

          {/* Top 3 Referral Podium (2nd on Left, 1st in Center, 3rd on Right) */}
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
                  <div style={{ fontSize: '11.5px', fontWeight: '700', color: 'white', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.display_name || item.short_address}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text3, #94a3b8)', marginBottom: '4px' }}>
                    {item.total_referred_users || 0} friends
                  </div>
                  <div style={{
                    fontSize: isCenter ? '15px' : '13px',
                    fontWeight: '800',
                    color: 'var(--lime, #a3e635)',
                  }}>
                    {Math.floor(Number(item.referral_points) || 0).toLocaleString()} pts
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Referral Leaderboard Table */}
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
              <span style={{ flex: 1 }}>Referrer</span>
              <span style={{ width: '70px', textAlign: 'center' }}>Friends</span>
              <span style={{ width: '85px', textAlign: 'right' }}>Points</span>
            </div>

            {loading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text3, #94a3b8)', fontSize: '12px' }}>
                Loading referral rankings...
              </div>
            ) : list.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'white', marginBottom: '6px' }}>
                  No referrers ranked yet
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text3, #94a3b8)', marginBottom: '16px' }}>
                  Invite friends to FiatWallet and be the first to claim #1 on the referral leaderboard!
                </div>
                <button
                  onClick={handleShareLink}
                  style={{
                    background: 'var(--lime, #a3e635)',
                    color: '#0a1628',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Share Referral Link →
                </button>
              </div>
            ) : (
              (restList.length > 0 ? restList : topThree).map(item => {
                const isMe = userCard && item.address.toLowerCase() === (walletAddress || '').toLowerCase();
                return (
                  <div
                    key={item.address}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                      background: isMe ? 'rgba(34, 211, 238, 0.08)' : 'none',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ width: '45px', fontWeight: '700', color: isMe ? 'var(--cyan, #22d3ee)' : 'var(--text3, #94a3b8)' }}>
                      #{item.rank}
                    </span>
                    <span style={{ flex: 1, fontWeight: '600', color: isMe ? 'var(--cyan, #22d3ee)' : 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.display_name || item.short_address} {isMe && '(You)'}
                    </span>
                    <span style={{ width: '70px', textAlign: 'center', color: 'var(--text2, #cbd5e1)', fontWeight: '600' }}>
                      {item.total_referred_users || 0}
                    </span>
                    <span style={{ width: '85px', textAlign: 'right', fontWeight: '700', color: 'var(--lime, #a3e635)' }}>
                      {Math.floor(Number(item.referral_points) || 0).toLocaleString()} pts
                    </span>
                  </div>
                );
              })
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
          <span>{data.total_referrers || list.length} Referrers Ranked</span>
          <span>Total Referral Points: {Math.floor(Number(data.total_referral_points_distributed) || 0).toLocaleString()} pts</span>
        </div>
      </div>
    </div>
  );
}
