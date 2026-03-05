import React from 'react';

const BlobBackground = () => {
    return (
        <svg
            className="absolute inset-0 w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1920 1080"
            preserveAspectRatio="xMidYMid slice"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
        >
            <defs>
                <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="80" />
                </filter>

                {/* Cosmic Orange & Black Gradients */}
                <radialGradient id="blob1" cx="50%" cy="50%">
                    <stop offset="0%" stopColor="#F77E2D" stopOpacity="0.9">
                        <animate attributeName="stop-color" values="#F77E2D;#FFA266;#FF9147;#F77E2D" dur="8s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="#000000" stopOpacity="0">
                        <animate attributeName="stop-color" values="#000000;#1a0f05;#000000" dur="8s" repeatCount="indefinite" />
                    </stop>
                </radialGradient>

                <radialGradient id="blob2" cx="50%" cy="50%">
                    <stop offset="0%" stopColor="#FFA266" stopOpacity="0.9">
                        <animate attributeName="stop-color" values="#FFA266;#FF9147;#FFBB88;#FFA266" dur="10s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="#000000" stopOpacity="0">
                        <animate attributeName="stop-color" values="#000000;#1a0a00;#000000" dur="10s" repeatCount="indefinite" />
                    </stop>
                </radialGradient>

                <radialGradient id="blob3" cx="50%" cy="50%">
                    <stop offset="0%" stopColor="#FF9147" stopOpacity="0.9">
                        <animate attributeName="stop-color" values="#FF9147;#FFBB88;#F77E2D;#FF9147" dur="12s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="#000000" stopOpacity="0">
                        <animate attributeName="stop-color" values="#000000;#1a0f05;#000000" dur="12s" repeatCount="indefinite" />
                    </stop>
                </radialGradient>

                <radialGradient id="blob4" cx="50%" cy="50%">
                    <stop offset="0%" stopColor="#FFBB88" stopOpacity="0.9">
                        <animate attributeName="stop-color" values="#FFBB88;#FF9147;#FFA266;#FFBB88" dur="9s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="#000000" stopOpacity="0">
                        <animate attributeName="stop-color" values="#000000;#1a0a00;#000000" dur="9s" repeatCount="indefinite" />
                    </stop>
                </radialGradient>

                <radialGradient id="blob5" cx="50%" cy="50%">
                    <stop offset="0%" stopColor="#FFA266" stopOpacity="0.9">
                        <animate attributeName="stop-color" values="#FFA266;#F77E2D;#FF9147;#FFA266" dur="11s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="#000000" stopOpacity="0">
                        <animate attributeName="stop-color" values="#000000;#1a0f05;#000000" dur="11s" repeatCount="indefinite" />
                    </stop>
                </radialGradient>
            </defs>

            <rect width="100%" height="100%" fill="#000000" />

            <g filter="url(#blur)">
                <ellipse cx="20%" cy="35%" rx="450" ry="380" fill="url(#blob1)">
                    <animate attributeName="cx" values="20%;35%;15%;20%" dur="15s" repeatCount="indefinite" />
                    <animate attributeName="cy" values="35%;50%;30%;35%" dur="12s" repeatCount="indefinite" />
                    <animate attributeName="rx" values="450;480;450" dur="10s" repeatCount="indefinite" />
                    <animate attributeName="ry" values="380;410;380" dur="11s" repeatCount="indefinite" />
                </ellipse>

                <ellipse cx="75%" cy="45%" rx="420" ry="350" fill="url(#blob2)">
                    <animate attributeName="cx" values="75%;65%;80%;75%" dur="18s" repeatCount="indefinite" />
                    <animate attributeName="cy" values="45%;60%;40%;45%" dur="14s" repeatCount="indefinite" />
                    <animate attributeName="rx" values="420;450;420" dur="12s" repeatCount="indefinite" />
                    <animate attributeName="ry" values="350;380;350" dur="13s" repeatCount="indefinite" />
                </ellipse>

                <ellipse cx="50%" cy="65%" rx="480" ry="400" fill="url(#blob3)">
                    <animate attributeName="cx" values="50%;55%;45%;50%" dur="16s" repeatCount="indefinite" />
                    <animate attributeName="cy" values="65%;55%;70%;65%" dur="11s" repeatCount="indefinite" />
                    <animate attributeName="rx" values="480;510;480" dur="14s" repeatCount="indefinite" />
                    <animate attributeName="ry" values="400;430;400" dur="15s" repeatCount="indefinite" />
                </ellipse>

                <ellipse cx="30%" cy="70%" rx="400" ry="330" fill="url(#blob4)">
                    <animate attributeName="cx" values="30%;40%;25%;30%" dur="17s" repeatCount="indefinite" />
                    <animate attributeName="cy" values="70%;60%;75%;70%" dur="13s" repeatCount="indefinite" />
                    <animate attributeName="rx" values="400;430;400" dur="11s" repeatCount="indefinite" />
                    <animate attributeName="ry" values="330;360;330" dur="12s" repeatCount="indefinite" />
                </ellipse>

                <ellipse cx="80%" cy="25%" rx="380" ry="320" fill="url(#blob5)">
                    <animate attributeName="cx" values="80%;70%;85%;80%" dur="14s" repeatCount="indefinite" />
                    <animate attributeName="cy" values="25%;35%;20%;25%" dur="16s" repeatCount="indefinite" />
                    <animate attributeName="rx" values="380;410;380" dur="13s" repeatCount="indefinite" />
                    <animate attributeName="ry" values="320;350;320" dur="14s" repeatCount="indefinite" />
                </ellipse>
            </g>
        </svg>
    );
};

export default BlobBackground;
