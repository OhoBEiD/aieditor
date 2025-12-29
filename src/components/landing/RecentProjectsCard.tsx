import React from 'react';
import { Box, ExternalLink, ArrowRight } from 'lucide-react';
import Image from 'next/image';

interface RecentProjectsCardProps {
    onOpen: () => void;
}

export function RecentProjectsCard({ onOpen }: RecentProjectsCardProps) {
    return (
        <div className="mt-12 w-full flex justify-center perspective-[1000px]">
            <div className="relative group cursor-pointer animate-fade-in" onClick={onOpen} style={{ animationDelay: '0.4s' }}>
                {/* Glow Effect */}
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 rounded-[2rem] blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>

                {/* Main Card */}
                <div className="relative w-64 h-64 bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[2rem] p-6 flex flex-col items-center justify-between shadow-2xl transition-all duration-300 group-hover:scale-105 group-hover:-translate-y-2 overflow-hidden">

                    {/* Background pattern/gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent z-0 pointer-events-none"></div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none"></div>

                    {/* Content */}
                    <div className="relative z-10 w-full flex flex-col h-full">
                        {/* Header */}
                        <div className="flex justify-between items-start w-full mb-4">
                            <div className="p-2 rounded-xl bg-white/20 border border-white/20 shadow-inner">
                                <Box className="w-6 h-6 text-white" />
                            </div>
                            <div className="px-2 py-1 rounded-full bg-green-500/20 border border-green-500/30 text-[10px] font-bold text-green-300 uppercase tracking-wide">
                                Active
                            </div>
                        </div>

                        {/* Title & Info */}
                        <div className="mt-auto mb-4">
                            <h3 className="text-xl font-bold text-white mb-1 drop-shadow-sm">AI Demo Shop</h3>
                            <p className="text-xs text-blue-200/80 font-medium">Last edited just now</p>
                        </div>

                        {/* Action Area */}
                        <div className="w-full pt-4 border-t border-white/10 flex items-center justify-between group-hover:border-white/30 transition-colors">
                            <span className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">Open Project</span>
                            <div className="p-1.5 rounded-full bg-white/10 group-hover:bg-white/20 transition-all">
                                <ArrowRight className="w-3.5 h-3.5 text-white/90" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
