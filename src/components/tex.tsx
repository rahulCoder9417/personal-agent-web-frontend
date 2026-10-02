export type AgentId = "tex" | "scout" | "byte" | "patch" | "echo" | "pitch" | "tock";

export type Mood = "auto" | "ready" | "working" | "asking" | "done" | "asleep" | "paused";

type Look = {
  base: string;
  shade: string;
  deep: string;
  gx: number;
  gy: number;
  hL: number;
  hR: number;
  label: string;
  icon: string[];
};

const LOOKS: Record<AgentId, Look> = {
  tex: { base: "#3355F5", shade: "#2440C4", deep: "#1B2F94", gx: 0, gy: 0, hL: 14, hR: 14, label: "Tex, the captain", icon: ["..X..", "X.X.X", ".XXX.", "X.X.X", "..X.."] },
  scout: { base: "#11A39B", shade: "#0C7F79", deep: "#0C7F79", gx: 3, gy: -3, hL: 14, hR: 14, label: "Scout, research", icon: ["XXX..", "X.X..", "XXX..", "...X.", "....X"] },
  byte: { base: "#7B4DFF", shade: "#5F35D6", deep: "#5F35D6", gx: 0, gy: 3, hL: 12, hR: 12, label: "Byte, coder", icon: ["X....", ".X...", "X....", ".....", "..XXX"] },
  patch: { base: "#F5A623", shade: "#D08612", deep: "#D08612", gx: 0, gy: 0, hL: 14, hR: 9, label: "Patch, code review", icon: [".....", "....X", "...X.", "X.X..", ".X..."] },
  echo: { base: "#E93D82", shade: "#C22866", deep: "#C22866", gx: 0, gy: -1, hL: 17, hR: 17, label: "Echo, marketing", icon: ["...X.", "X.X.X", "XXX.X", "X.X.X", "...X."] },
  pitch: { base: "#22A45D", shade: "#178247", deep: "#178247", gx: 2, gy: 0, hL: 14, hR: 14, label: "Pitch, sales", icon: [".XXXX", "...XX", "..X.X", ".X...", "X...."] },
  tock: { base: "#FF6B2C", shade: "#D9521A", deep: "#D9521A", gx: 4, gy: 0, hL: 14, hR: 14, label: "Tock, ops", icon: [".XXX.", "X.X.X", "X.XXX", "X...X", ".XXX."] },
};

const SCREEN = "#16151A";
const PAPER = "#F6F5F1";

function iconPath(rows: string[], x0: number, y0: number, s: number) {
  let d = "";
  rows.forEach((row, j) => {
    for (let i = 0; i < 5; i++) {
      if (row.charAt(i) === "X") d += `M${x0 + i * s} ${y0 + j * s}h${s}v${s}h-${s}Z`;
    }
  });
  return d;
}

