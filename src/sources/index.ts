// Every provider the bot watches, and how often.
//
// The cadence follows how fast each source changes and how much a minute
// matters for it. Emergencies in Tbilisi (GWP, Telasi) are polled every minute:
// each answer is a few KB in under 300 ms, and an unchanged answer is
// recognised by its hash and costs nothing more. Planned works are announced a
// day or two ahead, so five minutes is plenty there.
import { gwp, gwpPlanned } from "./gwp.ts";
import { telasi } from "./telasi.ts";
import { te } from "./te.ts";
import { energo, socar, uwsc } from "./regions.ts";
import { georoad } from "./georoad.ts";
import { meteo } from "./meteo.ts";
import type { SourceDef } from "../types.ts";

export const SOURCES: SourceDef[] = [gwp, gwpPlanned, telasi, te, energo, socar, uwsc, georoad, meteo];

export function sourceByName(name: string): SourceDef | undefined {
  return SOURCES.find((s) => s.name === name);
}
