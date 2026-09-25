import React, { useState, useEffect, useRef } from 'react';
import { getConfig, saveConfig, getTopics, getGames } from '../api';
import { useToast } from './Toast';

const REGIONS = [
  "", "af", "ax", "al", "dz", "as", "ad", "ao", "ai", "aq", "ag", "ar", "am", "aw", "au", "at", "az", "bs", "bh", "bd", "bb", "by", "be", "bz", "bj", "bm", "bt", "bo", "bq", "ba", "bw", "bv", "br", "io", "bn", "bg", "bf", "bi", "cv", "kh", "cm", "ca", "ky", "cf", "td", "cl", "cn", "cx", "cc", "co", "km", "cg", "cd", "ck", "cr", "ci", "hr", "cu", "cw", "cy", "cz", "dk", "dj", "dm", "do", "ec", "eg", "sv", "et", "fk", "fo", "fj", "fi", "fr", "gf", "pf", "tf", "ga", "gm", "ge", "de", "gh", "gi", "gr", "gl", "gd", "gp", "gu", "gt", "gg", "gn", "gw", "gy", "ht", "hm", "va", "hn", "hk", "hu", "is", "in", "id", "ir", "iq", "ie", "im", "il", "it", "jm", "jp", "je", "jo", "kz", "ke", "ki", "kp", "kr", "kw", "kg", "la", "lv", "lb", "ls", "lr", "ly", "li", "lt", "lu", "mo", "mg", "mw", "my", "mv", "ml", "mt", "mh", "mq", "mr", "mu", "yt", "mx", "fm", "md", "mc", "mn", "me", "ms", "ma", "mz", "mm", "na", "nr", "np", "nl", "nc", "nz", "ni", "ne", "ng", "nu", "nf", "mk", "mp", "no", "om", "pk", "pw", "ps", "pa", "pg", "py", "pe", "ph", "pn", "pl", "pt", "pr", "qa", "re", "ro", "ru", "rw", "bl", "sh", "kn", "lc", "mf", "pm", "vc", "ws", "sm", "st", "sa", "sn", "rs", "sc", "sl", "sg", "sx", "sk", "si", "sb", "so", "za", "gs", "ss", "es", "lk", "sd", "sr", "sj", "se", "ch", "sy", "tw", "tj", "tz", "th", "tl", "tg", "tk", "to", "tt", "tn", "tr", "tm", "tc", "tv", "ug", "ua", "ae", "gb", "um", "us", "uy", "uz", "vu", "ve", "vn", "vg", "vi", "wf", "eh", "ye", "zm", "zw"
];