export function AgentFigure({
  who = "tex",
  mood = "auto",
  size = 320,
  glyph = false,
  label,
  className,
}: {
  who?: AgentId;
  mood?: Mood;
  size?: number;
  glyph?: boolean;
  label?: string;
  className?: string;
}) {
  const c = LOOKS[who];
  const body = !glyph;
  const isTex = who === "tex";

  let { gx, gy, hL, hR } = c;
  let eyes: "open" | "dots" | "joy" | "shut" = "open";
  let mouth: "line" | "o" | "wide" | "none" = "line";
  if (mood === "ready") { gx = 0; gy = 0; hL = 14; hR = 14; }
  else if (mood === "working") { eyes = "dots"; mouth = "none"; }
  else if (mood === "asking") { gx = 0; gy = -3; hL = 19; hR = 19; mouth = "o"; }
  else if (mood === "done") { eyes = "joy"; mouth = "wide"; }
  else if (mood === "asleep") { eyes = "shut"; mouth = "none"; }
  else if (mood === "paused") { gx = 0; gy = 0; hL = 7; hR = 7; }

  const eyL = Math.round(89 - hL / 2 + gy);
  const eyR = Math.round(89 - hR / 2 + gy);
  const blink = mood !== "paused" ? "agent-blink" : undefined;
  const breathe = mood === "paused" ? undefined : mood === "asleep" ? "agent-breathe-slow" : "agent-breathe";
  const iconD = iconPath(c.icon, 117, 172, 4);

  return (
    <svg
      width={size}
      height={size}
      viewBox={glyph ? "66 16 168 168" : "0 0 300 300"}
      role="img"
      aria-label={label ?? c.label}
      className={className}
    >
      {body && <ellipse cx={150} cy={282} rx={62} ry={6} style={{ fill: "var(--shadow)" }} opacity={0.14} />}
      <g className={breathe}>
        {body && isTex && <path d="M 110 158 L 190 158 L 214 244 Q 150 256 86 244 Z" fill={c.deep} />}
        {who === "byte" && <rect x={72} y={24} width={156} height={140} rx={52} fill={c.shade} />}

        {body && (
          <g>
            <rect x={132} y={226} width={16} height={50} rx={8} fill="#2B2A26" />
            <rect x={152} y={226} width={16} height={50} rx={8} fill="#2B2A26" />
            <rect x={128} y={268} width={22} height={10} rx={5} fill={SCREEN} />
            <rect x={150} y={268} width={22} height={10} rx={5} fill={SCREEN} />
            <rect x={102} y={158} width={15} height={66} rx={7.5} transform="rotate(7 110 160)" fill={c.shade} />
            <rect x={183} y={158} width={15} height={66} rx={7.5} transform="rotate(-7 190 160)" fill={c.shade} />
            <path d="M 120 148 H 180 Q 194 148 193 162 L 188 222 Q 187 234 174 234 H 126 Q 113 234 112 222 L 107 162 Q 106 148 120 148 Z" fill={c.base} />
            <path d="M 150 150 V 232" stroke={c.shade} strokeWidth={2} opacity={0.6} />
          </g>
        )}

        {body && isTex && (
          <g>
            <rect x={108} y={212} width={84} height={11} rx={3} fill={SCREEN} />
            {["#11A39B", "#7B4DFF", "#F5A623", "#E93D82", "#22A45D", "#FF6B2C"].map((fill, i) => (
              <rect key={fill} x={117 + i * 12} y={214} width={7} height={7} fill={fill} />
            ))}
          </g>
        )}
        {body && who === "pitch" && (
          <g>
            <path d="M 136 150 L 150 164 L 164 150 Z" fill={PAPER} />
            <path d="M 146 160 H 154 L 156 168 L 150 172 L 144 168 Z" fill={SCREEN} />
            <path d="M 145 170 L 155 170 L 158 206 L 150 214 L 142 206 Z" fill={SCREEN} />
          </g>
        )}
        {body && who === "byte" && (
          <g fill="none" stroke={PAPER} strokeWidth={3} strokeLinecap="round">
            <path d="M 145 152 L 144 178" />
            <path d="M 155 152 L 156 178" />
          </g>
        )}
        {body && (
          <g>
            <rect x={113} y={168} width={28} height={28} rx={6} fill={SCREEN} />
            <path d={iconD} fill="#FFFFFF" />
          </g>
        )}

        {who !== "byte" && (
          <g fill={c.shade}>
            <rect x={74} y={78} width={12} height={32} rx={5} />
            <rect x={214} y={78} width={12} height={32} rx={5} />
          </g>
        )}
        <rect x={84} y={34} width={132} height={116} rx={40} fill={c.shade} />
        <rect x={84} y={34} width={132} height={108} rx={40} fill={c.base} />
        <rect x={100} y={52} width={100} height={76} rx={24} fill={SCREEN} />
        <path d="M 116 58 L 132 58 L 110 104 L 104 104 L 104 84 Z" fill="#FFFFFF" opacity={0.08} />

        {eyes === "open" && (
          <g fill="#FFFFFF">
            <rect className={blink} x={124 + gx} y={eyL} width={14} height={hL} />
            <rect className={blink} x={162 + gx} y={eyR} width={14} height={hR} />
          </g>
        )}
        {eyes === "dots" && (
          <g fill="#FFFFFF">
            {[127, 145.5, 164].map((x, i) => (
              <rect key={x} className="agent-dot" style={{ animationDelay: `${i * 0.15}s` }} x={x} y={86} width={9} height={9} />
            ))}
          </g>
        )}
        {eyes === "joy" && (
          <g fill="#FFFFFF">
            {[
              [122, 90], [128, 84], [134, 90],
              [160, 90], [166, 84], [172, 90],
            ].map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={6} height={6} />
            ))}
          </g>
        )}
        {eyes === "shut" && (
          <g fill="#FFFFFF">
            <rect x={124} y={92} width={14} height={3} />
            <rect x={162} y={92} width={14} height={3} />
          </g>
        )}
        {mouth === "line" && <rect x={145} y={110} width={10} height={3} rx={1.5} fill="#FFFFFF" opacity={0.85} />}
        {mouth === "o" && <rect x={146.5} y={107} width={7} height={7} rx={2} fill="#FFFFFF" opacity={0.9} />}
        {mouth === "wide" && (
          <g fill="#FFFFFF">
            <rect x={136} y={105} width={6} height={4} />
            <rect x={142} y={109} width={16} height={4} />
            <rect x={158} y={105} width={6} height={4} />
          </g>
        )}

        {who === "patch" && (
          <g fill="none" stroke="#F5A623" strokeWidth={3}>
            <circle cx={131} cy={89} r={14} />
            <circle cx={169} cy={89} r={14} />
            <path d="M 145 88 H 155" />
          </g>
        )}

        {body && who === "scout" && (
          <g>
            <path d="M 196 228 L 206 212" stroke={SCREEN} strokeWidth={6} strokeLinecap="round" />
            <circle cx={216} cy={198} r={15} fill="#DDF3F1" fillOpacity={0.55} stroke={SCREEN} strokeWidth={5} />
            <circle cx={197} cy={226} r={7} fill={c.shade} />
          </g>
        )}
        {body && who === "patch" && (
          <g>
            <rect x={190} y={194} width={34} height={44} rx={4} fill={PAPER} />
            <rect x={200} y={190} width={14} height={8} rx={2} fill={SCREEN} />
            <path d="M 196 210 L 200 214 L 207 206 M 196 224 L 200 228 L 207 220" fill="none" stroke="#22A45D" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 211 210 H 219 M 211 224 H 219" stroke="#C9C5BA" strokeWidth={3} strokeLinecap="round" />
            <circle cx={195} cy={233} r={7} fill={c.shade} />
          </g>
        )}
        {body && who === "echo" && (
          <g>
            <path d="M 198 214 L 230 198 L 234 238 L 200 228 Z" fill={PAPER} />
            <path d="M 230 197 Q 238 218 234 239" fill="none" stroke={SCREEN} strokeWidth={5} strokeLinecap="round" />
            <g fill="none" stroke={c.base} strokeWidth={4} strokeLinecap="round">
              <path d="M 246 204 L 256 198" />
              <path d="M 248 219 L 260 219" />
              <path d="M 246 234 L 256 240" />
            </g>
            <circle cx={199} cy={222} r={7} fill={c.shade} />
          </g>
        )}
        {body && who === "pitch" && (
          <g>
            <path d="M 204 226 V 220 H 218 V 226" fill="none" stroke={SCREEN} strokeWidth={3} />
            <rect x={196} y={225} width={30} height={22} rx={4} fill="#3B2A1F" />
            <rect x={196} y={233} width={30} height={3} fill="#2A1D15" />
            <circle cx={202} cy={224} r={6.5} fill={c.shade} />
          </g>
        )}
        {body && who === "tock" && (
          <g>
            <rect x={192} y={196} width={32} height={36} rx={4} fill={PAPER} />
            <path d="M 192 206 V 200 A 4 4 0 0 1 196 196 H 220 A 4 4 0 0 1 224 200 V 206 Z" fill={c.base} />
            <g fill="#D8D4C8">
              <rect x={197} y={211} width={6} height={5} />
              <rect x={205} y={211} width={6} height={5} />
              <rect x={213} y={211} width={6} height={5} />
              <rect x={197} y={219} width={6} height={5} />
              <rect x={213} y={219} width={6} height={5} />
            </g>
            <rect x={205} y={219} width={6} height={5} fill={c.base} />
            <circle cx={196} cy={229} r={7} fill={c.shade} />
          </g>
        )}

        {body && isTex && (mood === "auto" || mood === "ready") && (
          <rect className="agent-caret" x={234} y={70} width={10} height={40} style={{ fill: "var(--accent)" }} />
        )}
        {body && isTex && mood === "working" && (
          <rect className="agent-caret-fast" x={234} y={70} width={10} height={40} style={{ fill: "var(--accent)" }} />
        )}
        {body && isTex && mood === "done" && <rect x={234} y={70} width={10} height={40} style={{ fill: "var(--accent)" }} />}
        {body && isTex && mood === "paused" && <rect x={234} y={70} width={10} height={40} fill="#BDBAB1" />}
        {body && isTex && mood === "asking" && (
          <text x={228} y={108} fontSize={46} fontWeight={700} style={{ fill: "var(--accent)", fontFamily: "var(--font-mono)" }}>
            ?
          </text>
        )}
        {body && isTex && mood === "asleep" && (
          <g fill="#8E8B82" fontWeight={700} style={{ fontFamily: "var(--font-mono)" }}>
            <text x={230} y={76} fontSize={24}>z</text>
            <text x={246} y={54} fontSize={17}>z</text>
          </g>
        )}
      </g>
    </svg>
  );
}
