import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

const P: Record<string, React.ReactNode> = {
  home: <Path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z" />,
  explore: <><Circle cx="12" cy="12" r="9" /><Path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  programs: <Path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />,
  rank: <Path d="M7 4h10v5a5 5 0 01-10 0zM12 14v4M8 20h8" />,
  profile: <><Circle cx="12" cy="8" r="4" /><Path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  plus: <Path d="M12 5v14M5 12h14" />,
  back: <Path d="M15 5l-7 7 7 7" />,
  down: <Path d="M6 9l6 6 6-6" />,
  check: <Path d="M5 12l5 5 9-10" />,
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  heart: <Path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z" />,
  comment: <Path d="M4 5h16v11H9l-5 4z" />,
  bookmark: <Path d="M6 4h12v17l-6-4-6 4z" />,
  search: <><Circle cx="11" cy="11" r="7" /><Path d="M20 20l-4-4" /></>,
  grip: <Path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />,
  chevron: <Path d="M9 5l7 7-7 7" />,
};
export function Icon({ name, color = '#fff', size = 22, fill = false }: { name: keyof typeof P; color?: string; size?: number; fill?: boolean }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : 'none'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{P[name]}</Svg>;
}
