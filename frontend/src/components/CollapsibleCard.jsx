import React from 'react';

export default function CollapsibleCard({
    title,
    isOpen,
    onToggle,
    badge,
    icon,
    children
}) {
    return (
        <section className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] overflow-hidden transition-colors shadow-sm">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                className="w-full px-5 py-4 flex items-center justify-between bg-[#1f1f1f] hover:bg-[#252525] transition-colors text-left focus:outline-none focus:ring-1 focus:ring-[#25f4ee]"
            >
                <div className="flex items-center gap-3">
                    {icon && (
                        <span className="text-[#25f4ee] flex items-center justify-center w-5 h-5">
                            {icon}
                        </span>
                    )}
                    <h2 className="font-semibold text-base text-white tracking-wide">
                        {title}
                    </h2>
                    {badge && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium">
                            {badge}
                        </span>
                    )}
                </div>

                <div className="text-[#8a8a8a] flex items-center">
                    <svg
                        className={`w-5 h-5 transform transition-transform duration-300 ease-in-out ${
                            isOpen ? 'rotate-180 text-white' : ''
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            <div
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
            >
                <div className="overflow-hidden">
                    <div className="p-5 border-t border-[#262626]">
                        {children}
                    </div>
                </div>
            </div>
        </section>
    );
}
