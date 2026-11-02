// Original lightweight vector character drawn from the supplied design references.
export default function Gnome({ pose = 'happy' }) {
  return <svg className={`tn-gnome tn-gnome-${pose}`} viewBox="0 0 100 126" aria-hidden="true">
    <ellipse cx="50" cy="119" rx="32" ry="5" fill="#5A4632" opacity=".13" />
    <path d="M29 102 28 117Q17 124 39 121L44 103M57 103 59 121Q81 124 72 116L71 102" fill="#5A4632" />
    <path d="M25 67Q12 72 14 94L27 99 28 109Q50 117 75 109L74 94Q90 78 80 68L71 73Z" fill="#4E7C59" />
    <path d="M29 76 27 108Q38 113 50 112L48 81" fill="#365E43" opacity=".5" />
    <path d="M26 99Q51 104 76 98L75 105Q50 111 27 106Z" fill="#8B6B3E" />
    <rect x="44" y="100" width="14" height="10" rx="2" fill="#F3B562" /><rect x="47" y="103" width="8" height="4" rx="1" fill="#705138" />
    <g className="tn-gnome-hand" transform={pose === 'thinking' ? 'translate(-20 12) rotate(-20 76 78)' : undefined}><path d="M76 78 84 64" stroke="#4E7C59" strokeWidth="12" strokeLinecap="round" /><path d="m81 66-2-9m4 7 1-12m2 12 5-10m-3 14 7-7" stroke="#F7C9A5" strokeWidth="4" strokeLinecap="round" /><ellipse cx="85" cy="66" rx="7" ry="8" fill="#F7C9A5" /></g>
    <ellipse cx="22" cy="58" rx="8" ry="11" fill="#F7C9A5" /><ellipse cx="78" cy="58" rx="8" ry="11" fill="#F7C9A5" />
    <ellipse cx="50" cy="59" rx="30" ry="28" fill="#F7C9A5" />
    <path d="M23 64Q22 90 50 103Q78 90 77 64L68 70Q52 76 32 68Z" fill="#F7F3EA" />
    <path d="M29 76Q33 91 50 99Q44 88 45 83" fill="#EADDC8" opacity=".65" />
    <ellipse cx="31" cy="65" rx="8" ry="6" fill="#F7A67E" /><ellipse cx="69" cy="65" rx="8" ry="6" fill="#F7A67E" />
    {pose === 'celebrate' ? <g fill="none" stroke="#283D39" strokeWidth="2.7" strokeLinecap="round"><path d="M32 56q4-6 8 0M60 56q4-6 8 0" /></g> : <g fill="#283D39"><ellipse cx="36" cy="56" rx="3" ry="4.5" /><ellipse cx="64" cy="56" rx="3" ry="4.5" /><circle cx="37" cy="54" r="1" fill="white" /><circle cx="65" cy="54" r="1" fill="white" /></g>}
    <path d="M31 47q4-3 9-1M60 46q5-2 9 1" stroke="#FFF9EC" strokeWidth="5" strokeLinecap="round" fill="none" />
    <ellipse cx="50" cy="64" rx="9" ry="6" fill="#EE956D" /><ellipse cx="48" cy="62" rx="4" ry="2" fill="#FFC39D" />
    <path d="M42 77q8 7 16 0" stroke="#CA704D" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <path d="M20 48Q25 28 43 5Q48-3 54 6Q65 20 79 48Q51 35 20 48" fill="#E4573F" />
    <path d="M43 7Q31 29 28 43L20 48Q25 28 43 7" fill="#C84231" />
    <path d="M20 44Q49 31 80 45L81 53Q50 41 19 54Z" fill="#E4573F" /><path d="M22 45Q50 35 77 46" stroke="#F77954" strokeWidth="3" fill="none" strokeLinecap="round" />
    {pose === 'celebrate' && <g stroke="#F3B562" strokeWidth="3" strokeLinecap="round"><path d="m12 20-5-5m78 6 5-6M9 32H3m88 0h6" /></g>}
  </svg>;
}
