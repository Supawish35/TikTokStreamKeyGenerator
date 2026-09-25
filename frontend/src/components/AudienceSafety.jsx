import React from 'react';

function formatEpoch(val) {
    if (!val) return '—';
    try {
        const num = Number(val);
        if (isNaN(num) || num === 0) return String(val);
        const ms = num > 1e11 ? num : num * 1000;
        return new Date(ms).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch (_) {
        return String(val);
    }
}

export default function AudienceSafety({ audienceData, safetyData, isLive }) {
    // 1. Online Audience Parsing
    const totalAudience = audienceData?.total ?? 0;
    const previewCount = audienceData?.preview_count ?? 0;
    const ranks = Array.isArray(audienceData?.ranks) ? audienceData.ranks : [];

    const audienceList = ranks.map((entry, idx) => {
        const user = entry.user || {};
        return {
            rank: entry.rank ?? (idx + 1),
            username: entry.display_id || user.display_id || user.unique_id || user.username || entry.username || 'Unknown',
            nickname: entry.nickname || user.nickname || user.nick_name || '—',
            score: entry.score ?? entry.rank_score ?? entry.coin_count ?? entry.value ?? 0,
            badges: Array.isArray(entry.badges) ? entry.badges.join(', ') : (entry.badges || '—')
        };
    });

    // 2. Safety & Violations Parsing
    const rawStatus = safetyData?.status || safetyData?.violation_summary || 'OK';
    const communityStatus = safetyData?.community_status || (safetyData?.community_flagged ? 'Flagged' : 'OK');
    const banStatus = safetyData?.ban_status || (safetyData?.ban_active ? 'Banned' : 'Clear');

    const rawRecords = (
        safetyData?.active_violations?.length ? safetyData.active_violations :
        (safetyData?.active_violation_records?.length ? safetyData.active_violation_records :
        (safetyData?.recent_violations?.length ? safetyData.recent_violations :
        (safetyData?.history_violation_records || safetyData?.violations || [])))
    );

    const violationsList = (Array.isArray(rawRecords) ? rawRecords : []).map(rec => {
        const punish = rec.punish_info || {};
        const live = rec.live_info || {};
        return {
            room: live.title || rec.room || rec.room_title || 'Current Room',
            violation: punish.punish_title || punish.violation_type || rec.violation || rec.title || 'Policy Violation',
            reason: punish.punish_reason || punish.perception_code || rec.reason || rec.description || 'Community guidelines flag',
            start: formatEpoch(punish.punish_start_time || live.start_time || rec.start),
            end: formatEpoch(punish.punish_real_end_time || punish.punish_expected_end_time || punish.punish_end_time || rec.end)
        };
    });

    const getStatusBadge = (text, type) => {
        const isOk = text === 'OK' || text === 'Clear';
        const isWarning = text === 'Warning' || text === 'Review' || text.includes('Review');
        const isBad = text.includes('violation') || text.includes('Violation') || text === 'Restricted' || text === 'Banned' || text.includes('Flagged');

        if (isOk) {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {text}
                </span>
            );
        }
        if (isWarning) {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    {text}
                </span>
            );
        }
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#fe2c55]/15 text-[#fe2c55] border border-[#fe2c55]/30">
                {text}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* 1. Online Audience Sub-section */}
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">
                        Online Audience
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#252525] border border-[#333] text-[#25f4ee]">
                            <span>Total:</span>
                            <span className="font-mono font-bold text-white">{totalAudience}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#252525] border border-[#333] text-[#8a8a8a]">
                            <span>Preview:</span>
                            <span className="font-mono font-bold text-white">{previewCount}</span>
                        </span>
                    </div>
                </div>

                <div className="border border-[#2a2a2a] rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[#1a1a1a] text-[#8a8a8a] uppercase tracking-wider font-semibold sticky top-0 z-10 border-b border-[#2a2a2a]">
                            <tr>
                                <th className="px-3 py-2.5 w-12 text-center">#</th>
                                <th className="px-3 py-2.5">Username</th>
                                <th className="px-3 py-2.5">Nickname</th>
                                <th className="px-3 py-2.5">Score</th>
                                <th className="px-3 py-2.5">Badges</th>
                            </tr>
                        </thead>
                        <tbody>
                            {audienceList.length > 0 ? (
                                audienceList.map((user, idx) => (
                                    <tr
                                        key={idx}
                                        className={idx % 2 === 0 ? 'bg-[#1e1e1e]' : 'bg-[#222222]'}
                                    >
                                        <td className="px-3 py-2 text-center text-[#8a8a8a] font-mono">{user.rank}</td>
                                        <td className="px-3 py-2 font-medium text-white truncate max-w-[140px]">{user.username}</td>
                                        <td className="px-3 py-2 text-[#ccc] truncate max-w-[140px]">{user.nickname}</td>
                                        <td className="px-3 py-2 font-mono text-[#25f4ee] font-semibold">{user.score}</td>
                                        <td className="px-3 py-2 text-[#8a8a8a]">{user.badges}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr className="bg-[#1e1e1e]">
                                    <td colSpan="5" className="px-4 py-8 text-center text-[#777]">
                                        {isLive ? 'No audience members visible currently' : 'Stream is offline'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 2. Safety Sub-section */}
            <div className="space-y-3 pt-2 border-t border-[#262626]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">
                        Safety & Compliance
                    </span>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-[#8a8a8a]">Status:</span>
                            {getStatusBadge(rawStatus)}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-[#8a8a8a]">Community:</span>
                            {getStatusBadge(communityStatus)}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-[#8a8a8a]">Ban:</span>
                            {getStatusBadge(banStatus)}
                        </div>
                    </div>
                </div>

                <div className="border border-[#2a2a2a] rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[#1a1a1a] text-[#8a8a8a] uppercase tracking-wider font-semibold sticky top-0 z-10 border-b border-[#2a2a2a]">
                            <tr>
                                <th className="px-3 py-2.5">Room</th>
                                <th className="px-3 py-2.5">Violation</th>
                                <th className="px-3 py-2.5">Reason</th>
                                <th className="px-3 py-2.5">Start</th>
                                <th className="px-3 py-2.5">End</th>
                            </tr>
                        </thead>
                        <tbody>
                            {violationsList.length > 0 ? (
                                violationsList.map((item, idx) => (
                                    <tr
                                        key={idx}
                                        className={idx % 2 === 0 ? 'bg-[#1e1e1e]' : 'bg-[#222222]'}
                                    >
                                        <td className="px-3 py-2 text-[#ccc] truncate max-w-[120px]">{item.room}</td>
                                        <td className="px-3 py-2 font-semibold text-[#fe2c55]">{item.violation}</td>
                                        <td className="px-3 py-2 text-white max-w-[200px] break-words">{item.reason}</td>
                                        <td className="px-3 py-2 text-[#8a8a8a] whitespace-nowrap">{item.start}</td>
                                        <td className="px-3 py-2 text-[#8a8a8a] whitespace-nowrap">{item.end}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr className="bg-[#1e1e1e]">
                                    <td colSpan="5" className="px-4 py-8 text-center text-emerald-400 font-medium">
                                        No active or recent violations. Stream is in good standing.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}