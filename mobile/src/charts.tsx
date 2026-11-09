import React from 'react';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Stop, Text as SvgText } from 'react-native-svg';
import { C, F } from './theme';

export interface RadarItem { key: string; name: string; percentile: number | null }

/** Radar with labels placed outside each corner so nothing overlaps the shape. */
export function Radar({ items, width = 340 }: { items: RadarItem[]; width?: number }) {
  const n = items.length; if (n < 3) return null;
  const cx = width / 2, cy = 150, R = 82, h = 300;
  const ang = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pt = (i: number, r: number) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))] as const;
  const poly = (f: (i: number) => number) => items.map((_, i) => pt(i, R * f(i)).join(',')).join(' ');
  const label = items.map((x) => `${x.name} ${x.percentile === null ? 'not scored' : Math.round(x.percentile)}`).join(', ');
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${width} ${h}`} accessibilityLabel={`Radar: ${label}`}>
      {[1, 0.5].map((f) => <Polygon key={f} points={poly(() => f)} fill="none" stroke={C.line} />)}
      {items.map((_, i) => <Line key={i} x1={cx} y1={cy} x2={pt(i, R)[0]} y2={pt(i, R)[1]} stroke={C.line} />)}
      <Polygon points={poly((i) => (items[i].percentile ?? 0) / 100)} fill={C.red + '40'} stroke={C.red} strokeWidth={2.5} strokeLinejoin="round" />
      {items.map((x, i) => { const [px, py] = pt(i, R * ((x.percentile ?? 0) / 100)); return <Circle key={x.key} cx={px} cy={py} r={3.5} fill={C.red} />; })}
      {items.map((x, i) => {
        const [lx, ly] = pt(i, R + 16), cos = Math.cos(ang(i));
        const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
        const top = Math.sin(ang(i)) < -0.5;
        return (
          <G key={x.key}>
            <SvgText x={lx} y={top ? ly - 14 : ly - 2} fill={C.muted} fontSize={9} fontWeight="700" fontFamily={F.bold} textAnchor={anchor}>{x.name.toUpperCase()}</SvgText>
            <SvgText x={lx} y={top ? ly + 2 : ly + 15} fill={C.text} fontSize={17} fontFamily={F.display} textAnchor={anchor}>{x.percentile === null ? '-' : Math.round(x.percentile)}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

export function LineChart({ points, height = 120, width = 330, highlightLast = true }: { points: number[]; height?: number; width?: number; highlightLast?: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1, pad = 8;
  const xy = points.map((v, i) => [(i / (points.length - 1)) * width, pad + (1 - (v - min) / span) * (height - pad * 2)] as const);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = xy[xy.length - 1];
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel={`Trend from ${points[0]} to ${points[points.length - 1]}`}>
      <Defs><LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={C.red} stopOpacity={0.35} /><Stop offset="1" stopColor={C.red} stopOpacity={0} /></LinearGradient></Defs>
      <Path d={`${d} L${width} ${height} L0 ${height} Z`} fill="url(#fill)" />
      <Path d={d} stroke={C.red} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {highlightLast ? <Circle cx={lx} cy={ly} r={5} fill={C.gold} /> : null}
    </Svg>
  );
}
