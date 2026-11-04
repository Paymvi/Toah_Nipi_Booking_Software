/*
  The tutorial gnome, drawn once as SVG so it is the same character at every
  size. pose changes the arms, mood changes the face. crop="bust" frames
  hat to belt (raised hands stay in view) for the launcher; crop="head"
  frames just the hat, face and beard for very small spots. Animations live in
  TutorialGnome.css (tg-gnome-*) and switch off with reduced motion.

  Palette from the character sheet.
*/

const HAT = "#E4573F";
const HAT_SHADE = "#C4432F";
const TUNIC = "#4E7C59";
const TUNIC_SHADE = "#436D4D";
const BELT = "#8B6B3E";
const BOOTS = "#5A4632";
const SKIN = "#F7C9A5";
const SKIN_LINE = "#E8B48E";
const BEARD = "#F7F3EA";
const BEARD_LINE = "#E3D8C5";
const ACCENT = "#F3B562";
const INK = "#2A2321";
const MOUTH = "#9A3F33";

const VIEW_BOXES = { full: "0 0 120 160", bust: "14 0 92 112", head: "26 0 68 98" };

// Sleeve path and hand position for each arm, per pose.
const ARMS = {
  idle: { left: ["M41 98 Q34 108 32 119", 32, 122], right: ["M79 98 Q86 108 88 119", 88, 122] },
  wave: { left: ["M41 98 Q34 108 32 119", 32, 122], right: ["M79 97 Q90 90 95 79", 96, 74] },
  point: { left: ["M41 98 Q34 108 32 119", 32, 122], right: ["M79 99 Q92 99 102 96", 105, 95] },
  think: { left: ["M41 98 Q34 108 32 119", 32, 122], right: ["M79 99 Q80 92 71 88", 67, 87] },
  celebrate: { left: ["M41 97 Q31 88 26 77", 25, 72], right: ["M79 97 Q89 88 94 77", 95, 72] },
};

function Hand({ x, y }) {
  return <circle cx={x} cy={y} r="5" fill={SKIN} stroke={SKIN_LINE} strokeWidth="0.8" />;
}

function Arm({ arm, className }) {
  const [path, handX, handY] = arm;

  return (
    <g className={className}>
      <path d={path} stroke={TUNIC_SHADE} strokeWidth="10" strokeLinecap="round" fill="none" />
      <Hand x={handX} y={handY} />
    </g>
  );
}

function Eyes({ mood }) {
  const closedEye = (x) => (
    <path d={`M${x - 2.8} 65 Q${x} 61.2 ${x + 2.8} 65`} stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
  );
  const openEye = (x, ry = 3.5, dx = 0, dy = 0) => (
    <g>
      <ellipse cx={x + dx} cy={64 + dy} rx="2.7" ry={ry} fill={INK} />
      <circle cx={x + dx + 0.8} cy={62.8 + dy} r="0.9" fill="#ffffff" />
    </g>
  );

  if (mood === "excited") return <g className="tg-gnome-eyes">{closedEye(52.5)}{closedEye(67.5)}</g>;
  if (mood === "wink") return <g className="tg-gnome-eyes">{openEye(52.5)}{closedEye(67.5)}</g>;
  if (mood === "surprised") return <g className="tg-gnome-eyes">{openEye(52.5, 4.2)}{openEye(67.5, 4.2)}</g>;
  if (mood === "thinking") return <g className="tg-gnome-eyes">{openEye(52.5, 3.5, 1, -1)}{openEye(67.5, 3.5, 1, -1)}</g>;
  return <g className="tg-gnome-eyes">{openEye(52.5)}{openEye(67.5)}</g>;
}

function Brows({ mood }) {
  const lift = mood === "surprised" ? -2.2 : 0;
  const rightLift = mood === "thinking" ? -2 : lift;

  return (
    <g stroke="#D7C8B3" strokeWidth="1.6" strokeLinecap="round" fill="none">
      <path d={`M49 ${58.6 + lift} Q52.5 ${56.8 + lift} 56 ${58.4 + lift}`} />
      <path d={`M64 ${58.4 + rightLift} Q67.5 ${56.8 + rightLift} 71 ${58.6 + rightLift}`} />
    </g>
  );
}

function Mouth({ mood }) {
  if (mood === "excited") return <path d="M55.5 79 Q60 85.5 64.5 79 Z" fill={MOUTH} />;
  if (mood === "surprised") return <ellipse cx="60" cy="81" rx="2" ry="2.5" fill={MOUTH} />;
  if (mood === "thinking") {
    return <path d="M57 80.6 Q60.5 81.4 63.5 79.6" stroke={MOUTH} strokeWidth="1.6" strokeLinecap="round" fill="none" />;
  }
  return <path d="M56 79.5 Q60 83 64 79.5" stroke={MOUTH} strokeWidth="1.6" strokeLinecap="round" fill="none" />;
}

