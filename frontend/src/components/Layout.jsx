import React from 'react';

export default function Layout({ children, isConnected }) {
    return (
        <div className="min-h-screen bg-[#0f0f0f] text-[#ffffff] font-sans antialiased flex flex-col selection:bg-[#fe2c55] selection:text-white">
            {/* Header bar */}
            <header className="border-b border-[#222222] bg-[#141414]/90 backdrop-blur sticky top-0 z-40 px-4 py-3.5">
                <div className="max-w-[900px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#fe2c55] to-[#25f4ee] flex items-center justify-center shadow-sm">
                            <svg className="w-4 h-4 text-black font-black" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.67a2.886 2.886 0 1 1-2.887-2.886c.264 0 .52.036.764.102V9.378a6.331 6.331 0 1 0 5.568 6.292V8.924a8.19 8.19 0 0 0 4.77 1.524V6.99a4.832 4.832 0 0 1-1-.304z"/>
                            </svg>
                        </div>
                        <h1 className="text-lg sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-[#fe2c55] to-[#25f4ee] bg-clip-text text-transparent">
                            TikTok Stream Key Generator
                        </h1>
                    </div>

                    <div className="flex items-center gap-2">
                        {isConnected ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                Live Sync
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#222222] text-[#8a8a8a] border border-[#333333]">
                                <span className="w-2 h-2 rounded-full bg-[#666666]"></span>
                                Offline
                            </span>
                        )}
                    </div>
                </div>
            </header>

            {/* Main single-column layout */}
            <main className="flex-1 w-full max-w-[900px] mx-auto px-4 py-6 space-y-4">
                {children}
            </main>

            {/* Footer */}
            <footer className="border-t border-[#222222] bg-[#121212] py-5 mt-8 text-xs text-[#8a8a8a]">
                <div className="max-w-[900px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <span>TikTok Stream Key Generator</span>
                        <span className="text-[#444]">•</span>
                        <span>Single-User Localhost</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <a
                            href="https://buymeacoffee.com/loukious"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#fe2c55]/15 border border-[#fe2c55]/30 text-[#fe2c55] hover:bg-[#fe2c55]/25 transition-colors font-medium"
                        >
                            <span>☕</span>
                            <span>Buy Me a Coffee</span>
                        </a>

                        <a
                            href="https://github.com/Loukious/TikTokStreamKeyGenerator"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#252525] border border-[#333333] text-white hover:border-[#25f4ee] hover:text-[#25f4ee] transition-colors font-medium"
                        >
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                            </svg>
                            <span>GitHub</span>
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}