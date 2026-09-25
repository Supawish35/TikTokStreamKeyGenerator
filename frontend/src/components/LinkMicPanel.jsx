import React, { useCallback, useEffect, useState } from 'react';
import { getLinkMicStatus } from '../api';

const unavailableActions = [
    'Guest roster',
    'Pending requests',
    'Invite guest',
    'Accept or reject request',
    'Remove guest',
    'Mute guest'
];

export default function LinkMicPanel({ status, onStatusChange, isLive }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const refresh = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            onStatusChange(await getLinkMicStatus());
        } catch (err) {
            setError(err.message || 'Could not refresh LinkMic status.');
        } finally {
            setLoading(false);
        }
    }, [onStatusChange]);

    useEffect(() => {
        if (status === null) refresh();
    }, [refresh, status]);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-sm text-white">
                        {!isLive
                            ? 'Start a LIVE to view LinkMic status.'
                            : status?.available && status.guest_count !== null
                                ? `${status.guest_count} LinkMic guest${Number(status.guest_count) === 1 ? '' : 's'}`
                                : 'Guest count is unavailable for this LIVE.'}
                    </p>
                    <p className="mt-1 text-xs text-[#8a8a8a]">
                        Roster and host actions need verified TikTok request formats before they can be enabled.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={refresh}
                    disabled={!isLive || loading}
                    className="rounded-lg border border-[#3a3a3a] px-3 py-2 text-sm text-white hover:bg-[#252525] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {loading ? 'Refreshing…' : 'Refresh status'}
                </button>
            </div>

            {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}

            <div className="grid gap-2 sm:grid-cols-2">
                {unavailableActions.map(action => (
                    <div key={action} className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2.5">
                        <span className="text-sm text-[#8a8a8a]">{action}</span>
                        <span className="rounded bg-[#252525] px-2 py-1 text-xs text-[#8a8a8a]">Unavailable</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
