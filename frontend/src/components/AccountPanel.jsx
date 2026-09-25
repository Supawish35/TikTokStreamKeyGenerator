import React, { useState, useEffect } from 'react';
import { getAccount, getQuota, uploadCookies, getConfig, saveConfig } from '../api';
import { useToast } from './Toast';

export default function AccountPanel({ quotaData }) {
    const [accountInfo, setAccountInfo] = useState(null);
    const [localQuota, setLocalQuota] = useState(null);
    const [rapidApiKey, setRapidApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [loadingAccount, setLoadingAccount] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [savingKey, setSavingKey] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [showPaste, setShowPaste] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const showToast = useToast();

    const fetchAccount = async () => {
        setLoadingAccount(true);
        try {
            const acc = await getAccount();
            setAccountInfo(acc);
        } catch (err) {
            console.error('Account info fetch error', err);
        } finally {
            setLoadingAccount(false);
        }
    };

    const fetchQuota = async () => {
        try {
            const q = await getQuota();
            setLocalQuota(q);
        } catch (err) {
            console.error('Quota fetch error', err);
        }
    };

    useEffect(() => {
        fetchAccount();
        fetchQuota();
        getConfig().then(cfg => {
            if (cfg && cfg.rapidapi_key) {
                setRapidApiKey(cfg.rapidapi_key);
            }
        }).catch(() => {});
    }, []);

    const quota = quotaData || localQuota;

    const handleUploadFile = async (fileOrContent) => {
        if (!fileOrContent) return;
        setUploading(true);
        try {
            const res = await uploadCookies(fileOrContent);
            if (res.status === 'session_expired') {
                showToast(res.message || 'TikTok session expired. Please re-login and export fresh cookies.', 'warning');
            } else if (res.status === 'signer_error') {
                showToast(res.message || 'RapidAPI key error during account check.', 'warning');
            } else if (res.username || res.screen_name) {
                const displayName = res.username ? (res.username.startsWith('@') ? res.username : `@${res.username}`) : res.screen_name;
                showToast(`Logged in as ${displayName}!`, 'success');
            } else {
                showToast(res.message || 'Cookies uploaded successfully!', 'success');
            }
            setAccountInfo({
                username: res.username || '',
                screen_name: res.screen_name || '',
                avatar_url: res.avatar_url || '',
                user_id: res.user_id || '',
                can_go_live: Boolean(res.can_go_live),
                dual_layout_supported: Boolean(res.dual_layout_supported),
                status: res.status || 'ready',
                message: res.message || ''
            });
            if (showPaste) setShowPaste(false);
            setPasteText('');
        } catch (err) {
            showToast(err.message || 'Failed to upload cookies', 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) handleUploadFile(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleUploadFile(file);
    };

    const handleSaveKey = async () => {
        setSavingKey(true);
        try {
            await saveConfig({ rapidapi_key: rapidApiKey });
            showToast('RapidAPI key saved to config.json', 'success');
        } catch (err) {
            showToast('Failed to save RapidAPI key: ' + err.message, 'error');
        } finally {
            setSavingKey(false);
        }
    };

    const quotaLimit = quota?.limit ?? 100;
    const quotaRemaining = quota?.remaining ?? 100;
    const quotaPercentage = quotaLimit > 0 ? Math.min(100, Math.max(0, (quotaRemaining / quotaLimit) * 100)) : 100;

    return (
        <div className="space-y-6">
            {/* Account Info Grid */}
            <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">
                        Account Info
                    </span>
                    <button
                        type="button"
                        onClick={fetchAccount}
                        disabled={loadingAccount}
                        className="text-xs text-[#25f4ee] hover:underline flex items-center gap-1 disabled:opacity-50"
                    >
                        <svg className={`w-3.5 h-3.5 ${loadingAccount ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Refresh Account</span>
                    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-[#151515] p-3 rounded-lg border border-[#2a2a2a]">
                        <span className="block text-[11px] text-[#8a8a8a] uppercase tracking-wider mb-1">Username</span>
                        <div className="flex items-center gap-2">
                            {accountInfo?.avatar_url && (
                                <img src={accountInfo.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover border border-[#333] shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                                <span className="text-sm font-bold text-white truncate block" title={accountInfo?.username || 'Not logged in'}>
                                    {loadingAccount ? 'Loading...' : (
                                        accountInfo?.username && accountInfo.username !== 'Unknown'
                                            ? (accountInfo.username.startsWith('@') ? accountInfo.username : `@${accountInfo.username}`)
                                            : (accountInfo?.screen_name || (accountInfo?.status === 'session_expired' ? 'Session Expired' : (accountInfo?.status === 'no_cookies' ? 'Not logged in' : 'Unknown')))
                                    )}
                                </span>
                                {accountInfo?.screen_name && accountInfo.screen_name !== accountInfo.username && accountInfo.username !== 'Unknown' && (
                                    <span className="text-[11px] text-[#8a8a8a] truncate block" title={accountInfo.screen_name}>
                                        {accountInfo.screen_name}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#151515] p-3 rounded-lg border border-[#2a2a2a]">
                        <span className="block text-[11px] text-[#8a8a8a] uppercase tracking-wider mb-1">Can Go Live</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            accountInfo?.can_go_live ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-[#fe2c55]/15 text-[#fe2c55] border border-[#fe2c55]/30'
                        }`}>
                            {accountInfo?.can_go_live ? 'Granted' : 'Restricted'}
                        </span>
                    </div>

                    <div className="bg-[#151515] p-3 rounded-lg border border-[#2a2a2a]">
                        <span className="block text-[11px] text-[#8a8a8a] uppercase tracking-wider mb-1">Can Dual Layout</span>
                        <span className="text-xs font-semibold text-[#e0e0e0]">
                            {accountInfo?.dual_layout_supported ? 'Supported' : 'Standard Only'}
                        </span>
                    </div>

                    <div className="bg-[#151515] p-3 rounded-lg border border-[#2a2a2a]">
                        <span className="block text-[11px] text-[#8a8a8a] uppercase tracking-wider mb-1">Status</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                            accountInfo?.status === 'ready'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : accountInfo?.status === 'session_expired'
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : accountInfo?.status === 'signer_error'
                                ? 'bg-[#fe2c55]/15 text-[#fe2c55] border border-[#fe2c55]/30'
                                : 'bg-[#25f4ee]/15 text-[#25f4ee] border border-[#25f4ee]/30'
                        }`}>
                            {accountInfo?.status ? accountInfo.status.replace('_', ' ') : 'Unknown'}
                        </span>
                    </div>
                </div>

                {/* Expiration or Signer Alert Banner */}
                {accountInfo?.status === 'session_expired' && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2.5 text-xs text-amber-300">
                        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                            <span className="font-semibold block">TikTok Session Expired</span>
                            <span>{accountInfo.message || 'The cookies you provided are expired or invalid. Please sign into TikTok in your browser, export fresh cookies, and upload them here.'}</span>
                        </div>
                    </div>
                )}
                {accountInfo?.status === 'signer_error' && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2.5 text-xs text-red-300">
                        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <span className="font-semibold block">RapidAPI Key Required</span>
                            <span>{accountInfo.message || 'A valid RapidAPI key is required to sign TikTok live requests. Please configure your key below.'}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Cookies Upload / Paste Zone */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">
                            TikTok Cookies
                        </span>
                        <div className="flex rounded bg-[#202020] p-0.5 text-[11px]">
                            <button
                                type="button"
                                onClick={() => setShowPaste(false)}
                                className={`px-2 py-0.5 rounded font-medium transition-colors ${!showPaste ? 'bg-[#2a2a2a] text-[#25f4ee]' : 'text-[#8a8a8a] hover:text-white'}`}
                            >
                                File Upload
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowPaste(true)}
                                className={`px-2 py-0.5 rounded font-medium transition-colors ${showPaste ? 'bg-[#2a2a2a] text-[#25f4ee]' : 'text-[#8a8a8a] hover:text-white'}`}
                            >
                                Paste Text
                            </button>
                        </div>
                    </div>
                    <a
                        href="https://chromewebstore.google.com/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#25f4ee] hover:underline flex items-center gap-1"
                    >
                        <span>How to export cookies</span>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </a>
                </div>

                {!showPaste ? (
                    <label
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                            dragOver
                                ? 'border-[#25f4ee] bg-[#25f4ee]/10 scale-[1.01]'
                                : 'border-[#333] hover:border-[#25f4ee]/70 bg-[#161616]'
                        }`}
                    >
                        <div className="w-10 h-10 rounded-full bg-[#25f4ee]/10 text-[#25f4ee] flex items-center justify-center mb-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <span className="text-sm font-semibold text-white mb-1">
                            {uploading ? 'Processing cookies...' : 'Drop your cookies.json here or click to browse'}
                        </span>
                        <span className="text-xs text-[#8a8a8a]">
                            Accepts JSON array, key-value dict, or Netscape cookies.txt
                        </span>
                        <input
                            type="file"
                            accept=".json,.txt"
                            disabled={uploading}
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </label>
                ) : (
                    <div className="space-y-2 bg-[#161616] p-4 rounded-xl border border-[#2a2a2a]">
                        <textarea
                            rows={4}
                            value={pasteText}
                            onChange={(e) => setPasteText(e.target.value)}
                            placeholder="Paste your JSON cookies array, key-value JSON, or Cookie: sessionid=... header string here"
                            className="w-full bg-[#202020] border border-[#333] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#25f4ee] transition-all resize-y"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => { setPasteText(''); setShowPaste(false); }}
                                className="px-3 py-1.5 text-xs text-[#8a8a8a] hover:text-white rounded transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={uploading || !pasteText.trim()}
                                onClick={() => handleUploadFile(pasteText.trim())}
                                className="px-4 py-1.5 bg-[#25f4ee] hover:bg-[#25f4ee]/90 text-black font-semibold text-xs rounded transition-colors disabled:opacity-50"
                            >
                                {uploading ? 'Processing...' : 'Import Cookies'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* RapidAPI Key Input & Quota */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* RapidAPI Key */}
                <div className="bg-[#151515] p-4 rounded-lg border border-[#2a2a2a] space-y-2.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">
                                RapidAPI Key
                            </span>
                            <a
                                href="https://rapidapi.com/"
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open RapidAPI Documentation"
                                className="w-4 h-4 rounded-full bg-[#2a2a2a] hover:bg-[#333] text-[#25f4ee] text-[10px] font-bold flex items-center justify-center"
                            >
                                ?
                            </a>
                        </div>
                    </div>

                    <div className="relative">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={rapidApiKey}
                            onChange={e => setRapidApiKey(e.target.value)}
                            placeholder="Enter your RapidAPI Key..."
                            className="w-full bg-[#252525] border border-[#333] rounded-lg px-3 py-2 text-sm text-white pr-10 focus:outline-none focus:border-[#25f4ee] focus:ring-2 focus:ring-[#25f4ee]/30 transition-all font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8a8a8a] hover:text-white p-1"
                            title={showKey ? 'Hide key' : 'Show key'}
                        >
                            {showKey ? (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            )}
                        </button>
                    </div>

                    <div className="flex justify-end pt-1">
                        <button
                            type="button"
                            onClick={handleSaveKey}
                            disabled={savingKey}
                            className="px-3 py-1.5 bg-[#252525] hover:bg-[#303030] border border-[#333] hover:border-[#25f4ee] text-xs font-semibold rounded text-white transition-colors disabled:opacity-50"
                        >
                            {savingKey ? 'Saving...' : 'Save Key'}
                        </button>
                    </div>
                </div>

                {/* RapidAPI Quota */}
                <div className="bg-[#151515] p-4 rounded-lg border border-[#2a2a2a] space-y-2.5 flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-baseline mb-1">
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">
                                RapidAPI Quota
                            </span>
                            <span className="text-xs font-bold text-white font-mono" title={`Reset date: ${quota?.reset_at || 'Monthly'}`}>
                                {quotaRemaining} / {quotaLimit} remaining
                            </span>
                        </div>

                        {/* Progress Bar with pink gradient fill */}
                        <div className="w-full bg-[#252525] rounded-full h-2.5 overflow-hidden my-2">
                            <div
                                className="h-2.5 rounded-full bg-gradient-to-r from-[#fe2c55] to-[#d91a40] transition-all duration-500 ease-out"
                                style={{ width: `${quotaPercentage}%` }}
                                title={`Reset date: ${quota?.reset_at || 'Monthly'}`}
                            ></div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-[#8a8a8a] pt-1 border-t border-[#262626]">
                        <span>Updated: {quota?.updated_at || 'Never'}</span>
                        <span title={quota?.reset_at || 'Monthly'}>Resets: {quota?.reset_at || 'Monthly'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}