import { useEffect, useId, useState } from 'react';
import { useProductImagesEnabled } from '../../utils';

export function ProductArt({ item, small = false }) {
  const gradient = useId();
  const imagesEnabled = useProductImagesEnabled();
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [item?.image_url]);

  if (imagesEnabled && item?.image_url && !imgFailed) {
    return (
      <span className={'product-art has-photo ' + (small ? 'small' : '')} aria-hidden="true">
        <img
          src={item.image_url}
          alt={item.name || ''}
          loading="lazy"
          decoding="async"
          className="zk-product-photo"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  const phone =
    item.category === 'Phones' ||
    item.category === 'Repair Parts' ||
    item.sku?.includes('CASE') ||
    item.sku?.includes('GLASS');
  const color =
    item.brand === 'Samsung' ? '#a6a2e9' : item.brand === 'Xiaomi' ? '#32bdc4' : '#5f7ab6';

  return (
    <span className={'product-art ' + (small ? 'small' : '')} aria-hidden="true">
      {phone ? (
        <svg viewBox="0 0 96 84">
          <defs>
            <linearGradient id={gradient} x2="100%" y2="100%">
              <stop stopColor={color} />
              <stop offset="1" stopColor="#e4effa" />
            </linearGradient>
          </defs>
          <rect x="23" y="9" width="35" height="65" rx="8" fill={color} stroke="#47546d" />
          <circle cx="31" cy="18" r="4" fill="#15233c" />
          <circle cx="31" cy="28" r="4" fill="#15233c" />
          <rect x="42" y="7" width="35" height="67" rx="8" fill="#162037" />
          <rect
            x="45"
            y="10"
            width="29"
            height="61"
            rx="5"
            fill={'url(#' + gradient + ')'}
          />
          <path d="M45 58L74 28v16L50 71h-5z" fill="#fff" opacity=".28" />
          <rect x="54" y="12" width="11" height="3" rx="1.5" fill="#162037" />
        </svg>
      ) : (
        <svg viewBox="0 0 96 84">
          {item.sku?.includes('CBL') || item.sku?.includes('USB-C') ? (
            <>
              <ellipse cx="45" cy="43" rx="24" ry="19" fill="none" stroke="#8ca1b1" strokeWidth="5" />
              <ellipse cx="45" cy="43" rx="18" ry="14" fill="none" stroke="#c1d0dc" strokeWidth="4" />
              <path d="M60 58l10 8M24 53l-9 8" stroke="#8ca1b1" strokeWidth="6" />
            </>
          ) : item.sku?.includes('AP-') ? (
            <>
              <rect x="23" y="36" width="51" height="31" rx="12" fill="#fff" stroke="#b6c8da" />
              <path d="M24 48h48" stroke="#c6d2de" />
              <path
                d="M38 19v22m19-22v22"
                stroke="#a5b7c7"
                strokeWidth="7"
                strokeLinecap="round"
              />
              <ellipse cx="38" cy="22" rx="10" ry="8" fill="#f8fcff" />
              <ellipse cx="57" cy="22" rx="10" ry="8" fill="#f8fcff" />
              <circle cx="48" cy="57" r="2" fill="#2ed4a9" />
            </>
          ) : (
            <>
              <rect x="26" y="31" width="44" height="38" rx="9" fill="#fff" stroke="#b6c8da" />
              <path
                d="M39 32V18m18 14V18"
                stroke="#899dac"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <rect x="42" y="57" width="12" height="4" rx="2" fill="#29384b" />
            </>
          )}
        </svg>
      )}
    </span>
  );
}
