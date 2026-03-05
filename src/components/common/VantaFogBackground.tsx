'use client';

import React, { useEffect, useRef, useState } from 'react';

interface VantaFogBackgroundProps {
    className?: string;
}

const VantaFogBackground: React.FC<VantaFogBackgroundProps> = ({ className }) => {
    const vantaRef = useRef<HTMLDivElement>(null);
    const [vantaEffect, setVantaEffect] = useState<any>(null);

    useEffect(() => {
        if (vantaEffect) return;
        if (!vantaRef.current) return;

        let mounted = true;

        const initVanta = async () => {
            try {
                const THREE = await import('three');
                const FOG = (await import('vanta/dist/vanta.fog.min')).default;

                if (!mounted || !vantaRef.current) return;

                const effect = FOG({
                    el: vantaRef.current,
                    THREE,
                    mouseControls: true,
                    touchControls: true,
                    gyroControls: false,
                    minHeight: 200.0,
                    minWidth: 200.0,
                    highlightColor: 0xe6e0dd,
                    midtoneColor: 0xb69161,
                    lowlightColor: 0x84745b,
                    baseColor: 0xe8e8e8,
                });

                if (mounted) {
                    setVantaEffect(effect);
                }
            } catch (err) {
                console.error('Failed to initialize Vanta.js fog:', err);
            }
        };

        initVanta();

        return () => {
            mounted = false;
        };
    }, [vantaEffect]);

    useEffect(() => {
        return () => {
            if (vantaEffect) {
                vantaEffect.destroy();
            }
        };
    }, [vantaEffect]);

    return (
        <div
            ref={vantaRef}
            className={className}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 0,
            }}
        />
    );
};

export default VantaFogBackground;
