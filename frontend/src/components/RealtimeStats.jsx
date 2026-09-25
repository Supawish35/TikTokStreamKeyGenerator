import React, { useState } from 'react';
import { getStats } from '../api';
import { useToast } from './Toast';

function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    const n = Number(num);
    if (n >= 1_000_000) {
        return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (n >= 1_000) {
        return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return n.toLocaleString();
}

export default function RealtimeStats({ statsData, isLive }) {
    const [manualStats, setManualStats] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const showToast = useToast();

    const activeStats = manualStats || statsData || {};
    const rt = activeStats.realtime || activeStats;
    const tr = activeStats.trends || {};

    const liveViewers = tr.current_viewers ?? activeStats.current_viewers ?? activeStats.viewer_count ?? rt.alive_viewers ?? rt.watch_count ?? 0;
    const totalViews = activeStats.total_views ?? rt.watch_count ?? rt.total_user ?? 0;
    const likes = activeStats.likes ?? rt.like_count ?? 0;
    const comments = activeStats.comments ?? rt.comment_count ?? 0;
    const shares = activeStats.shares ?? rt.share_count ?? 0;
    const newFans = activeStats.new_fans ?? rt.new_fans_count ?? rt.live_new_fans_ucnt ?? 0;

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const data = await getStats();
            setManualStats(data);
            showToast('Realtime stats refreshed', 'info');
        } catch (err) {
            showToast('Failed to refresh stats: ' + err.message, 'error');
        } finally {
            setRefreshing(false);
        }
    };

    const cards = [
        {
            label: 'Live Viewers',
            value: liveViewers,
            isLiveViewer: true
        },
        {
            label: 'Total Views',
            value: totalViews
        },
        {
            label: 'Likes',
            value: likes
        },
        {
            label: 'Comments',
            value: comments
        },
        {
            label: 'Shares',
            value: shares
        },
        {
            label: 'New Fans',
            value: newFans
        }
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">
                    Live Broadcast Metrics
                </span>
                <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshing || !isLive}
                    className="text-xs text-[#25f4ee] hover:underline flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Refresh Stats</span>
                </button>
            </div>

            {/* 3x2 Grid of mini-cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {cards.map((item, idx) => (
                    <div
                        key={idx}
                        className="bg-[#151515] rounded-xl p-4 border border-[#2a2a2a] text-center flex flex-col justify-center items-center hover:border-[#383838] transition-all"
                    >
                        <div className="flex items-center gap-2">
                            {item.isLiveViewer && (
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#fe2c55] opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#fe2c55]"></span>
                                </span>
                            )}
                            <span className="text-2xl sm:text-3xl font-extrabold text-[#25f4ee] font-mono tracking-tight transition-all duration-300">
                                {formatNumber(item.value)}
                            </span>
                        </div>
                        <span className="text-xs text-[#8a8a8a] font-medium uppercase tracking-wider mt-1.5">
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}