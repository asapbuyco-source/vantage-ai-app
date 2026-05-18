import React, { useMemo } from 'react';

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    strokeWidth?: number;
    className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
    data,
    width = 100,
    height = 30,
    color = '#00E5FF', // default vantage-cyan
    strokeWidth = 2,
    className = ''
}) => {
    const points = useMemo(() => {
        if (!data || data.length === 0) return '';
        
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min === 0 ? 1 : max - min;
        
        // Add padding so stroke isn't clipped
        const paddingY = strokeWidth;
        const drawHeight = height - paddingY * 2;
        
        return data.map((val, i) => {
            const x = (i / (data.length - 1)) * width;
            // Invert Y because SVG 0 is at the top
            const y = height - paddingY - ((val - min) / range) * drawHeight;
            return `${x},${y}`;
        }).join(' ');
    }, [data, width, height, strokeWidth]);

    if (!data || data.length < 2) return null;

    // Generate gradient ID to avoid collisions if multiple sparklines exist
    const gradientId = `sparkline-gradient-${Math.random().toString(36).substr(2, 9)}`;

    return (
        <svg 
            width={width} 
            height={height} 
            viewBox={`0 0 ${width} ${height}`} 
            className={`overflow-visible ${className}`}
            preserveAspectRatio="none"
        >
            <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                </linearGradient>
            </defs>
            {/* Fill area */}
            <polygon 
                points={`0,${height} ${points} ${width},${height}`}
                fill={`url(#${gradientId})`} 
            />
            {/* Line */}
            <polyline 
                points={points} 
                fill="none" 
                stroke={color} 
                strokeWidth={strokeWidth} 
                strokeLinecap="round" 
                strokeLinejoin="round" 
            />
            {/* Ending Dot */}
            {points && (
                <circle 
                    cx={points.split(' ').pop()?.split(',')[0]} 
                    cy={points.split(' ').pop()?.split(',')[1]} 
                    r={strokeWidth * 1.5} 
                    fill={color} 
                />
            )}
        </svg>
    );
};
