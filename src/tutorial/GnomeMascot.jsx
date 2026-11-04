import { useId } from "react";

/*
  The tutorial gnome, drawn once as SVG so it is the same character at every
  size. pose changes the arms, mood changes the face. crop="seated" sits the
  gnome down (boots forward) and frames it for the launcher; crop="head"
  frames just the hat, face and beard for very small spots. Animations live in
  TutorialGnome.css (tg-gnome-*) and switch off with reduced motion.

  Palette from the character sheet; soft shading comes from the gradients.
*/

const HAT_SHADE = "#B73C29";
const SLEEVE = "#4A7756";
const SLEEVE_EDGE = "#3B6146";
const BELT = "#8B6B3E";
const BELT_SHADE = "#76592F";
const TROUSERS = "#5E4330";
const SOLE = "#3E3025";
const SKIN = "#F7C9A5";
const SKIN_LINE = "#E3A07F";
const BEARD_LINE = "#E0D3BE";
const ACCENT = "#F3B562";
const INK = "#2A2321";
const MOUTH = "#8E3B2E";

const VIEW_BOXES = { full: "0 0 120 160", seated: "18 2 84 152", head: "24 2 72 122.5" };

// Sleeve path and hand placement [x, y, rotation, flipped] for each arm, per pose.
const ARMS = {
  idle: { left: ["M40 105 Q35 114 33.5 123", 33, 127.5, 0, true], right: ["M80 105 Q85 114 86.5 123", 87, 127.5, 0] },
  wave: { left: ["M40 105 Q35 114 33.5 123", 33, 127.5, 0, true], right: ["M80 104 Q91 99 94 87", 95, 81.5, 12] },
  point: { left: ["M40 105 Q35 114 33.5 123", 33, 127.5, 0, true], right: ["M80 105 Q92 107 100 102.5", 103.5, 101.5, -5] },
  think: { left: ["M40 105 Q35 114 33.5 123", 33, 127.5, 0, true], right: ["M86.5 115 Q81 106 73.5 104", 69.5, 102.5, -35] },
  celebrate: { left: ["M40 104 Q29 97 26 86", 25, 80.5, -12, true], right: ["M80 104 Q91 97 94 86", 95, 80.5, 12] },
};