export default function GnomeMascot({ pose = "idle", mood = "happy", crop = "full", className = "" }) {
  const arms = ARMS[pose] || ARMS.idle;
  const showSparkles = pose === "celebrate" || mood === "excited";

  return (
    <svg
      className={`tg-gnome tg-gnome-pose-${pose} ${className}`}
      viewBox={VIEW_BOXES[crop] || VIEW_BOXES.full}
      aria-hidden="true"
      focusable="false"
    >
      <g className="tg-gnome-figure">
        <ellipse cx="60" cy="152" rx="30" ry="4.5" fill="#000000" opacity="0.1" />

        {/* Boots, under the tunic hem */}
        <g fill={BOOTS}>
          <rect x="39" y="128" width="14" height="18" rx="3" />
          <ellipse cx="44" cy="146.5" rx="9" ry="4.6" />
          <rect x="67" y="128" width="14" height="18" rx="3" />
          <ellipse cx="76" cy="146.5" rx="9" ry="4.6" />
        </g>

        {/* Satchel at the hip */}
        <rect x="25" y="109" width="12" height="14" rx="3" fill={BELT} />
        <path d="M25 112 Q31 117 37 112 L37 110 Q31 108 25 110 Z" fill="#76592F" />

        <g className="tg-gnome-body">
          <path d="M39 96 C41 90 49 87 60 87 C71 87 79 90 81 96 L87 132 C79 137 41 137 33 132 Z" fill={TUNIC} />
          <path d="M70 88 C76 89 80 92 81 96 L87 132 C84 134 80 135 76 135.5 Z" fill={TUNIC_SHADE} opacity="0.55" />
          <rect x="35" y="117" width="50" height="7" rx="1.5" fill={BELT} />
          <rect x="55" y="115.5" width="10" height="10" rx="2" fill="none" stroke={ACCENT} strokeWidth="2.2" />

          <Arm arm={arms.left} className="tg-gnome-arm-left" />
          {pose !== "think" && <Arm arm={arms.right} className="tg-gnome-arm-right" />}

          <g className="tg-gnome-head">
            <ellipse cx="41.5" cy="66" rx="4.5" ry="5.5" fill={SKIN} />
            <ellipse cx="78.5" cy="66" rx="4.5" ry="5.5" fill={SKIN} />
            <circle cx="60" cy="64" r="19" fill={SKIN} />

            <Brows mood={mood} />
            <Eyes mood={mood} />

            <ellipse cx="47" cy="71" rx="4" ry="2.6" fill="#F09A86" opacity="0.6" />
            <ellipse cx="73" cy="71" rx="4" ry="2.6" fill="#F09A86" opacity="0.6" />

            <path
              d="M40 66 C38 83 44 101 60 115 C76 101 82 83 80 66 C76 73 70 77 60 77 C50 77 44 73 40 66 Z"
              fill={BEARD}
              stroke={BEARD_LINE}
              strokeWidth="1"
            />
            <path d="M48 96 Q52 99 55 96 M65 96 Q68 99 72 96 M55 106 Q60 109 65 106" stroke={BEARD_LINE} strokeWidth="1.1" fill="none" strokeLinecap="round" />

            <Mouth mood={mood} />

            <path
              d="M60 73.2 C56 71 50 72 47.5 76 C52 78.6 57 77.6 60 75.6 C63 77.6 68 78.6 72.5 76 C70 72 64 71 60 73.2 Z"
              fill="#FBF8F1"
              stroke={BEARD_LINE}
              strokeWidth="0.8"
            />
            <ellipse cx="60" cy="70" rx="4.3" ry="3.7" fill="#EE8E78" />
            <ellipse cx="58.6" cy="68.7" rx="1.2" ry="0.9" fill="#ffffff" opacity="0.55" />

            {/* Hat */}
            <path
              d="M30 58 C31 44 40 33 50 22 C56 15 61 8 66 3 C67.2 1.8 68.8 2.6 68.6 4.2 C70 20 79 38 90 58 C72 52 48 52 30 58 Z"
              fill={HAT}
            />
            <path d="M30 58 C48 52 72 52 90 58 C89 61 87 62.4 84.5 62.2 C68 57.4 52 57.4 35.5 62.2 C33 62.4 31 61 30 58 Z" fill={HAT_SHADE} />
            <path d="M45 33 C51 25 57 16 63 9" stroke="#F08A72" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />
          </g>

          {pose === "think" && <Arm arm={arms.right} className="tg-gnome-arm-right" />}
          {pose === "point" && <rect x="108" y="93.4" width="7" height="3.2" rx="1.6" fill={SKIN} stroke={SKIN_LINE} strokeWidth="0.6" />}
        </g>

        {showSparkles && (
          <g className="tg-gnome-sparkles" stroke={ACCENT} strokeWidth="2.6" strokeLinecap="round">
            <path d="M24 34 L18 29" />
            <path d="M20 46 L13 46" />
            <path d="M96 34 L102 29" />
            <path d="M100 46 L107 46" />
          </g>
        )}
      </g>
    </svg>
  );
}
