import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastCtx = createContext();

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'info', duration) => {
        const id = Date.now() + Math.random();
        const timeout = duration || (type === 'error' || type === 'violation' ? 10000 : 5000);
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), timeout);
    }, []);

    const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

    const borderColors = {
        success: 'border-l-emerald-400',
        error: 'border-l-[#fe2c55]',
        violation: 'border-l-[#fe2c55]',
        warning: 'border-l-amber-400',
        info: 'border-l-[#25f4ee]'
    };

    return (
        <ToastCtx.Provider value={showToast}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`pointer-events-auto bg-[#1a1a1a] text-white p-3.5 rounded-lg shadow-xl border border-[#2a2a2a] border-l-4 ${borderColors[t.type] || borderColors.info} flex items-start justify-between gap-3 transform transition-all duration-300 translate-x-0 ease-out`}
                    >
                        <span className="text-xs sm:text-sm font-medium leading-snug">{t.message}</span>
                        <button
                            onClick={() => removeToast(t.id)}
                            className="text-[#8a8a8a] hover:text-white transition-colors text-base leading-none p-0.5"
                        >
                            &times;
                        </button>
                    </div>
                ))}
            </div>
        </ToastCtx.Provider>
    );
}

export const useToast = () => useContext(ToastCtx);