function Hand({ x, y, rotate, flip, point }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${flip ? -1 : 1} 1)`}>
      {point && <rect x="2" y="-2.6" width="8.5" height="3.6" rx="1.8" fill={SKIN} />}
      <ellipse rx="4.8" ry="5" fill={SKIN} />
      <ellipse cx="1.2" cy="1.6" rx="3.2" ry="2.8" fill={SKIN_LINE} opacity="0.3" />
      <ellipse cx="-3.5" cy="-2.4" rx="1.9" ry="2.8" transform="rotate(-25 -3.5 -2.4)" fill={SKIN} />
    </g>
  );
}

function Arm({ arm, className, point }) {
  const [path, handX, handY, rotate, flip] = arm;

  return (
    <g className={className}>
      <path d={path} stroke={SLEEVE_EDGE} strokeWidth="11.4" strokeLinecap="round" fill="none" opacity="0.45" />
      <path d={path} stroke={SLEEVE} strokeWidth="10" strokeLinecap="round" fill="none" />
      <Hand x={handX} y={handY} rotate={rotate} flip={flip} point={point} />
    </g>
  );
}

function Eyes({ mood }) {
  const closedEye = (x) => (
    <path d={`M${x - 3.2} 78 Q${x} 73.4 ${x + 3.2} 78`} stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />
  );
  const openEye = (x, ry = 4, dx = 0, dy = 0) => (
    <g>
      <ellipse cx={x + dx} cy={77 + dy} rx="3" ry={ry} fill={INK} />
      <circle cx={x + dx + 1.1} cy={75.5 + dy} r="1.15" fill="#ffffff" />
      <circle cx={x + dx - 0.9} cy={78.5 + dy} r="0.5" fill="#ffffff" opacity="0.8" />
    </g>
  );

  if (mood === "excited") return <g className="tg-gnome-eyes">{closedEye(51.5)}{closedEye(68.5)}</g>;
  if (mood === "wink") return <g className="tg-gnome-eyes">{openEye(51.5)}{closedEye(68.5)}</g>;
  if (mood === "surprised") return <g className="tg-gnome-eyes">{openEye(51.5, 4.6)}{openEye(68.5, 4.6)}</g>;
  if (mood === "thinking") return <g className="tg-gnome-eyes">{openEye(51.5, 4, 1, -1)}{openEye(68.5, 4, 1, -1)}</g>;
  return <g className="tg-gnome-eyes">{openEye(51.5)}{openEye(68.5)}</g>;
}

function Brows({ mood }) {
  const lift = mood === "surprised" ? -1.4 : 0;
  const rightLift = mood === "thinking" ? -1.4 : lift;
  const left = `M47.5 ${71 + lift} Q51.5 ${68.8 + lift} 55.5 ${70.6 + lift}`;
  const right = `M64.5 ${70.6 + rightLift} Q68.5 ${68.8 + rightLift} 72.5 ${71 + rightLift}`;

  return (
    <g strokeLinecap="round" fill="none">
      <g stroke="#D9A98A" strokeWidth="2.8" opacity="0.45" transform="translate(0 0.7)">
        <path d={left} />
        <path d={right} />
      </g>
      <g stroke="#FFFBF3" strokeWidth="2.2">
        <path d={left} />
        <path d={right} />
      </g>
    </g>
  );
}

function Mouth({ mood }) {
  if (mood === "surprised") return <ellipse cx="60" cy="94.8" rx="2.3" ry="2.9" fill={MOUTH} />;
  if (mood === "thinking") {
    return <path d="M57 94.2 Q60.5 95.2 63.5 93.4" stroke={MOUTH} strokeWidth="1.7" strokeLinecap="round" fill="none" />;
  }
  const open = mood === "excited" ? "M54.8 92.2 Q60 100.6 65.2 92.2 Q60 93.8 54.8 92.2 Z" : "M55.8 92.4 Q60 98.4 64.2 92.4 Q60 93.8 55.8 92.4 Z";

  return (
    <g>
      <path d={open} fill={MOUTH} />
      <ellipse cx="60" cy={mood === "excited" ? 96.6 : 95.4} rx="2.2" ry="1.1" fill="#E27D6B" />
    </g>
  );
}

function Boots({ seated, fill }) {
  if (seated) {
    // Toes up toward the viewer, peeking out from under the tunic.
    const boot = (
      <g>
        <ellipse cx="45" cy="143.2" rx="8.2" ry="5.8" transform="rotate(-12 45 143.2)" fill={fill} />
        <path d="M37.4 145.6 Q44 151.4 52.4 146" stroke={SOLE} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <ellipse cx="42.6" cy="140.8" rx="2.6" ry="1.2" fill="#ffffff" opacity="0.18" />
      </g>
    );

    return (
      <g>
        {boot}
        <g transform="translate(120 0) scale(-1 1)">{boot}</g>
      </g>
    );
  }

  const leg = (
    <g>
      <rect x="44" y="137" width="10" height="8" fill={TROUSERS} />
      <path
        d="M42 140.5 H53.5 Q55.5 140.5 55.5 142.5 V149 Q55.5 152.5 52 152.5 H40 Q34.5 152.5 34.5 149 Q34.5 145.5 40 145.2 Q42 145 42 143 Z"
        fill={fill}
      />
      <rect x="34.5" y="151" width="21" height="2" rx="1" fill={SOLE} />
      <ellipse cx="39.5" cy="147.4" rx="2.4" ry="1.1" fill="#ffffff" opacity="0.18" />
    </g>
  );

  return (
    <g>
      {leg}
      <g transform="translate(120 0) scale(-1 1)">{leg}</g>
    </g>
  );
}

export default function GnomeMascot({ pose = "idle", mood = "happy", crop = "full", className = "" }) {
  // Gradient ids must be unique per instance; several gnomes can be on screen at once.
  const uid = `tg${useId().replace(/[^\w-]/g, "")}`;
  const url = (name) => `url(#${uid}-${name})`;
  const arms = ARMS[pose] || ARMS.idle;
  const seated = crop === "seated";
  const showSparkles = pose === "celebrate" || mood === "excited";

  return (
    <svg
      className={`tg-gnome tg-gnome-pose-${pose} ${className}`}
      viewBox={VIEW_BOXES[crop] || VIEW_BOXES.full}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-hat`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#F07A5E" />
          <stop offset="0.45" stopColor="#E4573F" />
          <stop offset="1" stopColor="#BF3F2C" />
        </linearGradient>
        <linearGradient id={`${uid}-brim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EE6D53" />
          <stop offset="0.55" stopColor="#DE523C" />
          <stop offset="1" stopColor="#B93D2A" />
        </linearGradient>
        <radialGradient id={`${uid}-skin`} cx="0.45" cy="0.4" r="0.65">
          <stop offset="0" stopColor="#FCDCC2" />
          <stop offset="0.6" stopColor="#F7C9A5" />
          <stop offset="1" stopColor="#EBB089" />
        </radialGradient>
        <radialGradient id={`${uid}-beard`} cx="0.45" cy="0.25" r="0.85">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.5" stopColor="#F7F3EA" />
          <stop offset="1" stopColor="#E2D6C2" />
        </radialGradient>
        <linearGradient id={`${uid}-tunic`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5E9069" />
          <stop offset="0.5" stopColor="#4E7C59" />
          <stop offset="1" stopColor="#3E6548" />
        </linearGradient>
        <linearGradient id={`${uid}-boot`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6E5640" />
          <stop offset="1" stopColor="#4A3A2A" />
        </linearGradient>
        <radialGradient id={`${uid}-nose`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#F8AE8C" />
          <stop offset="1" stopColor="#E9825F" />
        </radialGradient>
      </defs>

      <g className="tg-gnome-figure">
        <ellipse cx="60" cy={seated ? 149.5 : 153.5} rx={seated ? 34 : 31} ry="4" fill="#000000" opacity="0.12" />

        {!seated && <Boots fill={url("boot")} />}

        {/* Satchel at the hip, behind the arm */}
        <rect x="23.5" y="113" width="13" height="15" rx="3.5" fill={BELT} />
        <path d="M23.5 117 Q30 122 36.5 117 V116.5 Q36.5 113 33 113 H27 Q23.5 113 23.5 116.5 Z" fill={BELT_SHADE} />
        <circle cx="30" cy="119.2" r="1" fill={ACCENT} />

        <g className="tg-gnome-body">
          <path
            d="M37 106 C39 98.5 48 95 60 95 C72 95 81 98.5 83 106 L87.5 133.5 C88.3 137.5 86 139.6 81.5 140 C67 141.3 53 141.3 38.5 140 C34 139.6 31.7 137.5 32.5 133.5 Z"
            fill={url("tunic")}
          />
          <path d="M34 123.5 Q60 127 86 123.5 L87.1 130.5 Q60 134 32.9 130.5 Z" fill={BELT} />
          <path d="M33.3 129 Q60 132.5 86.8 129 L87.1 130.5 Q60 134 32.9 130.5 Z" fill={BELT_SHADE} />
          <rect x="54.6" y="123.9" width="10.8" height="9.2" rx="2" fill="none" stroke={ACCENT} strokeWidth="2.2" />
          <path d="M60 125.6 V131.4" stroke="#C98E3C" strokeWidth="1.2" strokeLinecap="round" />

          {seated && <Boots seated fill={url("boot")} />}

          <Arm arm={arms.left} className="tg-gnome-arm-left" />
          {pose !== "think" && <Arm arm={arms.right} className="tg-gnome-arm-right" point={pose === "point"} />}

          <g className="tg-gnome-head">
            {/* Ears */}
            <ellipse cx="35.2" cy="76" rx="4.6" ry="6" fill={url("skin")} />
            <ellipse cx="84.8" cy="76" rx="4.6" ry="6" fill={url("skin")} />
            <path d="M36.2 72.5 Q33.2 76 35.7 79.5 M83.8 72.5 Q86.8 76 84.3 79.5" stroke={SKIN_LINE} strokeWidth="1.3" strokeLinecap="round" fill="none" />

            <ellipse cx="60" cy="77" rx="24" ry="20.5" fill={url("skin")} />

            {/* Shadow the brim casts on the forehead */}
            <path d="M38 68.4 C48 63.6 72 63.6 82 68.4 L81 70 C72 66.6 48 66.6 39 70 Z" fill="#D99A78" opacity="0.45" />

            <Brows mood={mood} />
            <Eyes mood={mood} />

            <ellipse cx="46" cy="84.5" rx="4.8" ry="3" fill="#F29A85" opacity="0.55" />
            <ellipse cx="74" cy="84.5" rx="4.8" ry="3" fill="#F29A85" opacity="0.55" />

            {/* Beard: sideburns below the ears, under the cheeks, tapering to a soft point */}
            <path
              d="M37.5 78 C31 88 31.5 103 40.5 112 C46 117.5 53 120.8 57.5 122.4 Q60 123.4 62.5 122.4 C67 120.8 74 117.5 79.5 112 C88.5 103 89 88 82.5 78 C80.5 83 77.5 86.8 73 88 C69.5 89.3 65 88.3 60 88.3 C55 88.3 50.5 89.3 47 88 C42.5 86.8 39.5 83 37.5 78 Z"
              fill={url("beard")}
            />
            <path
              d="M43.5 96 C42 101.5 44.5 107.5 50 111 M76.5 96 C78 101.5 75.5 107.5 70 111 M60 110.5 Q59.2 114.5 60 118.5"
              stroke={BEARD_LINE}
              strokeWidth="1.1"
              strokeLinecap="round"
              fill="none"
            />

            <Mouth mood={mood} />

            {/* Moustache, with a soft shadow on the beard below it */}
            <path
              d="M60 88 C56 85.6 50.5 86 47.2 90.6 C51 93.4 56.5 92.8 60 90.2 C63.5 92.8 69 93.4 72.8 90.6 C69.5 86 64 85.6 60 88 Z"
              fill={BEARD_LINE}
            />
            <path
              d="M60 87 C56 84.6 50.5 85 47.2 89.6 C51 92.4 56.5 91.8 60 89.2 C63.5 91.8 69 92.4 72.8 89.6 C69.5 85 64 84.6 60 87 Z"
              fill={url("beard")}
            />

            <ellipse cx="60" cy="84" rx="5.2" ry="4.4" fill={url("nose")} />
            <ellipse cx="58.3" cy="82.4" rx="1.5" ry="1" fill="#ffffff" opacity="0.6" />

            {/* Hat: soft cone leaning a little to the right, then the folded brim over the forehead */}
            <path
              d="M33.5 60 C33 42 45 24 58.5 9.5 C61 6.8 64.6 5.6 66.6 7.4 C68.2 8.9 68 11.4 67.6 13.6 C69.6 28 78.5 43 86.5 60 Z"
              fill={url("hat")}
            />
            <path d="M67.6 13.6 C69.6 28 78.5 43 86.5 60 L75.5 60 C72 44 68.6 29 66.8 15 Z" fill={HAT_SHADE} opacity="0.3" />
            <path d="M40 52 C41.5 38 48.5 25 57.5 14 C51.5 27 46.5 40 45 53 Z" fill="#ffffff" opacity="0.14" />
            <path
              d="M30.5 61 C42 52.5 78 52.5 89.5 61 C92.5 63 92 69.5 88.5 70.5 C77 63.5 43 63.5 31.5 70.5 C28 69.5 27.5 63 30.5 61 Z"
              fill={url("brim")}
            />
            <path d="M35 60.5 C46 54.5 74 54.5 85 60.5" stroke="#F59A80" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.55" />
          </g>

          {pose === "think" && <Arm arm={arms.right} className="tg-gnome-arm-right" />}
        </g>

        {showSparkles && (
          <g className="tg-gnome-sparkles" stroke={ACCENT} strokeWidth="2.6" strokeLinecap="round">
            <path d="M22 44 L16 39" />
            <path d="M19 56 L12 56" />
            <path d="M98 44 L104 39" />
            <path d="M101 56 L108 56" />
          </g>
        )}
      </g>
    </svg>
  );
}
