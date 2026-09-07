import { normalizeTimeValue } from "@/lib/dates";
for (const v of ["12:30","12","12:",":30","1230","930","9:30","","24:00","12:61","abc","0:5"]) console.log(JSON.stringify(v), "→", normalizeTimeValue(v));
