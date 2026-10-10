import { SVG_NS } from './dom';

// Side-view racehorse facing right. Colors come from CSS variables (--coat, --mane, --silk)
// set on a parent element, so the markup itself is static.
const HORSE = `
<path class="tail" d="M30 40 Q14 40 9 60 Q13 54 19 52 Q15 60 17 66 Q22 52 32 47 Z"/>
<g class="leg leg-b2"><rect x="38" y="48" width="6" height="26" rx="3"/><rect class="hoof" x="37" y="71" width="8" height="4" rx="1.5"/></g>
<g class="leg leg-f2"><rect x="74" y="48" width="6" height="26" rx="3"/><rect class="hoof" x="73" y="71" width="8" height="4" rx="1.5"/></g>
<path class="coat" d="M84 18 L96 22 L84 50 L70 44 Z"/>
<ellipse class="coat" cx="56" cy="44" rx="29" ry="13"/>
<g class="leg leg-b1 near"><rect x="32" y="49" width="6.5" height="26" rx="3"/><rect class="hoof" x="31" y="72" width="8.5" height="4" rx="1.5"/></g>
<g class="leg leg-f1 near"><rect x="78" y="49" width="6.5" height="26" rx="3"/><rect class="hoof" x="77" y="72" width="8.5" height="4" rx="1.5"/></g>
<ellipse class="coat" cx="99" cy="25" rx="13" ry="6.5" transform="rotate(32 99 25)"/>
<path class="mane" d="M83 16 Q76 28 70 42 L75 43 Q80 31 89 19 Z"/>
<path class="coat" d="M88 15 L90 6 L94 16 Z"/>
<circle class="eye" cx="95" cy="21" r="1.6"/>
<circle class="nostril" cx="107" cy="31" r="1.1"/>
<rect class="silk cloth" x="44" y="35" width="18" height="14" rx="2.5"/>
<text class="num" x="53" y="46" text-anchor="middle">#</text>
<path class="breeches" d="M58 34 L66 33 L64 46 L59 46 Z"/>
<rect class="boot" x="58" y="43" width="7" height="6" rx="2"/>
<path class="silk" d="M54 34 L66 19 L75 23 L64 37 Z"/>
<path class="silk sleeve" d="M70 22 L84 28 L83 31 L68 27 Z"/>
<circle class="skin" cx="76" cy="15" r="5"/>
<path class="silk cap" d="M70.5 14 A5.6 5.6 0 0 1 81.6 13.5 L85 15 L70.5 15 Z"/>
<path class="rein" d="M83 30 L98 27" fill="none"/>
`;

export function horseSvg(lane: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 118 80');
  svg.setAttribute('class', 'horse-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = HORSE.replace('>#<', `>${lane + 1}<`);
  return svg;
}
