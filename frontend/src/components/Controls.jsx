import React, { useState } from 'react';
import { goLive, pauseLive, resumeLive, endLive } from '../api';
import { useToast } from './Toast';

export default function Controls({
    streamInfo,
    setupData,
    onStreamChange,
    onOpenAccount
}) {
    const [actionLoading, setActionLoading] = useState(false);
    const showToast = useToast();

    const isLive = Boolean(streamInfo?.is_live);
    const isPaused = Boolean(streamInfo?.is_paused);

    const handleGoLive = async () => {
        setActionLoading(true);
        try {
            const res = await goLive({
                title: setupData.title,
                topic: setupData.topic,
                game: setupData.game,
                region: setupData.region,
                replay: setupData.replay,
                close_room: setupData.close_room,
                age_restricted: setupData.age_restricted,
                dual_layout: setupData.dual_layout,
                thumbnail_path: setupData.thumbnail_path
            });
            showToast('Stream started successfully! FFmpeg SEI proxy running.', 'success');
            if (onStreamChange) onStreamChange(res);
        } catch (err) {
            showToast('Failed to go live: ' + err.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handlePause = async () => {
        setActionLoading(true);
        try {
            await pauseLive();
            showToast('Stream paused', 'warning');
            if (onStreamChange) onStreamChange({ is_paused: true });
        } catch (err) {
            showToast('Failed to pause: ' + err.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleResume = async () => {
        setActionLoading(true);
        try {
            await resumeLive();
            showToast('Stream resumed', 'success');
            if (onStreamChange) onStreamChange({ is_paused: false });
        } catch (err) {
            showToast('Failed to resume: ' + err.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleEndLive = async () => {
        if (!window.confirm('Are you sure you want to end this TikTok live stream?')) {
            return;
        }
        setActionLoading(true);
        try {
            await endLive();
            showToast('Stream ended. Proxy stopped.', 'info');
            if (onStreamChange) {
                onStreamChange({
                    is_live: false,
                    is_paused: false,
                    proxy_status: 'stopped',
                    stream_url: '',
                    stream_key: '',
                    portrait_url: '',
                    portrait_key: ''
                });
            }
        } catch (err) {
            showToast('Failed to end stream: ' + err.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[#161616] rounded-xl border border-[#2a2a2a]">
            {/* Status indicator dot */}
            <div className="flex items-center gap-2.5">
                <span className="relative flex h-3.5 w-3.5">
                    {isLive && !isPaused && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                    {isLive && isPaused && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    )}
                    <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                        !isLive ? 'bg-[#555]' : (isPaused ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500 animate-pulse')
                    }`}></span>
                </span>
                <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                        {!isLive ? 'Offline' : (isPaused ? 'Paused' : 'Living')}
                    </span>
                    <span className="text-[11px] text-[#8a8a8a]">
                        {!isLive ? 'Ready to broadcast' : (isPaused ? 'Heartbeat paused' : 'Active TikTok Room')}
                    </span>
                </div>
            </div>

            {/* Row of buttons */}
            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
                {/* Login button */}
                <button
                    type="button"
                    onClick={onOpenAccount}
                    disabled={actionLoading || isLive}
                    className="px-3.5 py-2 bg-[#252525] hover:bg-[#303030] border border-[#333] hover:border-[#25f4ee] text-xs font-semibold rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                    <svg className="w-3.5 h-3.5 text-[#25f4ee]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>Login</span>
                </button>

                {/* Go Live */}
                <button
                    type="button"
                    onClick={handleGoLive}
                    disabled={actionLoading || isLive}
                    className="px-4 py-2 bg-gradient-to-r from-[#fe2c55] to-[#d91a40] hover:from-[#d91a40] hover:to-[#b01432] text-xs font-bold rounded-lg text-white shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                    {actionLoading && !isLive ? (
                        <>
                            <svg className="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Starting...</span>
                        </>
                    ) : (
                        <>
                            <span className="w-2 h-2 rounded-full bg-white"></span>
                            <span>Go Live</span>
                        </>
                    )}
                </button>

                {/* Pause */}
                <button
                    type="button"
                    onClick={handlePause}
                    disabled={actionLoading || !isLive || isPaused}
                    className="px-3.5 py-2 bg-[#252525] hover:bg-[#303030] border border-[#333] hover:border-amber-400 text-xs font-semibold rounded-lg text-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Pause</span>
                </button>

                {/* Resume */}
                <button
                    type="button"
                    onClick={handleResume}
                    disabled={actionLoading || !isLive || !isPaused}
                    className="px-3.5 py-2 bg-[#252525] hover:bg-[#303030] border border-[#333] hover:border-emerald-400 text-xs font-semibold rounded-lg text-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Resume</span>
                </button>

                {/* End Live */}
                <button
                    type="button"
                    onClick={handleEndLive}
                    disabled={actionLoading || !isLive}
                    className="px-3.5 py-2 bg-[#fe2c55]/20 hover:bg-[#fe2c55]/30 border border-[#fe2c55]/40 text-xs font-semibold rounded-lg text-[#fe2c55] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    <span>End Live</span>
                </button>
            </div>
        </div>
    );
}
