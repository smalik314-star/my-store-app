import React, { useState, useEffect } from 'react';
import { useSettings } from '../../context/SettingsContext';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'color';
}

export function Logo({ className = 'h-8 w-8', variant = 'color' }: LogoProps) {
  const { settings } = useSettings();
  const [imgError, setImgError] = useState(false);
  const [base64Src, setBase64Src] = useState<string | null>(null);

  // If the logo changes, reset the error state and base64 src to allow retrying
  useEffect(() => {
    setImgError(false);
    setBase64Src(null);
  }, [settings?.logoURL]);

  useEffect(() => {
    if (!settings?.logoURL) {
      setBase64Src(null);
      return;
    }

    let active = true;
    const convertToBase64 = async () => {
      try {
        const response = await fetch(settings.logoURL, { mode: 'cors' });
        if (!response.ok) throw new Error('Fetch logo failed');
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (active) {
            setBase64Src(reader.result as string);
          }
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.warn('[Logo] Failed to pre-convert external logo to base64, falling back to original URL:', err);
        if (active) {
          setBase64Src(settings.logoURL);
        }
      }
    };

    convertToBase64();
    return () => {
      active = false;
    };
  }, [settings?.logoURL]);

  if (settings?.logoURL && !imgError) {
    return (
      <img
        src={base64Src || settings.logoURL}
        alt={settings.storeName || 'PharmaFlow'}
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        className={`${className} object-contain rounded-xl`}
      />
    );
  }

  // Beautiful fallback default logo (custom SVG)
  // Designed to match the brand identity perfectly with responsive styles.
  const isLight = variant === 'light';
  
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="defaultLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#009688" />
          <stop offset="100%" stopColor="#00796B" />
        </linearGradient>
        <linearGradient id="pillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00B0FF" />
          <stop offset="100%" stopColor="#0091EA" />
        </linearGradient>
      </defs>
      
      {/* Rounded square container with drop shadow feel */}
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="26"
        fill={isLight ? "rgba(255, 255, 255, 0.15)" : "url(#defaultLogoGrad)"}
        stroke={isLight ? "rgba(255, 255, 255, 0.2)" : "none"}
        strokeWidth="2"
      />
      
      {/* Modern Medical Cross representation with flow curves */}
      <g transform="translate(10, 10) scale(0.8)">
        {/* Dynamic floating pill inside the cross */}
        <rect
          x="34"
          y="15"
          width="32"
          height="70"
          rx="16"
          fill={isLight ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.15)"}
        />
        
        {/* Pill base color (secondary brand color accent) */}
        <rect
          x="34"
          y="15"
          width="32"
          height="35"
          rx="16"
          fill="url(#pillGrad)"
        />

        {/* White cross bar */}
        <path
          d="M20 50H80M50 20V80"
          stroke="#FFFFFF"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Elegant internal flow pulse wave */}
        <path
          d="M25 50C35 40, 40 60, 50 50C60 40, 65 60, 75 50"
          stroke={isLight ? "rgba(255, 255, 255, 0.5)" : "#009688"}
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
