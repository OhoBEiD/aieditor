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
                background: '#f2efed',
                foreground: '#2c2418',
                cursor: '#2c2418',
                selectionBackground: '#d6cfc9',
                black: '#2c2418',
                red: '#c45c4a',
                green: '#6b8f71',
                yellow: '#d4a843',
                blue: '#84745b',
                magenta: '#b69161',
                cyan: '#84745b',
                white: '#e6e0dd',
                brightBlack: '#7a6f60',
                brightRed: '#c45c4a',
                brightGreen: '#6b8f71',
                brightYellow: '#d4a843',
                brightBlue: '#84745b',
                brightMagenta: '#c9a474',
                brightCyan: '#84745b',
                brightWhite: '#f2efed',
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
            className={`w-full h-full overflow-hidden bg-[#f2efed] ${className || ''}`}
            style={{ padding: '8px' }}
        />
    );
}
