import React, { useState, useEffect, useCallback } from 'react';
import { getStatus } from './api';
import { useSSE } from './hooks/useSSE';
import { ToastProvider, useToast } from './components/Toast';
import Layout from './components/Layout';
import CollapsibleCard from './components/CollapsibleCard';
import StreamSetup from './components/StreamSetup';
import AccountPanel from './components/AccountPanel';
import Controls from './components/Controls';
import StreamOutput from './components/StreamOutput';
import RealtimeStats from './components/RealtimeStats';
import AudienceSafety from './components/AudienceSafety';
import LinkMicPanel from './components/LinkMicPanel';

function MainContent() {
    const [streamInfo, setStreamInfo] = useState({
        is_live: false,
        is_paused: false,
        stream_url: '',
        stream_key: '',
        share_url: '',
        proxy_status: 'stopped',
        room_id: '',
        portrait_url: '',
        portrait_key: ''
    });

    const [setupData, setSetupData] = useState({
        title: 'TikTok LIVE Stream',
        topic: '5',
        game: '',
        region: '',
        replay: true,
        close_room: true,
        age_restricted: false,
        dual_layout: false,
        thumbnail_path: ''
    });

    const [openCards, setOpenCards] = useState({
        setup: true,
        account: true,
        controlsOutput: true,
        stats: false,
        audience: false,
        linkmic: false
    });

    const showToast = useToast();

    // Violation alert callback from SSE
    const handleViolationAlert = useCallback((alert) => {
        const reason = alert.reason || (alert.record?.punish_info?.punish_reason) || 'Policy violation detected';
        showToast(`⚠️ New violation: ${reason}`, 'violation', 10000);
    }, [showToast]);

    const [linkMicStatus, setLinkMicStatus] = useState(null);

    // Connect to SSE stream
    const {
        isConnected,
        status: sseStatus,
        stats: sseStats,
        audience: sseAudience,
        safety: sseSafety,
        quota: sseQuota,
        linkmic: sseLinkMic
    } = useSSE('/api/events', {
        onViolationAlert: handleViolationAlert
    });

    useEffect(() => {
        if (sseLinkMic) setLinkMicStatus(sseLinkMic);
    }, [sseLinkMic]);

    // Sync SSE status updates into local streamInfo state
    useEffect(() => {
        if (sseStatus) {
            setStreamInfo(prev => ({ ...prev, ...sseStatus }));
            // Auto expand if became live
            if (sseStatus.is_live) {
                setOpenCards(prev => ({
                    ...prev,
                    controlsOutput: true,
                    stats: true,
                    audience: true
                }));
            }
        }
    }, [sseStatus]);

    // Fetch initial status on mount
    const fetchStatus = async () => {
        try {
            const data = await getStatus();
            setStreamInfo(prev => ({ ...prev, ...data }));
            if (data.is_live) {
                setOpenCards(prev => ({
                    ...prev,
                    controlsOutput: true,
                    stats: true,
                    audience: true
                }));
            }
        } catch (err) {
            console.error('Initial status fetch error:', err);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const toggleCard = (cardKey) => {
        setOpenCards(prev => ({
            ...prev,
            [cardKey]: !prev[cardKey]
        }));
    };

    const handleStreamChange = (update) => {
        setStreamInfo(prev => {
            const next = { ...prev, ...update };
            if (next.is_live) {
                setOpenCards(c => ({
                    ...c,
                    controlsOutput: true,
                    stats: true,
                    audience: true
                }));
            }
            return next;
        });
    };

    const isLive = Boolean(streamInfo.is_live);
    const isPaused = Boolean(streamInfo.is_paused);

    return (
        <Layout isConnected={isConnected}>
            {/* Card 1: Stream Setup */}
            <CollapsibleCard
                title="Stream Setup"
                isOpen={openCards.setup}
                onToggle={() => toggleCard('setup')}
                badge={isLive ? <span className="bg-[#252525] text-[#8a8a8a]">Locked</span> : <span className="bg-[#25f4ee]/15 text-[#25f4ee]">Ready</span>}
                icon={
                    <svg className="w-5 h-5 text-[#25f4ee]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                }
            >
                <StreamSetup
                    setupData={setupData}
                    setSetupData={setSetupData}
                    isLive={isLive}
                />
            </CollapsibleCard>

            {/* Card 2: Account */}
            <CollapsibleCard
                title="Account"
                isOpen={openCards.account}
                onToggle={() => toggleCard('account')}
                badge={<span className="bg-[#252525] text-[#8a8a8a]">Session</span>}
                icon={
                    <svg className="w-5 h-5 text-[#25f4ee]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                }
            >
                <AccountPanel quotaData={sseQuota} />
            </CollapsibleCard>

            {/* Card 3: Stream Controls & Output */}
            <CollapsibleCard
                title="Stream Controls & Output"
                isOpen={openCards.controlsOutput}
                onToggle={() => toggleCard('controlsOutput')}
                badge={
                    !isLive ? (
                        <span className="bg-[#252525] text-[#8a8a8a]">Offline</span>
                    ) : isPaused ? (
                        <span className="bg-amber-500/20 text-amber-400">Paused</span>
                    ) : (
                        <span className="bg-[#fe2c55]/20 text-[#fe2c55] animate-pulse">Live</span>
                    )
                }
                icon={
                    <svg className="w-5 h-5 text-[#25f4ee]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                }
            >
                <div className="space-y-4">
                    <Controls
                        streamInfo={streamInfo}
                        setupData={setupData}
                        onStreamChange={handleStreamChange}
                        onOpenAccount={() => setOpenCards(prev => ({ ...prev, account: true }))}
                    />
                    <StreamOutput streamInfo={streamInfo} />
                </div>
            </CollapsibleCard>

            {/* Card 4: Realtime Stats */}
            <CollapsibleCard
                title="Realtime Stats"
                isOpen={openCards.stats}
                onToggle={() => toggleCard('stats')}
                badge={isLive ? <span className="bg-emerald-500/20 text-emerald-400">Streaming</span> : null}
                icon={
                    <svg className="w-5 h-5 text-[#25f4ee]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                }
            >
                <RealtimeStats statsData={sseStats} isLive={isLive} />
            </CollapsibleCard>

            {/* LinkMic status and supported host controls */}
            <CollapsibleCard
                title="LinkMic Host Controls"
                isOpen={openCards.linkmic}
                onToggle={() => toggleCard('linkmic')}
                badge={<span className="bg-[#252525] text-[#8a8a8a]">Status</span>}
                icon={
                    <svg className="w-5 h-5 text-[#25f4ee]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.830-1M17 20H7m10 0v-2c0-.653-.126-1.277-.354-1.854M7 20H2v-2a3 3 0 015.830-1M7 20v-2c0-.653.126-1.277.354-1.854m0 0a5.002 5.002 0 019.292 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                }
            >
                <LinkMicPanel
                    status={linkMicStatus ?? sseLinkMic}
                    onStatusChange={setLinkMicStatus}
                    isLive={isLive}
                />
            </CollapsibleCard>

            {/* Card 5: Audience & Safety */}
            <CollapsibleCard
                title="Audience & Safety"
                isOpen={openCards.audience}
                onToggle={() => toggleCard('audience')}
                badge={isLive ? <span className="bg-emerald-500/20 text-emerald-400">Monitoring</span> : null}
                icon={
                    <svg className="w-5 h-5 text-[#25f4ee]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                }
            >
                <AudienceSafety audienceData={sseAudience} safetyData={sseSafety} isLive={isLive} />
            </CollapsibleCard>
        </Layout>
    );
}

export default function App() {
    return (
        <ToastProvider>
            <MainContent />
        </ToastProvider>
    );
}