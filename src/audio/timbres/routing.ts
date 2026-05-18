import type { TrackKey } from "../../types.ts";

/** Default routing for comp/non-mel roles. Melody timbres take an explicit
 *  `melRowId` parameter instead of consulting this map. */
export function roleRouting(_role: string): { trackKey: TrackKey; rowId: string } {
  return { trackKey: "comp", rowId: "mx-comp" };
}