export default function StreamSetup({ setupData, setSetupData, isLive }) {
    const [topics, setTopics] = useState({});
    const [games, setGames] = useState({});
    const [gameSearch, setGameSearch] = useState('');
    const [isGameOpen, setIsGameOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const gameDropdownRef = useRef(null);
    const showToast = useToast();

    // Load topics, games, and config on mount
    useEffect(() => {
        getTopics()
            .then(data => { if (data && typeof data === 'object') setTopics(data); })
            .catch(err => console.error('Failed to load topics', err));

        getGames()
            .then(data => { if (data && typeof data === 'object') setGames(data); })
            .catch(err => console.error('Failed to load games', err));

        getConfig()
            .then(cfg => {
                if (cfg && typeof cfg === 'object') {
                    setSetupData(prev => ({
                        ...prev,
                        title: cfg.title ?? prev.title,
                        topic: String(cfg.topic || cfg.hashtag_id || prev.topic),
                        game: String(cfg.game || cfg.game_tag_id || prev.game),
                        region: cfg.region || cfg.priority_region || prev.region,
                        replay: cfg.replay !== undefined ? Boolean(cfg.replay) : (cfg.generate_replay !== undefined ? Boolean(cfg.generate_replay) : prev.replay),
                        close_room: cfg.close_room !== undefined ? Boolean(cfg.close_room) : (cfg.close_room_when_close_stream !== undefined ? Boolean(cfg.close_room_when_close_stream) : prev.close_room),
                        age_restricted: Boolean(cfg.age_restricted ?? prev.age_restricted),
                        dual_layout: Boolean(cfg.dual_layout || cfg.dual_layout_supported || prev.dual_layout),
                        thumbnail_path: cfg.thumbnail_path ?? prev.thumbnail_path
                    }));
                }
            })
            .catch(err => console.error('Failed to load config', err));
    }, []);

    // Close game combobox on outside click
    useEffect(() => {
        function handleClickOutside(e) {
            if (gameDropdownRef.current && !gameDropdownRef.current.contains(e.target)) {
                setIsGameOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const gameList = Array.isArray(games)
        ? games.map(g => ({ id: String(g.id || g.value), title: String(g.title || g.name || g.label) }))
        : Object.entries(games || {}).map(([id, title]) => ({ id: String(id), title: String(title) }));

    const filteredGames = gameList.filter(g =>
        g.title.toLowerCase().includes(gameSearch.toLowerCase())
    );

    const selectedGameTitle = gameList.find(g => g.id === setupData.game)?.title || '';

    const handleSaveConfig = async () => {
        setSaving(true);
        try {
            await saveConfig({
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
            showToast('Stream settings saved to config.json', 'success');
        } catch (err) {
            showToast('Failed to save config: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Title */}
            <div>
                <label className="block text-xs font-semibold text-[#8a8a8a] mb-1.5 uppercase tracking-wider">
                    Stream Title
                </label>
                <input
                    type="text"
                    value={setupData.title}
                    onChange={e => setSetupData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter broadcast title..."
                    disabled={isLive}
                    className="w-full bg-[#252525] border border-[#333] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#25f4ee] focus:ring-2 focus:ring-[#25f4ee]/30 transition-all disabled:opacity-50"
                />
            </div>

            {/* Topic & Searchable Game Combobox */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-[#8a8a8a] mb-1.5 uppercase tracking-wider">
                        Topic Category
                    </label>
                    <select
                        value={setupData.topic}
                        onChange={e => setSetupData(prev => ({ ...prev, topic: e.target.value }))}
                        disabled={isLive}
                        className="w-full bg-[#252525] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#25f4ee] focus:ring-2 focus:ring-[#25f4ee]/30 transition-all disabled:opacity-50 cursor-pointer"
                    >
                        {Object.entries(topics).map(([id, name]) => (
                            <option key={id} value={id}>{name}</option>
                        ))}
                    </select>
                </div>

                {/* Game Tag: Searchable Dropdown / Combobox */}
                <div className="relative" ref={gameDropdownRef}>
                    <label className="block text-xs font-semibold text-[#8a8a8a] mb-1.5 uppercase tracking-wider">
                        Game Tag
                    </label>
                    <div
                        onClick={() => !isLive && setIsGameOpen(!isGameOpen)}
                        className="w-full bg-[#252525] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus-within:border-[#25f4ee] focus-within:ring-2 focus-within:ring-[#25f4ee]/30 flex items-center justify-between cursor-pointer transition-all min-h-[42px]"
                    >
                        <span className={setupData.game ? 'text-white' : 'text-[#777]'}>
                            {selectedGameTitle || 'None / Search game...'}
                        </span>
                        <div className="flex items-center gap-1.5">
                            {setupData.game && !isLive && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSetupData(prev => ({ ...prev, game: '' }));
                                        setGameSearch('');
                                    }}
                                    className="text-[#8a8a8a] hover:text-white p-0.5"
                                >
                                    &times;
                                </button>
                            )}
                            <svg className={`w-4 h-4 text-[#8a8a8a] transform transition-transform ${isGameOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>

                    {isGameOpen && !isLive && (
                        <div className="absolute z-50 left-0 right-0 mt-1 bg-[#1e1e1e] border border-[#333] rounded-lg shadow-2xl max-h-60 overflow-hidden flex flex-col">
                            <div className="p-2 border-b border-[#2a2a2a] bg-[#1a1a1a]">
                                <input
                                    type="text"
                                    value={gameSearch}
                                    onChange={e => setGameSearch(e.target.value)}
                                    placeholder="Search game title..."
                                    autoFocus
                                    className="w-full bg-[#252525] border border-[#383838] rounded px-2.5 py-1.5 text-xs text-white placeholder-[#777] focus:outline-none focus:border-[#25f4ee]"
                                />
                            </div>
                            <div className="overflow-y-auto flex-1 divide-y divide-[#262626]">
                                <div
                                    onClick={() => {
                                        setSetupData(prev => ({ ...prev, game: '' }));
                                        setIsGameOpen(false);
                                        setGameSearch('');
                                    }}
                                    className={`px-3 py-2 text-xs cursor-pointer hover:bg-[#252525] ${!setupData.game ? 'text-[#25f4ee] font-semibold bg-[#25f4ee]/10' : 'text-[#8a8a8a]'}`}
                                >
                                    None / General Gaming
                                </div>
                                {filteredGames.length > 0 ? (
                                    filteredGames.map(g => (
                                        <div
                                            key={g.id}
                                            onClick={() => {
                                                setSetupData(prev => ({ ...prev, game: g.id }));
                                                setIsGameOpen(false);
                                                setGameSearch('');
                                            }}
                                            className={`px-3 py-2 text-xs cursor-pointer hover:bg-[#252525] ${setupData.game === g.id ? 'text-[#25f4ee] font-semibold bg-[#25f4ee]/10' : 'text-white'}`}
                                        >
                                            {g.title}
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-3 text-xs text-[#777] text-center">No matching games</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Region & Thumbnail */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-[#8a8a8a] mb-1.5 uppercase tracking-wider">
                        Priority Region
                    </label>
                    <select
                        value={setupData.region}
                        onChange={e => setSetupData(prev => ({ ...prev, region: e.target.value }))}
                        disabled={isLive}
                        className="w-full bg-[#252525] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#25f4ee] focus:ring-2 focus:ring-[#25f4ee]/30 transition-all disabled:opacity-50 cursor-pointer"
                    >
                        <option value="">Default (Automatic Routing)</option>
                        {REGIONS.filter(Boolean).map(code => (
                            <option key={code} value={code}>{code.toUpperCase()}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-[#8a8a8a] mb-1.5 uppercase tracking-wider">
                        Local Thumbnail Path (Optional)
                    </label>
                    <input
                        type="text"
                        value={setupData.thumbnail_path}
                        onChange={e => setSetupData(prev => ({ ...prev, thumbnail_path: e.target.value }))}
                        placeholder="/absolute/path/to/cover.jpg"
                        disabled={isLive}
                        className="w-full bg-[#252525] border border-[#333] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#25f4ee] focus:ring-2 focus:ring-[#25f4ee]/30 transition-all disabled:opacity-50"
                    />
                </div>
            </div>

            {/* Options Checkboxes */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#161616] p-3.5 rounded-lg border border-[#262626]">
                <label className="flex items-center gap-2.5 text-xs sm:text-sm text-[#e0e0e0] cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={setupData.replay}
                        onChange={e => setSetupData(prev => ({ ...prev, replay: e.target.checked }))}
                        disabled={isLive}
                        className="w-4 h-4 rounded border-[#444] bg-[#252525] text-[#fe2c55] accent-[#fe2c55] cursor-pointer"
                    />
                    <span>Generate Replay</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs sm:text-sm text-[#e0e0e0] cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={setupData.close_room}
                        onChange={e => setSetupData(prev => ({ ...prev, close_room: e.target.checked }))}
                        disabled={isLive}
                        className="w-4 h-4 rounded border-[#444] bg-[#252525] text-[#fe2c55] accent-[#fe2c55] cursor-pointer"
                    />
                    <span>Close Room When Close Stream</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs sm:text-sm text-[#e0e0e0] cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={setupData.age_restricted}
                        onChange={e => setSetupData(prev => ({ ...prev, age_restricted: e.target.checked }))}
                        disabled={isLive}
                        className="w-4 h-4 rounded border-[#444] bg-[#252525] text-[#fe2c55] accent-[#fe2c55] cursor-pointer"
                    />
                    <span>Age Restricted (18+)</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs sm:text-sm text-[#e0e0e0] cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={setupData.dual_layout}
                        onChange={e => setSetupData(prev => ({ ...prev, dual_layout: e.target.checked }))}
                        disabled={isLive}
                        className="w-4 h-4 rounded border-[#444] bg-[#252525] text-[#fe2c55] accent-[#fe2c55] cursor-pointer"
                    />
                    <span className="text-[#25f4ee] font-medium">Dual Layout (Portrait Ingest)</span>
                </label>
            </div>

            {/* Save Config Button */}
            <div className="flex justify-end pt-1">
                <button
                    type="button"
                    onClick={handleSaveConfig}
                    disabled={isLive || saving}
                    className="px-4 py-2 bg-[#252525] hover:bg-[#303030] border border-[#333] hover:border-[#25f4ee] text-xs font-semibold rounded-lg text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <svg className="w-3.5 h-3.5 text-[#25f4ee]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    <span>{saving ? 'Saving...' : 'Save Settings'}</span>
                </button>
            </div>
        </div>
    );
}