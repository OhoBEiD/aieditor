'use client';

import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalProps {
    onTerminalReady?: (terminal: XTerm) => void;
    className?: string;
}

export function Terminal({ onTerminalReady, className }: TerminalProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        // Initialize xterm.js
        const term = new XTerm({
            cursorBlink: true,
            fontSize: 12,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#ffffff', // White background
                foreground: '#18181b', // Zinc-900
                cursor: '#18181b',
                selectionBackground: '#e4e4e7', // Zinc-200
                black: '#000000',
                red: '#ef4444',
                green: '#16a34a', // Darker green for light mode
                yellow: '#ca8a04', // Darker yellow
                blue: '#2563eb', // Darker blue
                magenta: '#c026d3',
                cyan: '#0891b2',
                white: '#e5e7eb', // This acts as "dim" in some contexts, or bright black equivalent
                brightBlack: '#71717a',
                brightRed: '#f87171',
                brightGreen: '#4ade80',
                brightYellow: '#facc15',
                brightBlue: '#60a5fa',
                brightMagenta: '#e879f9',
                brightCyan: '#22d3ee',
                brightWhite: '#fafafa',
            },
            convertEol: true, // Treat \n as new line
            cursorStyle: 'bar', // More modern cursor
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Call callback with terminal instance
        onTerminalReady?.(term);

        // Handle resize
        const handleResize = () => {
            fitAddon.fit();
        };
        window.addEventListener('resize', handleResize);

        // Also resize observer for the container
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
        });
        resizeObserver.observe(terminalRef.current);

        return () => {
            window.removeEventListener('resize', handleResize);
            resizeObserver.disconnect();
            term.dispose();
        };
    }, [onTerminalReady]);

    return (
        <div
            ref={terminalRef}
            className={`w-full h-full overflow-hidden bg-white ${className || ''}`}
            style={{ padding: '8px' }}
        />
    );
}
