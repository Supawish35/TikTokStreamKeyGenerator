import React, { useState } from 'react';
import { copyToClipboard } from '../utils/clipboard';
import { useToast } from './Toast';

export default function StreamOutput({ streamInfo }) {
    const [copiedField, setCopiedField] = useState(null);
    const showToast = useToast();

    const handleCopy = async (field, text) => {
        if (!text) return;
        const ok = await copyToClipboard(text);
        if (ok) {
            setCopiedField(field);
            showToast(`Copied ${field} to clipboard`, 'success');
            setTimeout(() => setCopiedField(null), 2000);
        } else {
            showToast(`Failed to copy ${field}`, 'error');
        }
    };

    const isLive = Boolean(streamInfo?.is_live);
    const streamUrl = streamInfo?.stream_url || (isLive ? 'rtmp://127.0.0.1:19350/live' : '');
    const streamKey = streamInfo?.stream_key || (isLive ? 'obs' : '');
    const shareUrl = streamInfo?.share_url || '';
    const portraitUrl = streamInfo?.portrait_url || '';
    const portraitKey = streamInfo?.portrait_key || '';
    const proxyStatus = streamInfo?.proxy_status || 'stopped';

    const renderCopyButton = (fieldName, value) => (
        <button
            type="button"
            onClick={() => handleCopy(fieldName, value)}
            disabled={!value}
            title={`Copy ${fieldName}`}
            className="px-3 py-2 bg-[#252525] hover:bg-[#333] border border-[#383838] hover:border-[#25f4ee] rounded text-xs font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
        >
            {copiedField === fieldName ? (
                <>
                    <span className="text-emerald-400">✅</span>
                    <span className="text-emerald-400">Copied</span>
                </>
            ) : (
                <>
                    <span>📋</span>
                    <span>Copy</span>
                </>
            )}
        </button>
    );

    return (
        <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-[#262626]">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">
                        Local RTMP Proxy Output
                    </span>
                    <span className="text-[11px] text-[#666]">(Use in OBS / Streaming App)</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-[#8a8a8a]">Proxy Status:</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${
                        proxyStatus === 'running'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-[#2a2a2a] text-[#8a8a8a] border border-[#333]'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${proxyStatus === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-[#666]'}`}></span>
                        {proxyStatus}
                    </span>
                </div>
            </div>

            {/* Landscape Stream URL & Key */}
            <div className="space-y-3">
                <div>
                    <label className="block text-xs font-semibold text-[#8a8a8a] mb-1 uppercase tracking-wider">
                        Stream URL (OBS Server)
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            readOnly
                            value={streamUrl}
                            placeholder={isLive ? 'rtmp://127.0.0.1:19350/live' : 'Waiting for stream to start...'}
                            className="w-full bg-[#181818] border border-[#2e2e2e] rounded-lg px-3.5 py-2 text-xs sm:text-sm font-mono text-[#25f4ee] focus:outline-none select-all"
                        />
                        {renderCopyButton('Stream URL', streamUrl)}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-[#8a8a8a] mb-1 uppercase tracking-wider">
                        Stream Key
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            readOnly
                            value={streamKey}
                            placeholder={isLive ? 'obs' : 'Waiting for stream to start...'}
                            className="w-full bg-[#181818] border border-[#2e2e2e] rounded-lg px-3.5 py-2 text-xs sm:text-sm font-mono text-[#25f4ee] focus:outline-none select-all"
                        />
                        {renderCopyButton('Stream Key', streamKey)}
                    </div>
                </div>
            </div>

            {/* Share URL */}
            {shareUrl && (
                <div>
                    <label className="block text-xs font-semibold text-[#8a8a8a] mb-1 uppercase tracking-wider">
                        TikTok Live Broadcast Share URL
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            readOnly
                            value={shareUrl}
                            className="w-full bg-[#181818] border border-[#2e2e2e] rounded-lg px-3.5 py-2 text-xs sm:text-sm font-mono text-white focus:outline-none select-all"
                        />
                        {renderCopyButton('Share URL', shareUrl)}
                        <a
                            href={shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 bg-[#252525] hover:bg-[#333] border border-[#383838] hover:border-[#fe2c55] rounded text-xs font-semibold text-[#fe2c55] transition-all flex items-center gap-1 shrink-0"
                        >
                            <span>Open</span>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                    </div>
                </div>
            )}

            {/* Portrait Layout Fields (shown only when dual layout is active) */}
            {portraitUrl && (
                <div className="mt-4 pt-4 border-t border-[#262626] space-y-3 bg-[#181818] p-3.5 rounded-lg border">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#25f4ee] uppercase tracking-wider">
                            Dual Layout · Portrait Ingest
                        </span>
                        <span className="text-[11px] text-[#8a8a8a]">(Vertical 1080x1920)</span>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-[#8a8a8a] mb-1 uppercase tracking-wider">
                            Portrait Stream URL
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                readOnly
                                value={portraitUrl}
                                className="w-full bg-[#121212] border border-[#2e2e2e] rounded px-3 py-1.5 text-xs font-mono text-[#25f4ee] select-all"
                            />
                            {renderCopyButton('Portrait URL', portraitUrl)}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-[#8a8a8a] mb-1 uppercase tracking-wider">
                            Portrait Stream Key
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                readOnly
                                value={portraitKey}
                                className="w-full bg-[#121212] border border-[#2e2e2e] rounded px-3 py-1.5 text-xs font-mono text-[#25f4ee] select-all"
                            />
                            {renderCopyButton('Portrait Key', portraitKey)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
