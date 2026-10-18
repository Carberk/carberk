import type { ImprovementSchemas } from "@auto-tm/contracts";

import type { ScorecardInput } from "./MeasurementScorecard";
export function protectImprovement(_input:ScorecardInput,scorecard:ImprovementSchemas.ImprovementScorecard):ImprovementSchemas.ImprovementScorecard{return scorecard;}
export function freezeImprovementRelease(candidate:ImprovementSchemas.ImprovementScorecard,_previous:ImprovementSchemas.ImprovementScorecard):ImprovementSchemas.ImprovementScorecard{return candidate;}
