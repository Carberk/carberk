import { View } from "react-native";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import { diagnosticCopy } from "./copy";

import { Text } from "@/components/ui/text";

/** Same normalized 220×80 coordinates and stable finding numbers as the issued PDF. */
export function DiagnosticBodyMap({findings,locale}:{findings:D.DiagnosticFinding[];locale:string}) {
 const c=diagnosticCopy(locale);
 return <View className="gap-4"><Text className="font-semibold">{c.diagram}</Text><Text>{c.diagramLimit}</Text>{(["front","rear","left","right","top"] as const).map(view=><View key={view} className="gap-1"><Text>{c[view]}</Text><Svg viewBox="0 0 220 80" width="100%" height={110} accessibilityLabel={c[view]}><Path d={view==="top"?"M30 12 L185 12 Q205 12 205 28 L205 52 Q205 68 185 68 L30 68 Q15 68 15 52 L15 28 Q15 12 30 12 Z M65 12 L65 68 M155 12 L155 68":view==="front"||view==="rear"?"M45 15 L175 15 L195 35 L195 67 L25 67 L25 35 Z M45 15 L40 35 L180 35 L175 15":"M15 55 L25 35 L70 30 L90 12 L150 12 L175 35 L205 42 L205 60 L15 60 Z"} fill="white" stroke="black" strokeWidth={1.5}/>{findings.map(finding=>finding.location?.view===view?<Circle key={finding.id} cx={finding.location.x*220} cy={finding.location.y*80} r={9} fill="white" stroke="black"/>:null)}{findings.map((finding,index)=>finding.location?.view===view?<SvgText key={finding.id} x={finding.location.x*220} y={finding.location.y*80+3} fontSize={9} textAnchor="middle" fill="black">{index+1}</SvgText>:null)}</Svg></View>)}</View>;
}
